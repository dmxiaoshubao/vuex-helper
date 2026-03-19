import * as assert from 'assert';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/duplicate-global-getter-project');

describe('StoreIndexer Duplicate Global Getter Conflicts', () => {
    it('should collect duplicate conflicts for root and non-namespaced module getters', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const conflicts = indexer.getDuplicateGlobalGetterConflicts();
        const sharedTotalConflict = conflicts.find((item) => item.name === 'sharedTotal');

        assert.ok(sharedTotalConflict, 'Should detect duplicate global getter conflict');
        assert.strictEqual(sharedTotalConflict?.items.length, 2, 'Should only include root and non-namespaced getter definitions');
        assert.ok(
            sharedTotalConflict?.items.some((item) => item.defLocation.uri.fsPath.endsWith('/src/store/index.js')),
            'Should include root getter definition',
        );
        assert.ok(
            sharedTotalConflict?.items.some((item) => item.defLocation.uri.fsPath.endsWith('/src/store/modules/legacy.js')),
            'Should include non-namespaced module getter definition',
        );
        assert.ok(
            !sharedTotalConflict?.items.some((item) => item.defLocation.uri.fsPath.endsWith('/src/store/modules/safe.js')),
            'Namespaced getter should not be part of global conflict set',
        );
    });
});
