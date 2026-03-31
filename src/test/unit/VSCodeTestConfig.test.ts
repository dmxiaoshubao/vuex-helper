import * as assert from 'assert';

import { DEFAULT_VSCODE_TEST_VERSION, resolveVSCodeTestVersion } from '../vscodeTestConfig';

describe('VSCode Test Config', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('should fallback to pinned default version when no override exists', () => {
        delete process.env.VSCODE_TEST_VERSION;
        delete process.env.HOST_TEST_VSCODE_VERSION;

        assert.strictEqual(resolveVSCodeTestVersion('HOST_TEST_VSCODE_VERSION', 'VSCODE_TEST_VERSION'), DEFAULT_VSCODE_TEST_VERSION);
    });

    it('should prefer the first non-empty override key', () => {
        process.env.HOST_TEST_VSCODE_VERSION = '1.112.0';
        process.env.VSCODE_TEST_VERSION = '1.111.0';

        assert.strictEqual(resolveVSCodeTestVersion('HOST_TEST_VSCODE_VERSION', 'VSCODE_TEST_VERSION'), '1.112.0');
    });

    it('should ignore blank overrides', () => {
        process.env.HOST_TEST_VSCODE_VERSION = '   ';
        process.env.VSCODE_TEST_VERSION = '1.110.0';

        assert.strictEqual(resolveVSCodeTestVersion('HOST_TEST_VSCODE_VERSION', 'VSCODE_TEST_VERSION'), '1.110.0');
    });
});
