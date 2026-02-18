import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StoreIndexer } from './services/StoreIndexer';
import { VuexDefinitionProvider } from './providers/VuexDefinitionProvider';
import { VuexCompletionItemProvider } from './providers/VuexCompletionItemProvider';
import { VuexHoverProvider } from './providers/VuexHoverProvider';
import { ReindexScheduler } from './services/ReindexScheduler';
import { ComponentMapper } from './services/ComponentMapper';

/**
 * 检查项目 package.json 中是否有 vuex 依赖。
 * 无 package.json 或解析失败时返回 true（保守策略，避免漏掉合法项目）。
 */
export async function hasVuexDependency(workspaceRoot: string): Promise<boolean> {
    const pkgPath = path.join(workspaceRoot, 'package.json');
    try {
        const content = await fs.promises.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        return !!allDeps['vuex'];
    } catch {
        // 文件不存在或解析失败，保守返回 true
        return true;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // 检查项目是否使用 vuex，非 vuex 项目静默退出
    if (!await hasVuexDependency(workspaceRoot)) {
        return;
    }

    const storeIndexer = new StoreIndexer(workspaceRoot);
    const sharedComponentMapper = new ComponentMapper();
    const scheduler = new ReindexScheduler(() => {
        // Save/config-driven re-index should not interrupt users with setup prompts.
        void storeIndexer.index({ interactive: false });
    });
    context.subscriptions.push(scheduler);
    context.subscriptions.push(storeIndexer);
    context.subscriptions.push(sharedComponentMapper);

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
}

export function deactivate() {}
