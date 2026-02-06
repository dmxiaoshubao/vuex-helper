import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { PathResolver } from '../utils/PathResolver';
import { VuexStoreMap, VuexStateInfo, VuexGetterInfo, VuexMutationInfo, VuexActionInfo } from '../types';

export class StoreParser {
    private pathResolver: PathResolver;
    private storeMap: VuexStoreMap = {
        state: [],
        getters: [],
        mutations: [],
        actions: []
    };

    constructor(workspaceRoot: string) {
        this.pathResolver = new PathResolver(workspaceRoot);
    }

    public async parse(storeEntryPath: string): Promise<VuexStoreMap> {
        // Reset map
        this.storeMap = { state: [], getters: [], mutations: [], actions: [] };
        
        await this.parseModule(storeEntryPath, []);
        return this.storeMap;
    }

    private async parseModule(filePath: string, moduleNamespace: string[]) {
        if (!fs.existsSync(filePath)) return;

        console.log(`Parsing module: ${filePath}, namespace: ${moduleNamespace.join('/')}`);

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ast = parser.parse(content, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx']
            });

            // 1. Identify valid Vuex Store or Module object
            // It could be `export default new Vuex.Store({...})`
            // Or `export default { state: ..., ... }` (module)
            // Or `const store = new Vuex.Store({...}); export default store;`

            let exportedObj: any = null;

            // Simple heuristic mapping of imported names to file paths
            const imports: Record<string, string> = {};

            traverse(ast, {
                ImportDeclaration: (path: any) => {
                    const source = path.node.source.value;
                    const resolved = this.pathResolver.resolve(source, filePath);
                    if (resolved) {
                        path.node.specifiers.forEach((s: any) => {
                            imports[s.local.name] = resolved;
                        });
                    }
                }
            });

            // Find exported object
            // This is simplified; robust handling requires logic flow analysis
            traverse(ast, {
                ExportDefaultDeclaration: (path: any) => {
                    const declaration = path.node.declaration;
                    if (declaration.type === 'ObjectExpression') {
                        exportedObj = declaration; // export default { state: ... }
                    } else if (declaration.type === 'NewExpression') {
                         // export default new Vuex.Store({...})
                         const args = declaration.arguments;
                         if (args.length > 0 && args[0].type === 'ObjectExpression') {
                             exportedObj = args[0];
                         }
                    }
                    // Handle Identifier export (export default store) - TODO
                }
            });
            
            // Should also look for `const store = new Vuex.Store({...})` if export default not found directly
             if (!exportedObj) {
                traverse(ast, {
                    NewExpression: (path: any) => {
                        // Check for new Vuex.Store or new Store
                        // Very simplified check
                         const args = path.node.arguments;
                         if (args.length > 0 && args[0].type === 'ObjectExpression') {
                             // Assume this is the store definition
                             // In reality, we should check if this is assigned to 'export default' variable
                             // For now, let's just grab the first object passed to new Store/Vuex.Store 
                             // if it looks like a store (has state/mutations/actions)
                             const props = args[0].properties;
                             const hasStoreKeys = props.some((p: any) => 
                                 p.type === 'ObjectProperty' && p.key.type === 'Identifier' && 
                                 ['state', 'getters', 'actions', 'mutations', 'modules'].includes(p.key.name)
                             );
                             if (hasStoreKeys) {
                                 exportedObj = args[0];
                             }
                         }
                    }
                });
             }


            // Collect top-level variable declarations for resolution
            const localVars: Record<string, any> = {};
            traverse(ast, {
                VariableDeclarator: (path: any) => {
                    if (path.node.id.type === 'Identifier') {
                        localVars[path.node.id.name] = path.node.init;
                    }
                }
            });

            if (exportedObj) {
                this.processStoreObject(exportedObj, filePath, moduleNamespace, imports, localVars);
            }

        } catch (error) {
            console.error(`Error parsing module ${filePath}:`, error);
        }
    }

    private processStoreObject(objExpression: any, filePath: string, namespace: string[], imports: Record<string, string>, localVars: Record<string, any>) {
        let isNamespaced = false;
        
        const properties = objExpression.properties;
        
        for (const prop of properties) {
            if (prop.type === 'ObjectProperty' && prop.key.name === 'namespaced') {
                if (prop.value.type === 'BooleanLiteral' && prop.value.value === true) {
                    isNamespaced = true;
                }
            }
        }
        
        for (const prop of properties) {
             if (prop.type !== 'ObjectProperty' && prop.type !== 'ObjectMethod') continue;
             
             const keyName = (prop.key as any).name;
             let valueNode = prop.value;

             // Resolve identifier if needed
             if (valueNode.type === 'Identifier' && localVars[valueNode.name]) {
                 valueNode = localVars[valueNode.name];
             }

             if (keyName === 'state') {
                 this.processState(valueNode, filePath, namespace, localVars);
             } else if (keyName === 'getters') {
                 this.processGetters(valueNode, filePath, namespace, localVars);
             } else if (keyName === 'mutations') {
                 this.processMutations(valueNode, filePath, namespace, localVars);
             } else if (keyName === 'actions') {
                 this.processActions(valueNode, filePath, namespace, localVars);
             } else if (keyName === 'modules') {
                 this.processModules(valueNode, filePath, namespace, imports, localVars);
             }
        }
    }

    private processState(valueNode: any, filePath: string, namespace: string[], localVars: Record<string, any>) {
        if (!valueNode) return;
        
        // Handle Identifier resolution (double check if nested)
        if (valueNode.type === 'Identifier' && localVars[valueNode.name]) {
            valueNode = localVars[valueNode.name];
        }

        let stateObj = valueNode;
        if (valueNode.type === 'ArrowFunctionExpression' || valueNode.type === 'FunctionExpression') {
             if (valueNode.body.type === 'ObjectExpression') {
                 stateObj = valueNode.body;
             } else if (valueNode.body.type === 'BlockStatement') {
                 const returnStmt = valueNode.body.body.find((s: any) => s.type === 'ReturnStatement');
                 if (returnStmt && returnStmt.argument.type === 'ObjectExpression') {
                     stateObj = returnStmt.argument;
                 }
                 // Handle return state (identifier)
                 if (returnStmt && returnStmt.argument.type === 'Identifier' && localVars[returnStmt.argument.name]) {
                     stateObj = localVars[returnStmt.argument.name];
                 }
             }
        }

        if (stateObj && stateObj.type === 'ObjectExpression') {
            stateObj.properties.forEach((p: any) => {
                if (p.type === 'ObjectProperty' && p.key.type === 'Identifier') {
                    this.storeMap.state.push({
                        name: p.key.name,
                        defLocation: new vscode.Location(
                            vscode.Uri.file(filePath),
                            new vscode.Position(p.key.loc.start.line - 1, p.key.loc.start.column)
                        ),
                        modulePath: namespace,
                        documentation: this.extractDocumentation(p),
                        displayType: this.inferType(p.value)
                    });
                }
            });
        }
    }

    private inferType(node: any): string | undefined {
        if (!node) return undefined;
        // Basic literals
        if (node.type === 'StringLiteral') return 'string';
        if (node.type === 'NumericLiteral') return 'number';
        if (node.type === 'BooleanLiteral') return 'boolean';
        if (node.type === 'NullLiteral') return 'null';
        // Complex types
        if (node.type === 'ArrayExpression') return 'Array<any>'; // Could be inferred further
        if (node.type === 'ObjectExpression') return 'Object';
        if (node.type === 'NewExpression' && node.callee.type === 'Identifier') {
            return node.callee.name; // e.g. 'new Date()' -> 'Date'
        }
        // Functions
        if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return 'Function';
        
        return undefined;
    }

    private processGetters(valueNode: any, filePath: string, namespace: string[], localVars: Record<string, any>) {
        if (!valueNode) return;
        if (valueNode.type === 'Identifier' && localVars[valueNode.name]) {
            valueNode = localVars[valueNode.name];
        }
        
        if (valueNode.type === 'ObjectExpression') {
            valueNode.properties.forEach((p: any) => {
                let name = '';
                let loc = null;
                
                if (p.type === 'ObjectProperty' && p.key.type === 'Identifier') {
                    name = p.key.name;
                    loc = p.key.loc;
                } else if (p.type === 'ObjectMethod' && p.key.type === 'Identifier') {
                    name = p.key.name;
                    loc = p.key.loc;
                }

                if (name && loc) {
                    this.storeMap.getters.push({
                        name: name,
                        defLocation: new vscode.Location(
                            vscode.Uri.file(filePath),
                            new vscode.Position(loc.start.line - 1, loc.start.column)
                        ),
                        modulePath: namespace,
                        documentation: this.extractDocumentation(p)
                    });
                }
            });
        }
    }

    private processMutations(valueNode: any, filePath: string, namespace: string[], localVars: Record<string, any>) {
        if (!valueNode) return;
        if (valueNode.type === 'Identifier' && localVars[valueNode.name]) {
            valueNode = localVars[valueNode.name];
        }

         if (valueNode.type === 'ObjectExpression') {
            valueNode.properties.forEach((p: any) => {
                let name = '';
                let loc = null;
                
                if ((p.type === 'ObjectProperty' || p.type === 'ObjectMethod') && p.key.type === 'Identifier') {
                    name = p.key.name;
                    loc = p.key.loc;
                }

                if (name && loc) {
                    this.storeMap.mutations.push({
                        name: name,
                        defLocation: new vscode.Location(
                            vscode.Uri.file(filePath),
                            new vscode.Position(loc.start.line - 1, loc.start.column)
                        ),
                        modulePath: namespace,
                        documentation: this.extractDocumentation(p)
                    });
                }
            });
        }
    }

    private processActions(valueNode: any, filePath: string, namespace: string[], localVars: Record<string, any>) {
        if (!valueNode) return;
        if (valueNode.type === 'Identifier' && localVars[valueNode.name]) {
            valueNode = localVars[valueNode.name];
        }

         if (valueNode.type === 'ObjectExpression') {
            valueNode.properties.forEach((p: any) => {
                let name = '';
                let loc = null;
                
                if ((p.type === 'ObjectProperty' || p.type === 'ObjectMethod') && p.key.type === 'Identifier') {
                    name = p.key.name;
                    loc = p.key.loc;
                }

                if (name && loc) {
                    this.storeMap.actions.push({
                        name: name,
                        defLocation: new vscode.Location(
                            vscode.Uri.file(filePath),
                            new vscode.Position(loc.start.line - 1, loc.start.column)
                        ),
                        modulePath: namespace,
                        documentation: this.extractDocumentation(p)
                    });
                }
            });
        }
    }

    private async processModules(valueNode: any, filePath: string, namespace: string[], imports: Record<string, string>, localVars: Record<string, any>) {
        if (!valueNode) return;
        if (valueNode.type === 'Identifier' && localVars[valueNode.name]) {
            valueNode = localVars[valueNode.name];
        }

        if (valueNode.type !== 'ObjectExpression') return;

        for (const prop of valueNode.properties) {
            if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                const moduleName = prop.key.name;
                const newNamespace = [...namespace, moduleName];
                
                if (prop.value.type === 'Identifier') {
                    const importedPath = imports[prop.value.name];
                    if (importedPath) {
                        await this.parseModule(importedPath, newNamespace);
                    } else if (localVars[prop.value.name]) {
                        // Inline module defined as variable
                         this.processStoreObject(localVars[prop.value.name], filePath, newNamespace, imports, localVars);
                    }
                } else if (prop.value.type === 'ObjectExpression') {
                    this.processStoreObject(prop.value, filePath, newNamespace, imports, localVars);
                }
            }
        }
    }
    private extractDocumentation(node: any): string | undefined {
        if (node.leadingComments && Array.isArray(node.leadingComments) && node.leadingComments.length > 0) {
            // Filter for JSDoc comments only: must be Block Comment starting with * (which implies /** in source)
            const jsDocComments = node.leadingComments.filter((comment: any) => 
                comment.type === 'CommentBlock' && comment.value.startsWith('*')
            );

            if (jsDocComments.length === 0) return undefined;

            return jsDocComments.map((comment: any) => {
                let value = comment.value;
                // Remove the initial * from /**
                // value is string content, excluding /* and */. 
                // For /** docs */, value is "* docs "
                
                // Remove leading *
                value = value.substring(1).trim(); 

                // Handle multiline formatting: strip leading * from each line
                // Example:
                // * First line
                // * Second line
                return value.split('\n').map((line: string) => {
                    const trimmed = line.trim();
                    // Remove leading * and optional space
                    return trimmed.replace(/^\*\s?/, '');
                }).join('  \n').trim(); // Use double space + newline for Markdown hard break
            }).join('\n\n');
        }
        return undefined;
    }
}
