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

        // Helper to filter by namespace
        const filterByNamespace = (itemPath: string[], targetNs: string | undefined) => {
             if (!targetNs) return true; // logic: if no namespace arg, likely root. OR we show all.
             // Actually, if user types mapState('user', [...]), we ONLY want 'user' module items.
             const joinedPath = itemPath.join('/');
             return joinedPath === targetNs;
        };

        if (vuexContext.type === 'action') {
            let actions = this.storeIndexer.getStoreMap()?.actions || [];
            if (vuexContext.namespace) {
                actions = actions.filter(a => filterByNamespace(a.modulePath, vuexContext.namespace));
            }
            return actions.map(a => {
                // If namespaced, we might want to show local name?
                // For mapActions('ns', ['action']), the label should be 'action', NOT 'ns/action'.
                const label = vuexContext.namespace ? a.name : [...a.modulePath, a.name].join('/');
                const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Method);
                item.detail = 'Vuex Action';
                item.documentation = a.documentation || '';
                return item;
            });
        }

        if (vuexContext.type === 'mutation') {
            let mutations = this.storeIndexer.getStoreMap()?.mutations || [];
            if (vuexContext.namespace) {
                mutations = mutations.filter(m => filterByNamespace(m.modulePath, vuexContext.namespace));
            }
            return mutations.map(m => {
                const label = vuexContext.namespace ? m.name : [...m.modulePath, m.name].join('/');
                const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Method);
                item.detail = 'Vuex Mutation';
                item.documentation = m.documentation || '';
                return item;
            });
        }

        if (vuexContext.type === 'state') {
            let states = this.storeIndexer.getStoreMap()?.state || [];
            if (vuexContext.namespace) {
                states = states.filter(s => filterByNamespace(s.modulePath, vuexContext.namespace));
            }
            return states.map(s => {
                const label = s.name; // state is usually just property name
                const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Field);
                item.detail = 'Vuex State';
                item.documentation = s.documentation || '';
                return item;
            });
        }

        if (vuexContext.type === 'getter') {
            let getters = this.storeIndexer.getStoreMap()?.getters || [];
            if (vuexContext.namespace) {
                 getters = getters.filter(g => filterByNamespace(g.modulePath, vuexContext.namespace));
            }
            return getters.map(g => {
                const label = vuexContext.namespace ? g.name : [...g.modulePath, g.name].join('/');
                const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
                item.detail = 'Vuex Getter';
                item.documentation = g.documentation || '';
                return item;
            });
        }

        return undefined;
    }
}
