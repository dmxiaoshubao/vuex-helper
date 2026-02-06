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
    ): Promise<vscode.CompletionItem[] | undefined> {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

        // 1. Vuex Context (String literals) - existing logic
        const vuexContext = this.contextScanner.getContext(document, position);
        if (vuexContext && vuexContext.type !== 'unknown') {
            let items: { name: string, documentation?: string, modulePath: string[] }[] = [];
            let kind = vscode.CompletionItemKind.Property;

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
            }

            const results = items.map(item => {
                const label = vuexContext.namespace ? item.name : [...item.modulePath, item.name].join('/');
                const completionItem = new vscode.CompletionItem(label, kind);
                completionItem.detail = `[Vuex] ${vuexContext.type}`;
                completionItem.sortText = `0${label}`; // Top priority
                if (item.documentation) {
                    completionItem.documentation = new vscode.MarkdownString(item.documentation);
                }
                return completionItem;
            });
            return results;
        }

        // 2. Component Method Completion (this.)
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, position.character);
        
        const match = prefix.match(/(?:this|vm)\.([a-zA-Z0-9_$]*)$/);
        
        if (match) {
             const mapping = this.componentMapper.getMapping(document);
             const items: vscode.CompletionItem[] = [];

             for (const localName in mapping) {
                const info = mapping[localName];
                let kind = vscode.CompletionItemKind.Method; 
                if (info.type === 'state') kind = vscode.CompletionItemKind.Field;
                if (info.type === 'getter') kind = vscode.CompletionItemKind.Property;
                
                const item = new vscode.CompletionItem(localName, kind);
                item.detail = `[Vuex Mapped] ${info.type} -> ${info.namespace ? info.namespace + '/' : ''}${info.originalName}`;
                item.sortText = '0'; // Top priority
                item.preselect = true;
                
                const storeMatch = this.findStoreItem(info.originalName, info.type, info.namespace, storeMap);
                if (storeMatch && storeMatch.documentation) {
                    item.documentation = new vscode.MarkdownString(storeMatch.documentation);
                }
                 
                items.push(item);
            }
            
            if (items.length > 0) return items;
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
