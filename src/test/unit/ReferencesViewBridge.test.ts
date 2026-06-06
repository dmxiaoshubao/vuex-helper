import * as assert from 'assert';

describe('ReferencesViewBridge', () => {
    it('should pass locations to the built-in references side view when available', async () => {
        const vscode = require('vscode');
        const originalGetExtension = vscode.extensions.getExtension;
        let receivedInput: any;

        vscode.extensions.getExtension = (id: string) => {
            assert.strictEqual(id, 'vscode.references-view');
            return {
                activate: async () => ({
                    setInput: (input: any) => {
                        receivedInput = input;
                    }
                })
            };
        };

        try {
            const { openReferencesInSideView } = require('../../services/ReferencesViewBridge');
            const uri = vscode.Uri.file('/workspace/src/store/user.js');
            const references = [
                new vscode.Location(uri, new vscode.Range(10, 2, 10, 10))
            ];

            const opened = await openReferencesInSideView(uri, new vscode.Position(1, 0), references);

            assert.strictEqual(opened, true);
            assert.ok(receivedInput, 'Expected references-view input to be passed');
            assert.strictEqual(receivedInput.title, 'Vuex References');
            assert.strictEqual(receivedInput.contextValue, 'vscode.executeReferenceProvider');
        } finally {
            vscode.extensions.getExtension = originalGetExtension;
        }
    });

    it('should report fallback when the built-in references side view is unavailable', async () => {
        const vscode = require('vscode');
        const originalGetExtension = vscode.extensions.getExtension;
        vscode.extensions.getExtension = () => undefined;

        try {
            const { openReferencesInSideView } = require('../../services/ReferencesViewBridge');
            const uri = vscode.Uri.file('/workspace/src/store/user.js');
            const opened = await openReferencesInSideView(uri, new vscode.Position(1, 0), []);

            assert.strictEqual(opened, false);
        } finally {
            vscode.extensions.getExtension = originalGetExtension;
        }
    });
});
