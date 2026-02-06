import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';

export class VuexHoverProvider implements vscode.HoverProvider {
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
        const isInsideQuotes = (lineText.substring(0, range.start.character).match(/['"]/g) || []).length % 2 === 1;

        if (isInsideQuotes) {
            if (lineText.includes('dispatch') || lineText.includes('mapActions')) {
                const action = this.storeIndexer.getAction(word);
                if (action) {
                     const md = new vscode.MarkdownString();
                     md.appendCodeblock(`Action: ${word}`, 'typescript');
                     md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(action.defLocation.uri)}**`);
                     return new vscode.Hover(md);
                }
            }
             if (lineText.includes('commit') || lineText.includes('mapMutations')) {
                const mutation = this.storeIndexer.getMutation(word);
                if (mutation) {
                     const md = new vscode.MarkdownString();
                     md.appendCodeblock(`Mutation: ${word}`, 'typescript');
                     md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(mutation.defLocation.uri)}**`);
                     return new vscode.Hover(md);
                }
            }
        }

        return undefined;
    }
}
