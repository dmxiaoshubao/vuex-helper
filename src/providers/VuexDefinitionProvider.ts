import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';

export class VuexDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private storeIndexer: StoreIndexer) {}

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;

        const word = document.getText(range);
        const lineText = document.lineAt(position).text;
        
        // Simple regex matching for context
        // 1. commit('mutationName') or dispatch('actionName')
        // 2. mapState(['stateName']), mapGetters...
        // 3. properties in object: ...mapState({ alias: 'stateName' })
        
        // Check for dispatch/commit
        const dispatchMatch = lineText.match(/dispatch\s*\(\s*['"](.+?)['"]/);
        const commitMatch = lineText.match(/commit\s*\(\s*['"](.+?)['"]/);
        
        // This regex is very basic and fragile. 
        // A better approach is to check if the 'word' is inside one of these calls using AST or more complex Regex around location.
        // For efficiency in MVP, let's just check if the word matches a known mutation/action AND looks like it's in a string.
        
        // Check if cursor is inside quotes
        const isInsideQuotes = (lineText.substring(0, range.start.character).match(/['"]/g) || []).length % 2 === 1;
        
        if (isInsideQuotes) {
            // Likely a string parameter
            // Check context
            if (lineText.includes('dispatch')) {
                const action = this.storeIndexer.getAction(word);
                if (action) {
                    return action.defLocation;
                }
            } else if (lineText.includes('commit')) {
                const mutation = this.storeIndexer.getMutation(word);
                if (mutation) {
                    return mutation.defLocation;
                }
            }
             // mapHelpers
            if (lineText.includes('mapActions')) {
                const action = this.storeIndexer.getAction(word);
                if (action) return action.defLocation;
            }
            if (lineText.includes('mapMutations')) {
                const mutation = this.storeIndexer.getMutation(word);
                if (mutation) return mutation.defLocation;
            }
             if (lineText.includes('mapGetters')) {
                 // getter lookup
                 const getters = this.storeIndexer.getStoreMap()?.getters;
                 const getter = getters?.find(g => {
                     const fullName = [...g.modulePath, g.name].join('/');
                     return fullName === word || g.name === word;
                 });
                 if (getter) return getter.defLocation;
            }
            if (lineText.includes('mapState')) {
                // state lookup
                 const states = this.storeIndexer.getStoreMap()?.state;
                 const state = states?.find(s => {
                     // State is often accessed by leaf name if using modules without namespacing... 
                     // With namespacing + mapState('module', ['prop']), it's harder.
                     // Simplified: just match name
                     return s.name === word;
                 });
                 if (state) return state.defLocation;
            }
        }
        
        // Check for this.$store.state.xxx
        // Regex to check specific patterns prior to cursor
        // ...
        
        return undefined;
    }
}
