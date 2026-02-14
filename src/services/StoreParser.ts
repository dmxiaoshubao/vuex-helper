import * as vscode from 'vscode';
import * as fs from 'fs';
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
    private fileNamespaceMap: Map<string, string[]> = new Map();
    private visitedModuleScope: Set<string> = new Set();

    constructor(workspaceRoot: string) {
        this.pathResolver = new PathResolver(workspaceRoot);
    }

    public async parse(storeEntryPath: string): Promise<VuexStoreMap> {
        this.storeMap = { state: [], getters: [], mutations: [], actions: [] };
        this.fileNamespaceMap.clear();
        this.visitedModuleScope.clear();

        await this.parseModule(storeEntryPath, []);
        return this.storeMap;
    }

    private async parseModule(filePath: string, moduleNamespace: string[]): Promise<void> {
        if (!fs.existsSync(filePath)) return;

        const normalizedPath = vscode.Uri.file(filePath).fsPath;
        const visitKey = `${normalizedPath}::${moduleNamespace.join('/')}`;
        if (this.visitedModuleScope.has(visitKey)) {
            return;
        }
        this.visitedModuleScope.add(visitKey);

        this.fileNamespaceMap.set(normalizedPath, moduleNamespace);
        console.log(`Parsing module: ${filePath}, namespace: ${moduleNamespace.join('/')}`);

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ast = parser.parse(content, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx']
            });

            const imports = this.collectImports(ast, filePath);
            const localVars = this.collectLocalVars(ast);
            const storeIdentifiers = this.collectStoreInstanceIdentifiers(ast, localVars);

            const exportedObj = this.findExportedStoreObject(ast, localVars);
            if (exportedObj) {
                await this.processStoreObject(exportedObj, filePath, moduleNamespace, imports, localVars);
            }
            await this.processDynamicModuleRegistrations(ast, filePath, moduleNamespace, imports, localVars, storeIdentifiers);
        } catch (error) {
            console.error(`Error parsing module ${filePath}:`, error);
        }
    }

    private collectImports(ast: any, filePath: string): Record<string, string> {
        const imports: Record<string, string> = {};

        traverse(ast, {
            ImportDeclaration: (path: any) => {
                const source = path.node.source.value;
                const resolved = this.pathResolver.resolve(source, filePath);
                if (!resolved) return;

                path.node.specifiers.forEach((specifier: any) => {
                    if (specifier.local && specifier.local.name) {
                        imports[specifier.local.name] = resolved;
                    }
                });
            }
        });

        return imports;
    }

    private collectLocalVars(ast: any): Record<string, any> {
        const localVars: Record<string, any> = {};

        traverse(ast, {
            FunctionDeclaration: (path: any) => {
                if (path.node.id && path.node.id.name) {
                    localVars[path.node.id.name] = path.node;
                }
            },
            VariableDeclarator: (path: any) => {
                if (path.node.id.type === 'Identifier') {
                    localVars[path.node.id.name] = path.node.init;
                }
            }
        });

        return localVars;
    }

    private collectStoreInstanceIdentifiers(ast: any, localVars: Record<string, any>): Set<string> {
        const storeIdentifiers = new Set<string>();

        traverse(ast, {
            VariableDeclarator: (path: any) => {
                const id = path.node.id;
                if (!id || id.type !== 'Identifier') return;
                const candidate = this.extractStoreObject(path.node.init, localVars);
                if (candidate) {
                    storeIdentifiers.add(id.name);
                }
            },
            ExportDefaultDeclaration: (path: any) => {
                const declaration = path.node.declaration;
                if (!declaration || declaration.type !== 'Identifier') return;
                const candidate = this.extractStoreObject(declaration, localVars);
                if (candidate) {
                    storeIdentifiers.add(declaration.name);
                }
            },
            AssignmentExpression: (path: any) => {
                const left = path.node.left;
                const isModuleExports =
                    left.type === 'MemberExpression' &&
                    left.object.type === 'Identifier' &&
                    left.object.name === 'module' &&
                    left.property.type === 'Identifier' &&
                    left.property.name === 'exports';
                const isExportsDefault =
                    left.type === 'MemberExpression' &&
                    left.object.type === 'Identifier' &&
                    left.object.name === 'exports' &&
                    left.property.type === 'Identifier' &&
                    left.property.name === 'default';
                if (!isModuleExports && !isExportsDefault) return;

                const right = path.node.right;
                if (!right || right.type !== 'Identifier') return;
                const candidate = this.extractStoreObject(right, localVars);
                if (candidate) {
                    storeIdentifiers.add(right.name);
                }
            }
        });

        return storeIdentifiers;
    }

    private async processDynamicModuleRegistrations(
        ast: any,
        filePath: string,
        baseNamespace: string[],
        imports: Record<string, string>,
        localVars: Record<string, any>,
        storeIdentifiers: Set<string>
    ): Promise<void> {
        if (storeIdentifiers.size === 0) return;

        const registrations: Array<{ namespace: string[]; moduleNode: any }> = [];

        traverse(ast, {
            CallExpression: (path: any) => {
                const call = path.node;
                const callee = call.callee;
                if (!callee || callee.type !== 'MemberExpression') return;
                if (callee.computed) return;
                if (callee.property.type !== 'Identifier' || callee.property.name !== 'registerModule') return;
                if (callee.object.type !== 'Identifier' || !storeIdentifiers.has(callee.object.name)) return;
                if (!call.arguments || call.arguments.length < 2) return;

                const namespacePath = this.parseNamespaceArgument(call.arguments[0], localVars);
                if (!namespacePath || namespacePath.length === 0) return;

                registrations.push({
                    namespace: [...baseNamespace, ...namespacePath],
                    moduleNode: call.arguments[1]
                });
            }
        });

        for (const registration of registrations) {
            await this.processModuleReference(registration.moduleNode, filePath, registration.namespace, imports, localVars);
        }
    }

    private parseNamespaceArgument(node: any, localVars: Record<string, any>): string[] | null {
        const resolved = this.resolveNode(node, localVars, 0, new Set());
        if (!resolved) return null;

        if (resolved.type === 'StringLiteral') {
            return [resolved.value];
        }

        if (resolved.type === 'ArrayExpression') {
            const namespace: string[] = [];
            for (const element of resolved.elements || []) {
                if (!element) return null;
                const resolvedElement = this.resolveNode(element, localVars, 0, new Set());
                if (!resolvedElement) return null;
                if (resolvedElement.type === 'StringLiteral') {
                    namespace.push(resolvedElement.value);
                    continue;
                }
                return null;
            }
            return namespace.length > 0 ? namespace : null;
        }

        return null;
    }

    private findExportedStoreObject(ast: any, localVars: Record<string, any>): any | null {
        let exportedObj: any | null = null;

        traverse(ast, {
            ExportDefaultDeclaration: (path: any) => {
                const candidate = this.extractStoreObject(path.node.declaration, localVars);
                if (candidate) {
                    exportedObj = candidate;
                    path.stop();
                }
            }
        });

        if (exportedObj) return exportedObj;

        traverse(ast, {
            AssignmentExpression: (path: any) => {
                const left = path.node.left;
                const isModuleExports =
                    left.type === 'MemberExpression' &&
                    left.object.type === 'Identifier' &&
                    left.object.name === 'module' &&
                    left.property.type === 'Identifier' &&
                    left.property.name === 'exports';

                const isExportsDefault =
                    left.type === 'MemberExpression' &&
                    left.object.type === 'Identifier' &&
                    left.object.name === 'exports' &&
                    left.property.type === 'Identifier' &&
                    left.property.name === 'default';

                if (!isModuleExports && !isExportsDefault) return;

                const candidate = this.extractStoreObject(path.node.right, localVars);
                if (candidate) {
                    exportedObj = candidate;
                    path.stop();
                }
            }
        });

        if (exportedObj) return exportedObj;

        traverse(ast, {
            NewExpression: (path: any) => {
                const candidate = this.extractStoreObject(path.node, localVars);
                if (candidate) {
                    exportedObj = candidate;
                    path.stop();
                }
            }
        });

        return exportedObj;
    }

    private extractStoreObject(node: any, localVars: Record<string, any>): any | null {
        const resolvedNode = this.resolveNode(node, localVars, 0, new Set());
        if (!resolvedNode) return null;

        if (resolvedNode.type === 'ObjectExpression') {
            return this.looksLikeStoreObject(resolvedNode) ? resolvedNode : null;
        }

        if (resolvedNode.type === 'NewExpression') {
            const arg0 = resolvedNode.arguments && resolvedNode.arguments.length > 0
                ? this.resolveNode(resolvedNode.arguments[0], localVars, 0, new Set())
                : null;

            if (arg0 && arg0.type === 'ObjectExpression' && this.looksLikeStoreObject(arg0)) {
                return arg0;
            }
        }

        if (resolvedNode.type === 'CallExpression') {
            const arg0 = resolvedNode.arguments && resolvedNode.arguments.length > 0
                ? this.resolveNode(resolvedNode.arguments[0], localVars, 0, new Set())
                : null;

            if (arg0 && arg0.type === 'ObjectExpression' && this.looksLikeStoreObject(arg0)) {
                return arg0;
            }
        }

        return null;
    }

    private looksLikeStoreObject(objExpression: any): boolean {
        const keys = new Set<string>();
        objExpression.properties.forEach((prop: any) => {
            const key = this.getPropertyKeyName(prop, {});
            if (key) keys.add(key);
        });

        return ['state', 'getters', 'mutations', 'actions', 'modules', 'namespaced'].some((k) => keys.has(k));
    }

    private resolveNode(node: any, localVars: Record<string, any>, depth: number, seen: Set<string>): any {
        if (!node || depth > 12) return node;

        if (node.type === 'Identifier') {
            const name = node.name;
            if (seen.has(name)) return node;

            const next = localVars[name];
            if (!next) return node;

            seen.add(name);
            return this.resolveNode(next, localVars, depth + 1, seen);
        }

        if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion' || node.type === 'ParenthesizedExpression') {
            return this.resolveNode(node.expression, localVars, depth + 1, seen);
        }

        if (node.type === 'AwaitExpression') {
            return this.resolveNode(node.argument, localVars, depth + 1, seen);
        }

        if (node.type === 'ChainExpression') {
            return this.resolveNode(node.expression, localVars, depth + 1, seen);
        }

        if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
            const calleeName = node.callee.name;
            if (seen.has(calleeName)) return node;

            const calleeNode = this.resolveNode(localVars[calleeName], localVars, depth + 1, seen);
            if (
                calleeNode &&
                (calleeNode.type === 'FunctionDeclaration' ||
                    calleeNode.type === 'FunctionExpression' ||
                    calleeNode.type === 'ArrowFunctionExpression')
            ) {
                seen.add(calleeName);
                const returned = this.resolveFunctionReturnValue(calleeNode, localVars, depth + 1, seen);
                if (returned) {
                    return returned;
                }
            }
        }

        return node;
    }

    private resolveFunctionReturnValue(
        fnNode: any,
        localVars: Record<string, any>,
        depth: number,
        seen: Set<string>
    ): any {
        if (!fnNode) return null;

        if (fnNode.type === 'ArrowFunctionExpression' && fnNode.body && fnNode.body.type !== 'BlockStatement') {
            return this.resolveNode(fnNode.body, localVars, depth + 1, seen);
        }

        const body = fnNode.body && fnNode.body.type === 'BlockStatement' ? fnNode.body.body : [];
        for (const statement of body) {
            if (statement.type === 'ReturnStatement' && statement.argument) {
                return this.resolveNode(statement.argument, localVars, depth + 1, seen);
            }
        }
        return null;
    }

    private async processStoreObject(
        objExpression: any,
        filePath: string,
        moduleNamespace: string[],
        imports: Record<string, string>,
        localVars: Record<string, any>
    ): Promise<void> {
        const isNamespaced = this.readNamespacedFlag(objExpression, localVars);
        const assetNamespace = moduleNamespace.length > 0 && isNamespaced ? moduleNamespace : [];

        for (const prop of objExpression.properties) {
            if (prop.type !== 'ObjectProperty' && prop.type !== 'ObjectMethod') continue;

            const keyName = this.getPropertyKeyName(prop, localVars);
            if (!keyName) continue;

            const valueNode = this.getPropertyValueNode(prop, localVars);

            if (keyName === 'state') {
                this.processState(valueNode, filePath, moduleNamespace, localVars);
            } else if (keyName === 'getters') {
                this.processGetters(valueNode, filePath, assetNamespace, localVars);
            } else if (keyName === 'mutations') {
                this.processMutations(valueNode, filePath, assetNamespace, localVars);
            } else if (keyName === 'actions') {
                this.processActions(valueNode, filePath, assetNamespace, localVars);
            } else if (keyName === 'modules') {
                await this.processModules(valueNode, filePath, moduleNamespace, imports, localVars);
            }
        }
    }

    private readNamespacedFlag(objExpression: any, localVars: Record<string, any>): boolean {
        for (const prop of objExpression.properties) {
            if (prop.type !== 'ObjectProperty' && prop.type !== 'ObjectMethod') continue;

            const keyName = this.getPropertyKeyName(prop, localVars);
            if (keyName !== 'namespaced') continue;

            const valueNode = this.getPropertyValueNode(prop, localVars);
            const resolvedValue = this.resolveNode(valueNode, localVars, 0, new Set());
            if (resolvedValue && resolvedValue.type === 'BooleanLiteral' && resolvedValue.value === true) {
                return true;
            }
        }
        return false;
    }

    private getPropertyValueNode(prop: any, localVars: Record<string, any>): any {
        if (prop.type === 'ObjectMethod') {
            return prop;
        }

        if (!prop.value) return prop.value;
        return this.resolveNode(prop.value, localVars, 0, new Set());
    }

    private getPropertyKeyName(prop: any, localVars: Record<string, any>): string | null {
        const key = prop.key;
        if (!key) return null;

        if (key.type === 'Identifier' && !prop.computed) {
            return key.name;
        }

        if (key.type === 'StringLiteral') {
            return key.value;
        }

        if (key.type === 'NumericLiteral') {
            return String(key.value);
        }

        if (prop.computed) {
            const resolvedKey = this.resolveNode(key, localVars, 0, new Set());
            if (!resolvedKey) return null;

            if (resolvedKey.type === 'StringLiteral') {
                return resolvedKey.value;
            }

            if (resolvedKey.type === 'NumericLiteral') {
                return String(resolvedKey.value);
            }
        }

        return null;
    }

    private getPropertyLocation(prop: any): any {
        if (prop.key && prop.key.loc) return prop.key.loc;
        if (prop.loc) return prop.loc;
        return null;
    }

    private processState(valueNode: any, filePath: string, namespace: string[], localVars: Record<string, any>): void {
        if (!valueNode) return;

        const resolvedValueNode = this.resolveNode(valueNode, localVars, 0, new Set());

        let stateObj = resolvedValueNode;
        if (resolvedValueNode && (resolvedValueNode.type === 'ArrowFunctionExpression' || resolvedValueNode.type === 'FunctionExpression')) {
            if (resolvedValueNode.body.type === 'ObjectExpression') {
                stateObj = resolvedValueNode.body;
            } else if (resolvedValueNode.body.type === 'BlockStatement') {
                const returnStmt = resolvedValueNode.body.body.find((statement: any) => statement.type === 'ReturnStatement');
                if (returnStmt && returnStmt.argument) {
                    stateObj = this.resolveNode(returnStmt.argument, localVars, 0, new Set());
                }
            }
        }

        if (!stateObj || stateObj.type !== 'ObjectExpression') return;
        this.collectStateProperties(stateObj, filePath, namespace, localVars, []);
    }

    private collectStateProperties(
        stateObj: any,
        filePath: string,
        moduleNamespace: string[],
        localVars: Record<string, any>,
        nestedPath: string[]
    ): void {
        if (!stateObj || stateObj.type !== 'ObjectExpression') return;

        stateObj.properties.forEach((property: any) => {
            if (property.type !== 'ObjectProperty') return;

            const keyName = this.getPropertyKeyName(property, localVars);
            const loc = this.getPropertyLocation(property);
            if (!keyName || !loc) return;

            const currentPath = [...moduleNamespace, ...nestedPath];
            this.storeMap.state.push({
                name: keyName,
                defLocation: new vscode.Location(
                    vscode.Uri.file(filePath),
                    new vscode.Position(loc.start.line - 1, loc.start.column)
                ),
                modulePath: currentPath,
                documentation: this.extractDocumentation(property),
                displayType: this.inferType(property.value)
            });

            const resolvedValue = this.resolveNode(property.value, localVars, 0, new Set());
            if (resolvedValue && resolvedValue.type === 'ObjectExpression') {
                this.collectStateProperties(
                    resolvedValue,
                    filePath,
                    moduleNamespace,
                    localVars,
                    [...nestedPath, keyName]
                );
            }
        });
    }

    private inferType(node: any): string | undefined {
        if (!node) return undefined;

        if (node.type === 'StringLiteral') return 'string';
        if (node.type === 'NumericLiteral') return 'number';
        if (node.type === 'BooleanLiteral') return 'boolean';
        if (node.type === 'NullLiteral') return 'null';
        if (node.type === 'ArrayExpression') return 'Array<any>';
        if (node.type === 'ObjectExpression') return 'Object';
        if (node.type === 'NewExpression' && node.callee.type === 'Identifier') {
            return node.callee.name;
        }
        if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return 'Function';

        return undefined;
    }

    private processGetters(valueNode: any, filePath: string, namespace: string[], localVars: Record<string, any>): void {
        this.processFunctionCollection(valueNode, filePath, namespace, localVars, this.storeMap.getters);
    }

    private processMutations(valueNode: any, filePath: string, namespace: string[], localVars: Record<string, any>): void {
        this.processFunctionCollection(valueNode, filePath, namespace, localVars, this.storeMap.mutations);
    }

    private processActions(valueNode: any, filePath: string, namespace: string[], localVars: Record<string, any>): void {
        this.processFunctionCollection(valueNode, filePath, namespace, localVars, this.storeMap.actions);
    }

    private processFunctionCollection(
        valueNode: any,
        filePath: string,
        namespace: string[],
        localVars: Record<string, any>,
        output: VuexGetterInfo[] | VuexMutationInfo[] | VuexActionInfo[]
    ): void {
        if (!valueNode) return;

        const resolvedValue = this.resolveNode(valueNode, localVars, 0, new Set());
        if (!resolvedValue || resolvedValue.type !== 'ObjectExpression') return;

        resolvedValue.properties.forEach((property: any) => {
            if (property.type !== 'ObjectProperty' && property.type !== 'ObjectMethod') return;

            const keyName = this.getPropertyKeyName(property, localVars);
            const loc = this.getPropertyLocation(property);
            if (!keyName || !loc) return;

            output.push({
                name: keyName,
                defLocation: new vscode.Location(
                    vscode.Uri.file(filePath),
                    new vscode.Position(loc.start.line - 1, loc.start.column)
                ),
                modulePath: namespace,
                documentation: this.extractDocumentation(property)
            });
        });
    }

    private async processModules(
        valueNode: any,
        filePath: string,
        namespace: string[],
        imports: Record<string, string>,
        localVars: Record<string, any>
    ): Promise<void> {
        if (!valueNode) return;

        const resolvedValue = this.resolveNode(valueNode, localVars, 0, new Set());
        if (!resolvedValue || resolvedValue.type !== 'ObjectExpression') return;

        await this.processModulesObjectExpression(resolvedValue, filePath, namespace, imports, localVars);
    }

    private async processModulesObjectExpression(
        modulesObject: any,
        filePath: string,
        namespace: string[],
        imports: Record<string, string>,
        localVars: Record<string, any>
    ): Promise<void> {
        if (!modulesObject || modulesObject.type !== 'ObjectExpression') return;

        for (const property of modulesObject.properties) {
            if (property.type === 'SpreadElement') {
                const spreadValue = this.resolveNode(property.argument, localVars, 0, new Set());
                if (spreadValue && spreadValue.type === 'ObjectExpression') {
                    await this.processModulesObjectExpression(spreadValue, filePath, namespace, imports, localVars);
                }
                continue;
            }

            if (property.type !== 'ObjectProperty') continue;

            const moduleName = this.getPropertyKeyName(property, localVars);
            if (!moduleName) continue;

            const newNamespace = [...namespace, moduleName];
            await this.processModuleReference(property.value, filePath, newNamespace, imports, localVars);
        }
    }

    private async processModuleReference(
        moduleNode: any,
        filePath: string,
        namespace: string[],
        imports: Record<string, string>,
        localVars: Record<string, any>
    ): Promise<void> {
        const resolvedModule = this.resolveNode(moduleNode, localVars, 0, new Set());
        if (!resolvedModule) return;

        if (resolvedModule.type === 'ObjectExpression') {
            await this.processStoreObject(resolvedModule, filePath, namespace, imports, localVars);
            return;
        }

        if (resolvedModule.type === 'Identifier') {
            const importedPath = this.resolveImportedModulePath(resolvedModule.name, imports, localVars, filePath);
            if (importedPath) {
                await this.parseModule(importedPath, namespace);
                return;
            }

            const resolvedLocalValue = this.resolveNode(localVars[resolvedModule.name], localVars, 0, new Set());
            if (resolvedLocalValue && resolvedLocalValue.type === 'ObjectExpression') {
                await this.processStoreObject(resolvedLocalValue, filePath, namespace, imports, localVars);
            }
            return;
        }

        const dynamicPath = this.resolveModulePathFromNode(resolvedModule, localVars, filePath);
        if (dynamicPath) {
            await this.parseModule(dynamicPath, namespace);
        }
    }

    private resolveModulePathFromNode(node: any, localVars: Record<string, any>, filePath: string): string | null {
        const resolvedNode = this.resolveNode(node, localVars, 0, new Set());
        if (!resolvedNode) return null;

        if (
            resolvedNode.type === 'CallExpression' &&
            resolvedNode.callee.type === 'Identifier' &&
            resolvedNode.callee.name === 'require'
        ) {
            const arg0 = resolvedNode.arguments && resolvedNode.arguments[0];
            if (arg0 && arg0.type === 'StringLiteral') {
                return this.pathResolver.resolve(arg0.value, filePath);
            }
            return null;
        }

        if (resolvedNode.type === 'MemberExpression' && resolvedNode.object) {
            const objectNode = this.resolveNode(resolvedNode.object, localVars, 0, new Set());
            if (
                objectNode &&
                objectNode.type === 'CallExpression' &&
                objectNode.callee.type === 'Identifier' &&
                objectNode.callee.name === 'require'
            ) {
                const arg0 = objectNode.arguments && objectNode.arguments[0];
                if (arg0 && arg0.type === 'StringLiteral') {
                    return this.pathResolver.resolve(arg0.value, filePath);
                }
            }
        }

        return null;
    }

    private resolveImportedModulePath(
        identifier: string,
        imports: Record<string, string>,
        localVars: Record<string, any>,
        filePath: string
    ): string | null {
        if (imports[identifier]) {
            return imports[identifier];
        }

        const localValue = this.resolveNode(localVars[identifier], localVars, 0, new Set());
        if (!localValue) return null;
        return this.resolveModulePathFromNode(localValue, localVars, filePath);
    }

    private extractDocumentation(node: any): string | undefined {
        if (!(node.leadingComments && Array.isArray(node.leadingComments) && node.leadingComments.length > 0)) {
            return undefined;
        }

        const jsDocComments = node.leadingComments.filter((comment: any) =>
            comment.type === 'CommentBlock' && comment.value.startsWith('*')
        );

        if (jsDocComments.length === 0) return undefined;

        return jsDocComments.map((comment: any) => {
            let value = comment.value;
            value = value.substring(1).trim();

            return value
                .split('\n')
                .map((line: string) => line.trim().replace(/^\*\s?/, ''))
                .join('  \n')
                .trim();
        }).join('\n\n');
    }

    public getNamespace(filePath: string): string[] | undefined {
        const normalizedPath = vscode.Uri.file(filePath).fsPath;
        return this.fileNamespaceMap.get(normalizedPath);
    }

    public hasIndexedFile(filePath: string): boolean {
        const normalizedPath = vscode.Uri.file(filePath).fsPath;
        return this.fileNamespaceMap.has(normalizedPath);
    }
}
