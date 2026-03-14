import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

type CompletionResult = vscode.CompletionItem[] | vscode.CompletionList | undefined;
type DefinitionResult = Array<vscode.Location | vscode.LocationLink> | undefined;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function findNthIndex(text: string, token: string, occurrence = 1): number {
    let fromIndex = 0;
    let index = -1;

    for (let i = 0; i < occurrence; i++) {
        index = text.indexOf(token, fromIndex);
        if (index < 0) {
            throw new Error(`Token not found: "${token}" (occurrence=${occurrence})`);
        }
        fromIndex = index + token.length;
    }

    return index;
}

function findPositionInAnchor(
    document: vscode.TextDocument,
    anchor: string,
    token: string,
    occurrence = 1,
    tokenOffset = 0,
): vscode.Position {
    const text = document.getText();
    const anchorIndex = findNthIndex(text, anchor, occurrence);
    const tokenIndexInAnchor = anchor.indexOf(token);
    assert.ok(tokenIndexInAnchor >= 0, `Token "${token}" not found in anchor "${anchor}"`);
    return document.positionAt(anchorIndex + tokenIndexInAnchor + tokenOffset);
}

function rangeContains(range: vscode.Range, position: vscode.Position): boolean {
    return (
        range.start.isBeforeOrEqual(position) &&
        range.end.isAfterOrEqual(position)
    );
}

function hasWarningAtPosition(
    diagnostics: readonly vscode.Diagnostic[],
    position: vscode.Position,
    messageFragment: string,
): boolean {
    return diagnostics.some((diag) =>
        diag.severity === vscode.DiagnosticSeverity.Warning &&
        diag.message.includes(messageFragment) &&
        rangeContains(diag.range, position)
    );
}

function hasAnyDiagnosticAtPosition(
    diagnostics: readonly vscode.Diagnostic[],
    position: vscode.Position,
): boolean {
    return diagnostics.some((diag) => rangeContains(diag.range, position));
}

function normalizeCompletionItems(result: CompletionResult): vscode.CompletionItem[] {
    if (!result) return [];
    return Array.isArray(result) ? result : result.items;
}

function getCompletionLabel(item: vscode.CompletionItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label;
}

function normalizeDefinitionResults(result: DefinitionResult): Array<vscode.Location | vscode.LocationLink> {
    return result ?? [];
}

function getDefinitionUri(definition: vscode.Location | vscode.LocationLink): vscode.Uri {
    return definition instanceof vscode.Location ? definition.uri : definition.targetUri;
}

function hoverToString(hover: vscode.Hover): string {
    const parts = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
    return parts.map((part) => {
        if (typeof part === 'string') return part;
        const valuePart = part as { value: string; language?: string };
        return valuePart.language ? `${valuePart.language}\n${valuePart.value}` : valuePart.value;
    }).join('\n');
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

async function waitForDiagnostics(
    document: vscode.TextDocument,
    predicate: (diagnostics: readonly vscode.Diagnostic[]) => boolean,
): Promise<readonly vscode.Diagnostic[]> {
    const deadline = Date.now() + 20000;
    let lastDiagnostics: readonly vscode.Diagnostic[] = [];

    while (Date.now() < deadline) {
        lastDiagnostics = vscode.languages.getDiagnostics(document.uri);
        if (predicate(lastDiagnostics)) {
            return lastDiagnostics;
        }
        await sleep(250);
    }

    throw new Error(`Diagnostics did not reach expected state within timeout: ${lastDiagnostics.map((diag) => diag.message).join(' | ')}`);
}

async function waitForCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    predicate: (items: vscode.CompletionItem[]) => boolean,
): Promise<vscode.CompletionItem[]> {
    const deadline = Date.now() + 20000;
    let lastItems: vscode.CompletionItem[] = [];

    while (Date.now() < deadline) {
        const result = await vscode.commands.executeCommand<CompletionResult>(
            'vscode.executeCompletionItemProvider',
            document.uri,
            position,
        );
        lastItems = normalizeCompletionItems(result);
        if (predicate(lastItems)) {
            return lastItems;
        }
        await sleep(250);
    }

    throw new Error(`Completion items did not reach expected state within timeout: ${lastItems.map(getCompletionLabel).join(', ')}`);
}

async function waitForDefinitions(
    document: vscode.TextDocument,
    position: vscode.Position,
    predicate: (definitions: Array<vscode.Location | vscode.LocationLink>) => boolean,
): Promise<Array<vscode.Location | vscode.LocationLink>> {
    const deadline = Date.now() + 20000;
    let lastDefinitions: Array<vscode.Location | vscode.LocationLink> = [];

    while (Date.now() < deadline) {
        const result = await vscode.commands.executeCommand<DefinitionResult>(
            'vscode.executeDefinitionProvider',
            document.uri,
            position,
        );
        lastDefinitions = normalizeDefinitionResults(result);
        if (predicate(lastDefinitions)) {
            return lastDefinitions;
        }
        await sleep(250);
    }

    throw new Error(`Definitions did not reach expected state within timeout: ${lastDefinitions.map((item) => getDefinitionUri(item).fsPath).join(', ')}`);
}

async function waitForHovers(
    document: vscode.TextDocument,
    position: vscode.Position,
    predicate: (hovers: vscode.Hover[]) => boolean,
): Promise<vscode.Hover[]> {
    const deadline = Date.now() + 20000;
    let lastHovers: vscode.Hover[] = [];

    while (Date.now() < deadline) {
        lastHovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            document.uri,
            position,
        ) || [];
        if (predicate(lastHovers)) {
            return lastHovers;
        }
        await sleep(250);
    }

    throw new Error(`Hovers did not reach expected state within timeout: ${lastHovers.map(hoverToString).join(' | ')}`);
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
        const anchor = 'this.$store.commit("others/SET_THEME"';
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

    it('should report real vuex warnings and keep known false positives clean', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const filePath = path.join(workspaceRoot, 'src/DiagnosticsTest.vue');

        await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await vscode.commands.executeCommand('vuexHelper.reindex');
        await sleep(1000);

        const document = await openDocumentForProviders(filePath);

        const warningChecks = [
            {
                position: findPositionInAnchor(document, '...mapState(["ghostState"]),', 'ghostState', 1, 2),
                message: '"ghostState"',
            },
            {
                position: findPositionInAnchor(document, '...mapState({ alias: "badState" }),', 'badState', 1, 2),
                message: '"badState"',
            },
            {
                position: findPositionInAnchor(document, '...mapGetters(["noSuchGetter"]),', 'noSuchGetter', 1, 2),
                message: '"noSuchGetter"',
            },
            {
                position: findPositionInAnchor(document, '...mapMutations(["NO_SUCH_MUTATION"]),', 'NO_SUCH_MUTATION', 1, 2),
                message: '"NO_SUCH_MUTATION"',
            },
            {
                position: findPositionInAnchor(document, '...mapActions("user", ["badAction"]),', 'badAction', 1, 2),
                message: '"badAction"',
            },
        ];

        const cleanChecks = [
            findPositionInAnchor(document, '...mapState("user", ["name", "age"]),', 'name', 1, 2),
            findPositionInAnchor(document, '...mapState("user", ["name", "age"]),', 'age', 1, 2),
            findPositionInAnchor(document, 'return state.count > 0 ? "dark" : "light";', 'dark', 1, 2),
            findPositionInAnchor(document, 'return state.count > 0 ? "dark" : "light";', 'light', 1, 2),
            findPositionInAnchor(document, 'dispatch("local-event");', 'local-event', 1, 2),
            findPositionInAnchor(document, 'commit("local-mutation");', 'local-mutation', 1, 2),
        ];

        const diagnostics = await waitForDiagnostics(document, (items) =>
            warningChecks.every((check) => hasWarningAtPosition(items, check.position, check.message)) &&
            cleanChecks.every((position) => !hasAnyDiagnosticAtPosition(items, position))
        );

        warningChecks.forEach((check) => {
            assert.ok(hasWarningAtPosition(diagnostics, check.position, check.message), `Expected warning for ${check.message}`);
        });
        cleanChecks.forEach((position) => {
            assert.ok(!hasAnyDiagnosticAtPosition(diagnostics, position), 'Unexpected diagnostic at clean position');
        });
    });
});

describe('Host Completion', function () {
    this.timeout(20000);

    it('should provide module-scoped completions for real store commit and dispatch calls', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const othersFile = path.join(workspaceRoot, 'src/store/modules/others.js');
        const userFile = path.join(workspaceRoot, 'src/store/modules/user.js');

        await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await vscode.commands.executeCommand('vuexHelper.reindex');
        await sleep(1000);

        const othersDocument = await openDocumentForProviders(othersFile);
        const commitPosition = findPositionInAnchor(
            othersDocument,
            'commit("SET_THEME", theme)',
            'SET_THEME',
        );
        const commitItems = await waitForCompletionItems(othersDocument, commitPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('SET_THEME');
        });
        const commitLabels = commitItems.map(getCompletionLabel);
        assert.ok(commitLabels.includes('SET_THEME'), 'Expected commit completion to include SET_THEME');
        assert.ok(!commitLabels.includes('increment'), 'Commit completion under others/ should stay module-scoped');

        const userDocument = await openDocumentForProviders(userFile);
        const dispatchPosition = findPositionInAnchor(
            userDocument,
            'dispatch("updateName", name)',
            'updateName',
        );
        const dispatchItems = await waitForCompletionItems(userDocument, dispatchPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('callRootAction') && labels.includes('updateName');
        });
        const dispatchLabels = dispatchItems.map(getCompletionLabel);
        assert.ok(dispatchLabels.includes('callRootAction'), 'Expected dispatch completion to include callRootAction');
        assert.ok(dispatchLabels.includes('updateName'), 'Expected dispatch completion to include updateName');
        assert.ok(!dispatchLabels.includes('incrementAsync'), 'Dispatch completion under user/ should stay module-scoped');
    });

    it('should support rootState and rootGetters completions and navigation in real module context', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const userFile = path.join(workspaceRoot, 'src/store/modules/user.js');

        await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await vscode.commands.executeCommand('vuexHelper.reindex');
        await sleep(1000);

        const document = await openDocumentForProviders(userFile);

        const rootStatePosition = findPositionInAnchor(
            document,
            'rootState.count; // <- 光标放点后',
            'count',
        );
        const rootStateItems = await waitForCompletionItems(document, rootStatePosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('count') && labels.includes('user') && labels.includes('others');
        });
        const rootStateLabels = rootStateItems.map(getCompletionLabel);
        assert.ok(rootStateLabels.includes('count'), 'Expected rootState completion to include count');
        assert.ok(rootStateLabels.includes('user'), 'Expected rootState completion to include user module');
        assert.ok(rootStateLabels.includes('others'), 'Expected rootState completion to include others module');

        const nestedRootStatePosition = findPositionInAnchor(
            document,
            'rootState.others.productName; // <- 光标放最后一个点后',
            'productName',
        );
        const nestedRootStateItems = await waitForCompletionItems(document, nestedRootStatePosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('productName') && labels.includes('theme');
        });
        const nestedRootStateLabels = nestedRootStateItems.map(getCompletionLabel);
        assert.ok(nestedRootStateLabels.includes('productName'), 'Expected nested rootState completion to include productName');
        assert.ok(nestedRootStateLabels.includes('theme'), 'Expected nested rootState completion to include theme');

        const rootGettersDotPosition = findPositionInAnchor(
            document,
            'rootGetters.isLoggedIn; // <- 光标放点后',
            'isLoggedIn',
        );
        const rootGetterItems = await waitForCompletionItems(document, rootGettersDotPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('isLoggedIn') && labels.includes('user/upperName');
        });
        const rootGetterLabels = rootGetterItems.map(getCompletionLabel);
        assert.ok(rootGetterLabels.includes('isLoggedIn'), 'Expected rootGetters dot completion to include isLoggedIn');
        assert.ok(rootGetterLabels.includes('user/upperName'), 'Expected rootGetters dot completion to include namespaced getter');

        const rootGettersBracketPosition = findPositionInAnchor(
            document,
            'rootGetters["user/upperName"]; // <- 光标放引号内',
            'upperName',
        );
        const rootGetterBracketItems = await waitForCompletionItems(document, rootGettersBracketPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('user/upperName') && labels.includes('others/isDarkMode');
        });
        const rootGetterBracketLabels = rootGetterBracketItems.map(getCompletionLabel);
        assert.ok(rootGetterBracketLabels.includes('user/upperName'), 'Expected rootGetters bracket completion to include user/upperName');
        assert.ok(rootGetterBracketLabels.includes('others/isDarkMode'), 'Expected rootGetters bracket completion to include others/isDarkMode');

        const rootStateDefinitionPosition = findPositionInAnchor(
            document,
            'rootState.others.productName; // <- 光标放 productName 上',
            'productName',
            1,
            2,
        );
        const rootStateDefinitions = await waitForDefinitions(document, rootStateDefinitionPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'others.js')))
        );
        assert.ok(
            rootStateDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'others.js'))),
            'Expected rootState definition to resolve to others.js',
        );

        const rootStateHovers = await waitForHovers(document, rootStateDefinitionPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('productName'))
        );
        assert.ok(rootStateHovers.some((hover) => hoverToString(hover).includes('productName')), 'Expected rootState hover to include productName');

        const rootGetterDefinitionPosition = findPositionInAnchor(
            document,
            'rootGetters["user/upperName"]; // <- 光标放 upperName 上',
            'upperName',
            1,
            2,
        );
        const rootGetterDefinitions = await waitForDefinitions(document, rootGetterDefinitionPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'user.js')))
        );
        assert.ok(
            rootGetterDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'user.js'))),
            'Expected rootGetters definition to resolve to user.js',
        );

        const rootGetterHovers = await waitForHovers(document, rootGetterDefinitionPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('upperName'))
        );
        assert.ok(rootGetterHovers.some((hover) => hoverToString(hover).includes('upperName')), 'Expected rootGetters hover to include upperName');
    });

    it('should support mapped property and bracket access completions and navigation in component context', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const appFile = path.join(workspaceRoot, 'src/App.vue');

        await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await vscode.commands.executeCommand('vuexHelper.reindex');
        await sleep(1000);

        const document = await openDocumentForProviders(appFile);

        const mappedDotPosition = findPositionInAnchor(
            document,
            'this.c; // <- 光标放 c 后',
            'c',
            1,
            1,
        );
        const mappedDotItems = await waitForCompletionItems(document, mappedDotPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('count');
        });
        const mappedDotLabels = mappedDotItems.map(getCompletionLabel);
        assert.ok(mappedDotLabels.includes('count'), 'Expected mapped dot completion to include count');

        const mappedBracketPosition = findPositionInAnchor(
            document,
            'this["others/"]; // <- 光标放斜杠后',
            'others/',
            1,
            'others/'.length,
        );
        const mappedBracketItems = await waitForCompletionItems(document, mappedBracketPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('others/SET_THEME') && labels.includes('others/changeTheme');
        });
        const mappedBracketLabels = mappedBracketItems.map(getCompletionLabel);
        assert.ok(mappedBracketLabels.includes('others/SET_THEME'), 'Expected mapped bracket completion to include others/SET_THEME');
        assert.ok(mappedBracketLabels.includes('others/changeTheme'), 'Expected mapped bracket completion to include others/changeTheme');

        const mappedDefinitionPosition = findPositionInAnchor(
            document,
            'this["others/SET_THEME"];',
            'SET_THEME',
            1,
            2,
        );
        const mappedDefinitions = await waitForDefinitions(document, mappedDefinitionPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'others.js')))
        );
        assert.ok(
            mappedDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'others.js'))),
            'Expected mapped bracket definition to resolve to others.js',
        );

        const mappedHovers = await waitForHovers(document, mappedDefinitionPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('others/SET_THEME'))
        );
        assert.ok(mappedHovers.some((hover) => hoverToString(hover).includes('others/SET_THEME')), 'Expected mapped bracket hover to include others/SET_THEME');
    });
});
