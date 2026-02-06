import * as assert from 'assert';
import * as path from 'path';
import * as Module from 'module';

// --- Hack to mock 'vscode' module ---
const originalRequire = Module.prototype.require;
const vscodeMock = require('./vscode-mock');

(Module.prototype as any).require = function(id: string) {
    if (id === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments as any);
};
// ------------------------------------

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

});
