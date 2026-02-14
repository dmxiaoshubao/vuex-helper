import * as vscode from 'vscode';

export type VuexContextType = 'state' | 'getter' | 'mutation' | 'action' | 'unknown';

export interface VuexContext {
    type: VuexContextType;
    method: 'mapHelper' | 'dispatch' | 'commit' | 'access'; // 'access' for this.$store.state.xxx
    namespace?: string;
    argumentIndex?: number; // 0-based index of the argument we are in
    isNested?: boolean; // true if we are inside [ ] or { } within the function call
    isObject?: boolean; // true if we are inside { } (Object context)
}

type HelperName = 'mapState' | 'mapGetters' | 'mapMutations' | 'mapActions';

interface HelperContext {
    functionAliasMap: Record<string, { helperName: HelperName; namespace?: string }>;
    objectNamespaceMap: Record<string, string>;
}

export class VuexContextScanner {

    /**
     * Determines the Vuex context at the given position.
     * Scans backwards to find if we are inside matchers like mapState([...]), this.$store.commit(...), etc.
     */
    public getContext(document: vscode.TextDocument, position: vscode.Position): VuexContext | undefined {
        const offset = document.offsetAt(position);
        const text = document.getText();

        // 对于 Vue 文件，只扫描 <script> 标签内的内容
        let scriptStart = 0;
        let scriptEnd = text.length;

        if (document.fileName.endsWith('.vue')) {
            const scriptTagMatch = text.match(/<script[^>]*>/);
            if (scriptTagMatch) {
                scriptStart = (scriptTagMatch.index || 0) + scriptTagMatch[0].length;
                const scriptCloseMatch = text.indexOf('</script>', scriptStart);
                if (scriptCloseMatch !== -1) {
                    scriptEnd = scriptCloseMatch;
                }
            }
        }
        if (offset < scriptStart || offset > scriptEnd) {
            return undefined;
        }

        // Safety check limit (look back max 2000 chars, but not before script start)
        const searchLimit = Math.max(scriptStart, offset - 2000);

        // Forward Scan on Window to simplify parsing
        const windowStart = searchLimit;
        const windowEnd = offset;
        const snippet = text.substring(windowStart, windowEnd);
        const helperContext = this.collectHelperContext(snippet);

        // Tokenize properly retaining string values to extract arguments
        const tokens = this.tokenize(snippet);

        // Parse stack to find enclosing function call and extracted args
        const result = this.analyzeTokens(tokens, helperContext);

        return result;
    }

    private tokenize(code: string): { type: 'word' | 'symbol' | 'string', value: string, index: number }[] {
        const tokens: { type: 'word' | 'symbol' | 'string', value: string, index: number }[] = [];

        // Regex:
        // 1. Strings: "...", '...', `...` - 单行匹配，避免截断导致跨行错误配对
        // 2. Symbols: ( ) [ ] { } ,
        // 3. Words: identifiers

        // 字符串匹配不跨行，避免 snippet 截断导致未闭合引号与后续引号错误配对
        const tokenRegex = /("[^\n]*?"|'[^\n]*?'|`[^`]*?`)|([(){},\[\]\.])|([a-zA-Z0-9_$]+)/g;

        // Pre-process: replace comments with spaces to avoid matching inside comments
        // Block comments: /\*[\s\S]*?\*/
        // Line comments: //.*$

        // We do this carefully. If we just blindly replace, we might mess up if a comment looks like a string or vice versa.
        // But for a simple scanner, standard strip is usually okay.
        const codeWithoutComments = code.replace(/\/\/.*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

        let match;
        while ((match = tokenRegex.exec(codeWithoutComments)) !== null) {
            if (match[1]) {
                tokens.push({ type: 'string', value: match[1], index: match.index });
            } else if (match[2]) {
                tokens.push({ type: 'symbol', value: match[2], index: match.index });
            } else if (match[3]) {
                tokens.push({ type: 'word', value: match[3], index: match.index });
            }
        }
        return tokens;
    }

    private analyzeTokens(tokens: { type: string, value: string }[], helperContext: HelperContext): VuexContext | undefined {
        // Stack to track brackets/parentheses and what precedes them
        // We also want to track arguments 'accumulated' inside the current parentheses scope
        const outputStack: {
            token: string,
            index: number,
            precedingWord: string,
            precedingObject: string,
            extractedArgs: string[],
            argIndex: number // Track current argument index (comma count)
        }[] = [];

        let prevWord = '';
        let prevObject = '';
        let pendingMemberObject = '';

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (token.type === 'symbol') {
                if (token.value === '.') {
                    if (prevWord) {
                        pendingMemberObject = prevWord;
                    }
                    prevWord = '';
                    continue;
                }

                if (['(', '{', '['].includes(token.value)) {
                    outputStack.push({
                        token: token.value,
                        index: i,
                        precedingWord: prevWord,
                        precedingObject: prevObject,
                        extractedArgs: [],
                        argIndex: 0
                    });
                    prevWord = '';
                    prevObject = '';
                    pendingMemberObject = '';
                } else if ([')', '}', ']'].includes(token.value)) {
                    if (outputStack.length > 0) {
                        const last = outputStack[outputStack.length - 1];
                        // Basic matching check
                        if ((token.value === ')' && last.token === '(') ||
                            (token.value === '}' && last.token === '{') ||
                            (token.value === ']' && last.token === '[')) {
                            outputStack.pop();
                        }
                    }
                    prevWord = '';
                    prevObject = '';
                    pendingMemberObject = '';
                } else if (token.value === ',') {
                     // Comma increments argument index for the current scope
                     if (outputStack.length > 0) {
                         outputStack[outputStack.length - 1].argIndex++;
                     }
                     prevWord = '';
                     prevObject = '';
                     pendingMemberObject = '';
                }
            } else if (token.type === 'string') {
                // If we are directly inside a function call '(', this string is an argument
                 if (outputStack.length > 0) {
                     const last = outputStack[outputStack.length - 1];
                     if (last.token === '(') {
                        last.extractedArgs.push(token.value);
                     }
                 }
                 prevWord = '';
                 prevObject = '';
                 pendingMemberObject = '';
            } else {
                // word
                prevWord = token.value;
                if (pendingMemberObject) {
                    prevObject = pendingMemberObject;
                    pendingMemberObject = '';
                } else {
                    prevObject = '';
                }
            }
        }

        // Now, look at the stack to find the immediate Vuex context.

        // nestingLevel: 0 means we are directly in the function. > 0 means we are in [ or {
        let nestingLevel = 0;

        for (let i = outputStack.length - 1; i >= 0; i--) {
            const frame = outputStack[i];

            if (frame.token === '(') {
                const func = frame.precedingWord;
                const helperInfo = helperContext.functionAliasMap[func];
                const canonicalFunc = helperInfo?.helperName || func;
                let namespace: string | undefined = helperInfo?.namespace;
                if (!namespace && frame.precedingObject) {
                    namespace = helperContext.objectNamespaceMap[frame.precedingObject];
                }
                let namespaceFromArguments: string | undefined = undefined;

                // Identify namespace if present (if we are at argIndex >= 1)
                if (frame.extractedArgs.length > 0) {
                    const firstArg = frame.extractedArgs[0];
                    // Strip quotes
                    if (firstArg.length >= 2) {
                         namespaceFromArguments = firstArg.slice(1, -1);
                    }
                }

                // If we are in the first argument (argIndex 0), namespace is not yet established from arguments
                // (unless we are editing it right now, which is handled by provider logic using direct string match)
                if (frame.argIndex > 0 && namespaceFromArguments) {
                    namespace = namespaceFromArguments;
                }

                if (['mapState', 'mapGetters', 'mapMutations', 'mapActions'].includes(canonicalFunc)) {
                    let type: VuexContextType = 'unknown';
                    if (canonicalFunc === 'mapState') type = 'state';
                    if (canonicalFunc === 'mapGetters') type = 'getter';
                    if (canonicalFunc === 'mapMutations') type = 'mutation';
                    if (canonicalFunc === 'mapActions') type = 'action';

                    return {
                        type,
                        method: 'mapHelper',
                        namespace,
                        argumentIndex: frame.argIndex,
                        isNested: nestingLevel > 0,
                        isObject: nestingLevel > 0 && outputStack[outputStack.length - 1].token === '{'
                    };
                }

                if (['commit', 'dispatch'].includes(func)) {
                    let type: VuexContextType = 'unknown';
                     if (func === 'commit') type = 'mutation';
                     if (func === 'dispatch') type = 'action';
                     return {
                         type,
                         method: func as any,
                         namespace, // Usually commit('ns/module')
                         argumentIndex: frame.argIndex,
                         isNested: nestingLevel > 0,
                         isObject: false // commit/dispatch don't usually use object context like mapHelpers
                     };
                }
            }

            // If we didn't return, we are going up the stack.
            // The current frame (e.g. '[') contributes to nesting for the *next* iteration (parent).
            nestingLevel++;
        }

        return undefined;
    }

    private collectHelperContext(snippet: string): HelperContext {
        const functionAliasMap: Record<string, { helperName: HelperName; namespace?: string }> = {
            mapState: { helperName: 'mapState' },
            mapGetters: { helperName: 'mapGetters' },
            mapMutations: { helperName: 'mapMutations' },
            mapActions: { helperName: 'mapActions' }
        };
        const objectNamespaceMap: Record<string, string> = {};
        const stringConstants: Record<string, string> = {};
        const namespacedFactoryNames = new Set<string>(['createNamespacedHelpers']);

        const parseNamespaceArg = (raw: string): string | undefined => {
            const trimmed = raw.trim();
            const quoted = trimmed.match(/^['"]([^'"]+)['"]$/);
            if (quoted) return quoted[1];
            return stringConstants[trimmed];
        };

        const constantRegex = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"][^'"]+['"])/g;
        for (const match of snippet.matchAll(constantRegex)) {
            const varName = match[1];
            const literal = match[2];
            const valueMatch = literal.match(/^['"]([^'"]+)['"]$/);
            if (varName && valueMatch) {
                stringConstants[varName] = valueMatch[1];
            }
        }

        const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]vuex['"]/g;
        for (const match of snippet.matchAll(importRegex)) {
            const specList = match[1];
            if (!specList) continue;
            const specs = specList.split(',').map((s) => s.trim()).filter(Boolean);
            specs.forEach((spec) => {
                const aliasMatch = spec.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
                const importedName = aliasMatch ? aliasMatch[1] : spec;
                const localName = aliasMatch ? aliasMatch[2] : spec;
                if (importedName === 'createNamespacedHelpers') {
                    namespacedFactoryNames.add(localName);
                    return;
                }
                if (['mapState', 'mapGetters', 'mapMutations', 'mapActions'].includes(importedName)) {
                    functionAliasMap[localName] = { helperName: importedName as HelperName };
                }
            });
        }

        const requireRegex = /\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(\s*['"]vuex['"]\s*\)/g;
        for (const match of snippet.matchAll(requireRegex)) {
            const specList = match[1];
            if (!specList) continue;
            const specs = specList.split(',').map((s) => s.trim()).filter(Boolean);
            specs.forEach((spec) => {
                const aliasMatch = spec.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/);
                const importedName = aliasMatch ? aliasMatch[1] : spec;
                const localName = aliasMatch ? aliasMatch[2] : spec;
                if (importedName === 'createNamespacedHelpers') {
                    namespacedFactoryNames.add(localName);
                    return;
                }
                if (['mapState', 'mapGetters', 'mapMutations', 'mapActions'].includes(importedName)) {
                    functionAliasMap[localName] = { helperName: importedName as HelperName };
                }
            });
        }

        namespacedFactoryNames.forEach((factoryName) => {
            const escapedFactory = factoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const objectFactoryRegex = new RegExp(
                `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escapedFactory}\\(\\s*([^\\)]+)\\s*\\)`,
                'g'
            );
            for (const match of snippet.matchAll(objectFactoryRegex)) {
                const localName = match[1];
                const namespace = parseNamespaceArg(match[2] || '');
                if (localName && namespace) {
                    objectNamespaceMap[localName] = namespace;
                }
            }

            const destructureFactoryRegex = new RegExp(
                `\\b(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*${escapedFactory}\\(\\s*([^\\)]+)\\s*\\)`,
                'g'
            );
            for (const match of snippet.matchAll(destructureFactoryRegex)) {
                const specList = match[1];
                const namespace = parseNamespaceArg(match[2] || '');
                if (!specList || !namespace) continue;

                const specs = specList.split(',').map((s) => s.trim()).filter(Boolean);
                specs.forEach((spec) => {
                    const aliasMatch = spec.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/);
                    const helperName = aliasMatch ? aliasMatch[1] : spec;
                    const localName = aliasMatch ? aliasMatch[2] : spec;
                    if (['mapState', 'mapGetters', 'mapMutations', 'mapActions'].includes(helperName)) {
                        functionAliasMap[localName] = { helperName: helperName as HelperName, namespace };
                    }
                });
            }
        });

        return { functionAliasMap, objectNamespaceMap };
    }
}
