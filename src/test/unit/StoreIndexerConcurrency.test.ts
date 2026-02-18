import * as assert from 'assert';

import { StoreIndexer } from '../../services/StoreIndexer';

describe('StoreIndexer Concurrency', () => {
    it('should coalesce concurrent indexing into at most one rerun', async () => {
        const indexer = new StoreIndexer('/tmp') as any;
        let analyzeCalls = 0;
        let parseCalls = 0;

        indexer.entryAnalyzer = {
            analyze: async () => {
                analyzeCalls++;
                await new Promise((resolve) => setTimeout(resolve, 15));
                return '/tmp/store.js';
            }
        };

        indexer.storeParser = {
            parse: async () => {
                parseCalls++;
                return { state: [], getters: [], mutations: [], actions: [] };
            }
        };

        await Promise.all([
            indexer.index(),
            indexer.index(),
            indexer.index()
        ]);

        assert.ok(analyzeCalls <= 2, `Expected at most one rerun, got ${analyzeCalls}`);
        assert.strictEqual(parseCalls, analyzeCalls, 'Parser call count should match analyzer call count');
    });

    it('should clear stale store map when no store entry is found', async () => {
        const indexer = new StoreIndexer('/tmp') as any;
        let shouldFindStore = true;

        indexer.entryAnalyzer = {
            analyze: async () => (shouldFindStore ? '/tmp/store.js' : null)
        };

        indexer.storeParser = {
            parse: async () => ({ state: [{ name: 'x', modulePath: [], defLocation: {} as any }], getters: [], mutations: [], actions: [] })
        };

        await indexer.index();
        assert.ok(indexer.getStoreMap(), 'First run should have store map');

        shouldFindStore = false;
        await indexer.index();
        assert.strictEqual(indexer.getStoreMap(), null, 'Store map should be cleared when store entry disappears');
    });

    it('should forward interactive option to entry analyzer', async () => {
        const indexer = new StoreIndexer('/tmp') as any;
        const interactiveCalls: boolean[] = [];

        indexer.entryAnalyzer = {
            analyze: async (options?: { interactive?: boolean }) => {
                interactiveCalls.push(options?.interactive === true);
                await new Promise((resolve) => setTimeout(resolve, 10));
                return '/tmp/store.js';
            }
        };

        indexer.storeParser = {
            parse: async () => ({ state: [], getters: [], mutations: [], actions: [] })
        };

        await indexer.index({ interactive: true });
        assert.strictEqual(interactiveCalls[0], true, 'Interactive flag should be passed through');
    });

    it('should clear all state after dispose', async () => {
        const indexer = new StoreIndexer('/tmp') as any;

        indexer.entryAnalyzer = {
            analyze: async () => '/tmp/store.js'
        };
        indexer.storeParser = {
            parse: async () => ({ state: [{ name: 'x', modulePath: [], defLocation: {} as any }], getters: [], mutations: [], actions: [] })
        };

        await indexer.index();
        assert.ok(indexer.getStoreMap(), 'Should have store map before dispose');

        indexer.dispose();
        assert.strictEqual(indexer.getStoreMap(), null, 'storeMap should be null after dispose');
        assert.strictEqual(indexer.lastStoreEntryPath, null, 'lastStoreEntryPath should be null after dispose');
        assert.strictEqual(indexer.indexingPromise, null, 'indexingPromise should be null after dispose');
    });

    it('should skip reindex for unrelated files after store is indexed', () => {
        const indexer = new StoreIndexer('/tmp') as any;
        indexer.storeMap = { state: [], getters: [], mutations: [], actions: [] };
        indexer.lastStoreEntryPath = '/tmp/src/store/index.js';
        indexer.storeParser = {
            hasIndexedFile: () => false
        };

        assert.strictEqual(indexer.shouldReindexForFile('/tmp/src/components/App.vue'), false);
        assert.strictEqual(indexer.shouldReindexForFile('/tmp/src/store/modules/user.js'), true);
        assert.strictEqual(indexer.shouldReindexForFile('/tmp/tsconfig.json'), true);
        assert.strictEqual(indexer.shouldReindexForFile('/tmp/src/main.js'), true);
    });
});
