import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';
import { VuexLookupService } from '../services/VuexLookupService';
import { PathResolver } from '../utils/PathResolver';
import { VuexAnyItem, VuexItemType } from '../services/StoreIndexer';
import {
    collectStoreLikeNames,
    extractStateAccessPath,
    extractContextAccessPath,
    extractRootAccessPath,
    extractStringLiteralPathAtPosition,
    detectStoreBracketAccessor,
    extractStoreAccessPath,
    hasScopedVuexCallContext,
    hasParamContextMemberAccess,
    hasParamBindingMemberAccess,
    hasRootTrueOption,
    hasLocalBindingAtPosition,
    collectThisAliasNames,
    isThisAliasMemberPrefix,
    resolveMappedItem,
} from '../utils/VuexProviderUtils';

function escapeMarkdown(value: string): string {
    return value.replace(/([\\`*_[\]()])/g, '\\$1');
}

function buildLocationUriString(uri: vscode.Uri, position: vscode.Position): string {
    const fragment = `L${position.line + 1},${position.character + 1}`;
    const withFragment = typeof (uri as any).with === 'function'
        ? (uri as any).with({ fragment })
        : uri;
    const value = withFragment.toString();
    return typeof (uri as any).with === 'function'
        ? value
        : `${value}#${fragment}`;
}

export class VuexHoverProvider implements vscode.HoverProvider {
    private contextScanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;
    private lookupService: VuexLookupService;
    private pathResolver: PathResolver;
    private storeLikeNamesCache?: { uri: string; version: number; names: string[] };

    constructor(storeIndexer: StoreIndexer, componentMapper?: ComponentMapper) {
        this.storeIndexer = storeIndexer;
        this.contextScanner = new VuexContextScanner();
        this.componentMapper = componentMapper ?? new ComponentMapper();
        this.lookupService = new VuexLookupService(storeIndexer);
        this.pathResolver = new PathResolver(storeIndexer.getWorkspaceRoot());
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
        const definitionHover = this.findDefinitionHover(document, range, word);
        if (definitionHover) return definitionHover;

        const storeLikeNames = await this.getStoreLikeNames(document);
        const storeLikeNameSet = new Set(storeLikeNames);
        
        // 1. Vuex Context (String literals)
        // Moved logical check down to combine with context awareness
        const context = this.contextScanner.getContext(document, position, storeLikeNameSet);
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
        const thisAliases = collectThisAliasNames(document, position);
        const mappedItem = shouldCheckLocalBindingForMappedItem(rawPrefix, thisAliases) && hasLocalBindingAtPosition(document, position, word)
            ? undefined
            : resolveMappedItem(mapping, rawPrefix, word, thisAliases);
        if (mappedItem) {
            return this.findHover(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }

        const currentNamespace = this.storeIndexer.getNamespace(document.fileName);
        const currentAssetNamespace = this.storeIndexer.getAssetNamespace(document.fileName) ?? currentNamespace;
        const validatedContext =
            context &&
            (context.method !== 'commit' && context.method !== 'dispatch' ||
                context.isStoreMethod === true ||
                hasScopedVuexCallContext(document, position, context.method, currentNamespace))
                ? context
                : undefined;

        // 3. Local State Hover (state.xxx)
        const stateAccessPath = extractStateAccessPath(rawPrefix, word);
        const contextStateAccessPath = extractContextAccessPath(rawPrefix, word, 'state');
        const contextGettersAccessPath = extractContextAccessPath(rawPrefix, word, 'getters');

        // 3a. rootState.xxx hover — 从根开始查找 state
        const rootStateAccessPath = extractRootAccessPath(rawPrefix, word, 'rootState');
        if (
            rootStateAccessPath &&
            hasParamBindingMemberAccess(document, position, 'rootState', currentNamespace)
        ) {
            return this.findHover(rootStateAccessPath, 'state');
        }

        const contextRootStateAccessPath = extractContextAccessPath(rawPrefix, word, 'rootState');
        if (
            contextRootStateAccessPath &&
            hasParamContextMemberAccess(document, position, 'rootState', currentNamespace)
        ) {
            return this.findHover(contextRootStateAccessPath, 'state');
        }

        // 3b. rootGetters.xxx hover — 用 extractRootAccessPath 统一处理
        const rootGettersAccessPath = extractRootAccessPath(rawPrefix, word, 'rootGetters');
        if (
            rootGettersAccessPath &&
            hasParamBindingMemberAccess(document, position, 'rootGetters', currentNamespace)
        ) {
            return this.findHover(rootGettersAccessPath, 'getter');
        }

        const contextRootGettersAccessPath = extractContextAccessPath(rawPrefix, word, 'rootGetters');
        if (
            contextRootGettersAccessPath &&
            hasParamContextMemberAccess(document, position, 'rootGetters', currentNamespace)
        ) {
            return this.findHover(contextRootGettersAccessPath, 'getter');
        }

        // 3c. Bracket Notation hover：rootGetters['...'] / this.$store?.getters?.['...']
        const stringLiteralObj = extractStringLiteralPathAtPosition(document, position);
        if (stringLiteralObj) {
            const { path: fullPath, range: literalRange } = stringLiteralObj;
            const textBefore = lineText.substring(0, literalRange.start.character).trimEnd();
            const bracketAccessType = detectStoreBracketAccessor(textBefore, currentNamespace, storeLikeNames);
            if (bracketAccessType) {
                return this.findHover(fullPath, bracketAccessType);
            }
        }

        if (
            currentNamespace &&
            /\bstate(?:\?\.|\.)$/.test(rawPrefix) &&
            hasParamBindingMemberAccess(document, position, 'state', currentNamespace)
        ) {
             return this.findHover(word, 'state', currentNamespace.join('/'));
        }

        if (
            currentNamespace &&
            contextStateAccessPath &&
            hasParamContextMemberAccess(document, position, 'state', currentNamespace)
        ) {
             return this.findHover(contextStateAccessPath, 'state', undefined, currentNamespace);
        }

        if (
            currentAssetNamespace &&
            /(?<!\.|root)\bgetters(?:\?\.|\.)$/.test(rawPrefix) &&
            hasParamBindingMemberAccess(document, position, 'getters', currentNamespace)
        ) {
             return this.findHover(word, 'getter', currentAssetNamespace.join('/'));
        }

        if (
            currentAssetNamespace &&
            contextGettersAccessPath &&
            hasParamContextMemberAccess(document, position, 'getters', currentNamespace)
        ) {
             return this.findHover(contextGettersAccessPath, 'getter', undefined, currentAssetNamespace);
        }

        // 3d. this.$store.state.xxx / this.$store?.getters?.xxx hover
        const storeAccess = extractStoreAccessPath(rawPrefix, word, storeLikeNames);
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
        if (validatedContext && validatedContext.type !== 'unknown') {
             const preferLocalFromContext = !(
                 (validatedContext.method === 'commit' || validatedContext.method === 'dispatch') &&
                 (
                     validatedContext.isStoreMethod === true ||
                     hasRootTrueOption(document, position, validatedContext.method, validatedContext.calleeName)
                 )
             );
             if (validatedContext.type === 'state' && stateAccessPath) {
                 return this.findHover(stateAccessPath, 'state', validatedContext.namespace, currentNamespace, preferLocalFromContext);
             }
             const explicitPath = stringLiteralObj ? stringLiteralObj.path : undefined;
             if (isCommitDispatchContext(validatedContext.method) && !explicitPath) {
                 return undefined;
             }
             const lookupNamespace = validatedContext.type === 'state'
                 ? currentNamespace
                 : currentAssetNamespace;
             if (explicitPath && explicitPath.includes('/')) {
                 const parts = explicitPath.split('/');
                 const name = parts.pop()!;
                 const namespace = parts.join('/');
                 return this.findHover(name, validatedContext.type, namespace, currentNamespace, preferLocalFromContext);
             }
             return this.findHover(word, validatedContext.type, validatedContext.namespace, lookupNamespace, preferLocalFromContext);
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

        if (result) {
            return new vscode.Hover(this.buildHoverMarkdown(name, type, result));
        }
        return undefined;
    }

    private findDefinitionHover(
        document: vscode.TextDocument,
        range: vscode.Range,
        word: string
    ): vscode.Hover | undefined {
        const found = this.findDefinitionItem(document, range, word);
        if (!found) return undefined;

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`[Find All References](${this.formatFindReferencesCommand(found.item.defLocation)})`);
        md.isTrusted = { enabledCommands: ['vuexHelper.findReferences'] };
        return new vscode.Hover(md);
    }

    private findDefinitionItem(
        document: vscode.TextDocument,
        range: vscode.Range,
        word: string
    ): { type: VuexItemType; item: VuexAnyItem } | undefined {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

        const allItems: Array<{ type: VuexItemType; item: VuexAnyItem }> = [
            ...storeMap.state.map(item => ({ type: 'state' as const, item })),
            ...storeMap.getters.map(item => ({ type: 'getter' as const, item })),
            ...storeMap.mutations.map(item => ({ type: 'mutation' as const, item })),
            ...storeMap.actions.map(item => ({ type: 'action' as const, item })),
        ];

        return allItems.find(({ item }) => {
            if (item.name !== word) return false;
            if (!sameUri(document.uri, item.defLocation.uri)) return false;
            const defStart = locationStart(item.defLocation);
            return !!defStart && rangeContainsPosition(range, defStart);
        });
    }

    private formatDefinitionLink(location: vscode.Location): string {
        const position = locationStart(location) ?? new vscode.Position(0, 0);
        const label = escapeMarkdown(vscode.workspace.asRelativePath(location.uri));
        const target = buildLocationUriString(location.uri, position);
        return `[${label}](${target})`;
    }

    private formatFindReferencesCommand(location: vscode.Location): string {
        const position = locationStart(location) ?? new vscode.Position(0, 0);
        const args = encodeURIComponent(JSON.stringify([
            location.uri.toString(),
            position.line,
            position.character
        ]));
        return `command:vuexHelper.findReferences?${args}`;
    }

    private buildHoverMarkdown(
        name: string,
        type: 'state' | 'getter' | 'mutation' | 'action',
        item: { defLocation: vscode.Location; documentation?: string; displayType?: string }
    ): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        let label = `${labelForType(type)}: ${name}`;
        if (type === 'state' && item.displayType) {
            label += `: ${item.displayType}`;
        }

        md.appendCodeblock(label, 'typescript');
        if (item.documentation) {
            md.appendMarkdown(`\n\n${item.documentation}\n\n`);
        }
        md.appendMarkdown(`Defined in: ${this.formatDefinitionLink(item.defLocation)}`);
        return md;
    }


    private async getStoreLikeNames(document: vscode.TextDocument): Promise<string[]> {
        const uri = document.uri?.toString();
        const version = document.version;
        if (
            uri &&
            this.storeLikeNamesCache?.uri === uri &&
            this.storeLikeNamesCache.version === version
        ) {
            return this.storeLikeNamesCache.names;
        }

        const names = await collectStoreLikeNames(
            document,
            this.pathResolver,
            this.storeIndexer.getStoreEntryPath()
        );
        if (uri) {
            this.storeLikeNamesCache = { uri, version, names };
        }
        return names;
    }
}

function labelForType(type: 'state' | 'getter' | 'mutation' | 'action'): string {
    if (type === 'action') return 'Action';
    if (type === 'mutation') return 'Mutation';
    if (type === 'state') return 'State';
    return 'Getter';
}

function locationStart(location: vscode.Location): vscode.Position | undefined {
    const range = (location as any).range;
    if (range?.start) return range.start;

    const rangeOrPosition = (location as any).rangeOrPosition;
    if (rangeOrPosition?.start) return rangeOrPosition.start;
    if (typeof rangeOrPosition?.line === 'number') return rangeOrPosition;
    return undefined;
}

function sameUri(a: vscode.Uri, b: vscode.Uri): boolean {
    const aFsPath = (a as any).fsPath;
    const bFsPath = (b as any).fsPath;
    if (aFsPath && bFsPath) return aFsPath === bFsPath;
    return a.toString() === b.toString();
}

function rangeContainsPosition(range: vscode.Range, position: vscode.Position): boolean {
    const start = (range as any).start;
    const end = (range as any).end;
    if (!start || !end) return false;
    if (position.line !== start.line || position.line !== end.line) return false;
    return position.character >= start.character && position.character <= end.character;
}

function shouldCheckLocalBindingForMappedItem(rawPrefix: string, thisAliases: readonly string[]): boolean {
    return !isThisAliasMemberPrefix(rawPrefix, thisAliases);
}

function isCommitDispatchContext(method: string): boolean {
    return method === 'commit' || method === 'dispatch';
}
