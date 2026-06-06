import * as assert from 'assert';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';
import { VuexReferenceProvider } from '../../providers/VuexReferenceProvider';
const vscode = require('vscode');

class MockStoreIndexer extends StoreIndexer {
    constructor() {
        super('/mock/workspace');
    }

    getStoreMap() {
        const location = new (vscode as any).Location(
            (vscode as any).Uri.file('/mock/workspace/src/store/modules/merchant.js'),
            new (vscode as any).Position(1, 2)
        );
        return {
            state: [],
            getters: [],
            mutations: [
                { name: 'setOutTradeNo', modulePath: ['merchant'], defLocation: location }
            ],
            actions: []
        } as any;
    }
}

function createDocument(text: string, fileName: string) {
    const lines = text.split('\n');
    return {
        fileName,
        languageId: fileName.endsWith('.vue') ? 'vue' : fileName.endsWith('.ts') ? 'typescript' : 'javascript',
        version: 1,
        uri: (vscode as any).Uri.file(fileName),
        getText: (range?: any) => {
            if (!range) return text;
            const start = offsetAt(range.start);
            const end = offsetAt(range.end);
            return text.slice(start, end);
        },
        lineAt: (lineOrPos: any) => {
            const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
            return { text: lines[lineNum] || '' };
        },
        get lineCount() {
            return lines.length;
        },
        offsetAt,
        positionAt,
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

    function offsetAt(pos: any): number {
        let offset = 0;
        for (let i = 0; i < pos.line; i++) {
            offset += (lines[i] || '').length + 1;
        }
        return offset + pos.character;
    }

    function positionAt(offset: number) {
        let remaining = offset;
        for (let line = 0; line < lines.length; line++) {
            const length = lines[line].length;
            if (remaining <= length) {
                return new (vscode as any).Position(line, remaining);
            }
            remaining -= length + 1;
        }
        return new (vscode as any).Position(lines.length - 1, lines[lines.length - 1].length);
    }
}

describe('VuexReferenceProvider', () => {
    const originalFindFiles = vscode.workspace.findFiles;
    const originalOpenTextDocument = vscode.workspace.openTextDocument;
    const originalTextDocuments = vscode.workspace.textDocuments;

    afterEach(() => {
        vscode.workspace.findFiles = originalFindFiles;
        vscode.workspace.openTextDocument = originalOpenTextDocument;
        vscode.workspace.textDocuments = originalTextDocuments;
    });

    it('should find Vuex mutation references from its store definition', async () => {
        const storePath = '/mock/workspace/src/store/modules/merchant.js';
        const appPath = '/mock/workspace/src/App.vue';
        const localPath = '/mock/workspace/src/local.js';
        const storeDocument = createDocument(
            `const mutations = {\n  setOutTradeNo: (state, outTradeNo) => {}\n}`,
            storePath
        );
        const appDocument = createDocument(
            `<script>\nimport { mapMutations } from 'vuex'\nexport default {\n  methods: {\n    clear() { this.setOutTradeNo('') },\n    commitIt() { this.$store.commit('merchant/setOutTradeNo') },\n    ...mapMutations({ setOutTradeNo: 'merchant/setOutTradeNo' })\n  }\n}\n</script>`,
            appPath
        );
        const localDocument = createDocument(
            `const setOutTradeNo = () => {}\nsetOutTradeNo()`,
            localPath
        );
        const documents = new Map<string, any>([
            [storePath, storeDocument],
            [appPath, appDocument],
            [localPath, localDocument],
        ]);

        vscode.workspace.findFiles = async () => Array.from(documents.keys()).map((file) => (vscode as any).Uri.file(file));
        vscode.workspace.openTextDocument = async (uri: any) => documents.get(uri.fsPath);
        vscode.workspace.textDocuments = [];

        const provider = new VuexReferenceProvider(new MockStoreIndexer());
        const references = await provider.provideReferences(
            storeDocument,
            new (vscode as any).Position(1, 5),
            { includeDeclaration: true } as any,
            { isCancellationRequested: false } as any
        );

        const byPathLine = references.map((ref: any) => `${path.basename(ref.uri.fsPath)}:${ref.rangeOrPosition.start?.line ?? ref.rangeOrPosition.line}`);
        assert.ok(byPathLine.includes('merchant.js:1'), 'References should include the mutation definition');
        assert.ok(byPathLine.some((item) => item === 'App.vue:4'), 'References should include mapped this.setOutTradeNo call');
        assert.ok(byPathLine.some((item) => item === 'App.vue:5'), 'References should include this.$store.commit string path');
        assert.ok(byPathLine.some((item) => item === 'App.vue:6'), 'References should include mapMutations declarations');
        assert.ok(!byPathLine.some((item) => item.startsWith('local.js')), 'References should exclude local same-name functions');
    });

    it('should cap workspace file search and stop opening documents when cancelled', async () => {
        const storePath = '/mock/workspace/src/store/modules/merchant.js';
        const firstPath = '/mock/workspace/src/First.vue';
        const secondPath = '/mock/workspace/src/Second.vue';
        const storeDocument = createDocument(
            `const mutations = {\n  setOutTradeNo: (state, outTradeNo) => {}\n}`,
            storePath
        );
        const firstDocument = createDocument(
            `<script>export default { methods: { run() { this.$store.commit('merchant/setOutTradeNo') } } }</script>`,
            firstPath
        );
        const secondDocument = createDocument(
            `<script>export default { methods: { run() { this.$store.commit('merchant/setOutTradeNo') } } }</script>`,
            secondPath
        );
        const documents = new Map<string, any>([
            [storePath, storeDocument],
            [firstPath, firstDocument],
            [secondPath, secondDocument],
        ]);
        const token = { isCancellationRequested: false } as any;
        const opened: string[] = [];
        let observedLimit: number | undefined;
        let observedExclude = '';

        vscode.workspace.findFiles = async (_include: any, exclude: any, limit?: number) => {
            observedLimit = limit;
            observedExclude = String(exclude);
            return [firstPath, secondPath].map((file) => (vscode as any).Uri.file(file));
        };
        vscode.workspace.openTextDocument = async (uri: any) => {
            opened.push(uri.fsPath);
            token.isCancellationRequested = true;
            return documents.get(uri.fsPath);
        };
        vscode.workspace.textDocuments = [];

        const provider = new VuexReferenceProvider(new MockStoreIndexer());
        await provider.provideReferences(
            storeDocument,
            new (vscode as any).Position(1, 5),
            { includeDeclaration: true } as any,
            token
        );

        assert.strictEqual(observedLimit, 500, 'Workspace file search should be capped');
        assert.ok(observedExclude.includes('unpackage'), 'Search exclude should skip common build output folders');
        assert.deepStrictEqual(opened, [firstPath], 'Provider should stop opening documents after cancellation');
    });
});
