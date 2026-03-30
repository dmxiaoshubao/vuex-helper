import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { EntryAnalyzer } from '../../services/EntryAnalyzer';

describe('EntryAnalyzer', () => {
    const vscode = require('vscode');
    const originalGetConfiguration = vscode.workspace.getConfiguration;
    const originalShowInformationMessage = vscode.window.showInformationMessage;
    const originalShowOpenDialog = vscode.window.showOpenDialog;
    const originalShowWarningMessage = vscode.window.showWarningMessage;
    const originalShowErrorMessage = vscode.window.showErrorMessage;

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
        vscode.window.showInformationMessage = originalShowInformationMessage;
        vscode.window.showOpenDialog = originalShowOpenDialog;
        vscode.window.showWarningMessage = originalShowWarningMessage;
        vscode.window.showErrorMessage = originalShowErrorMessage;
    });

    it('should save alias path when selected store file matches workspace alias', async () => {
        const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-entry-alias-')));
        const storeFile = path.join(tmpDir, 'src', 'store', 'index.js');
        fs.mkdirSync(path.dirname(storeFile), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                baseUrl: '.',
                paths: {
                    '@/*': ['src/*']
                }
            }
        }));
        fs.writeFileSync(storeFile, 'export default {};');

        let updatedValue: string | undefined;
        vscode.workspace.getConfiguration = () => ({
            get: () => '',
            update: async (_key: string, value: string) => {
                updatedValue = value;
            }
        });
        vscode.window.showInformationMessage = async (_message: string, ...items: string[]) =>
            items.includes('Select Store File') ? 'Select Store File' : undefined;
        vscode.window.showOpenDialog = async () => [vscode.Uri.file(storeFile)];
        vscode.window.showWarningMessage = async () => undefined;
        vscode.window.showErrorMessage = async () => undefined;

        try {
            const analyzer = new EntryAnalyzer(tmpDir);
            const result = await analyzer.analyze({ interactive: true });

            assert.strictEqual(result, storeFile);
            assert.strictEqual(updatedValue, '@/store/index.js');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('should fallback to workspace relative path when no alias matches selected file', async () => {
        const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-entry-relative-')));
        const storeFile = path.join(tmpDir, 'custom', 'store.js');
        fs.mkdirSync(path.dirname(storeFile), { recursive: true });
        fs.writeFileSync(storeFile, 'export default {};');

        let updatedValue: string | undefined;
        vscode.workspace.getConfiguration = () => ({
            get: () => '',
            update: async (_key: string, value: string) => {
                updatedValue = value;
            }
        });
        vscode.window.showInformationMessage = async (_message: string, ...items: string[]) =>
            items.includes('Select Store File') ? 'Select Store File' : undefined;
        vscode.window.showOpenDialog = async () => [vscode.Uri.file(storeFile)];
        vscode.window.showWarningMessage = async () => undefined;
        vscode.window.showErrorMessage = async () => undefined;

        try {
            const analyzer = new EntryAnalyzer(tmpDir);
            const result = await analyzer.analyze({ interactive: true });
            assert.strictEqual(result, storeFile);
            assert.strictEqual(updatedValue, 'custom/store.js');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('should allow prompting again after interaction state reset', async () => {
        const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-entry-reset-')));
        let promptCount = 0;

        vscode.workspace.getConfiguration = () => ({
            get: () => '',
            update: async () => undefined
        });
        vscode.window.showInformationMessage = async (_message: string, ...items: string[]) => {
            if (items.includes('Select Store File')) {
                promptCount++;
            }
            return undefined;
        };
        vscode.window.showOpenDialog = async () => undefined;
        vscode.window.showWarningMessage = async () => undefined;
        vscode.window.showErrorMessage = async () => undefined;

        try {
            const analyzer = new EntryAnalyzer(tmpDir);
            await analyzer.analyze({ interactive: true });
            await analyzer.analyze({ interactive: true });
            assert.strictEqual(promptCount, 1, 'Prompt should only appear once before reset');

            analyzer.resetInteractionState();
            await analyzer.analyze({ interactive: true });
            assert.strictEqual(promptCount, 2, 'Prompt should appear again after reset');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
