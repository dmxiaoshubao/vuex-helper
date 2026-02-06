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
        const context = this.contextScanner.getContext(document, position);
        if (context) {
            if (context.type === 'state') return this.findHover(word, 'state', context.namespace);
            if (context.type === 'getter') return this.findHover(word, 'getter', context.namespace);
            if (context.type === 'mutation') return this.findHover(word, 'mutation', context.namespace);
            if (context.type === 'action') return this.findHover(word, 'action', context.namespace);
        }

        // 2. Component Mapping (this.methodName)
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, range.start.character).trimEnd();
        
        // Reuse simplest property access check
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = mapping[word];
        
        if (mappedItem) {
            return this.findHover(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }

        return undefined;
    }

    private findHover(name: string, type: 'state' | 'getter' | 'mutation' | 'action', namespace?: string): vscode.Hover | undefined {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

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

        let result: { defLocation: vscode.Location, documentation?: string } | undefined;
        let labelPrefix = '';

        if (type === 'action') {
            result = storeMap.actions.find(matchItem);
            labelPrefix = 'Action';
        } else if (type === 'mutation') {
            result = storeMap.mutations.find(matchItem);
            labelPrefix = 'Mutation';
        } else if (type === 'state') {
            result = storeMap.state.find(matchItem);
            labelPrefix = 'State';
        } else if (type === 'getter') {
            result = storeMap.getters.find(matchItem);
            labelPrefix = 'Getter';
        }

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
