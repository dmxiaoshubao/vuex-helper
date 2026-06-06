import * as assert from 'assert';
import * as path from 'path';

describe('Extension Commands', () => {
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

    it('should register explicit commands without registering a language reference provider', async () => {
        // 捕获 registerCommand 调用
        const vscode = require('vscode');
        const registered: string[] = [];
        const originalRegister = vscode.commands.registerCommand;
        const originalRegisterReferenceProvider = vscode.languages.registerReferenceProvider;
        let referenceProviderRegistered = false;
        vscode.commands.registerCommand = (command: string, callback: any) => {
            registered.push(command);
            return { dispose: () => undefined };
        };
        vscode.languages.registerReferenceProvider = () => {
            referenceProviderRegistered = true;
            return { dispose: () => undefined };
        };

        const originalFolders = vscode.workspace.workspaceFolders;
        try {
            const { activate } = require('../../extension');
            // mock workspace 指向有 vuex 依赖的 fixture
            vscode.workspace.workspaceFolders = [
                { uri: { fsPath: path.join(fixturesDir, 'vue2-project') } }
            ];

            const subscriptions: any[] = [];
            await activate({ subscriptions: { push: (...items: any[]) => subscriptions.push(...items) } });

            assert.ok(
                registered.includes('vuexHelper.reindex'),
                `Expected vuexHelper.reindex to be registered, got: ${registered.join(', ')}`
            );
            assert.ok(
                registered.includes('vuexHelper.findReferences'),
                `Expected vuexHelper.findReferences to be registered, got: ${registered.join(', ')}`
            );
            assert.strictEqual(
                referenceProviderRegistered,
                false,
                'Vuex references should be exposed through the explicit command, not a language ReferenceProvider'
            );
        } finally {
            vscode.commands.registerCommand = originalRegister;
            vscode.languages.registerReferenceProvider = originalRegisterReferenceProvider;
            vscode.workspace.workspaceFolders = originalFolders;
        }
    });
});
