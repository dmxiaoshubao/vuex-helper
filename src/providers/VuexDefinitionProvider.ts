import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';
import { VuexLookupService } from '../services/VuexLookupService';
import {
    extractStateAccessPath,
    extractRootAccessPath,
    extractBracketPath,
    hasRootTrueOption,
    resolveMappedItem,
} from '../utils/VuexProviderUtils';

export class VuexDefinitionProvider implements vscode.DefinitionProvider {
    private scanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;
    private lookupService: VuexLookupService;

    constructor(storeIndexer: StoreIndexer, componentMapper?: ComponentMapper) {
        this.storeIndexer = storeIndexer;
        this.scanner = new VuexContextScanner();
        this.componentMapper = componentMapper ?? new ComponentMapper();
        this.lookupService = new VuexLookupService(storeIndexer);
    }

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        if (token.isCancellationRequested) return undefined;
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;

        const word = document.getText(range);

        // 1. Component Mapping (for this.methodName usage)
        const lineText = document.lineAt(position.line).text;
        const rawPrefix = lineText.substring(0, range.start.character);
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = resolveMappedItem(mapping, rawPrefix, word);
        if (mappedItem) {
            return this.findDefinition(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }

        // 功能 3：检查是否是 state 链式访问的中间路径词（如 state.common.merchant 中的 common）
        if (!mappedItem) {
            for (const key in mapping) {
                if (token.isCancellationRequested) return undefined;
                const info = mapping[key];
                if (info.type === 'state' && info.originalName.includes('.')) {
                    const parts = info.originalName.split('.');
                    const wordIndex = parts.indexOf(word);
                    if (wordIndex >= 0 && wordIndex < parts.length - 1) {
                        // word 是中间路径段，跳转到对应的 module 定义
                        const modulePath = parts.slice(0, wordIndex + 1).join('/');
                        const fullNamespace = info.namespace
                            ? `${info.namespace}/${modulePath}`
                            : modulePath;
                        return this.findModuleDefinition(fullNamespace);
                    }
                }
            }
        }

        const currentNamespace = this.storeIndexer.getNamespace(document.fileName);

        // 2. Local State Definition (state.xxx)
        // Check if preceding text ends with "state."
        const stateAccessPath = extractStateAccessPath(rawPrefix, word);

        // 2a. rootState.xxx — 从根开始查找 state
        const rootStateAccessPath = extractRootAccessPath(rawPrefix, word, 'rootState');
        if (rootStateAccessPath) {
            // 检查 word 右侧是否有后续 ".xxx"，如果有则当前词是中间路径词
            const rawSuffix = lineText.substring(range.end.character);
            const suffixMatch = rawSuffix.match(/^\.([A-Za-z0-9_$\.]+)/);
            if (suffixMatch) {
                // word 是中间路径词，跳转到对应的 module 定义
                const nsSegments = rootStateAccessPath.replace(/\./g, '/');
                const moduleDef = this.findModuleDefinition(nsSegments);
                if (moduleDef) return moduleDef;
            }
            return this.findDefinition(rootStateAccessPath, 'state');
        }

        // 2b. rootGetters.xxx — 用 extractRootAccessPath 统一处理
        const rootGettersAccessPath = extractRootAccessPath(rawPrefix, word, 'rootGetters');
        if (rootGettersAccessPath) {
            return this.findDefinition(rootGettersAccessPath, 'getter');
        }

        // 2c. rootGetters['xxx'] — 方括号语法访问命名空间 getter
        const rootGettersBracketPath = extractBracketPath(rawPrefix, 'rootGetters');
        if (rootGettersBracketPath) {
            const fullPath = rootGettersBracketPath + word;
            return this.findDefinition(fullPath, 'getter');
        }

        if (currentNamespace && /\bstate\.$/.test(rawPrefix)) {
             return this.findDefinition(word, 'state', currentNamespace.join('/'));
        }

        // 3. Try VuexContextScanner (for String Literal contexts like mapState('...'))
        const context = this.scanner.getContext(document, position);
        if (token.isCancellationRequested) return undefined;
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
                // 功能 3 补充：在 state 上下文中检查中间路径词的 module 跳转
                // 例如 state.user.name 中点击 user，stateAccessPath = "user"
                // 需要检查 word 右侧是否还有 ".xxx" 后续路径
                const rawSuffix = lineText.substring(range.end.character);
                const suffixMatch = rawSuffix.match(/^\.([A-Za-z0-9_$\.]+)/);
                if (suffixMatch) {
                    // word 右侧还有后续路径（如 ".name"），说明 word 是中间路径词
                    const nsFromPath = stateAccessPath; // stateAccessPath 已经包含了 word 及其左侧路径
                    const nsSegments = nsFromPath.replace(/\./g, '/');
                    const fullNs = context.namespace
                        ? `${context.namespace}/${nsSegments}`
                        : nsSegments;
                    const moduleDef = this.findModuleDefinition(fullNs);
                    if (moduleDef) return moduleDef;
                }
                return this.findDefinition(stateAccessPath, 'state', context.namespace, currentNamespace, preferLocalFromContext);
            }
            const explicitPath = this.extractStringLiteralPathAtPosition(document, position);
            if (explicitPath && explicitPath.includes('/')) {
                const parts = explicitPath.split('/');
                const nameFromPath = parts.pop();
                const namespaceFromPath = parts.join('/');
                if (nameFromPath && namespaceFromPath) {
                    return this.findDefinition(nameFromPath, context.type, namespaceFromPath, currentNamespace, preferLocalFromContext);
                }
            }
            return this.findDefinition(word, context.type, context.namespace, currentNamespace, preferLocalFromContext);
        }

        return undefined;
    }


    private extractStringLiteralPathAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): string | undefined {
        const lineText = document.lineAt(position.line).text;
        const cursor = position.character;
        const quoteChars = [`'`, `"`, '`'];

        let start = -1;
        let quoteChar = '';
        for (let i = cursor; i >= 0; i--) {
            const ch = lineText.charAt(i);
            if (quoteChars.includes(ch)) {
                start = i;
                quoteChar = ch;
                break;
            }
        }
        if (start < 0 || !quoteChar) return undefined;

        let end = -1;
        for (let i = start + 1; i < lineText.length; i++) {
            if (lineText.charAt(i) === quoteChar && lineText.charAt(i - 1) !== '\\') {
                end = i;
                break;
            }
        }
        if (end < 0) return undefined;

        if (cursor <= start || cursor > end) return undefined;
        return lineText.substring(start + 1, end).trim();
    }

    private findDefinition(
        name: string,
        type: 'state' | 'getter' | 'mutation' | 'action',
        namespace?: string,
        currentNamespace?: string[],
        preferLocal: boolean = true
    ): vscode.Definition | undefined {
        const found = this.lookupService.findItem({
            name,
            type,
            namespace,
            currentNamespace,
            preferLocal,
            allowRootFallback: true
        });
        return found?.defLocation;
    }

    /**
     * 查找指定命名空间对应的模块文件定义位置。
     * 通过查找 storeMap 中属于该命名空间的任意项来定位文件。
     */
    private findModuleDefinition(namespace: string): vscode.Definition | undefined {
        const def = this.storeIndexer.getModuleDefinition(namespace);
        if (!def) return undefined;
        return new vscode.Location(def.uri, new vscode.Position(0, 0));
    }
}
