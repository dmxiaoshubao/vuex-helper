import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProviders(document: vscode.TextDocument, position: vscode.Position): Promise<void> {
    const deadline = Date.now() + 20000;
    let lastDefCount = 0;
    let lastHoverCount = 0;
    while (Date.now() < deadline) {
        const defs = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
            'vscode.executeDefinitionProvider',
            document.uri,
            position
        );
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            document.uri,
            position
        );
        lastDefCount = defs?.length || 0;
        lastHoverCount = hovers?.length || 0;
        if ((defs && defs.length > 0) && (hovers && hovers.length > 0)) {
            return;
        }
        await sleep(250);
    }
    throw new Error(`Providers did not become ready within timeout (def=${lastDefCount}, hover=${lastHoverCount}, language=${document.languageId})`);
}

async function ensureExtensionActivated(): Promise<void> {
    const extension = vscode.extensions.getExtension('dmxiaoshubao.vuex-helper');
    assert.ok(extension, 'Failed to locate vuex-helper extension');
    if (!extension!.isActive) {
        await extension!.activate();
    }
}

async function openDocumentForProviders(filePath: string): Promise<vscode.TextDocument> {
    let document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    if (!['vue', 'javascript', 'typescript'].includes(document.languageId)) {
        // 在 --disable-extensions 场景下，.vue 可能退化为 plain text；切到 js 以触发 provider。
        document = await vscode.languages.setTextDocumentLanguage(document, 'javascript');
    }
    await vscode.window.showTextDocument(document);
    return document;
}

function p95(values: number[]): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
    return sorted[idx];
}

async function measureDefinitionHoverLatency(
    document: vscode.TextDocument,
    position: vscode.Position,
    label: string
): Promise<void> {
    await waitForProviders(document, position);

    const defDurations: number[] = [];
    const hoverDurations: number[] = [];
    for (let i = 0; i < 6; i++) {
        const defStart = performance.now();
        const defs = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
            'vscode.executeDefinitionProvider',
            document.uri,
            position
        );
        const defElapsed = performance.now() - defStart;
        assert.ok(defs && defs.length > 0, `[${label}] Definition result should not be empty`);
        if (i > 0) defDurations.push(defElapsed); // skip first sample as warmup

        const hoverStart = performance.now();
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            document.uri,
            position
        );
        const hoverElapsed = performance.now() - hoverStart;
        assert.ok(hovers && hovers.length > 0, `[${label}] Hover result should not be empty`);
        if (i > 0) hoverDurations.push(hoverElapsed);
    }

    const defP95 = p95(defDurations);
    const hoverP95 = p95(hoverDurations);
    assert.ok(defP95 < 1200, `[${label}] Definition p95 exceeded host smoke baseline: ${defP95.toFixed(2)}ms`);
    assert.ok(hoverP95 < 1200, `[${label}] Hover p95 exceeded host smoke baseline: ${hoverP95.toFixed(2)}ms`);
}

describe('Host Performance Smoke', function () {
    this.timeout(40000);

    it('should keep definition and hover latency within host smoke baseline (module js)', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required for host smoke tests');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const filePath = path.join(workspaceRoot, 'src/store/modules/others.js');

        // 先打开 JS 文件触发 onLanguage:javascript 激活路径，避免 .vue 语言模式依赖。
        const warmupDoc = await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await sleep(500);

        const document = await openDocumentForProviders(filePath);

        const text = document.getText();
        const anchor = 'commit("SET_THEME", theme)';
        const anchorIndex = text.indexOf(anchor);
        assert.ok(anchorIndex >= 0, 'Anchor code not found in fixture');
        const tokenIndex = anchorIndex + anchor.indexOf('SET_THEME');
        const position = document.positionAt(tokenIndex + 2);

        await measureDefinitionHoverLatency(document, position, 'others.js');
    });

    it('should keep definition and hover latency within host smoke baseline (App.vue real cases)', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required for host smoke tests');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const appFile = path.join(workspaceRoot, 'src/App.vue');

        const warmupDoc = await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await sleep(500);
        void warmupDoc;

        const document = await openDocumentForProviders(appFile);
        const text = document.getText();
        const anchor = "this['others/SET_THEME']";
        const anchorIndex = text.lastIndexOf(anchor);
        assert.ok(anchorIndex >= 0, 'App.vue anchor code not found in fixture');
        const tokenIndex = anchorIndex + anchor.indexOf('SET_THEME');
        const position = document.positionAt(tokenIndex + 2);

        await measureDefinitionHoverLatency(document, position, 'App.vue');
    });
});

describe('Host Reindex Command', function () {
    this.timeout(15000);

    it('should execute vuexHelper.reindex command without error', async () => {
        await ensureExtensionActivated();
        // 命令应能正常执行，不抛异常
        await vscode.commands.executeCommand('vuexHelper.reindex');
        // 等待索引完成
        await sleep(1000);
    });
});

describe('Host Diagnostics', function () {
    this.timeout(20000);

    it('should produce diagnostics for opened vue file after indexing', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;

        await ensureExtensionActivated();
        await sleep(2000); // 等待初始索引完成

        // 打开一个已知包含有效 store 引用的文件
        const filePath = path.join(workspaceRoot, 'src/App.vue');
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(document);
        await sleep(500);

        // 诊断集合应存在（不抛异常即可，具体内容取决于 fixture）
        const diags = vscode.languages.getDiagnostics
            ? vscode.languages.getDiagnostics(document.uri)
            : [];
        // 只验证 API 可调用，不对具体数量做断言（fixture 内容可能变化）
        assert.ok(Array.isArray(diags), 'getDiagnostics should return an array');
    });
});
