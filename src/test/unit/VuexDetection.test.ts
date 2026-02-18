import * as assert from 'assert';
import * as path from 'path';

import { hasVuexDependency } from '../../extension';

describe('hasVuexDependency', () => {
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

    it('should return true for project with vuex dependency', async () => {
        const result = await hasVuexDependency(path.join(fixturesDir, 'vue2-project'));
        assert.strictEqual(result, true);
    });

    it('should return false for project without vuex dependency', async () => {
        const result = await hasVuexDependency(path.join(fixturesDir, 'non-vue-project'));
        assert.strictEqual(result, false);
    });

    it('should return true when package.json does not exist (conservative)', async () => {
        const result = await hasVuexDependency(path.join(fixturesDir, 'nonexistent-dir'));
        assert.strictEqual(result, true);
    });

    it('should return true for simple-project with vuex', async () => {
        const result = await hasVuexDependency(path.join(fixturesDir, 'simple-project'));
        // simple-project 没有 package.json，应返回 true（保守策略）
        assert.strictEqual(result, true);
    });
});
