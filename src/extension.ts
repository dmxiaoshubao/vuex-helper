import * as vscode from 'vscode';
import { StoreIndexer } from './services/StoreIndexer';
import { VuexDefinitionProvider } from './providers/VuexDefinitionProvider';
import { VuexCompletionItemProvider } from './providers/VuexCompletionItemProvider';
import { VuexHoverProvider } from './providers/VuexHoverProvider';
import { ReindexScheduler } from './services/ReindexScheduler';
import { ComponentMapper } from './services/ComponentMapper';

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating Vuex Helper...');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const storeIndexer = new StoreIndexer(workspaceRoot);
    const sharedComponentMapper = new ComponentMapper();
    const scheduler = new ReindexScheduler(() => {
        // Save/config-driven re-index should not interrupt users with setup prompts.
        void storeIndexer.index({ interactive: false });
    });
    context.subscriptions.push(scheduler);

    // Initial indexing: allow one-time interactive guidance if store entry cannot be detected.
    void storeIndexer.index({ interactive: true });

    // Re-index on file save (throttled in real app, simplified here)
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.languageId === 'javascript' || doc.languageId === 'typescript' || doc.languageId === 'vue') {
             // Skip unrelated saves to avoid unnecessary full store re-parsing.
             if (storeIndexer.shouldReindexForFile(doc.fileName)) {
                scheduler.schedule();
             }
        }
    }));

    // Re-index on configuration change
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vuexHelper.storeEntry')) {
            console.log('Configuration changed, re-indexing store...');
            scheduler.schedule();
            vscode.window.showInformationMessage('Vuex Helper: Store configuration updated. Re-indexing...');
        }
    }));

    const selector = [{ language: 'vue', scheme: 'file' }, { language: 'javascript', scheme: 'file' }, { language: 'typescript', scheme: 'file' }];

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, new VuexDefinitionProvider(storeIndexer, sharedComponentMapper)),
        vscode.languages.registerCompletionItemProvider(selector, new VuexCompletionItemProvider(storeIndexer, sharedComponentMapper), "'", '"', '.'),
        vscode.languages.registerHoverProvider(selector, new VuexHoverProvider(storeIndexer, sharedComponentMapper))
    );
    
    console.log('Vuex Helper activated.');
}

export function deactivate() {}
