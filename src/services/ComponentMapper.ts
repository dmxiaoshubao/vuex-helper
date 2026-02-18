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
            const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
            const parts: string[] = [];
            let match;
            while ((match = scriptRegex.exec(text)) !== null) {
                parts.push(match[1]);
            }
            if (parts.length > 0) {
                scriptContent = parts.join('\n');
            }
        }

        // 预处理：修复不完整的代码，使其能够被解析
        let processedContent = scriptContent;

        // 修复行末的 `this.` / `this?.` 及其别名（如 `_t.` / `_t?.`）后面没有属性名的情况
        const thisAliasPattern = this.buildThisAliasPattern(scriptContent);
        processedContent = processedContent.replace(
            new RegExp(`(^|[^\\w$])(${thisAliasPattern})\\?\\.\\s*$`, 'gm'),
            '$1$2?.__placeholder__'
        );
        processedContent = processedContent.replace(
            new RegExp(`(^|[^\\w$])(${thisAliasPattern})\\.\\s*$`, 'gm'),
            '$1$2.__placeholder__'
        );

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
            const validHelpers = ['mapState', 'mapGetters', 'mapMutations', 'mapActions'] as const;
            type HelperName = typeof validHelpers[number];
            const helperFunctionInfo: Record<string, { namespace?: string; helperName: HelperName }> = {};
            const helperObjectNamespace: Record<string, string> = {};
            const namespacedFactoryNames = new Set<string>(['createNamespacedHelpers']);
            const localStringConstants: Record<string, string> = {};

            // 合并三次 AST 遍历为一次
            traverse(ast, {
                ImportDeclaration: (path: any) => {
                    const declaration = path.node;
                    if (!declaration.source || declaration.source.value !== 'vuex') return;

                    declaration.specifiers.forEach((specifier: any) => {
                        if (!specifier.local || !specifier.local.name) return;

                        if (specifier.type === 'ImportSpecifier' && specifier.imported?.name) {
                            const importedName = specifier.imported.name;
                            const localName = specifier.local.name;
                            if (importedName === 'createNamespacedHelpers') {
                                namespacedFactoryNames.add(localName);
                                return;
                            }
                            if (validHelpers.includes(importedName as HelperName)) {
                                helperFunctionInfo[localName] = {
                                    helperName: importedName as HelperName
                                };
                            }
                        }
                    });
                },
                VariableDeclarator: (path: any) => {
                    const declarator = path.node;

                    if (
                        declarator.id?.type === 'Identifier' &&
                        declarator.init?.type === 'StringLiteral'
                    ) {
                        localStringConstants[declarator.id.name] = declarator.init.value;
                    }

                    if (
                        declarator.id?.type === 'ObjectPattern' &&
                        declarator.init?.type === 'CallExpression' &&
                        declarator.init.callee?.type === 'Identifier' &&
                        declarator.init.callee.name === 'require' &&
                        declarator.init.arguments?.[0]?.type === 'StringLiteral' &&
                        declarator.init.arguments[0].value === 'vuex'
                    ) {
                        declarator.id.properties.forEach((prop: any) => {
                            if (prop.type !== 'ObjectProperty') return;

                            const importedName = prop.key?.name || prop.key?.value;
                            const localName = prop.value?.name || importedName;
                            if (!importedName || !localName) return;

                            if (importedName === 'createNamespacedHelpers') {
                                namespacedFactoryNames.add(localName);
                                return;
                            }

                            if (validHelpers.includes(importedName as HelperName)) {
                                helperFunctionInfo[localName] = { helperName: importedName as HelperName };
                            }
                        });
                    }

                    if (!declarator.init || declarator.init.type !== 'CallExpression') return;
                    const init = declarator.init;

                    if (init.callee.type !== 'Identifier' || !namespacedFactoryNames.has(init.callee.name)) return;
                    if (!init.arguments || init.arguments.length === 0) return;

                    let namespace: string | undefined;
                    const namespaceArg = init.arguments[0];
                    if (namespaceArg.type === 'StringLiteral') {
                        namespace = namespaceArg.value;
                    } else if (namespaceArg.type === 'Identifier') {
                        namespace = localStringConstants[namespaceArg.name];
                    }
                    if (!namespace) return;

                    if (declarator.id.type === 'Identifier') {
                        helperObjectNamespace[declarator.id.name] = namespace;
                        return;
                    }

                    if (declarator.id.type === 'ObjectPattern') {
                        declarator.id.properties.forEach((prop: any) => {
                            if (prop.type !== 'ObjectProperty') return;

                            const importedName = prop.key?.name || prop.key?.value;
                            if (!importedName || !validHelpers.includes(importedName)) return;

                            const localName = prop.value?.name || importedName;
                            helperFunctionInfo[localName] = { namespace, helperName: importedName as HelperName };
                        });
                    }
                },
                CallExpression: (path: any) => {
                    const callee = path.node.callee;
                    let calleeName: string | undefined;
                    let inferredNamespace: string | undefined;
                    let inferredHelperName: HelperName | undefined;

                    if (callee.type === 'Identifier') {
                        calleeName = callee.name;
                        const helperInfo = helperFunctionInfo[callee.name];
                        inferredNamespace = helperInfo?.namespace;
                        inferredHelperName = helperInfo?.helperName;
                    } else if (callee.type === 'MemberExpression' && callee.property) {
                        calleeName = callee.property.name;
                        if (callee.object && callee.object.type === 'Identifier') {
                            inferredNamespace = helperObjectNamespace[callee.object.name];
                        }
                    }

                    if (typeof calleeName === 'string') {
                        const helperName = (inferredHelperName || calleeName) as string;
                        if (!validHelpers.includes(helperName as HelperName)) {
                            return;
                        }

                        let type: 'state' | 'getter' | 'mutation' | 'action' | undefined;

                        if (helperName === 'mapState') type = 'state';
                        else if (helperName === 'mapGetters') type = 'getter';
                        else if (helperName === 'mapMutations') type = 'mutation';
                        else if (helperName === 'mapActions') type = 'action';

                        if (!type) return;

                        const args = path.node.arguments;
                        if (args.length === 0) return;

                        let namespace: string | undefined = inferredNamespace;
                        let mapObj: any;

                        // Check for namespace: mapState('ns', [...])
                        if (args[0].type === 'StringLiteral') {
                            namespace = args[0].value;
                            if (args.length > 1) {
                                mapObj = args[1];
                            }
                        } else if (
                            args[0].type === 'Identifier' &&
                            !!localStringConstants[args[0].name] &&
                            args.length > 1
                        ) {
                            namespace = localStringConstants[args[0].name];
                            mapObj = args[1];
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
                                    } else if (
                                        prop.value.type === 'ArrowFunctionExpression' ||
                                        prop.value.type === 'FunctionExpression'
                                    ) {
                                        // mapState({ local: state => state.xxx }) / method wrapper variants
                                        const inferredStateName =
                                            type === 'state' ? this.inferStatePropertyNameFromFunction(prop.value) : undefined;
                                        mapping[localName] = {
                                            type: type!,
                                            originalName: inferredStateName || localName,
                                            namespace
                                        };
                                    }
                                } else if (prop.type === 'ObjectMethod') {
                                    const localName = prop.key.name || prop.key.value;
                                    const inferredStateName =
                                        type === 'state' ? this.inferStatePropertyNameFromFunction(prop) : undefined;
                                    mapping[localName] = {
                                        type: type!,
                                        originalName: inferredStateName || localName,
                                        namespace
                                    };
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

    public dispose(): void {
        this.cache.clear();
    }

    public getCacheSize(): number {
        return this.cache.size;
    }

    private inferStatePropertyNameFromFunction(fnNode: any): string | undefined {
        if (!fnNode || !Array.isArray(fnNode.params) || fnNode.params.length === 0) {
            return undefined;
        }

        const firstParam = fnNode.params[0];
        if (!firstParam || firstParam.type !== 'Identifier' || !firstParam.name) {
            return undefined;
        }

        const stateParamName = firstParam.name;
        const expr = this.extractReturnedExpressionFromFunction(fnNode);
        if (!expr) {
            return undefined;
        }

        return this.inferStatePropertyFromExpression(expr, stateParamName);
    }

    private extractReturnedExpressionFromFunction(fnNode: any): any | undefined {
        if (!fnNode) return undefined;

        if (fnNode.type === 'ArrowFunctionExpression' && fnNode.body && fnNode.body.type !== 'BlockStatement') {
            return fnNode.body;
        }

        const body = fnNode.body && fnNode.body.type === 'BlockStatement' ? fnNode.body.body : [];
        for (const statement of body) {
            if (statement.type === 'ReturnStatement' && statement.argument) {
                return statement.argument;
            }
        }
        return undefined;
    }

    private inferStatePropertyFromExpression(expr: any, stateParamName: string): string | undefined {
        let current = expr;

        // Unwrap wrappers to keep the extraction tolerant while editing.
        while (current && (current.type === 'TSAsExpression' || current.type === 'TSTypeAssertion' || current.type === 'ParenthesizedExpression' || current.type === 'ChainExpression')) {
            current = current.expression;
        }

        if (!current) return undefined;

        const segments: string[] = [];
        let cursor = current;
        while (cursor && (cursor.type === 'MemberExpression' || cursor.type === 'OptionalMemberExpression')) {
            const propertyNode = cursor.property;
            if (!propertyNode) return undefined;

            let propName: string | undefined;
            if (!cursor.computed && propertyNode.type === 'Identifier') {
                propName = propertyNode.name;
            } else if (cursor.computed && propertyNode.type === 'StringLiteral') {
                propName = propertyNode.value;
            }
            if (!propName) return undefined;

            segments.unshift(propName);
            cursor = cursor.object;
        }

        if (!cursor || cursor.type !== 'Identifier' || cursor.name !== stateParamName) {
            return undefined;
        }

        return segments.join('.');
    }

    private trimCache(): void {
        while (this.cache.size > this.maxCacheEntries) {
            const firstKey = this.cache.keys().next().value;
            if (!firstKey) break;
            this.cache.delete(firstKey);
        }
    }

    private buildThisAliasPattern(scriptContent: string): string {
        const aliases = new Set<string>(['this', 'vm']);
        const aliasRegex = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*this\b/g;
        let match: RegExpExecArray | null;

        while ((match = aliasRegex.exec(scriptContent)) !== null) {
            if (match[1]) aliases.add(match[1]);
        }

        return Array.from(aliases)
            .sort((a, b) => b.length - a.length)
            .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');
    }
}
