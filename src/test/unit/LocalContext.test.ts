import * as assert from 'assert';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';

// Set workspace root to our fixture
const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/simple-project');

describe('Local Context Analysis', () => {
    
    it('should correctly map file paths to namespaces', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();
        
        // Construct expected path
        // user.js is in src/store/modules/user.js
        const userModulePath = path.join(fixtureRoot, 'src/store/modules/user.js');
        const rootStorePath = path.join(fixtureRoot, 'src/store/index.js');
        
        // Check user module namespace
        const userNs = indexer.getNamespace(userModulePath);
        assert.ok(userNs, 'Should have namespace for user module');
        assert.deepStrictEqual(userNs, ['user'], 'Namespace should be ["user"]');
        
        // Check root store namespace
        const rootNs = indexer.getNamespace(rootStorePath);
        assert.ok(rootNs, 'Should have namespace for root store');
        assert.deepStrictEqual(rootNs, [], 'Namespace should be empty array for root');
    });

    it('should allow matching local state in Completion Logic (simulation)', async () => {
         // Simulation: testing the core data used by the provider
         const indexer = new StoreIndexer(fixtureRoot);
         await indexer.index();
         const storeMap = indexer.getStoreMap();

         const userModulePath = path.join(fixtureRoot, 'src/store/modules/user.js');
         const currentNs = indexer.getNamespace(userModulePath); // ['user']
         
         // Should find state 'name' in 'user' module
         const stateItems = storeMap?.state.filter(s => s.modulePath.join('/') === currentNs?.join('/'));
         const hasName = stateItems?.some(s => s.name === 'name');
         assert.ok(hasName, 'Should find local state "name" via namespace filter');
         
         // Should NOT find 'count' (root state) in local filter logic
         const hasCount = stateItems?.some(s => s.name === 'count');
         assert.strictEqual(hasCount, false, 'Should not find root state in local filter');
    });

    it('should allow filtering mutations for scoped Commit (simulation)', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();
        const storeMap = indexer.getStoreMap();

        const userModulePath = path.join(fixtureRoot, 'src/store/modules/user.js');
        const currentNs = indexer.getNamespace(userModulePath); // ['user']

        // Filter mutations for current module
        const localMutations = storeMap?.mutations.filter(m => m.modulePath.join('/') === currentNs?.join('/'));
        
        // Should find SET_NAME
        const hasSetName = localMutations?.some(m => m.name === 'SET_NAME');
        assert.ok(hasSetName, 'Should find local mutation SET_NAME');
        
        // Should NOT find root 'increment'
        const hasIncrement = localMutations?.some(m => m.name === 'increment');
        assert.strictEqual(hasIncrement, false, 'Should not find root mutation in local filter');
    });

});
