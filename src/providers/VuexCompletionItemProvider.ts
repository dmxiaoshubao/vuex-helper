import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';

export class VuexCompletionItemProvider implements vscode.CompletionItemProvider {
    private contextScanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;

    constructor(storeIndexer: StoreIndexer) {
        this.storeIndexer = storeIndexer;
        this.contextScanner = new VuexContextScanner();
        this.componentMapper = new ComponentMapper();
    }

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

        const currentNamespace = this.storeIndexer.getNamespace(document.fileName);

        // 1. Vuex Context (String literals) - existing logic
        const vuexContext = this.contextScanner.getContext(document, position);
        if (vuexContext && vuexContext.type !== 'unknown') {
            let items: { name: string, documentation?: string, modulePath: string[] }[] = [];
            let kind = vscode.CompletionItemKind.Property;

            // Special Case: mapHelper arg 0 -> Show Modules
            if (vuexContext.method === 'mapHelper' && vuexContext.argumentIndex === 0 && !vuexContext.isNested) {
                // Collect all unique modules
                const allModules = new Set<string>();
                // Gather modules from all stores
                [...storeMap.state, ...storeMap.getters, ...storeMap.mutations, ...storeMap.actions].forEach(item => {
                    const path = item.modulePath.join('/');
                    if (path) allModules.add(path);
                });
                
                // Create Module items
                const moduleItems: vscode.CompletionItem[] = [];
                allModules.forEach(mod => {
                    const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
                    item.detail = '[Vuex Module]';
                    item.sortText = `\u0000${mod}`; // 使用 null 字符确保最高优先级
                    item.preselect = true; // 标记为预选项
                    moduleItems.push(item);
                });
                
                items = []; // Clear other items
                // We will use existing robust quote/range logic below to render these moduleItems
                // Just map them to the structure expected by the logic below?
                // The logic below expects { name, documentation, modulePath }.
                // Let's adapt.
                
                // We can just return here? 
                // Wait, existing logic below handles "Smart Quote Insertion". WE NEED THAT.
                // So we should populate `items` with our module items but adapted to the interface expected?
                // The interface is `{ name: string, documentation?: string, modulePath: string[] }[]`.
                // If we treat "module path" as the "name" and empty modulePath?
                
                // Let's create a temporary list compatible with the logic below.
                const tempItems = Array.from(allModules).map(mod => ({
                    name: mod,
                    modulePath: [] as string[], // It's just a name
                    documentation: `Vuex Module: ${mod}`
                }));
                
                // Update items
                items = tempItems;
                kind = vscode.CompletionItemKind.Module;
                
            } else {
                // Normal Logic
                if (vuexContext.type === 'state') {
                    items = storeMap.state;
                    kind = vscode.CompletionItemKind.Field;
                } else if (vuexContext.type === 'getter') {
                    items = storeMap.getters;
                    kind = vscode.CompletionItemKind.Property;
                } else if (vuexContext.type === 'mutation') {
                    items = storeMap.mutations;
                    kind = vscode.CompletionItemKind.Method;
                } else if (vuexContext.type === 'action') {
                    items = storeMap.actions;
                    kind = vscode.CompletionItemKind.Function;
                }
    
                // Filtering by Namespace
                if (vuexContext.namespace) {
                    const ns = vuexContext.namespace;
                    items = items.filter(i => i.modulePath.join('/') === ns);
                } else if (currentNamespace && (vuexContext.type === 'mutation' || vuexContext.type === 'action')) {
                    // If inside a module, scoped completion for commit/dispatch
                    // Filter to only current module items (Strict scoping as per user request)
                    const nsJoined = currentNamespace.join('/');
                    items = items.filter(i => i.modulePath.join('/') === nsJoined);
                }
            }


            // Smart Quote Insertion - Robust Logic (Manual Scan)
            const lineText = document.lineAt(position.line).text;
            const prefix = lineText.substring(0, position.character);
            
            let currentWordLength = 0;
            let foundContent = false;
            let whitespaceSuffix = '';
            
            // Scan backwards to find the current "word" (key path) plus trailing spaces
            // Robust logic:
            // 1. Absorb trailing spaces into whitespaceSuffix.
            // 2. If we find content (non-space), we keep the whitespaceSuffix as part of the match.
            // 3. If we hit the start of line (or limit) and NO content was found (pure whitespace/indentation), we IGNORE the whitespace.
            
            for (let i = prefix.length - 1; i >= 0; i--) {
                const char = prefix.charAt(i);
                
                // Hard separators - stop immediately
                if (["'", '"', '`', '[', ']', '(', ')', ',', '{', '}', ':', ';', '.'].includes(char)) {
                     break; 
                }
                
                // Space handling
                if ([' ', '\t', '\n', '\r'].includes(char)) {
                    if (foundContent) {
                         // Space AFTER content -> This suggests we hit a word boundary
                         // e.g. "param1 param2" -> param2 is the word, param1 is separate.
                         break;
                    }
                    // Space BEFORE content (trailing space relative to typing direction) -> absorb it
                     whitespaceSuffix = char + whitespaceSuffix;
                } else {
                    // Non-space content found
                    foundContent = true;
                }
                
                // Non-space content found, count it
                currentWordLength++;
            }

            // CRITICAL FIX: If we only found whitespace (indentation), DO NOT include it in replacement.
            if (!foundContent) {
                currentWordLength = 0;
                whitespaceSuffix = '';
            }

            // Calculate the range to replace.
            const replacementRange = new vscode.Range(
                position.line,
                position.character - currentWordLength,
                position.line,
                position.character
            );
            
            // Look at what's before the current word to detect context
            const effectivePrefix = prefix.substring(0, prefix.length - currentWordLength).trimEnd();
            const lastChar = effectivePrefix.charAt(effectivePrefix.length - 1);

            const isInsideQuote = ["'", '"', '`'].includes(lastChar);
            
            // Fix: Check property access based on effectivePrefix (before current word)
            // e.g. "state.c" -> effectivePrefix="state.", lastChar='.'
            const isPropertyAccess = lastChar === '.';

                // Handling Property Access (e.g. "state." or "state.user.")
                if (isPropertyAccess && (vuexContext.type === 'state')) {
                     // 1. Extract the dotted path after "state." relative to the current namespace
                    // effectivePrefix (e.g. "... state.user.") -> split by dot
                    const match = effectivePrefix.match(/state\.([\w\.]*)$/);
                    let relativePath: string[] = [];
                    let pathPrefix = ''; // 用于 filterText 优化

                    if (match && match[1] !== undefined) {
                         const pathStr = match[1]; // e.g. "user." or ""
                         pathPrefix = pathStr; // 保留完整路径（包括尾部点号）用于 filterText
                         const inner = pathStr.slice(0, -1); // remove trailing dot
                         if (inner.length > 0) {
                             relativePath = inner.split('.');
                         }
                    }

                    // Combined path = currentNamespace + relativePath
                    const baseNamespace = currentNamespace || [];
                    const targetPath = [...baseNamespace, ...relativePath];

                    const suggestions = new Map<string, vscode.CompletionItem>();

                     items.forEach(item => {
                        // Check if item belongs to the target path hierarchy
                        // item.modulePath must start with targetPath
                        
                        // Check match:
                        if (item.modulePath.length < targetPath.length) return;
                        
                        for (let i = 0; i < targetPath.length; i++) {
                            if (item.modulePath[i] !== targetPath[i]) return;
                        }

                        // Now determine if it's a direct property or a submodule
                        const remainingPath = item.modulePath.slice(targetPath.length);
                        
                        if (remainingPath.length === 0) {
                            // Direct property
                            const label = item.name;
                            if (!suggestions.has(label)) {
                                const ci = new vscode.CompletionItem(label, vscode.CompletionItemKind.Field);
                                ci.detail = `[Vuex] State`;
                                ci.sortText = `\u0000${label}`; // 使用 null 字符确保最高优先级
                                ci.preselect = true; // 标记为预选项
                                ci.documentation = item.documentation ? new vscode.MarkdownString(item.documentation) : undefined;
                                ci.insertText = label;
                                ci.range = replacementRange;
                                // 优化 filterText：包含完整路径以提高匹配分数
                                // 例如：用户输入 "state.others."，filterText 为 "others.age"
                                ci.filterText = pathPrefix + label + (whitespaceSuffix || '');
                                suggestions.set(label, ci);
                            }
                        } else {
                            // Submodule
                            // Suggest the next segment
                            const nextModule = remainingPath[0];
                            if (!suggestions.has(nextModule)) {
                                const ci = new vscode.CompletionItem(nextModule, vscode.CompletionItemKind.Module);
                                ci.detail = `[Vuex] Module`;
                                ci.sortText = `\u0000${nextModule}`; // 使用 null 字符确保最高优先级
                                ci.preselect = true; // 标记为预选项
                                ci.insertText = nextModule;
                                ci.range = replacementRange;
                                // 优化 filterText：包含完整路径以提高匹配分数
                                ci.filterText = pathPrefix + nextModule + (whitespaceSuffix || '');
                                suggestions.set(nextModule, ci);
                            }
                        }
                    });

                    return new vscode.CompletionList(Array.from(suggestions.values()), false);
                }

                const results = items.map(item => {
                let label = [...item.modulePath, item.name].join('/');
                // If inside a module and matches current namespace, use short name
                if (currentNamespace && item.modulePath.join('/') === currentNamespace.join('/')) {
                    label = item.name;
                }
                // OR if explicit namespace arg was provided (handled by existing logic, but let's be safe)
                if (vuexContext.namespace) {
                     label = item.name;
                }

                const completionItem = new vscode.CompletionItem(label, kind);
                completionItem.detail = `[Vuex] ${vuexContext.type}`;
                completionItem.sortText = `\u0000${label}`; // 使用 null 字符确保最高优先级
                completionItem.preselect = true; // 标记为预选项
                
                if (item.documentation) {
                    completionItem.documentation = new vscode.MarkdownString(item.documentation);
                }

                // CRITICAL: Ensure filterText matches what the user typed (including space) so VS Code doesn't hide it.
                if (whitespaceSuffix) {
                   completionItem.filterText = label + whitespaceSuffix;
                }
                
                // Apply range to ensure we replace the full typed prefix (e.g., "base/" in "base/setBaseUrl")
                completionItem.range = replacementRange;

                if (!isInsideQuote) {
                     if (vuexContext.isObject) {
                         const alias = item.name; 
                         completionItem.insertText = `${alias}: '${label}'`;
                     } else {
                         completionItem.insertText = `'${label}'`;
                     }
                }

                return completionItem;
            });

            return new vscode.CompletionList(results, false);
        }

        // 2. In-Module State Completion (state.xxx)
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, position.character);

        if (currentNamespace && /\bstate\.$/.test(prefix)) {
            const nsJoined = currentNamespace.join('/');
            const items = storeMap.state.filter(s => s.modulePath.join('/') === nsJoined);

            const completionItems = items.map(item => {
                const completionItem = new vscode.CompletionItem(item.name, vscode.CompletionItemKind.Field);
                completionItem.detail = `[Vuex Module] state`;
                completionItem.sortText = `\u0000${item.name}`; // 使用 null 字符确保最高优先级
                completionItem.preselect = true; // 标记为预选项
                if (item.documentation) {
                    completionItem.documentation = new vscode.MarkdownString(item.documentation);
                }
                 // If we have type info, show it
                if (item.displayType) {
                    completionItem.detail += ` : ${item.displayType}`;
                }
                return completionItem;
            });

            return new vscode.CompletionList(completionItems, false);
        }
        
        const match = prefix.match(/(?:this|vm)\.([a-zA-Z0-9_$]*)$/);
        
        if (match) {
             const mapping = this.componentMapper.getMapping(document);
             const items: vscode.CompletionItem[] = [];

             // Range covering the dot and the identifier typed so far
             // match[1] is the identifier. 
             // prefix ends at position.character.
             // Dot is at position.character - match[1].length - 1
             const validIdLength = match[1].length;
             const dotPosition = position.character - validIdLength - 1;
             
             // Range that includes the dot (e.g. ".o")
             const bracketReplacementRange = new vscode.Range(
                 position.line, 
                 dotPosition, 
                 position.line, 
                 position.character
             );

             for (const localName in mapping) {
                const info = mapping[localName];
                let kind = vscode.CompletionItemKind.Method; 
                if (info.type === 'state') kind = vscode.CompletionItemKind.Field;
                if (info.type === 'getter') kind = vscode.CompletionItemKind.Property;
                
                const item = new vscode.CompletionItem(localName, kind);
                item.detail = `[Vuex Mapped] ${info.type} -> ${info.namespace ? info.namespace + '/' : ''}${info.originalName}`;
                item.sortText = `\u0000${localName}`; // 使用 null 字符确保最高优先级
                item.preselect = true;
                
                const storeMatch = this.findStoreItem(info.originalName, info.type, info.namespace, storeMap);
                if (storeMatch && storeMatch.documentation) {
                    item.documentation = new vscode.MarkdownString(storeMatch.documentation);
                }

                // Handling namespaced helpers (containing slashes)
                if (localName.includes('/')) {
                    // Use bracket notation: this['others/ADD_ROLE']
                    // We must replace the dot typed by the user.
                    item.range = bracketReplacementRange;
                    // Ensure filterText allows matching ".foo" against this item
                    item.filterText = '.' + localName; 

                    const quote = "'"; // Default to single quote
                    // Escape quotes in name just in case
                    const safeName = localName.replace(/'/g, "\\'");
                    
                    if (info.type === 'mutation' || info.type === 'action') {
                        // Append parentheses for methods and place cursor inside?
                        // User requirement: "mutations / actions need to append () ... eg: this['...']()"
                        // Usually implies cursor after or inside. Let's put cursor inside for args.
                        item.insertText = new vscode.SnippetString(`['${safeName}']($0)`);
                    } else {
                        // Property access only
                        item.insertText = `['${safeName}']`;
                    }
                }

                items.push(item);
            }

            if (items.length > 0) {
                return new vscode.CompletionList(items, false);
            }
        }

        return undefined;
    }

    private findStoreItem(name: string, type: string, namespace: string | undefined, storeMap: any) {
         const matchItem = (item: { name: string, modulePath: string[] }) => {
            if (namespace) {
                return item.name === name && item.modulePath.join('/') === namespace;
            } else {
                 if (name.includes('/')) {
                    const parts = name.split('/');
                    const realName = parts.pop()!;
                    const namespaceStr = parts.join('/');
                    return item.name === realName && item.modulePath.join('/') === namespaceStr;
                }
                return item.name === name;
            }
        };

        if (type === 'action') return storeMap.actions.find(matchItem);
        else if (type === 'mutation') return storeMap.mutations.find(matchItem);
        else if (type === 'getter') return storeMap.getters.find(matchItem);
        else if (type === 'state') return storeMap.state.find(matchItem);
        return undefined;
    }
}
