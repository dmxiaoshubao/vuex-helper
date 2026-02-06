import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';

export class VuexHoverProvider implements vscode.HoverProvider {
    private contextScanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;

    constructor(storeIndexer: StoreIndexer) {
        this.storeIndexer = storeIndexer;
        this.contextScanner = new VuexContextScanner();
        this.componentMapper = new ComponentMapper();
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;
        const word = document.getText(range);
        
        // 1. Vuex Context (String literals)
        // Moved logical check down to combine with context awareness
        const context = this.contextScanner.getContext(document, position);

        // 2. Component Mapping (this.methodName)
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, range.start.character).trimEnd();
        
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = mapping[word];
        
        if (mappedItem) {
            return this.findHover(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }

        const currentNamespace = this.storeIndexer.getNamespace(document.fileName);

        // 3. Local State Hover (state.xxx)
        const rawPrefix = lineText.substring(0, range.start.character);
        
        if (currentNamespace && /\bstate\.$/.test(rawPrefix)) {
             return this.findHover(word, 'state', currentNamespace.join('/'));
        }

        // Re-check context with awareness of current file namespace
        if (context && context.type !== 'unknown') {
             return this.findHover(word, context.type, context.namespace, currentNamespace);
        }

        return undefined;
    }

    private findHover(name: string, type: 'state' | 'getter' | 'mutation' | 'action', namespace?: string, currentNamespace?: string[]): vscode.Hover | undefined {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

         const matchItem = (item: { name: string, modulePath: string[] }) => {
            if (namespace) {
                return item.name === name && item.modulePath.join('/') === namespace;
            } else {
                // 1. If we are inside a namespaced module, and looking for mutation/action/state
                // and the name is simple (no slashes), prefer local item.
                 if (currentNamespace && !name.includes('/')) {
                     const isLocal = item.name === name && item.modulePath.join('/') === currentNamespace.join('/');
                     if (isLocal) return true;
                }

                if (name.includes('/')) {
                    const parts = name.split('/');
                    const realName = parts.pop()!;
                    const namespaceStr = parts.join('/');
                    return item.name === realName && item.modulePath.join('/') === namespaceStr;
                }
                return item.name === name;
            }
        };

        let result: { defLocation: vscode.Location, documentation?: string } | undefined;
        let labelPrefix = '';

        // Prioritize local match explicit check if needed, but matchItem logic above handles basic preference.
        // However, find() returns first match.
        if (currentNamespace && !name.includes('/')) {
             const checkLocal = (item: { name: string, modulePath: string[] }) => 
                item.name === name && item.modulePath.join('/') === currentNamespace.join('/');
             
             if (type === 'action') result = storeMap.actions.find(checkLocal);
             else if (type === 'mutation') result = storeMap.mutations.find(checkLocal);
             else if (type === 'state') result = storeMap.state.find(checkLocal);
             else if (type === 'getter') result = storeMap.getters.find(checkLocal);
        }
        
        if (!result) {
            if (type === 'action') result = storeMap.actions.find(matchItem);
            else if (type === 'mutation') result = storeMap.mutations.find(matchItem);
            else if (type === 'state') result = storeMap.state.find(matchItem);
            else if (type === 'getter') result = storeMap.getters.find(matchItem);
        }

        if (type === 'action') labelPrefix = 'Action';
        else if (type === 'mutation') labelPrefix = 'Mutation';
        else if (type === 'state') labelPrefix = 'State';
        else if (type === 'getter') labelPrefix = 'Getter';

        if (result) {
            const md = new vscode.MarkdownString();
            
            let label = `${labelPrefix}: ${name}`;
            if (type === 'state') {
                const stateInfo = result as any; // Cast to access displayType
                if (stateInfo.displayType) {
                    label += `: ${stateInfo.displayType}`;
                }
            }
            
            md.appendCodeblock(label, 'typescript');
            if (result.documentation) {
                md.appendMarkdown(`\n\n${result.documentation}\n\n`);
            }
            md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(result.defLocation.uri)}**`);
            return new vscode.Hover(md);
        }
        return undefined;
    }
}
