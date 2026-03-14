import * as assert from 'assert';
import * as path from 'path';

import { hasConfiguredStoreEntry, hasVuexDependency, shouldActivateWorkspace } from '../../extension';
const vscode = require('vscode');

describe('hasVuexDependency', () => {
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

    it('should return true for project with vuex dependency', async () => {
        const result = await hasVuexDependency(path.join(fixturesDir, 'vue2-project'));
        assert.strictEqual(result, true);
    });

    it('should return false for project without vuex dependency', async () => {
        const result = await hasVuexDependency(path.join(fixturesDir, 'non-vue-project'));
        assert.strictEqual(result, false);
    });

    it('should return false when package.json does not exist', async () => {
        const result = await hasVuexDependency(path.join(fixturesDir, 'nonexistent-dir'));
        assert.strictEqual(result, false);
    });

    it('should return true for simple-project with package.json', async () => {
        const result = await hasVuexDependency(path.join(fixturesDir, 'simple-project'));
        // simple-project 有 package.json 且包含 vuex 依赖
        assert.strictEqual(result, true);
    });
});

describe('activation compatibility', () => {
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

    it('should detect configured store entry from workspace settings', () => {
        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = (_section?: string, _scope?: any) => ({
            get: (key: string, defaultValue?: any) => key === 'storeEntry' ? 'src/store/index.js' : defaultValue,
            update: async () => undefined
        });

        try {
            const result = hasConfiguredStoreEntry(path.join(fixturesDir, 'nonexistent-dir'));
            assert.strictEqual(result, true);
        } finally {
            vscode.workspace.getConfiguration = originalGetConfiguration;
        }
    });

    it('should still activate when package.json is missing but storeEntry is configured', async () => {
        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = (_section?: string, _scope?: any) => ({
            get: (key: string, defaultValue?: any) => key === 'storeEntry' ? 'src/store/index.js' : defaultValue,
            update: async () => undefined
        });

        try {
            const result = await shouldActivateWorkspace(path.join(fixturesDir, 'nonexistent-dir'));
            assert.strictEqual(result, true);
        } finally {
            vscode.workspace.getConfiguration = originalGetConfiguration;
        }
    });

    it('should not activate when package.json is missing and storeEntry is not configured', async () => {
        const result = await shouldActivateWorkspace(path.join(fixturesDir, 'nonexistent-dir'));
        assert.strictEqual(result, false);
    });
});
