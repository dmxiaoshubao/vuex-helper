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
        }

        return undefined;
    }
}
