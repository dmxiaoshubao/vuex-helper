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

        if (context.type === 'action') {
            const action = this.storeIndexer.getAction(word);
            if (action) return action.defLocation;
        } else if (context.type === 'mutation') {
            const mutation = this.storeIndexer.getMutation(word);
            if (mutation) return mutation.defLocation;
        } else if (context.type === 'getter') {
             const getters = this.storeIndexer.getStoreMap()?.getters;
             const getter = getters?.find(g => {
                 const fullName = [...g.modulePath, g.name].join('/');
                 return fullName === word || g.name === word;
             });
             if (getter) return getter.defLocation;
        } else if (context.type === 'state') {
             const states = this.storeIndexer.getStoreMap()?.state;
             const state = states?.find(s => {
                 return s.name === word;
             });
             if (state) return state.defLocation;
        }
        
        return undefined;
    }
}
