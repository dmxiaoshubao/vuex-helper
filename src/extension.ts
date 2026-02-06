import * as vscode from 'vscode';
import { StoreIndexer } from './services/StoreIndexer';
import { VuexDefinitionProvider } from './providers/VuexDefinitionProvider';
import { VuexCompletionItemProvider } from './providers/VuexCompletionItemProvider';
import { VuexHoverProvider } from './providers/VuexHoverProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating Vuex Helper...');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const storeIndexer = new StoreIndexer(workspaceRoot);

    // Initial indexing
    storeIndexer.index();

    // Re-index on file save (throttled in real app, simplified here)
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.languageId === 'javascript' || doc.languageId === 'typescript' || doc.languageId === 'vue') {
             // simplified: re-index everything. In reality, check if file is related to store.
             storeIndexer.index();
        }
    }));

    // Re-index on configuration change
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vuexHelper.storeEntry')) {
            console.log('Configuration changed, re-indexing store...');
            storeIndexer.index();
            vscode.window.showInformationMessage('Vuex Helper: Store configuration updated. Re-indexing...');
        }
    }));

    const selector = [{ language: 'vue', scheme: 'file' }, { language: 'javascript', scheme: 'file' }, { language: 'typescript', scheme: 'file' }];

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, new VuexDefinitionProvider(storeIndexer)),
        vscode.languages.registerCompletionItemProvider(selector, new VuexCompletionItemProvider(storeIndexer), "'", '"', '.'),
        vscode.languages.registerHoverProvider(selector, new VuexHoverProvider(storeIndexer))
    );
    
    console.log('Vuex Helper activated.');
}

export function deactivate() {}
