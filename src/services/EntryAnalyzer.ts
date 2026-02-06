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
                 if (fs.existsSync(configuredEntry)) resolvedPath = configuredEntry;
            } else {
                 // Try alias first
                 resolvedPath = this.pathResolver.resolve(configuredEntry, path.join(this.workspaceRoot, 'package.json')); // Dummy context
                 
                 // If not alias, try workspace relative
                 if (!resolvedPath) {
                     const abs = path.resolve(this.workspaceRoot, configuredEntry);
                     if (fs.existsSync(abs)) resolvedPath = abs;
                 }
            }
            
            if (resolvedPath && fs.existsSync(resolvedPath)) {
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
        const action = await vscode.window.showInformationMessage(
            'Vuex Helper: Could not find Vuex store entry automatically.', 
            'Open Settings'
        );
        if (action === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'vuexHelper.storeEntry');
        }

        return null;
    }

    private findEntryFiles(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const pattern = 'src/{main,index}.{js,ts}';
            glob(pattern, { cwd: this.workspaceRoot, absolute: true }, (err, files) => {
                if (err) {
                    return reject(err);
                }
                resolve(files);
            });
        });
    }

    private findStoreInjection(filePath: string): string | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ast = parser.parse(content, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx'] // Enable TS and JSX support
            });

            let storeImportPath: string | null = null;
            let storeVariableName: string | null = null;

            // 1. Find `import store from '...'` or `import ...`
            traverse(ast, {
                ImportDeclaration: (path: any) => {
                    // Check default specifier
                    const defaultSpecifier = path.node.specifiers.find((s: any) => s.type === 'ImportDefaultSpecifier');
                    if (defaultSpecifier) {
                        // We store the variable name and source, but we don't know if it is THE store yet
                         // Just storing potential candidates might be complex. 
                         // Instead, let's find `new Vue` first, get the variable name used for store, 
                         // and THEN look up the import.
                    }
                }
            });

            // Re-traverse to find new Vue({ store })
            let foundStoreVar = '';

            traverse(ast, {
                NewExpression(path: any) {
                    const callee = path.node.callee;
                    if (callee.type === 'Identifier' && callee.name === 'Vue') {
                        const args = path.node.arguments;
                        if (args.length > 0 && args[0].type === 'ObjectExpression') {
                            const properties = args[0].properties;
                            for (const prop of properties) {
                                if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                                    if (prop.key.name === 'store') {
                                        // Found `store: ...` or `store,`
                                        if (prop.value.type === 'Identifier') {
                                            foundStoreVar = prop.value.name;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (foundStoreVar) {
                // Now find the import source for this variable
                traverse(ast, {
                    ImportDeclaration(path: any) {
                        const specifiers = path.node.specifiers;
                        for (const s of specifiers) {
                            if (s.local.name === foundStoreVar) {
                                storeImportPath = path.node.source.value;
                                return; // Stop traversal
                            }
                        }
                    }
                });
            }

            if (storeImportPath) {
                return this.pathResolver.resolve(storeImportPath, filePath);
            }

        } catch (error) {
            console.error(`Error parsing ${filePath}:`, error);
        }
        return null;
    }
}
