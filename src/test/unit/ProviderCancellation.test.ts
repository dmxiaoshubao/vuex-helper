import * as assert from 'assert';

import { StoreIndexer } from '../../services/StoreIndexer';
import { VuexCompletionItemProvider } from '../../providers/VuexCompletionItemProvider';
import { VuexDefinitionProvider } from '../../providers/VuexDefinitionProvider';
import { VuexHoverProvider } from '../../providers/VuexHoverProvider';
const vscode = require('vscode');

class MockStoreIndexer extends StoreIndexer {
    constructor() { super('/mock/workspace'); }

    getStoreMap() {
        const mkLoc = (file: string, line: number = 0) => new (vscode as any).Location((vscode as any).Uri.file(file), new (vscode as any).Position(line, 0));
        return {
            state: [{ name: 'count', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 1) }],
            getters: [],
            mutations: [{ name: 'increment', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 2) }],
            actions: [{ name: 'incrementAsync', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 3) }],
        } as any;
    }
}

function createDocument(text: string, fileName: string) {
    const lines = text.split('\n');
    const offsets: number[] = [];
    let total = 0;
    for (let i = 0; i < lines.length; i++) {
        offsets.push(total);
        total += lines[i].length + 1;
    }

    return {
        fileName,
        languageId: fileName.endsWith('.vue') ? 'vue' : 'javascript',
        version: 1,
        uri: { toString: () => `file://${fileName}` },
        lineCount: lines.length,
        getText: (range?: any) => {
            if (!range) return text;
            const start = offsets[range.start.line] + range.start.character;
            const end = offsets[range.end.line] + range.end.character;
            return text.slice(start, end);
        },
        lineAt: (lineOrPos: any) => {
            const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
            return { text: lines[lineNum] || '' };
        },
        offsetAt: (pos: any) => (offsets[pos.line] || 0) + pos.character,
        positionAt: (offset: number) => {
            let line = 0;
            while (line + 1 < offsets.length && offsets[line + 1] <= offset) line++;
            return new (vscode as any).Position(line, offset - offsets[line]);
        },
        getWordRangeAtPosition: (pos: any) => {
            const line = lines[pos.line] || '';
            let start = pos.character;
            let end = pos.character;
            while (start > 0 && /[A-Za-z0-9_$]/.test(line[start - 1])) start--;
            while (end < line.length && /[A-Za-z0-9_$]/.test(line[end])) end++;
            if (start === end) return undefined;
            return new (vscode as any).Range(pos.line, start, pos.line, end);
        }
    } as any;
}

describe('Provider Cancellation', () => {
    const cancelledToken = { isCancellationRequested: true } as any;

    it('completion provider should short-circuit when token is cancelled', async () => {
        const provider = new VuexCompletionItemProvider(new MockStoreIndexer());
        const document = createDocument(`this.$store.`, '/mock/workspace/src/components/App.vue');
        const result = await provider.provideCompletionItems(document, { line: 0, character: 12 } as any, cancelledToken, {} as any);
        assert.strictEqual(result, undefined);
    });

    it('definition provider should short-circuit when token is cancelled', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const document = createDocument(`this.$store.commit('increment')`, '/mock/workspace/src/components/App.vue');
        const result = await provider.provideDefinition(document, { line: 0, character: 21 } as any, cancelledToken);
        assert.strictEqual(result, undefined);
    });

    it('hover provider should short-circuit when token is cancelled', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexer());
        const document = createDocument(`this.$store.commit('increment')`, '/mock/workspace/src/components/App.vue');
        const result = await provider.provideHover(document, { line: 0, character: 21 } as any, cancelledToken);
        assert.strictEqual(result, undefined);
    });
});
