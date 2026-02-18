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
        if (token.isCancellationRequested) return undefined;
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;
        const word = document.getText(range);
        
        // 1. Vuex Context (String literals)
        // Moved logical check down to combine with context awareness
        const context = this.contextScanner.getContext(document, position);
        if (token.isCancellationRequested) return undefined;

        // 2. Component Mapping (this.methodName)
        const lineText = document.lineAt(position.line).text;
        const rawPrefix = lineText.substring(0, range.start.character);
        const prefix = rawPrefix.trimEnd();
        
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = mapping[word];
        
        if (mappedItem) {
            return this.findHover(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }
        const bracketMappedPathPrefix = extractBracketPath(rawPrefix, 'this') ?? extractBracketPath(rawPrefix, 'vm');
        if (bracketMappedPathPrefix) {
            const fullMappedKey = `${bracketMappedPathPrefix}${word}`;
            const bracketMappedItem = mapping[fullMappedKey];
            if (bracketMappedItem) {
                return this.findHover(bracketMappedItem.originalName, bracketMappedItem.type, bracketMappedItem.namespace);
            }
        }

        const currentNamespace = this.storeIndexer.getNamespace(document.fileName);

        // 3. Local State Hover (state.xxx)
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
        const lookups = buildLookupCandidates(name, type, namespace, currentNamespace);
        let result: { defLocation: vscode.Location, documentation?: string } | undefined;
        let labelPrefix = '';

        for (const lookup of lookups) {
            const lookupName = lookup.name;
            const lookupNamespace = lookup.namespace;
            result = this.findIndexedItem(type, lookupName, lookupNamespace, currentNamespace, preferLocal);
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

    private findIndexedItem(
        type: 'state' | 'getter' | 'mutation' | 'action',
        lookupName: string,
        lookupNamespace?: string,
        currentNamespace?: string[],
        preferLocal: boolean = true,
    ): { defLocation: vscode.Location, documentation?: string } | undefined {
        const typed = this.toItemType(type);
        if (!typed) return undefined;

        if (lookupNamespace) {
            const exact = this.storeIndexer.getIndexedItem(typed, lookupName, lookupNamespace);
            if (exact) return exact as any;
        }

        if (preferLocal && currentNamespace && !lookupName.includes('/')) {
            const local = this.storeIndexer.getIndexedItem(typed, lookupName, currentNamespace.join('/'));
            if (local) return local as any;
        }

        if (lookupName.includes('/')) {
            const byPath = this.storeIndexer.getIndexedItemByFullPath(typed, lookupName);
            if (byPath) return byPath as any;
        }

        const allItems = this.storeIndexer.getItemsByType(typed) as any[];
        return allItems.find((item) => item.name === lookupName);
    }

    private toItemType(type: 'state' | 'getter' | 'mutation' | 'action'): 'state' | 'getter' | 'mutation' | 'action' | undefined {
        if (type === 'state') return 'state';
        if (type === 'getter') return 'getter';
        if (type === 'mutation') return 'mutation';
        if (type === 'action') return 'action';
        return undefined;
    }
}
