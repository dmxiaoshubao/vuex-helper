import * as assert from 'assert';
import * as path from 'path';

describe('Extension Configuration Change', () => {
    const vscode = require('vscode');
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');
    const fixtureRoot = path.join(fixturesDir, 'vue2-project');

    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    const originalOnDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration;
    const originalWithProgress = vscode.window.withProgress;
    const originalShowInformationMessage = vscode.window.showInformationMessage;
    const originalShowWarningMessage = vscode.window.showWarningMessage;

    afterEach(() => {
        vscode.workspace.workspaceFolders = originalWorkspaceFolders;
        vscode.workspace.onDidChangeConfiguration = originalOnDidChangeConfiguration;
        vscode.window.withProgress = originalWithProgress;
        vscode.window.showInformationMessage = originalShowInformationMessage;
        vscode.window.showWarningMessage = originalShowWarningMessage;
        delete require.cache[require.resolve('../../extension')];
    });

    it('should reindex interactively through progress notification on storeEntry changes', async () => {
        const { StoreIndexer } = require('../../services/StoreIndexer');
        const originalIndex = StoreIndexer.prototype.index;
        const originalShouldReindexForFile = StoreIndexer.prototype.shouldReindexForFile;
        const originalResetEntryInteractionState = StoreIndexer.prototype.resetEntryInteractionState;
        const originalConsumeInternalStoreEntryConfigChange = StoreIndexer.prototype.consumeInternalStoreEntryConfigChange;

        let configListener: ((event: { affectsConfiguration: (section: string) => boolean }) => void) | undefined;
        let withProgressCalls = 0;
        let resetCalls = 0;
        const indexCalls: Array<{ interactive?: boolean; forceFull?: boolean }> = [];
        const infoMessages: string[] = [];

        vscode.workspace.workspaceFolders = [{ uri: { fsPath: fixtureRoot } }];
        vscode.workspace.onDidChangeConfiguration = (listener: any) => {
            configListener = listener;
            return { dispose: () => undefined };
        };
        vscode.window.withProgress = async (_options: any, task: any) => {
            withProgressCalls++;
            return task({ report: () => undefined }, { isCancellationRequested: false });
        };
        vscode.window.showInformationMessage = async (message: string) => {
            infoMessages.push(message);
            return undefined;
        };
        vscode.window.showWarningMessage = async () => undefined;

        StoreIndexer.prototype.index = async function (options?: { interactive?: boolean; forceFull?: boolean }) {
            indexCalls.push(options || {});
            (this as any).lastStoreEntryPath = path.join(fixtureRoot, 'src', 'store', 'index.js');
        };
        StoreIndexer.prototype.shouldReindexForFile = () => false;
        StoreIndexer.prototype.resetEntryInteractionState = function () {
            resetCalls++;
        };
        StoreIndexer.prototype.consumeInternalStoreEntryConfigChange = () => false;

        try {
            const { activate } = require('../../extension');
            const subscriptions: any[] = [];
            await activate({ subscriptions: { push: (...items: any[]) => subscriptions.push(...items) } });

            assert.ok(configListener, 'Expected configuration listener to be registered');
            const callCountBeforeConfigChange = indexCalls.length;

            configListener!({
                affectsConfiguration: (section: string) => section === 'vuexHelper.storeEntry'
            });
            await new Promise((resolve) => setImmediate(resolve));

            assert.strictEqual(withProgressCalls, 1, 'Configuration change should be wrapped by progress UI');
            assert.strictEqual(resetCalls, 1, 'Configuration change should reset entry interaction state');
            assert.deepStrictEqual(
                indexCalls.slice(callCountBeforeConfigChange),
                [{ interactive: true, forceFull: true }],
                'Configuration change should trigger interactive full reindex'
            );
            assert.ok(
                infoMessages.includes('Vuex Helper: Store configuration updated.'),
                'Expected final success message after config-driven reindex'
            );
            assert.ok(
                !infoMessages.includes('Vuex Helper: Store configuration updated. Re-indexing...'),
                'Legacy hanging reindex message should not be shown'
            );
        } finally {
            StoreIndexer.prototype.index = originalIndex;
            StoreIndexer.prototype.shouldReindexForFile = originalShouldReindexForFile;
            StoreIndexer.prototype.resetEntryInteractionState = originalResetEntryInteractionState;
            StoreIndexer.prototype.consumeInternalStoreEntryConfigChange = originalConsumeInternalStoreEntryConfigChange;
        }
    });

    it('should warn when config change reindex still cannot find store entry', async () => {
        const { StoreIndexer } = require('../../services/StoreIndexer');
        const originalIndex = StoreIndexer.prototype.index;
        const originalShouldReindexForFile = StoreIndexer.prototype.shouldReindexForFile;
        const originalResetEntryInteractionState = StoreIndexer.prototype.resetEntryInteractionState;
        const originalConsumeInternalStoreEntryConfigChange = StoreIndexer.prototype.consumeInternalStoreEntryConfigChange;

        let configListener: ((event: { affectsConfiguration: (section: string) => boolean }) => void) | undefined;
        const warningMessages: string[] = [];

        vscode.workspace.workspaceFolders = [{ uri: { fsPath: fixtureRoot } }];
        vscode.workspace.onDidChangeConfiguration = (listener: any) => {
            configListener = listener;
            return { dispose: () => undefined };
        };
        vscode.window.withProgress = async (_options: any, task: any) =>
            task({ report: () => undefined }, { isCancellationRequested: false });
        vscode.window.showInformationMessage = async () => undefined;
        vscode.window.showWarningMessage = async (message: string) => {
            warningMessages.push(message);
            return undefined;
        };

        StoreIndexer.prototype.index = async function () {
            (this as any).lastStoreEntryPath = null;
        };
        StoreIndexer.prototype.shouldReindexForFile = () => false;
        StoreIndexer.prototype.resetEntryInteractionState = function () {
            return undefined;
        };
        StoreIndexer.prototype.consumeInternalStoreEntryConfigChange = () => false;

        try {
            const { activate } = require('../../extension');
            await activate({ subscriptions: { push: () => undefined } });

            assert.ok(configListener, 'Expected configuration listener to be registered');
            configListener!({
                affectsConfiguration: (section: string) => section === 'vuexHelper.storeEntry'
            });
            await new Promise((resolve) => setImmediate(resolve));

            assert.ok(
                warningMessages.includes('Vuex Helper: No Vuex store entry is currently configured or auto-detected.'),
                'Expected warning when config removal still leaves no store entry'
            );
        } finally {
            StoreIndexer.prototype.index = originalIndex;
            StoreIndexer.prototype.shouldReindexForFile = originalShouldReindexForFile;
            StoreIndexer.prototype.resetEntryInteractionState = originalResetEntryInteractionState;
            StoreIndexer.prototype.consumeInternalStoreEntryConfigChange = originalConsumeInternalStoreEntryConfigChange;
        }
    });

    it('should ignore config change events triggered by internal storeEntry updates', async () => {
        const { StoreIndexer } = require('../../services/StoreIndexer');
        const originalIndex = StoreIndexer.prototype.index;
        const originalShouldReindexForFile = StoreIndexer.prototype.shouldReindexForFile;
        const originalResetEntryInteractionState = StoreIndexer.prototype.resetEntryInteractionState;
        const originalConsumeInternalStoreEntryConfigChange = StoreIndexer.prototype.consumeInternalStoreEntryConfigChange;

        let configListener: ((event: { affectsConfiguration: (section: string) => boolean }) => void) | undefined;
        let withProgressCalls = 0;

        vscode.workspace.workspaceFolders = [{ uri: { fsPath: fixtureRoot } }];
        vscode.workspace.onDidChangeConfiguration = (listener: any) => {
            configListener = listener;
            return { dispose: () => undefined };
        };
        vscode.window.withProgress = async (_options: any, task: any) => {
            withProgressCalls++;
            return task({ report: () => undefined }, { isCancellationRequested: false });
        };
        vscode.window.showInformationMessage = async () => undefined;
        vscode.window.showWarningMessage = async () => undefined;

        StoreIndexer.prototype.index = async function () {
            (this as any).lastStoreEntryPath = path.join(fixtureRoot, 'src', 'store', 'index.js');
        };
        StoreIndexer.prototype.shouldReindexForFile = () => false;
        StoreIndexer.prototype.resetEntryInteractionState = function () {
            return undefined;
        };
        StoreIndexer.prototype.consumeInternalStoreEntryConfigChange = () => true;

        try {
            const { activate } = require('../../extension');
            await activate({ subscriptions: { push: () => undefined } });

            assert.ok(configListener, 'Expected configuration listener to be registered');
            configListener!({
                affectsConfiguration: (section: string) => section === 'vuexHelper.storeEntry'
            });
            await new Promise((resolve) => setImmediate(resolve));

            assert.strictEqual(withProgressCalls, 0, 'Internal config update should not show config refresh progress');
        } finally {
            StoreIndexer.prototype.index = originalIndex;
            StoreIndexer.prototype.shouldReindexForFile = originalShouldReindexForFile;
            StoreIndexer.prototype.resetEntryInteractionState = originalResetEntryInteractionState;
            StoreIndexer.prototype.consumeInternalStoreEntryConfigChange = originalConsumeInternalStoreEntryConfigChange;
        }
    });

    it('should coalesce rapid external config changes into a single visible progress flow', async () => {
        const { StoreIndexer } = require('../../services/StoreIndexer');
        const originalIndex = StoreIndexer.prototype.index;
        const originalShouldReindexForFile = StoreIndexer.prototype.shouldReindexForFile;
        const originalResetEntryInteractionState = StoreIndexer.prototype.resetEntryInteractionState;
        const originalConsumeInternalStoreEntryConfigChange = StoreIndexer.prototype.consumeInternalStoreEntryConfigChange;

        let configListener: ((event: { affectsConfiguration: (section: string) => boolean }) => void) | undefined;
        let withProgressCalls = 0;
        let releaseIndex: (() => void) | undefined;
        let indexCalls = 0;

        vscode.workspace.workspaceFolders = [{ uri: { fsPath: fixtureRoot } }];
        vscode.workspace.onDidChangeConfiguration = (listener: any) => {
            configListener = listener;
            return { dispose: () => undefined };
        };
        vscode.window.withProgress = async (_options: any, task: any) => {
            withProgressCalls++;
            return task({ report: () => undefined }, { isCancellationRequested: false });
        };
        vscode.window.showInformationMessage = async () => undefined;
        vscode.window.showWarningMessage = async () => undefined;

        StoreIndexer.prototype.index = async function () {
            indexCalls++;
            (this as any).lastStoreEntryPath = path.join(fixtureRoot, 'src', 'store', 'index.js');
            if (indexCalls === 1) {
                return;
            }
            await new Promise<void>((resolve) => {
                releaseIndex = resolve;
            });
        };
        StoreIndexer.prototype.shouldReindexForFile = () => false;
        StoreIndexer.prototype.resetEntryInteractionState = function () {
            return undefined;
        };
        StoreIndexer.prototype.consumeInternalStoreEntryConfigChange = () => false;

        try {
            const { activate } = require('../../extension');
            await activate({ subscriptions: { push: () => undefined } });

            assert.ok(configListener, 'Expected configuration listener to be registered');
            const indexCallsBeforeConfigChange = indexCalls;
            configListener!({
                affectsConfiguration: (section: string) => section === 'vuexHelper.storeEntry'
            });
            configListener!({
                affectsConfiguration: (section: string) => section === 'vuexHelper.storeEntry'
            });
            await new Promise((resolve) => setImmediate(resolve));

            assert.strictEqual(withProgressCalls, 1, 'Rapid config changes should share one visible progress notification while in flight');
            assert.strictEqual(indexCalls - indexCallsBeforeConfigChange, 1, 'Only one reindex should start before the first run finishes');

            releaseIndex?.();
            await new Promise((resolve) => setImmediate(resolve));
            await new Promise((resolve) => setImmediate(resolve));

            assert.strictEqual(withProgressCalls, 2, 'A queued config refresh may rerun once after the first finishes');
            assert.strictEqual(indexCalls - indexCallsBeforeConfigChange, 2, 'Queued config refresh should rerun once after completion');
        } finally {
            StoreIndexer.prototype.index = originalIndex;
            StoreIndexer.prototype.shouldReindexForFile = originalShouldReindexForFile;
            StoreIndexer.prototype.resetEntryInteractionState = originalResetEntryInteractionState;
            StoreIndexer.prototype.consumeInternalStoreEntryConfigChange = originalConsumeInternalStoreEntryConfigChange;
        }
    });
});
