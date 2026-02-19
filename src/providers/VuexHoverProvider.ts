import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';
import { VuexLookupService } from '../services/VuexLookupService';
import {
    extractStateAccessPath,
    extractRootAccessPath,
    extractStringLiteralPathAtPosition,
    detectStoreBracketAccessor,
    extractStoreAccessPath,
    hasRootTrueOption,
    resolveMappedItem,
} from '../utils/VuexProviderUtils';

export class VuexHoverProvider implements vscode.HoverProvider {
    private contextScanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;
    private lookupService: VuexLookupService;

    constructor(storeIndexer: StoreIndexer, componentMapper?: ComponentMapper) {
        this.storeIndexer = storeIndexer;
        this.contextScanner = new VuexContextScanner();
        this.componentMapper = componentMapper ?? new ComponentMapper();
        this.lookupService = new VuexLookupService(storeIndexer);
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

        // 跳过注释行（单行注释 // 和块注释中间的 * 行）
        const trimmedLine = lineText.trimStart();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
            return undefined;
        }

        const rawPrefix = lineText.substring(0, range.start.character);
        
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = resolveMappedItem(mapping, rawPrefix, word);
        if (mappedItem) {
            return this.findHover(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
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

        // 3c. Bracket Notation hover：rootGetters['...'] / this.$store?.getters?.['...']
        const stringLiteralObj = extractStringLiteralPathAtPosition(document, position);
        if (stringLiteralObj) {
            const { path: fullPath, range: literalRange } = stringLiteralObj;
            const textBefore = lineText.substring(0, literalRange.start.character).trimEnd();
            const bracketAccessType = detectStoreBracketAccessor(textBefore, currentNamespace);
            if (bracketAccessType) {
                return this.findHover(fullPath, bracketAccessType);
            }
        }

        if (currentNamespace && /\bstate(?:\?\.|\.)$/.test(rawPrefix)) {
             return this.findHover(word, 'state', currentNamespace.join('/'));
        }

        // 3d. this.$store.state.xxx / this.$store?.getters?.xxx hover
        const storeAccess = extractStoreAccessPath(rawPrefix, word);
        if (storeAccess) {
            const { type: accessType, accessPath } = storeAccess;
            const dotIndex = accessPath.lastIndexOf('.');
            if (dotIndex >= 0) {
                const ns = accessPath.substring(0, dotIndex).replace(/\./g, '/');
                const name = accessPath.substring(dotIndex + 1);
                return this.findHover(name, accessType, ns);
            }
            return this.findHover(word, accessType);
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
        const result = this.lookupService.findItem({
            name,
            type,
            namespace,
            currentNamespace,
            preferLocal
        }) as { defLocation: vscode.Location, documentation?: string } | undefined;
        let labelPrefix = '';

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
