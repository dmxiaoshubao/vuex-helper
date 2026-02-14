import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as vscode from 'vscode';

export interface ComponentMapInfo {
    // Map local name to Vuex item Info
    // type: 'state' | 'getter' | 'mutation' | 'action'
    // originalName: string (the name in the store)
    // namespace?: string (the namespace if any)
    [localName: string]: {
        type: 'state' | 'getter' | 'mutation' | 'action';
        originalName: string;
        namespace?: string;
    };
}

export class ComponentMapper {
    
    private readonly maxCacheEntries = 100;
    private cache: Map<string, { version: number, mapping: ComponentMapInfo }> = new Map();

    /**
     * Analyzes the given document to find Vuex mapHelpers and build a mapping.
     */
    public getMapping(document: vscode.TextDocument): ComponentMapInfo {
        const text = document.getText();
        const uri = document.uri.toString();

        const cached = this.cache.get(uri);
        if (cached && cached.version === document.version) {
            // Touch entry for basic LRU behavior.
            this.cache.delete(uri);
            this.cache.set(uri, cached);
            return cached.mapping;
        }

        // For Vue files, extract script content
        let scriptContent = text;

        if (document.languageId === 'vue') {
            const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/);
            if (scriptMatch) {
                scriptContent = scriptMatch[1];
            }
        }

        // 预处理：修复不完整的代码，使其能够被解析
        let processedContent = scriptContent;

        // 修复行末的 `this.` 或 `vm.` 后面没有属性名的情况
        processedContent = processedContent.replace(/(this|vm)\.\s*$/gm, '$1.__placeholder__');

        // 修复 mapHelper 数组中的空字符串参数
        // 如 mapState([""]) -> mapState(["__placeholder__"])
        // 如 mapState(["count", ""]) -> mapState(["count", "__placeholder__"])
        // 如 mapState(["", "count"]) -> mapState(["__placeholder__", "count"])
        processedContent = processedContent.replace(/,\s*(['"])\s*\1\s*([,\]])/g, ', "__placeholder__"$2');
        processedContent = processedContent.replace(/\[\s*(['"])\s*\1\s*([,\]])/g, '["__placeholder__"$2');

        // 修复 mapHelper 对象中的空字符串值，如 { key: "" } -> { key: "__placeholder__" }
        processedContent = processedContent.replace(/:\s*(['"])\s*\1\s*([,}\]])/g, ': "__placeholder__"$2');

        try {
            const ast = parser.parse(processedContent, {
                sourceType: 'module',
                plugins: ['typescript', 'decorators-legacy', 'classProperties', 'jsx'],
                errorRecovery: true, // Crucial for completion while typing
                allowAwaitOutsideFunction: true,
                allowReturnOutsideFunction: true,
                allowUndeclaredExports: true
            });

            const mapping: ComponentMapInfo = {};
            const validHelpers = ['mapState', 'mapGetters', 'mapMutations', 'mapActions'];

            traverse(ast, {
                CallExpression(path: any) {
                    const callee = path.node.callee;
                    const calleeName = callee.name || (callee.property && callee.property.name);

                    if (typeof calleeName === 'string' && validHelpers.includes(calleeName)) {
                        const helperName = calleeName;

                        let type: 'state' | 'getter' | 'mutation' | 'action' | undefined;

                        if (helperName === 'mapState') type = 'state';
                        else if (helperName === 'mapGetters') type = 'getter';
                        else if (helperName === 'mapMutations') type = 'mutation';
                        else if (helperName === 'mapActions') type = 'action';

                        if (!type) return;

                        const args = path.node.arguments;
                        if (args.length === 0) return;

                        let namespace: string | undefined;
                        let mapObj: any;

                        // Check for namespace: mapState('ns', [...])
                        if (args[0].type === 'StringLiteral') {
                            namespace = args[0].value;
                            if (args.length > 1) {
                                mapObj = args[1];
                            }
                        } else {
                            mapObj = args[0];
                        }

                        if (!mapObj) return;

                        // Handle Array: mapState(['count']) -> local 'count' maps to store 'count'
                        if (mapObj.type === 'ArrayExpression') {
                            mapObj.elements.forEach((el: any) => {
                                if (el && el.type === 'StringLiteral') {
                                    const name = el.value;
                                    mapping[name] = { type: type!, originalName: name, namespace };
                                }
                            });
                        }
                        // Handle Object: mapState({ alias: 'count' })
                        else if (mapObj.type === 'ObjectExpression') {
                            mapObj.properties.forEach((prop: any) => {
                                if (prop.type === 'ObjectProperty') {
                                    const localName = prop.key.name || prop.key.value;

                                    if (prop.value.type === 'StringLiteral') {
                                        mapping[localName] = { type: type!, originalName: prop.value.value, namespace };
                                    }
                                }
                            });
                        }
                    }
                }
            });

            // 过滤掉预处理占位符 __placeholder__
            // 1. 删除 key 为 __placeholder__ 的映射
            delete mapping['__placeholder__'];

            // 2. 删除 originalName 为 __placeholder__ 的映射（值是空字符串的情况）
            for (const key in mapping) {
                if (mapping[key].originalName === '__placeholder__') {
                    delete mapping[key];
                }
            }

            // Success, update cache
            this.cache.set(uri, { version: document.version, mapping });
            this.trimCache();
            return mapping;

        } catch (e) {
            // If failed (highly unlikely with errorRecovery, but still), return cache
            return cached ? cached.mapping : {};
        }
    }

    public getCacheSize(): number {
        return this.cache.size;
    }

    private trimCache(): void {
        while (this.cache.size > this.maxCacheEntries) {
            const firstKey = this.cache.keys().next().value;
            if (!firstKey) break;
            this.cache.delete(firstKey);
        }
    }
}
