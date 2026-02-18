import * as assert from 'assert';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/entry-variants-project');

describe('Vuex Entry Variants Analysis', () => {
    it('should resolve store path from factory options function and require default', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const mutation = indexer.getMutation('SET_READY');
        const action = indexer.getAction('boot');
        const state = indexer.getStoreMap()?.state.find((item) => item.name === 'ready');

        assert.ok(mutation, 'Should resolve root mutation from CommonJS store export');
        assert.ok(action, 'Should resolve root action from CommonJS store export');
        assert.ok(state, 'Should parse root state from factory-created store');
    });
});
