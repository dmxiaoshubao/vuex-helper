import * as assert from 'assert';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/spread-modules-project');

describe('Vuex Modules Spread Analysis', () => {
    it('should parse modules from spread object maps', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const userMutation = indexer.getMutation('user/SET_NAME');
        const userAction = indexer.getAction('user/fetchProfile');
        const sharedGetter = indexer.getStoreMap()?.getters.find((item) => item.name === 'ping' && item.modulePath.join('/') === 'shared');
        const inlineMutation = indexer.getMutation('inline/SET_VALUE');

        assert.ok(userMutation, 'Should resolve module from spread local map');
        assert.ok(userAction, 'Should resolve action from spread local map');
        assert.ok(sharedGetter, 'Should resolve getter from spread shared module map');
        assert.ok(inlineMutation, 'Should resolve inline module in same modules object');
    });
});
