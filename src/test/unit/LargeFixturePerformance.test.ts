import * as assert from 'assert';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';
import { VuexContextScanner } from '../../services/VuexContextScanner';
import { ComponentMapper } from '../../services/ComponentMapper';

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/large-project');

describe('Large Fixture Performance Regression', () => {
    it('should parse multi-module fixture and keep data after incremental reindex', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const firstMap = indexer.getStoreMap();
        assert.ok(firstMap, 'Store map should exist after full index');
        assert.ok(firstMap!.state.length >= 20, 'Large fixture should produce rich state entries');
        assert.ok(firstMap!.getters.some((item) => item.name === 'smartSearchEnabled' && item.modulePath.join('/') === 'epsilon'));

        const changedFile = path.join(fixtureRoot, 'src/store/modules/alpha.js');
        await indexer.index({ changedFiles: [changedFile] });
        const secondMap = indexer.getStoreMap();
        assert.ok(secondMap, 'Store map should exist after incremental index');
        assert.ok(secondMap!.getters.some((item) => item.name === 'smartSearchEnabled' && item.modulePath.join('/') === 'epsilon'));
    });

    it('should keep VuexContextScanner stable on large document window', () => {
        const scanner = new VuexContextScanner();
        const filler = new Array(200).fill('const noop = 1;').join('\n');
        const source = `${filler}\nexport default { computed: { ...mapState([ ]) } }`;
        const cursor = source.indexOf('[ ]') + 2;
        const lines = source.split('\n');

        const document = {
            fileName: '/mock/workspace/src/components/App.vue',
            languageId: 'vue',
            version: 1,
            uri: { toString: () => 'file:///mock/workspace/src/components/App.vue' },
            getText: () => source,
            offsetAt: (_pos: any) => cursor,
        } as any;
        const position = { line: lines.length - 1, character: lines[lines.length - 1].indexOf('[ ]') + 2 } as any;

        const first = scanner.getContext(document, position);
        const second = scanner.getContext(document, position);
        assert.ok(first && first.type === 'state', 'Large document should still resolve Vuex context');
        assert.strictEqual(first, second, 'Repeated query at same position should reuse context cache');
    });

    it('should keep ComponentMapper mapping stable for large non-semantic edits', () => {
        const mapper = new ComponentMapper();
        const filler = new Array(200).fill('// filler-line').join('\n');
        const base = `<script>\nimport { mapState } from 'vuex';\n${filler}\nexport default { computed: { ...mapState(['count']) } }\n</script>`;
        const changed = `<script>\nimport { mapState } from 'vuex';\nconst debugValue = 1;\n${filler}\nexport default { computed: { ...mapState([</script>`;

        const doc1 = {
            uri: { toString: () => 'file:///mock/workspace/src/components/Large.vue' },
            version: 1,
            languageId: 'vue',
            getText: () => base,
        } as any;
        const doc2 = {
            uri: { toString: () => 'file:///mock/workspace/src/components/Large.vue' },
            version: 2,
            languageId: 'vue',
            getText: () => changed,
        } as any;

        const mapping1 = mapper.getMapping(doc1);
        const mapping2 = mapper.getMapping(doc2);
        assert.ok(mapping1.count, 'Base mapping should include count');
        assert.ok(mapping2.count, 'Non-semantic large edit should reuse stable mapping');
    });
});
