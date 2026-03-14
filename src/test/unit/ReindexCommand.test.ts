import * as assert from 'assert';
import * as path from 'path';

describe('Reindex Command', () => {
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

    it('should register vuexHelper.reindex command during activation', async () => {
        // 捕获 registerCommand 调用
        const vscode = require('vscode');
        const registered: string[] = [];
        const originalRegister = vscode.commands.registerCommand;
        vscode.commands.registerCommand = (command: string, callback: any) => {
            registered.push(command);
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
        } finally {
            vscode.commands.registerCommand = originalRegister;
            vscode.workspace.workspaceFolders = originalFolders;
        }
    });
});
