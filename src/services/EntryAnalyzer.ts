import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { PathResolver } from '../utils/PathResolver';

export class EntryAnalyzer {
    private workspaceRoot: string;
    private pathResolver: PathResolver;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.pathResolver = new PathResolver(workspaceRoot);
    }

    /**
     * Find the main entry file and the store path.
     */
    public async analyze(): Promise<string | null> {
        // 0. Check for configuration "vuexHelper.storeEntry"
        const config = vscode.workspace.getConfiguration('vuexHelper');
        const configuredEntry = config.get<string>('storeEntry');

        if (configuredEntry && configuredEntry.trim() !== '') {
            // Resolve configured path
            // It could be:
            // 1. Alias: "@/store/index.js"
            // 2. Relative: "./str/store.js" or "src/store.js"
            // 3. Absolute: "/Users/..."
            
            // PathResolver can handle aliases and general paths if we give it a context.
            // But resolve(path, contextFile) assumes contextFile for relative lookups logic?
            // Actually PathResolver.resolve checks for startWith('.') for relative.
            
            let resolvedPath: string | null = null;
            
            // If absolute
            if (path.isAbsolute(configuredEntry)) {
                 if (this.isAllowedStorePath(configuredEntry)) resolvedPath = configuredEntry;
            } else {
                 // Try alias first
                 resolvedPath = this.pathResolver.resolve(configuredEntry, path.join(this.workspaceRoot, 'package.json')); // Dummy context
                 
                 // If not alias, try workspace relative
                 if (!resolvedPath) {
                     const abs = path.resolve(this.workspaceRoot, configuredEntry);
                     if (this.isAllowedStorePath(abs)) resolvedPath = abs;
                 }
            }
            
            if (resolvedPath && this.isAllowedStorePath(resolvedPath)) {
                console.log(`Using configured store entry: ${resolvedPath}`);
                return resolvedPath;
            } else {
                vscode.window.showWarningMessage(`Vuex Helper: Configured store entry "${configuredEntry}" not found.`);
                // Fallback to auto-detection? Or stop? 
                // Usually if user configures it, they want that. But if it fails, maybe fallback is better than nothing.
                // But let's fallback to auto-detection with a warning.
            }
        }

        // 1. Find potential entry files
        const entryFiles = await this.findEntryFiles();
        
        // 2. Parse validation to find `new Vue({ store, ... })`
        for (const file of entryFiles) {
            const storePath = this.findStoreInjection(file);
            if (storePath) {
                console.log(`Found store injection in ${file}, store path: ${storePath}`);
                return storePath;
            }
        }
        
        // If nothing found
        // If nothing found
        const action = await vscode.window.showInformationMessage(
            'Vuex Helper: Could not find Vuex store entry automatically.', 
            'Configure Path'
        );
        if (action === 'Configure Path') {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter the path to your Vuex store (e.g., src/store/index.js or @/store/index.js)',
                placeHolder: 'src/store/index.js'
            });
            
            if (input && input.trim()) {
                try {
                    // Update configuration for the specific workspace folder
                    const targetUri = vscode.Uri.file(this.workspaceRoot);
                    const config = vscode.workspace.getConfiguration('vuexHelper', targetUri);
                    
                    // Force update to WorkspaceFolder level
                    await config.update('storeEntry', input, vscode.ConfigurationTarget.WorkspaceFolder);
                    
                    vscode.window.showInformationMessage(`Vuex Helper: Store path configured to "${input}".`);
                } catch (e) {
                    vscode.window.showErrorMessage(`Vuex Helper: Failed to save setting. ${e}`);
                }
            }
        }

        return null;
    }

    private isAllowedStorePath(candidate: string): boolean {
        if (!fs.existsSync(candidate)) return false;
        const resolved = path.resolve(candidate);
        const workspace = path.resolve(this.workspaceRoot);
        const relative = path.relative(workspace, resolved);
        const isInsideWorkspace = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        if (!isInsideWorkspace) return false;

        const stat = fs.statSync(resolved);
        return stat.isFile();
    }

    private async findEntryFiles(): Promise<string[]> {
        const pattern = 'src/{main,index}.{js,ts}';
        return glob(pattern, { cwd: this.workspaceRoot, absolute: true });
    }

    private findStoreInjection(filePath: string): string | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ast = parser.parse(content, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx'] // Enable TS and JSX support
            });

            const importMap: Record<string, string> = {};
            const localVars: Record<string, any> = {};

            traverse(ast, {
                ImportDeclaration: (path: any) => {
                    const source = path.node.source?.value;
                    if (!source) return;
                    path.node.specifiers.forEach((specifier: any) => {
                        if (specifier.local?.name) {
                            importMap[specifier.local.name] = source;
                        }
                    });
                },
                VariableDeclarator: (path: any) => {
                    if (path.node.id?.type === 'Identifier') {
                        localVars[path.node.id.name] = path.node.init;
                    }
                },
                FunctionDeclaration: (path: any) => {
                    if (path.node.id?.name) {
                        localVars[path.node.id.name] = path.node;
                    }
                }
            });

            let foundStoreRef: any = null;

            traverse(ast, {
                NewExpression: (path: any) => {
                    const callee = path.node.callee;
                    if (!(callee.type === 'Identifier' && callee.name === 'Vue')) return;
                    const args = path.node.arguments;
                    if (!args.length) return;

                    const optionsObject = this.resolveObjectExpression(args[0], localVars, 0, new Set());
                    if (!optionsObject) return;

                    for (const prop of optionsObject.properties) {
                        if (prop.type !== 'ObjectProperty') continue;
                        if (prop.key.type !== 'Identifier' || prop.key.name !== 'store') continue;
                        foundStoreRef = prop.value;
                        path.stop();
                        break;
                    }
                }
            });

            if (foundStoreRef) {
                return this.resolveStorePathFromNode(foundStoreRef, importMap, localVars, filePath, 0, new Set());
            }

        } catch (error) {
            console.error(`Error parsing ${filePath}:`, error);
        }
        return null;
    }

    private resolveObjectExpression(
        node: any,
        localVars: Record<string, any>,
        depth: number,
        seen: Set<string>
    ): any | null {
        if (!node || depth > 10) return null;

        if (node.type === 'ObjectExpression') {
            return node;
        }

        if (node.type === 'Identifier') {
            if (seen.has(node.name)) return null;
            seen.add(node.name);
            return this.resolveObjectExpression(localVars[node.name], localVars, depth + 1, seen);
        }

        if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
            const calleeName = node.callee.name;
            if (seen.has(calleeName)) return null;
            seen.add(calleeName);
            const calleeNode = localVars[calleeName];
            const returnedObject = this.resolveFunctionReturnObject(calleeNode, localVars, depth + 1, seen);
            if (returnedObject) {
                return returnedObject;
            }
        }

        if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion' || node.type === 'ParenthesizedExpression') {
            return this.resolveObjectExpression(node.expression, localVars, depth + 1, seen);
        }

        return null;
    }

    private resolveFunctionReturnObject(
        node: any,
        localVars: Record<string, any>,
        depth: number,
        seen: Set<string>
    ): any | null {
        if (!node || depth > 10) return null;
        if (node.type !== 'FunctionDeclaration' && node.type !== 'FunctionExpression' && node.type !== 'ArrowFunctionExpression') {
            return null;
        }

        if (node.type === 'ArrowFunctionExpression' && node.body && node.body.type !== 'BlockStatement') {
            return this.resolveObjectExpression(node.body, localVars, depth + 1, seen);
        }

        const body = node.body?.type === 'BlockStatement' ? node.body.body : [];
        for (const statement of body) {
            if (statement.type === 'ReturnStatement' && statement.argument) {
                return this.resolveObjectExpression(statement.argument, localVars, depth + 1, seen);
            }
        }
        return null;
    }

    private resolveStorePathFromNode(
        node: any,
        importMap: Record<string, string>,
        localVars: Record<string, any>,
        filePath: string,
        depth: number,
        seen: Set<string>
    ): string | null {
        if (!node || depth > 12) return null;

        if (node.type === 'Identifier') {
            const name = node.name;
            if (seen.has(name)) return null;
            seen.add(name);

            if (importMap[name]) {
                return this.pathResolver.resolve(importMap[name], filePath);
            }

            return this.resolveStorePathFromNode(localVars[name], importMap, localVars, filePath, depth + 1, seen);
        }

        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
            const arg0 = node.arguments?.[0];
            if (arg0 && arg0.type === 'StringLiteral') {
                return this.pathResolver.resolve(arg0.value, filePath);
            }
            return null;
        }

        if (node.type === 'MemberExpression' && node.object) {
            return this.resolveStorePathFromNode(node.object, importMap, localVars, filePath, depth + 1, seen);
        }

        if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion' || node.type === 'ParenthesizedExpression') {
            return this.resolveStorePathFromNode(node.expression, importMap, localVars, filePath, depth + 1, seen);
        }

        return null;
    }
}
