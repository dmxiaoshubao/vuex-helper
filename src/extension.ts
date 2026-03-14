import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StoreIndexer } from './services/StoreIndexer';
import { VuexDefinitionProvider } from './providers/VuexDefinitionProvider';
import { VuexCompletionItemProvider } from './providers/VuexCompletionItemProvider';
import { VuexHoverProvider } from './providers/VuexHoverProvider';
import { ReindexScheduler } from './services/ReindexScheduler';
import { ComponentMapper } from './services/ComponentMapper';
import { VuexDiagnosticProvider } from './services/VuexDiagnosticProvider';


/**
 * 检查项目 package.json 中是否有 vuex 依赖。
 * 无 package.json 时返回 false（没有 package.json 说明不是 Node.js 项目）。
 * 文件存在但解析失败时返回 true（保守策略，避免漏掉合法项目）。
 */
export async function hasVuexDependency(workspaceRoot: string): Promise<boolean> {
    const pkgPath = path.join(workspaceRoot, 'package.json');
    try {
        await fs.promises.access(pkgPath);
    } catch {
        // package.json 不存在，非 Node.js 项目
        return false;
    }
    try {
        const content = await fs.promises.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        return !!allDeps['vuex'];
    } catch {
        // 文件存在但读取或解析失败，保守返回 true
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
    context.subscriptions.push(storeIndexer);
    context.subscriptions.push(sharedComponentMapper);

    // Diagnostics：标记引用了不存在的 store 项
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('vuex-helper');
    context.subscriptions.push(diagnosticCollection);
    const diagnosticProvider = new VuexDiagnosticProvider(storeIndexer);

    const runDiagnostics = (doc: vscode.TextDocument) => {
        if (!['vue', 'javascript', 'typescript'].includes(doc.languageId)) return;
        diagnosticCollection.set(doc.uri, diagnosticProvider.diagnose(doc));
    };
    const runAllDiagnostics = () => {
        for (const doc of vscode.workspace.textDocuments) {
            runDiagnostics(doc);
        }
    };

    // 定义在 runAllDiagnostics 之后，确保回调闭包引用的变量已初始化
    const scheduler = new ReindexScheduler((changedFiles) => {
        // Save/config-driven re-index should not interrupt users with setup prompts.
        // 索引完成后刷新所有已打开文档的诊断
        void storeIndexer.index({
            interactive: false,
            changedFiles,
            forceFull: changedFiles.length === 0
        }).then(runAllDiagnostics);
    });
    context.subscriptions.push(scheduler);

    // Initial indexing: allow one-time interactive guidance if store entry cannot be detected.
    // 索引完成后对所有已打开文档执行诊断
    void storeIndexer.index({ interactive: true }).then(runAllDiagnostics);

    // 文档打开时执行诊断（处理扩展激活后新打开的文件）
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(runDiagnostics));

    // Re-index on file save (throttled in real app, simplified here)
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.languageId === 'javascript' || doc.languageId === 'typescript' || doc.languageId === 'vue') {
             // Skip unrelated saves to avoid unnecessary full store re-parsing.
             if (storeIndexer.shouldReindexForFile(doc.fileName)) {
                // store 文件：scheduler 回调中索引完成后会 runAllDiagnostics
                scheduler.schedule(doc.fileName);
                return;
             }
        }
        // 非 store 文件：立即刷新当前文档诊断（索引未变，无需等待）
        runDiagnostics(doc);
    }));

    // Re-index on configuration change
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vuexHelper.storeEntry')) {
            scheduler.schedule();
            vscode.window.showInformationMessage('Vuex Helper: Store configuration updated. Re-indexing...');
        }
    }));

    // 文件创建时，检查是否需要重新索引
    context.subscriptions.push(vscode.workspace.onDidCreateFiles(e => {
        for (const file of e.files) {
            if (storeIndexer.shouldReindexForFile(file.fsPath)) {
                scheduler.schedule(file.fsPath);
            }
        }
    }));

    // 文件删除时，触发全量重建以清除陈旧索引
    context.subscriptions.push(vscode.workspace.onDidDeleteFiles(e => {
        for (const file of e.files) {
            if (storeIndexer.shouldReindexForFile(file.fsPath)) {
                scheduler.schedule(); // 无参数 = 全量重建
                break; // 一次全量足矣
            }
        }
    }));

    // 文件重命名时，触发全量重建
    context.subscriptions.push(vscode.workspace.onDidRenameFiles(e => {
        for (const { oldUri, newUri } of e.files) {
            if (storeIndexer.shouldReindexForFile(oldUri.fsPath) || storeIndexer.shouldReindexForFile(newUri.fsPath)) {
                scheduler.schedule(); // 全量重建
                break;
            }
        }
    }));

    // 手动重索引命令
    context.subscriptions.push(
        vscode.commands.registerCommand('vuexHelper.reindex', () => {
            vscode.window.showInformationMessage('Vuex Helper: Re-indexing store...');
            void storeIndexer.index({ interactive: true, forceFull: true }).then(() => {
                runAllDiagnostics();
                vscode.window.showInformationMessage('Vuex Helper: Re-index complete.');
            });
        })
    );

    const selector = [{ language: 'vue', scheme: 'file' }, { language: 'javascript', scheme: 'file' }, { language: 'typescript', scheme: 'file' }];

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, new VuexDefinitionProvider(storeIndexer, sharedComponentMapper)),
        vscode.languages.registerCompletionItemProvider(selector, new VuexCompletionItemProvider(storeIndexer, sharedComponentMapper), "'", '"', '.'),
        vscode.languages.registerHoverProvider(selector, new VuexHoverProvider(storeIndexer, sharedComponentMapper))
    );

    // 文档关闭时清除诊断
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        diagnosticCollection.delete(doc.uri);
    }));
}

export function deactivate() {}
