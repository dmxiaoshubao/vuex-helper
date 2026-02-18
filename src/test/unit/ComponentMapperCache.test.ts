import * as assert from 'assert';

import { ComponentMapper } from '../../services/ComponentMapper';

function createDocument(uri: string, version: number, text: string) {
    return {
        uri: { toString: () => uri },
        version,
        languageId: 'vue',
        getText: () => text
    } as any;
}

describe('ComponentMapper Cache', () => {
    it('should keep cache size bounded to prevent memory growth', () => {
        const mapper = new ComponentMapper();

        for (let i = 0; i < 160; i++) {
            const doc = createDocument(`file:///doc-${i}.vue`, 1, `<script>export default {computed:{...mapState(['count'])}}</script>`);
            mapper.getMapping(doc);
        }

        assert.ok(mapper.getCacheSize() <= 100, 'Cache size should be bounded by LRU limit');
    });

    it('should reuse cached mapping when document version is unchanged', () => {
        const mapper = new ComponentMapper();
        const uri = 'file:///same.vue';

        const first = createDocument(uri, 3, `<script>export default {computed:{...mapState(['count'])}}</script>`);
        const firstMapping = mapper.getMapping(first);
        assert.ok(firstMapping.count, 'First parse should include mapped key');

        const second = createDocument(uri, 3, `<script>export default {computed:{...mapState([</script>`);
        const secondMapping = mapper.getMapping(second);
        assert.ok(secondMapping.count, 'Should return cached mapping for same version');
    });

    it('should clear cache after dispose', () => {
        const mapper = new ComponentMapper();

        const doc = createDocument('file:///dispose-test.vue', 1, `<script>export default {computed:{...mapState(['count'])}}</script>`);
        mapper.getMapping(doc);
        assert.ok(mapper.getCacheSize() > 0, 'Cache should have entries before dispose');

        mapper.dispose();
        assert.strictEqual(mapper.getCacheSize(), 0, 'Cache should be empty after dispose');
    });

    it('should reuse cached mapping when semantic signature is unchanged', () => {
        const mapper = new ComponentMapper();
        const uri = 'file:///semantic-stable.vue';

        const first = createDocument(
            uri,
            1,
            `<script>import { mapState } from 'vuex'; export default { computed: { ...mapState(['count']) } }</script>`,
        );
        const firstMapping = mapper.getMapping(first);
        assert.ok(firstMapping.count, 'Initial mapping should include count');

        const second = createDocument(
            uri,
            2,
            `<script>import { mapState } from 'vuex'; const debug = 1; export default { computed: { ...mapState([</script>`,
        );
        const secondMapping = mapper.getMapping(second);
        assert.ok(secondMapping.count, 'Semantic-stable edit should reuse previous mapping');
    });
});
