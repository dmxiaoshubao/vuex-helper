import * as assert from 'assert';
import * as path from 'path';

import { StoreParser } from '../../services/StoreParser';

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/simple-project');
const storeEntry = path.join(fixtureRoot, 'src/store/index.js');
const userModule = path.join(fixtureRoot, 'src/store/modules/user.js');
const othersModule = path.join(fixtureRoot, 'src/store/modules/others.js');

describe('StoreParser Incremental', () => {
    it('should compute affected files from reverse dependency graph', async () => {
        const parser = new StoreParser(fixtureRoot);
        await parser.parse(storeEntry);

        const affected = parser.getAffectedFiles([userModule]);
        assert.ok(affected.includes(userModule), 'Changed module should be affected');
        assert.ok(
            affected.includes(storeEntry),
            'Store entry that depends on changed module should be affected',
        );
    });

    it('should keep unaffected module data when running incremental parse', async () => {
        const parser = new StoreParser(fixtureRoot);
        const full = await parser.parse(storeEntry);
        const fullOthersGetter = full.getters.find((item) => item.name === 'isDarkMode' && item.modulePath.join('/') === 'others');
        assert.ok(fullOthersGetter, 'Full parse should include others/isDarkMode getter');

        const incremental = await parser.parse(storeEntry, { changedFiles: [userModule] });
        const incrementalOthersGetter = incremental.getters.find((item) => item.name === 'isDarkMode' && item.modulePath.join('/') === 'others');
        assert.ok(incrementalOthersGetter, 'Incremental parse should retain unaffected module getter');
        assert.ok(parser.hasIndexedFile(othersModule), 'Unchanged module should remain indexed');
    });
});
