import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

type CompletionResult = vscode.CompletionItem[] | vscode.CompletionList | undefined;
type DefinitionResult = Array<vscode.Location | vscode.LocationLink> | undefined;
let hostLanguageNoiseSuppressed: Promise<void> | undefined;

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

async function suppressHostLanguageNoise(): Promise<void> {
    if (!hostLanguageNoiseSuppressed) {
        hostLanguageNoiseSuppressed = (async () => {
            const updates: Array<[string | undefined, string, unknown]> = [
                ['javascript', 'validate.enable', false],
                ['typescript', 'validate.enable', false],
                ['javascript', 'suggestionActions.enabled', false],
                ['typescript', 'suggestionActions.enabled', false],
                ['javascript', 'format.enable', false],
                ['typescript', 'format.enable', false],
            ];

            for (const [section, key, value] of updates) {
                const config = section ? vscode.workspace.getConfiguration(section) : vscode.workspace.getConfiguration();
                await config.update(key, value, vscode.ConfigurationTarget.Workspace);
            }

            try {
                await vscode.commands.executeCommand('typescript.restartTsServer');
            } catch {
                // TS server may be unavailable in isolated mode before JS/TS docs are opened.
            }
        })();
    }

    await hostLanguageNoiseSuppressed;
}

async function openDocumentForProviders(filePath: string): Promise<vscode.TextDocument> {
    await suppressHostLanguageNoise();
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

async function withTemporaryTokenPrefix<T>(
    document: vscode.TextDocument,
    anchor: string,
    token: string,
    typedPrefixLength: number,
    run: (editedDocument: vscode.TextDocument, position: vscode.Position) => Promise<T>,
    occurrence = 1,
): Promise<T> {
    const editor = await vscode.window.showTextDocument(document);
    const start = findPositionInAnchor(document, anchor, token, occurrence);
    const originalEnd = new vscode.Position(start.line, start.character + token.length);
    const prefix = token.slice(0, typedPrefixLength);
    const editedEnd = new vscode.Position(start.line, start.character + prefix.length);

    const applied = await editor.edit((editBuilder) => {
        editBuilder.replace(new vscode.Range(start, originalEnd), prefix);
    });
    assert.ok(applied, `Failed to prepare temporary completion prefix for "${token}"`);

    try {
        return await run(editor.document, editedEnd);
    } finally {
        await editor.edit((editBuilder) => {
            editBuilder.replace(new vscode.Range(start, editedEnd), token);
        });
    }
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

    it('should navigate nested plain root object leaf to root state definition', async () => {
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
        const position = findPositionInAnchor(
            document,
            'const g5 = this.$store.state.preferences.theme;',
            'theme',
            1,
            2,
        );

        const result = await vscode.commands.executeCommand<DefinitionResult>(
            'vscode.executeDefinitionProvider',
            document.uri,
            position,
        );
        const definitions = normalizeDefinitionResults(result);

        assert.ok(
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'index.js'))),
            `Nested plain root object leaf should resolve to root store, got: ${definitions.map((item) => getDefinitionUri(item).fsPath).join(', ')}`
        );
    });

    it('should keep inherited namespace access clean and warn for invalid context members in real module files', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const accountFile = path.join(workspaceRoot, 'src/store/modules/account/index.js');
        const profileFile = path.join(workspaceRoot, 'src/store/modules/account/profile.js');

        await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await vscode.commands.executeCommand('vuexHelper.reindex');
        await sleep(1000);

        const accountDocument = await openDocumentForProviders(accountFile);
        const accountWarningPosition = findPositionInAnchor(
            accountDocument,
            'return context.state.missingAccountState; // <- 应触发诊断',
            'missingAccountState',
            1,
            2,
        );
        const accountDiagnostics = await waitForDiagnostics(accountDocument, (items) =>
            hasWarningAtPosition(items, accountWarningPosition, 'missingAccountState')
        );
        assert.ok(
            hasWarningAtPosition(accountDiagnostics, accountWarningPosition, 'missingAccountState'),
            'Expected warning for invalid context.state access in account module',
        );

        const profileDocument = await openDocumentForProviders(profileFile);
        const inheritedGetterPosition = findPositionInAnchor(
            profileDocument,
            'context.getters.readyLabel; // <- 光标放 readyLabel 上',
            'readyLabel',
            1,
            2,
        );
        const missingGetterPosition = findPositionInAnchor(
            profileDocument,
            'return context.getters.missingInheritedGetter; // <- 应触发诊断',
            'missingInheritedGetter',
            1,
            2,
        );
        const profileDiagnostics = await waitForDiagnostics(profileDocument, (items) =>
            !hasAnyDiagnosticAtPosition(items, inheritedGetterPosition) &&
            hasWarningAtPosition(items, missingGetterPosition, 'missingInheritedGetter')
        );
        assert.ok(
            !hasAnyDiagnosticAtPosition(profileDiagnostics, inheritedGetterPosition),
            'Inherited namespace getter access should stay clean in child module',
        );
        assert.ok(
            hasWarningAtPosition(profileDiagnostics, missingGetterPosition, 'missingInheritedGetter'),
            'Expected warning for invalid inherited namespace getter access',
        );
    });
});

describe('Host Completion', function () {
    this.timeout(40000);

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

        const rootStateItems = await withTemporaryTokenPrefix(
            document,
            'rootState.count; // <- 光标放点后',
            'count',
            0,
            async (editedDocument, position) => waitForCompletionItems(editedDocument, position, (items) => {
                const labels = items.map(getCompletionLabel);
                return labels.includes('count') && labels.includes('user') && labels.includes('others');
            }),
        );
        const rootStateLabels = rootStateItems.map(getCompletionLabel);
        assert.ok(rootStateLabels.includes('count'), 'Expected rootState completion to include count');
        assert.ok(rootStateLabels.includes('user'), 'Expected rootState completion to include user module');
        assert.ok(rootStateLabels.includes('others'), 'Expected rootState completion to include others module');

        const nestedRootStateItems = await withTemporaryTokenPrefix(
            document,
            'rootState.others.productName; // <- 光标放最后一个点后',
            'productName',
            0,
            async (editedDocument, position) => waitForCompletionItems(editedDocument, position, (items) => {
                const labels = items.map(getCompletionLabel);
                return labels.includes('productName') && labels.includes('theme');
            }),
        );
        const nestedRootStateLabels = nestedRootStateItems.map(getCompletionLabel);
        assert.ok(nestedRootStateLabels.includes('productName'), 'Expected nested rootState completion to include productName');
        assert.ok(nestedRootStateLabels.includes('theme'), 'Expected nested rootState completion to include theme');

        const rootGetterItems = await withTemporaryTokenPrefix(
            document,
            'rootGetters.isLoggedIn; // <- 光标放点后',
            'isLoggedIn',
            0,
            async (editedDocument, position) => waitForCompletionItems(editedDocument, position, (items) => {
                const labels = items.map(getCompletionLabel);
                return labels.includes('isLoggedIn') && labels.includes('user/upperName');
            }),
        );
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

    it('should support context members and object-style root actions in real namespaced module files', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const accountFile = path.join(workspaceRoot, 'src/store/modules/account/index.js');

        await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await vscode.commands.executeCommand('vuexHelper.reindex');
        await sleep(1000);

        const document = await openDocumentForProviders(accountFile);

        const rootTrueHandlerCommitItems = await withTemporaryTokenPrefix(
            document,
            'context.commit("SET_READY", true); // <- 光标放 SET_READY 上',
            'SET_READY',
            0,
            async (editedDocument, position) => waitForCompletionItems(editedDocument, position, (items) => {
                const labels = items.map(getCompletionLabel);
                return labels.includes('SET_READY') && labels.includes('SET_PUBLISH_COUNT');
            }),
        );
        const rootTrueHandlerCommitLabels = rootTrueHandlerCommitItems.map(getCompletionLabel);
        assert.ok(rootTrueHandlerCommitLabels.includes('SET_READY'), 'Expected root:true handler local commit completion to include SET_READY');
        assert.ok(rootTrueHandlerCommitLabels.includes('SET_PUBLISH_COUNT'), 'Expected root:true handler local commit completion to include SET_PUBLISH_COUNT');
        assert.ok(!rootTrueHandlerCommitLabels.includes('increment'), 'Root:true handler local commit completion should stay module-scoped without root option');

        const rootTrueHandlerCommitPosition = findPositionInAnchor(
            document,
            'context.commit("SET_READY", true); // <- 光标放 SET_READY 上',
            'SET_READY',
            1,
            2,
        );
        const rootTrueHandlerCommitDefinitions = await waitForDefinitions(document, rootTrueHandlerCommitPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js')))
        );
        assert.ok(
            rootTrueHandlerCommitDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js'))),
            'Expected root:true handler local commit definition to resolve to account/index.js',
        );

        const rootTrueHandlerCommitHovers = await waitForHovers(document, rootTrueHandlerCommitPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('SET_READY'))
        );
        assert.ok(rootTrueHandlerCommitHovers.some((hover) => hoverToString(hover).includes('SET_READY')), 'Expected root:true handler local commit hover to include SET_READY');

        const rootTrueHandlerStateItems = await withTemporaryTokenPrefix(
            document,
            'context.state.ready; // <- 光标放 ready 上',
            'ready',
            0,
            async (editedDocument, position) => waitForCompletionItems(editedDocument, position, (items) => {
                const labels = items.map(getCompletionLabel);
                return labels.includes('ready') && labels.includes('publishCount');
            }),
        );
        const rootTrueHandlerStateLabels = rootTrueHandlerStateItems.map(getCompletionLabel);
        assert.ok(rootTrueHandlerStateLabels.includes('ready'), 'Expected root:true handler context.state completion to include ready');
        assert.ok(rootTrueHandlerStateLabels.includes('publishCount'), 'Expected root:true handler context.state completion to include publishCount');

        const statePosition = findPositionInAnchor(
            document,
            'return context.state.ready; // <- 光标放 ready 上',
            'ready',
            1,
            2,
        );
        const stateDefinitions = await waitForDefinitions(document, statePosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js')))
        );
        assert.ok(
            stateDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js'))),
            'Expected root:true handler context.state definition to resolve to account/index.js',
        );

        const stateHovers = await waitForHovers(document, statePosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('ready'))
        );
        assert.ok(stateHovers.some((hover) => hoverToString(hover).includes('ready')), 'Expected root:true handler context.state hover to include ready');

        const getterItems = await withTemporaryTokenPrefix(
            document,
            'context.getters.readyLabel; // <- 光标放 readyLabel 上',
            'readyLabel',
            0,
            async (editedDocument, position) => waitForCompletionItems(editedDocument, position, (items) => {
                const labels = items.map(getCompletionLabel);
                return labels.includes('readyLabel') && labels.includes('publishSummary');
            }),
        );
        const getterLabels = getterItems.map(getCompletionLabel);
        assert.ok(getterLabels.includes('readyLabel'), 'Expected root:false handler context.getters completion to include readyLabel');
        assert.ok(getterLabels.includes('publishSummary'), 'Expected root:false handler context.getters completion to include publishSummary');

        const getterPosition = findPositionInAnchor(
            document,
            'context.getters.readyLabel; // <- 光标放 readyLabel 上',
            'readyLabel',
            1,
            2,
        );
        const getterDefinitions = await waitForDefinitions(document, getterPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js')))
        );
        assert.ok(
            getterDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js'))),
            'Expected root:false handler context.getters definition to resolve to account/index.js',
        );

        const getterHovers = await waitForHovers(document, getterPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('readyLabel'))
        );
        assert.ok(getterHovers.some((hover) => hoverToString(hover).includes('readyLabel')), 'Expected root:false handler context.getters hover to include readyLabel');

        const rootFalseHandlerCommitItems = await withTemporaryTokenPrefix(
            document,
            'commit("SET_READY", true); // <- 光标放 SET_READY 上',
            'SET_READY',
            0,
            async (editedDocument, position) => waitForCompletionItems(editedDocument, position, (items) => {
                const labels = items.map(getCompletionLabel);
                return labels.includes('SET_READY') && labels.includes('SET_PUBLISH_COUNT');
            }),
            2,
        );
        const rootFalseHandlerCommitLabels = rootFalseHandlerCommitItems.map(getCompletionLabel);
        assert.ok(rootFalseHandlerCommitLabels.includes('SET_READY'), 'Expected implicit root:false handler destructured commit completion to include SET_READY');
        assert.ok(rootFalseHandlerCommitLabels.includes('SET_PUBLISH_COUNT'), 'Expected implicit root:false handler destructured commit completion to include SET_PUBLISH_COUNT');
        assert.ok(!rootFalseHandlerCommitLabels.includes('increment'), 'Implicit root:false handler destructured commit completion should stay module-scoped');

        const rootFalseHandlerCommitPosition = findPositionInAnchor(
            document,
            'commit("SET_READY", true); // <- 光标放 SET_READY 上',
            'SET_READY',
            2,
            2,
        );
        const rootFalseHandlerCommitDefinitions = await waitForDefinitions(document, rootFalseHandlerCommitPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js')))
        );
        assert.ok(
            rootFalseHandlerCommitDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js'))),
            'Expected implicit root:false handler destructured commit definition to resolve to account/index.js',
        );

        const rootFalseHandlerCommitHovers = await waitForHovers(document, rootFalseHandlerCommitPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('SET_READY'))
        );
        assert.ok(rootFalseHandlerCommitHovers.some((hover) => hoverToString(hover).includes('SET_READY')), 'Expected implicit root:false handler destructured commit hover to include SET_READY');

        const rootActionPosition = findPositionInAnchor(
            document,
            'context.dispatch("publishProfile", null, { root: true }); // <- 光标放 publishProfile 上',
            'publishProfile',
            1,
            2,
        );
        const rootActionItems = await waitForCompletionItems(document, rootActionPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('publishProfile') && labels.includes('login');
        });
        const rootActionLabels = rootActionItems.map(getCompletionLabel);
        assert.ok(rootActionLabels.includes('publishProfile'), 'Expected root action completion to include publishProfile');
        assert.ok(rootActionLabels.includes('login'), 'Expected root action completion to include login');
        assert.ok(!rootActionLabels.includes('loadAccount'), 'Root action completion should not fall back to local namespaced actions');

        const rootActionDefinitions = await waitForDefinitions(document, rootActionPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js')))
        );
        assert.ok(
            rootActionDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js'))),
            'Expected object-style root action definition to resolve to account/index.js',
        );

        const rootActionHovers = await waitForHovers(document, rootActionPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('publishProfile'))
        );
        assert.ok(rootActionHovers.some((hover) => hoverToString(hover).includes('publishProfile')), 'Expected root action hover to include publishProfile');
    });

    it('should support inherited namespace getters mutations and actions in child module files', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Workspace is required');
        const workspaceRoot = workspaceFolders![0].uri.fsPath;
        const warmupFile = path.join(workspaceRoot, 'src/main.js');
        const profileFile = path.join(workspaceRoot, 'src/store/modules/account/profile.js');

        await openDocumentForProviders(warmupFile);
        await ensureExtensionActivated();
        await vscode.commands.executeCommand('vuexHelper.reindex');
        await sleep(1000);

        const document = await openDocumentForProviders(profileFile);

        const inheritedGetterItems = await withTemporaryTokenPrefix(
            document,
            'context.getters.readyLabel; // <- 光标放 readyLabel 上',
            'readyLabel',
            0,
            async (editedDocument, position) => waitForCompletionItems(editedDocument, position, (items) => {
                const labels = items.map(getCompletionLabel);
                return labels.includes('readyLabel') && labels.includes('profileName');
            }),
        );
        const inheritedGetterLabels = inheritedGetterItems.map(getCompletionLabel);
        assert.ok(inheritedGetterLabels.includes('readyLabel'), 'Expected inherited getter completion to include parent getter');
        assert.ok(inheritedGetterLabels.includes('profileName'), 'Expected inherited getter completion to include child getter');

        const inheritedGetterPosition = findPositionInAnchor(
            document,
            'context.getters.readyLabel; // <- 光标放 readyLabel 上',
            'readyLabel',
            1,
            2,
        );
        const inheritedGetterDefinitions = await waitForDefinitions(document, inheritedGetterPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js')))
        );
        assert.ok(
            inheritedGetterDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js'))),
            'Expected inherited getter definition to resolve to parent module',
        );

        const inheritedGetterHovers = await waitForHovers(document, inheritedGetterPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('readyLabel'))
        );
        assert.ok(inheritedGetterHovers.some((hover) => hoverToString(hover).includes('readyLabel')), 'Expected inherited getter hover to include readyLabel');

        const inheritedMutationPosition = findPositionInAnchor(
            document,
            'context.commit("SET_READY", true);',
            'SET_READY',
            1,
            2,
        );
        const inheritedMutationItems = await waitForCompletionItems(document, inheritedMutationPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('SET_READY') && labels.includes('SET_NICKNAME');
        });
        const inheritedMutationLabels = inheritedMutationItems.map(getCompletionLabel);
        assert.ok(inheritedMutationLabels.includes('SET_READY'), 'Expected inherited mutation completion to include parent mutation');
        assert.ok(inheritedMutationLabels.includes('SET_NICKNAME'), 'Expected inherited mutation completion to include child mutation');

        const inheritedMutationDefinitions = await waitForDefinitions(document, inheritedMutationPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js')))
        );
        assert.ok(
            inheritedMutationDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js'))),
            'Expected inherited mutation definition to resolve to parent module',
        );

        const inheritedActionPosition = findPositionInAnchor(
            document,
            'context.dispatch("loadAccount");',
            'loadAccount',
            1,
            2,
        );
        const inheritedActionItems = await waitForCompletionItems(document, inheritedActionPosition, (items) => {
            const labels = items.map(getCompletionLabel);
            return labels.includes('loadAccount') && labels.includes('renameProfile');
        });
        const inheritedActionLabels = inheritedActionItems.map(getCompletionLabel);
        assert.ok(inheritedActionLabels.includes('loadAccount'), 'Expected inherited action completion to include parent action');
        assert.ok(inheritedActionLabels.includes('renameProfile'), 'Expected inherited action completion to include child action');

        const inheritedActionDefinitions = await waitForDefinitions(document, inheritedActionPosition, (definitions) =>
            definitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js')))
        );
        assert.ok(
            inheritedActionDefinitions.some((item) => getDefinitionUri(item).fsPath.endsWith(path.join('src', 'store', 'modules', 'account', 'index.js'))),
            'Expected inherited action definition to resolve to parent module',
        );

        const inheritedActionHovers = await waitForHovers(document, inheritedActionPosition, (hovers) =>
            hovers.some((hover) => hoverToString(hover).includes('loadAccount'))
        );
        assert.ok(inheritedActionHovers.some((hover) => hoverToString(hover).includes('loadAccount')), 'Expected inherited action hover to include loadAccount');
    });
});
