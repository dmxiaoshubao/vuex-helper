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

    it('should prefer range-window reads when TextDocument range APIs are available', () => {
        const scanner = new VuexContextScanner();
        const filler = new Array(300).fill('const noop = 1;').join('\n');
        const source = `${filler}\n<script>\nexport default { computed: { ...mapState([ ]) } }\n</script>`;
        const lines = source.split('\n');

        const targetLine = lines.findIndex((line) => line.includes('mapState([ ])'));
        const targetChar = lines[targetLine].indexOf('[ ]') + 2;
        const targetOffset = (() => {
            let offset = 0;
            for (let i = 0; i < targetLine; i++) offset += lines[i].length + 1;
            return offset + targetChar;
        })();

        let fullGetTextCalls = 0;
        let rangeGetTextCalls = 0;
        const lineOffsets: number[] = [];
        let cursor = 0;
        for (const line of lines) {
            lineOffsets.push(cursor);
            cursor += line.length + 1;
        }

        const document = {
            fileName: '/mock/workspace/src/components/Windowed.vue',
            languageId: 'vue',
            version: 2,
            uri: { toString: () => 'file:///mock/workspace/src/components/Windowed.vue' },
            lineCount: lines.length,
            getText: (range?: any) => {
                if (!range) {
                    fullGetTextCalls++;
                    return source;
                }
                rangeGetTextCalls++;
                const start = lineOffsets[range.start.line] + range.start.character;
                const end = lineOffsets[range.end.line] + range.end.character;
                return source.slice(start, end);
            },
            lineAt: (lineOrPos: any) => {
                const line = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
                return { text: lines[line] || '' };
            },
            positionAt: (offset: number) => {
                let line = 0;
                while (line + 1 < lineOffsets.length && lineOffsets[line + 1] <= offset) {
                    line++;
                }
                return { line, character: offset - lineOffsets[line] };
            },
            offsetAt: (pos: any) => lineOffsets[pos.line] + pos.character,
        } as any;
        const position = { line: targetLine, character: targetChar } as any;

        const context = scanner.getContext(document, position);
        assert.ok(context && context.type === 'state', 'Windowed read should still resolve Vuex context');
        assert.ok(rangeGetTextCalls > 0, 'Expected scanner to read via range window');
        assert.strictEqual(fullGetTextCalls, 0, 'Scanner should avoid full document reads when range APIs are available');
    });

    it('should keep core hot path timings under baseline thresholds', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        const changedFile = path.join(fixtureRoot, 'src/store/modules/alpha.js');

        const fullStart = performance.now();
        await indexer.index();
        const fullDurationMs = performance.now() - fullStart;

        const incrementalStart = performance.now();
        await indexer.index({ changedFiles: [changedFile] });
        const incrementalDurationMs = performance.now() - incrementalStart;

        assert.ok(fullDurationMs < 4000, `Full index baseline exceeded: ${fullDurationMs.toFixed(2)}ms`);
        assert.ok(incrementalDurationMs < 2500, `Incremental index baseline exceeded: ${incrementalDurationMs.toFixed(2)}ms`);
        assert.ok(
            incrementalDurationMs <= fullDurationMs * 1.5 + 50,
            `Incremental index should stay near full-index baseline (full=${fullDurationMs.toFixed(2)}ms, incremental=${incrementalDurationMs.toFixed(2)}ms)`
        );

        const scanner = new VuexContextScanner();
        const filler = new Array(260).fill('const keep = 1;').join('\n');
        const source = `${filler}\nexport default { computed: { ...mapState([ ]) } }`;
        const lines = source.split('\n');
        const lineIndex = lines.length - 1;
        const col = lines[lineIndex].indexOf('[ ]') + 2;
        const baseOffset = source.indexOf('[ ]') + 2;

        const durations: number[] = [];
        for (let i = 0; i < 20; i++) {
            const doc = {
                fileName: '/mock/workspace/src/components/App.vue',
                languageId: 'vue',
                version: 100 + i, // 让每次都走真实计算路径，避免单点缓存掩盖性能回归
                uri: { toString: () => `file:///mock/workspace/src/components/App-${i}.vue` },
                getText: () => source,
                offsetAt: (_pos: any) => baseOffset,
            } as any;
            const position = { line: lineIndex, character: col } as any;

            const t0 = performance.now();
            const context = scanner.getContext(doc, position);
            const elapsed = performance.now() - t0;
            durations.push(elapsed);
            assert.ok(context && context.type === 'state', 'Scanner should resolve state context on large input');
        }

        const sorted = durations.slice().sort((a, b) => a - b);
        const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
        assert.ok(p95 < 80, `VuexContextScanner p95 exceeded baseline: ${p95.toFixed(2)}ms`);
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
