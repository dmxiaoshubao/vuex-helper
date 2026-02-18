import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { StoreIndexer } from '../../services/StoreIndexer';
import { StoreParser } from '../../services/StoreParser';

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/edge-project');

describe('Vuex Store Analysis Edge Cases', () => {
    it('should parse export-default identifier store declaration', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const mutation = indexer.getMutation('SET_ROOT');
        assert.ok(mutation, 'Should resolve root mutation from export default store variable');
    });

    it('should parse string and computed keys in namespaced module', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const setName = indexer.getMutation('userModule/SET_NAME');
        const resetProfile = indexer.getMutation('userModule/RESET_PROFILE');
        const fetchProfile = indexer.getAction('userModule/fetchProfile');

        assert.ok(setName, 'Should resolve computed mutation key [SET_NAME]');
        assert.ok(resetProfile, 'Should resolve string mutation key RESET_PROFILE');
        assert.ok(fetchProfile, 'Should resolve computed action key fetchProfile');
    });

    it('should treat non-namespaced module actions/mutations as global while keeping state path', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const toggle = indexer.getMutation('TOGGLE');
        const namespacedToggle = indexer.getMutation('publicModule/TOGGLE');
        const state = indexer.getStoreMap()?.state.find((item) => item.name === 'enabled');

        assert.ok(toggle, 'Should resolve non-namespaced mutation by global key');
        assert.strictEqual(namespacedToggle, undefined, 'Non-namespaced mutation should not require module prefix');
        assert.ok(state, 'Should parse module state');
        assert.deepStrictEqual(state?.modulePath, ['publicModule'], 'State path should keep structural module path');
    });

    it('should index nested state paths for deep property lookup', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const nestedStates = indexer
            .getStoreMap()
            ?.state.filter((item) =>
                item.modulePath.length >= 2 &&
                item.modulePath[0] === 'userModule'
            ) || [];

        assert.ok(nestedStates.length > 0, 'Should parse nested state path under userModule when nested keys exist');
    });
});

describe('StoreParser Large File Skip', () => {
    it('should skip files exceeding 5MB size limit', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-parser-'));
        const realTmpDir = fs.realpathSync(tmpDir);
        const largePath = path.join(realTmpDir, 'large-store.js');

        // 创建一个超过 5MB 的文件
        const header = 'export default { state: { count: 0 }, mutations: { increment(state) { state.count++ } } }';
        const padding = '\n' + '// padding\n'.repeat(600000); // ~6.6MB
        fs.writeFileSync(largePath, header + padding);

        const stat = fs.statSync(largePath);
        assert.ok(stat.size > 5 * 1024 * 1024, 'Test file should exceed 5MB');

        const parser = new StoreParser(realTmpDir);
        const result = await parser.parse(largePath);

        // 超大文件被跳过，不应解析出任何内容
        assert.strictEqual(result.state.length, 0, 'Should not parse state from oversized file');
        assert.strictEqual(result.mutations.length, 0, 'Should not parse mutations from oversized file');

        // 清理
        fs.unlinkSync(largePath);
        fs.rmdirSync(realTmpDir);
    });

    it('should parse files within 5MB size limit normally', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-parser-'));
        const realTmpDir = fs.realpathSync(tmpDir);
        const normalPath = path.join(realTmpDir, 'normal-store.js');

        fs.writeFileSync(normalPath, 'export default { state: { count: 0 }, mutations: { increment(state) { state.count++ } } }');

        const parser = new StoreParser(realTmpDir);
        const result = await parser.parse(normalPath);

        assert.ok(result.state.length > 0, 'Should parse state from normal-sized file');
        assert.ok(result.mutations.length > 0, 'Should parse mutations from normal-sized file');

        // 清理
        fs.unlinkSync(normalPath);
        fs.rmdirSync(realTmpDir);
    });
});
