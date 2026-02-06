import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';

export class VuexCompletionItemProvider implements vscode.CompletionItemProvider {
    private contextScanner = new VuexContextScanner();
    constructor(private storeIndexer: StoreIndexer) {}

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | undefined> {
        
        const vuexContext = this.contextScanner.getContext(document, position);
        if (!vuexContext) return undefined;

        if (vuexContext.type === 'action') {
            const actions = this.storeIndexer.getStoreMap()?.actions || [];
            return actions.map(a => {
                const fullName = [...a.modulePath, a.name].join('/');
                const item = new vscode.CompletionItem(fullName, vscode.CompletionItemKind.Method);
                item.detail = 'Vuex Action';
                item.documentation = a.documentation || '';
                return item;
            });
        }

        if (vuexContext.type === 'mutation') {
            const mutations = this.storeIndexer.getStoreMap()?.mutations || [];
            return mutations.map(m => {
                const fullName = [...m.modulePath, m.name].join('/');
                const item = new vscode.CompletionItem(fullName, vscode.CompletionItemKind.Method);
                item.detail = 'Vuex Mutation';
                item.documentation = m.documentation || '';
                return item;
            });
        }

        return undefined;
    }
}
