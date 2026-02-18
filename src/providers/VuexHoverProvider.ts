import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';
import {
    extractStateAccessPath,
    extractRootAccessPath,
    extractBracketPath,
    buildLookupCandidates,
    hasRootTrueOption,
} from '../utils/VuexProviderUtils';

export class VuexHoverProvider implements vscode.HoverProvider {
    private contextScanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;

    constructor(storeIndexer: StoreIndexer, componentMapper?: ComponentMapper) {
        this.storeIndexer = storeIndexer;
        this.contextScanner = new VuexContextScanner();
        this.componentMapper = componentMapper ?? new ComponentMapper();
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;
        const word = document.getText(range);
        
        // 1. Vuex Context (String literals)
        // Moved logical check down to combine with context awareness
        const context = this.contextScanner.getContext(document, position);

        // 2. Component Mapping (this.methodName)
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, range.start.character).trimEnd();
        
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = mapping[word];
        
        if (mappedItem) {
            return this.findHover(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }

        const currentNamespace = this.storeIndexer.getNamespace(document.fileName);

        // 3. Local State Hover (state.xxx)
        const rawPrefix = lineText.substring(0, range.start.character);
        const stateAccessPath = extractStateAccessPath(rawPrefix, word);

        // 3a. rootState.xxx hover — 从根开始查找 state
        const rootStateAccessPath = extractRootAccessPath(rawPrefix, word, 'rootState');
        if (rootStateAccessPath) {
            return this.findHover(rootStateAccessPath, 'state');
        }

        // 3b. rootGetters.xxx hover — 用 extractRootAccessPath 统一处理
        const rootGettersAccessPath = extractRootAccessPath(rawPrefix, word, 'rootGetters');
        if (rootGettersAccessPath) {
            return this.findHover(rootGettersAccessPath, 'getter');
        }

        // 3c. rootGetters['xxx'] hover — 方括号语法
        const rootGettersBracketPath = extractBracketPath(rawPrefix, 'rootGetters');
        if (rootGettersBracketPath) {
            const fullPath = rootGettersBracketPath + word;
            return this.findHover(fullPath, 'getter');
        }

        if (currentNamespace && /\bstate\.$/.test(rawPrefix)) {
             return this.findHover(word, 'state', currentNamespace.join('/'));
        }

        // Re-check context with awareness of current file namespace
        if (context && context.type !== 'unknown') {
             const preferLocalFromContext = !(
                 (context.method === 'commit' || context.method === 'dispatch') &&
                 (
                     context.isStoreMethod === true ||
                     hasRootTrueOption(document, position, context.method, context.calleeName)
                 )
             );
             if (context.type === 'state' && stateAccessPath) {
                 return this.findHover(stateAccessPath, 'state', context.namespace, currentNamespace, preferLocalFromContext);
             }
             return this.findHover(word, context.type, context.namespace, currentNamespace, preferLocalFromContext);
        }

        return undefined;
    }


    private findHover(
        name: string,
        type: 'state' | 'getter' | 'mutation' | 'action',
        namespace?: string,
        currentNamespace?: string[],
        preferLocal: boolean = true
    ): vscode.Hover | undefined {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

        const lookups = buildLookupCandidates(name, type, namespace, currentNamespace);
        let result: { defLocation: vscode.Location, documentation?: string } | undefined;
        let labelPrefix = '';

        for (const lookup of lookups) {
            const lookupName = lookup.name;
            const lookupNamespace = lookup.namespace;

            const matchItem = (item: { name: string, modulePath: string[] }) => {
                if (lookupNamespace) {
                    return item.name === lookupName && item.modulePath.join('/') === lookupNamespace;
                }

                if (preferLocal && currentNamespace && !lookupName.includes('/')) {
                    const isLocal = item.name === lookupName && item.modulePath.join('/') === currentNamespace.join('/');
                    if (isLocal) return true;
                }

                if (lookupName.includes('/')) {
                    const parts = lookupName.split('/');
                    const realName = parts.pop()!;
                    const namespaceStr = parts.join('/');
                    return item.name === realName && item.modulePath.join('/') === namespaceStr;
                }
                return item.name === lookupName;
            };

            if (preferLocal && !lookupNamespace && currentNamespace && !lookupName.includes('/')) {
                const checkLocal = (item: { name: string, modulePath: string[] }) =>
                    item.name === lookupName && item.modulePath.join('/') === currentNamespace.join('/');

                if (type === 'action') result = storeMap.actions.find(checkLocal);
                else if (type === 'mutation') result = storeMap.mutations.find(checkLocal);
                else if (type === 'state') result = storeMap.state.find(checkLocal);
                else if (type === 'getter') result = storeMap.getters.find(checkLocal);
            }

            if (!result) {
                if (type === 'action') result = storeMap.actions.find(matchItem);
                else if (type === 'mutation') result = storeMap.mutations.find(matchItem);
                else if (type === 'state') result = storeMap.state.find(matchItem);
                else if (type === 'getter') result = storeMap.getters.find(matchItem);
            }

            if (result) break;
        }

        if (type === 'action') labelPrefix = 'Action';
        else if (type === 'mutation') labelPrefix = 'Mutation';
        else if (type === 'state') labelPrefix = 'State';
        else if (type === 'getter') labelPrefix = 'Getter';

        if (result) {
            const md = new vscode.MarkdownString();
            
            let label = `${labelPrefix}: ${name}`;
            if (type === 'state') {
                const stateInfo = result as any; // Cast to access displayType
                if (stateInfo.displayType) {
                    label += `: ${stateInfo.displayType}`;
                }
            }
            
            md.appendCodeblock(label, 'typescript');
            if (result.documentation) {
                md.appendMarkdown(`\n\n${result.documentation}\n\n`);
            }
            md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(result.defLocation.uri)}**`);
            return new vscode.Hover(md);
        }
        return undefined;
    }
}
