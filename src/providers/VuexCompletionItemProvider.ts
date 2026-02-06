import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';

export class VuexCompletionItemProvider implements vscode.CompletionItemProvider {
    constructor(private storeIndexer: StoreIndexer) {}

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | undefined> {
        
        const lineText = document.lineAt(position).text;
        const linePrefix = lineText.substring(0, position.character);

        // Check trigger character
        // if user typed "dispatch('", we want action suggestions
        
        if (linePrefix.match(/dispatch\s*\(\s*['"]$/)) {
            const actions = this.storeIndexer.getStoreMap()?.actions || [];
            return actions.map(a => {
                const fullName = [...a.modulePath, a.name].join('/');
                const item = new vscode.CompletionItem(fullName, vscode.CompletionItemKind.Method);
                item.detail = 'Vuex Action';
                return item;
            });
        }

        if (linePrefix.match(/commit\s*\(\s*['"]$/)) {
            const mutations = this.storeIndexer.getStoreMap()?.mutations || [];
            return mutations.map(m => {
                const fullName = [...m.modulePath, m.name].join('/');
                const item = new vscode.CompletionItem(fullName, vscode.CompletionItemKind.Method);
                item.detail = 'Vuex Mutation';
                return item;
            });
        }
        
        // mapHelpers
        // mapActions(['...'])
        if (linePrefix.match(/mapActions\s*\(\s*\[.*['"]$/) || linePrefix.match(/mapActions\s*\(\s*\{.*['"]$/)) {
             const actions = this.storeIndexer.getStoreMap()?.actions || [];
            return actions.map(a => {
                 const fullName = [...a.modulePath, a.name].join('/');
                const item = new vscode.CompletionItem(fullName, vscode.CompletionItemKind.Method);
                return item;
            });
        }

        return undefined;
    }
}
