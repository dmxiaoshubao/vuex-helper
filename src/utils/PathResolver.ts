import * as path from 'path';
import * as fs from 'fs';
import * as json5 from 'json5';

export class PathResolver {
    private workspaceRoot: string;
    private aliasMap: Record<string, string[]> = {};

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.loadConfig();
    }

    private loadConfig() {
        const configFiles = ['tsconfig.json', 'jsconfig.json'];
        for (const file of configFiles) {
            const configPath = path.join(this.workspaceRoot, file);
            if (fs.existsSync(configPath)) {
                try {
                    const content = fs.readFileSync(configPath, 'utf-8');
                    const config = json5.parse(content);
                    if (config.compilerOptions && config.compilerOptions.paths) {
                        this.aliasMap = config.compilerOptions.paths;
                        break; // Prioritize tsconfig over jsconfig
                    }
                } catch (error) {
                    console.error(`Error parsing ${file}:`, error);
                }
            }
        }
    }

    /**
     * Resolve an import path to an absolute file path.
     * @param importPath e.g. "@/store", "./modules/user"
     * @param currentFilePath Absolute path of the file containing the import
     */
    public resolve(importPath: string, currentFilePath: string): string | null {
        if (importPath.startsWith('.')) {
            // Relative path
            const dir = path.dirname(currentFilePath);
            const absolutePath = path.resolve(dir, importPath);
            return this.ensureWorkspacePath(this.tryExtensions(absolutePath));
        }

        // Alias path
        for (const alias in this.aliasMap) {
            // Remove wildcard *
            const aliasPrefix = alias.replace('/*', '');
            if (importPath.startsWith(aliasPrefix)) {
                const paths = this.aliasMap[alias];
                for (const p of paths) {
                    // Remove wildcard * from target path and join with workspace root
                    const targetPrefix = p.replace('/*', '');
                    const rest = importPath.substring(aliasPrefix.length);
                    const absolutePath = path.join(this.workspaceRoot, targetPrefix, rest);
                    const resolved = this.ensureWorkspacePath(this.tryExtensions(absolutePath));
                    if (resolved) {
                        return resolved;
                    }
                }
            }
        }
        
        // Try node_modules or absolute path (less common for source files but possible)
        try {
            const absolutePath = require.resolve(importPath, { paths: [path.dirname(currentFilePath)] });
            return this.ensureWorkspacePath(absolutePath);
        } catch (e) {
            // ignore
        }

        return null;
    }

    private tryExtensions(filePath: string): string | null {
        const extensions = ['.ts', '.js', '.vue', '.json', '/index.ts', '/index.js', '/index.vue'];
        
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            return filePath;
        }

        for (const ext of extensions) {
            const fullPath = filePath + ext;
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                return fullPath;
            }
        }
        return null; // Not found
    }

    private ensureWorkspacePath(candidate: string | null): string | null {
        if (!candidate) return null;

        const workspaceRoot = path.resolve(this.workspaceRoot);
        const resolvedPath = path.resolve(candidate);
        const relative = path.relative(workspaceRoot, resolvedPath);
        const isInsideWorkspace = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);

        // Allow workspace root files as well.
        if (relative === '' || isInsideWorkspace) {
            return resolvedPath;
        }
        return null;
    }
}
