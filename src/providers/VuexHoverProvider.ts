import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';

export class VuexHoverProvider implements vscode.HoverProvider {
    private contextScanner = new VuexContextScanner();
    constructor(private storeIndexer: StoreIndexer) {}

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;
        const word = document.getText(range);
        const lineText = document.lineAt(position).text;
        const context = this.contextScanner.getContext(document, position);
        if (!context) return undefined;

        if (context.type === 'action') {
            const action = this.storeIndexer.getAction(word);
            if (action) {
                    const md = new vscode.MarkdownString();
                    md.appendCodeblock(`Action: ${word}`, 'typescript');
                    if (action.documentation) {
                        md.appendMarkdown(`\n\n${action.documentation}\n\n`);
                    }
                    md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(action.defLocation.uri)}**`);
                    return new vscode.Hover(md);
            }
        } else if (context.type === 'mutation') {
            const mutation = this.storeIndexer.getMutation(word);
            if (mutation) {
                    const md = new vscode.MarkdownString();
                    md.appendCodeblock(`Mutation: ${word}`, 'typescript');
                    if (mutation.documentation) {
                        md.appendMarkdown(`\n\n${mutation.documentation}\n\n`);
                    }
                    md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(mutation.defLocation.uri)}**`);
                    return new vscode.Hover(md);
            }
        } else if (context.type === 'state') {
            // State lookup needs to consider namespace or just name matching
            const states = this.storeIndexer.getStoreMap()?.state || [];
            // Simple match: if any state has this name.
            // Ideally we check namespace if available in context.
            const state = states.find(s => {
                if (context.namespace) {
                     return s.name === word && s.modulePath.join('/') === context.namespace;
                }
                return s.name === word;
            });
            
            if (state) {
                const md = new vscode.MarkdownString();
                md.appendCodeblock(`State: ${word}`, 'typescript');
                if (state.documentation) {
                     md.appendMarkdown(`\n\n${state.documentation}\n\n`);
                }
                md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(state.defLocation.uri)}**`);
                return new vscode.Hover(md);
            }
        } else if (context.type === 'getter') {
            const getters = this.storeIndexer.getStoreMap()?.getters || [];
            const getter = getters.find(g => {
                 const fullName = [...g.modulePath, g.name].join('/');
                 if (context.namespace) {
                     return g.name === word && g.modulePath.join('/') === context.namespace;
                 }
                 // If full name match or leaf name match (if unique?)
                 return fullName === word || g.name === word;
            });
            
            if (getter) {
                 const md = new vscode.MarkdownString();
                 md.appendCodeblock(`Getter: ${word}`, 'typescript');
                 if (getter.documentation) {
                     md.appendMarkdown(`\n\n${getter.documentation}\n\n`);
                 }
                 md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(getter.defLocation.uri)}**`);
                 return new vscode.Hover(md);
            }
        }

        return undefined;
    }
}
