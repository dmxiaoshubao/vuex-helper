import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';

export class VuexDefinitionProvider implements vscode.DefinitionProvider {
    private contextScanner = new VuexContextScanner();
    constructor(private storeIndexer: StoreIndexer) {}

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;

        const word = document.getText(range);
        const context = this.contextScanner.getContext(document, position);
        if (!context) return undefined;

        // Helper to match item with namespace constraint
        const matchItem = (item: { name: string, modulePath: string[] }) => {
            if (context.namespace) {
                return item.name === word && item.modulePath.join('/') === context.namespace;
            }
            // If no namespace arg, try full name match or leaf match
            const fullName = [...item.modulePath, item.name].join('/');
            return fullName === word || item.name === word;
        };

        if (context.type === 'action') {
            const actions = this.storeIndexer.getStoreMap()?.actions;
            const action = actions?.find(matchItem);
            if (action) return action.defLocation;
        } else if (context.type === 'mutation') {
            const mutations = this.storeIndexer.getStoreMap()?.mutations;
            const mutation = mutations?.find(matchItem);
            if (mutation) return mutation.defLocation;
        } else if (context.type === 'getter') {
             const getters = this.storeIndexer.getStoreMap()?.getters;
             const getter = getters?.find(matchItem);
             if (getter) return getter.defLocation;
        } else if (context.type === 'state') {
             const states = this.storeIndexer.getStoreMap()?.state;
             const state = states?.find(matchItem);
             if (state) return state.defLocation;
        }
        
        return undefined;
    }
}
