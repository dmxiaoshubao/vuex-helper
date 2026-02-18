import * as assert from 'assert';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/dynamic-project');

describe('Vuex Dynamic registerModule Analysis', () => {
    it('should parse registerModule with imported module and array namespace', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const userAction = indexer.getAction('dynamicUser/fetchProfile');
        const nestedMutation = indexer.getMutation('nested/stats/SET_LOADED');
        const nestedState = indexer.getStoreMap()?.state.find((item) => item.name === 'loaded');

        assert.ok(userAction, 'Should resolve namespaced action from imported dynamic module');
        assert.ok(nestedMutation, 'Should resolve mutation from array-path dynamic module');
        assert.ok(nestedState, 'Should parse dynamic module state');
        assert.deepStrictEqual(nestedState?.modulePath, ['nested', 'stats']);
    });

    it('should keep non-namespaced dynamic module mutations as global keys', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const globalMutation = indexer.getMutation('TOGGLE_LEGACY');
        const namespacedMutation = indexer.getMutation('legacy/TOGGLE_LEGACY');

        assert.ok(globalMutation, 'Should resolve non-namespaced dynamic mutation by global key');
        assert.strictEqual(namespacedMutation, undefined, 'Non-namespaced dynamic mutation should not require namespace');
    });
});
