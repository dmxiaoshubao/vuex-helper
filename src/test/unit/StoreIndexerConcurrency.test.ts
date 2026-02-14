import * as assert from 'assert';
import * as Module from 'module';

const originalRequire = Module.prototype.require;
(Module.prototype as any).require = function(id: string) {
    if (id === 'vscode') {
        return {
            Uri: { file: (fsPath: string) => ({ fsPath }) }
        };
    }
    return originalRequire.apply(this, arguments as any);
};

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
});
