import * as assert from 'assert';
import * as path from 'path';
import * as Module from 'module';

const originalRequire = Module.prototype.require;
const vscodeMock = require('./vscode-mock');

(Module.prototype as any).require = function(id: string) {
    if (id === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments as any);
};

import { StoreIndexer } from '../../services/StoreIndexer';

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/edge-project');

describe('Vuex Store Analysis Edge Cases', () => {
    it('should parse export-default identifier store declaration', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const mutation = indexer.getMutation('SET_ROOT');
        assert.ok(mutation, 'Should resolve root mutation from export default store variable');
    });

    it('should parse string and computed keys in namespaced module', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const setName = indexer.getMutation('userModule/SET_NAME');
        const resetProfile = indexer.getMutation('userModule/RESET_PROFILE');
        const fetchProfile = indexer.getAction('userModule/fetchProfile');

        assert.ok(setName, 'Should resolve computed mutation key [SET_NAME]');
        assert.ok(resetProfile, 'Should resolve string mutation key RESET_PROFILE');
        assert.ok(fetchProfile, 'Should resolve computed action key fetchProfile');
    });

    it('should treat non-namespaced module actions/mutations as global while keeping state path', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const toggle = indexer.getMutation('TOGGLE');
        const namespacedToggle = indexer.getMutation('publicModule/TOGGLE');
        const state = indexer.getStoreMap()?.state.find((item) => item.name === 'enabled');

        assert.ok(toggle, 'Should resolve non-namespaced mutation by global key');
        assert.strictEqual(namespacedToggle, undefined, 'Non-namespaced mutation should not require module prefix');
        assert.ok(state, 'Should parse module state');
        assert.deepStrictEqual(state?.modulePath, ['publicModule'], 'State path should keep structural module path');
    });
});
