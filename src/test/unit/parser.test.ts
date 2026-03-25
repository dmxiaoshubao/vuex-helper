import * as assert from 'assert';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';
import { StoreParser } from '../../services/StoreParser';

// Set workspace root to our fixture
const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/simple-project');

describe('Vuex Store Analysis', () => {
    
    it('should find the entry point and parse the store', async () => {
        console.log('Testing with workspace root:', fixtureRoot);
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();
        
        const storeMap = indexer.getStoreMap();
        assert.ok(storeMap, 'Store map should be generated');
        
        // Check root state
        const countState = storeMap?.state.find(s => s.name === 'count');
        assert.ok(countState, 'Should find "count" state in root');
        
        // Check root mutations
        const incrementMutation = storeMap?.mutations.find(m => m.name === 'increment');
        assert.ok(incrementMutation, 'Should find "increment" mutation');
        
        // Check root actions
        const incrementAsyncAction = indexer.getAction('incrementAsync');
        assert.ok(incrementAsyncAction, 'Should find "incrementAsync" action');
        
        // Check module state (user module)
        // Note: Our parser might not automatically flatten module state keys like 'user/name' unless we implemented that logic.
        // Let's check how we stored it. ModulePath should be ['user']
        const userState = storeMap?.state.find(s => s.modulePath.includes('user') && s.name === 'name');
        assert.ok(userState, 'Should find "name" state in user module');
        
        // Check module mutation (namespaced)
        const setNameMutation = indexer.getMutation('user/SET_NAME');
        assert.ok(setNameMutation, 'Should find "user/SET_NAME" mutation');
    });

    it('should ignore nested scope shadowing when indexing module assets', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const storeMap = indexer.getStoreMap();
        assert.ok(storeMap, 'Store map should be generated');

        const userStates = storeMap!.state
            .filter((item) => item.modulePath.join('/') === 'user')
            .map((item) => item.name)
            .sort();
        assert.deepStrictEqual(userStates, ['age', 'isActive', 'name', 'roles']);

        const userGetters = storeMap!.getters
            .filter((item) => item.modulePath.join('/') === 'user')
            .map((item) => item.name)
            .sort();
        assert.deepStrictEqual(userGetters, ['displayName', 'hasRole', 'isAdmin', 'nameWithCount', 'upperName', 'userAge']);

        const userMutations = storeMap!.mutations
            .filter((item) => item.modulePath.join('/') === 'user')
            .map((item) => item.name)
            .sort();
        assert.deepStrictEqual(userMutations, ['ADD_ROLE', 'SET_AGE', 'SET_NAME', 'SET_PROFILE', 'testName', 'toggleActive']);

        const userActions = storeMap!.actions
            .filter((item) => item.modulePath.join('/') === 'user')
            .map((item) => item.name)
            .sort();
        assert.deepStrictEqual(userActions, ['accessRootState', 'addItem', 'callRootAction', 'fetchProfile', 'inspectOptionalChain', 'inspectShadowedLocals', 'logout', 'updateInfoAsync', 'updateName']);

        assert.ok(!storeMap!.state.some((item) => item.name === 'tmp' && item.modulePath.join('/') === 'user'));
        assert.ok(!storeMap!.getters.some((item) => item.name === 'tempGetter' && item.modulePath.join('/') === 'user'));
        assert.ok(!storeMap!.mutations.some((item) => item.name === 'TEMP_MUTATION' && item.modulePath.join('/') === 'user'));
        assert.ok(!storeMap!.actions.some((item) => item.name === 'tempAction' && item.modulePath.join('/') === 'user'));
        assert.ok(indexer.getNamespace(path.join(fixtureRoot, 'src/store/modules/user.js'))?.join('/') === 'user');
    });

    it('should index exported-const computed getter keys from simple-project', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const displayNameGetter = indexer.getIndexedItem('getter', 'displayName', 'user');
        assert.ok(displayNameGetter, 'Should resolve getter key defined by exported const');
    });

});
