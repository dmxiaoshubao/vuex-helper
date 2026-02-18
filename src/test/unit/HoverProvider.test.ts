import * as assert from 'assert';
import * as Module from 'module';

const originalRequire = Module.prototype.require;

(Module.prototype as any).require = function(id: string) {
    if (id === 'vscode') {
        return {
            Uri: class {
                constructor(public fsPath: string, public scheme: string = 'file') {}
                static file(path: string) { return new (this as any)(path); }
                toString() { return `${this.scheme}://${this.fsPath}`; }
            },
            Position: class {
                constructor(public line: number, public character: number) {}
            },
            Range: class {
                start: any;
                end: any;
                constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
                    this.start = { line: startLine, character: startCharacter };
                    this.end = { line: endLine, character: endCharacter };
                }
            },
            Location: class {
                constructor(public uri: any, public rangeOrPosition: any) {}
            },
            MarkdownString: class {
                public value = '';
                appendCodeblock(text: string, lang?: string) {
                    this.value += `\`\`\`${lang || ''}\n${text}\n\`\`\``;
                    return this;
                }
                appendMarkdown(text: string) {
                    this.value += text;
                    return this;
                }
            },
            Hover: class {
                constructor(public contents: any) {}
            },
            workspace: {
                asRelativePath: (value: any) => value?.fsPath || String(value)
            }
        };
    }
    return originalRequire.apply(this, arguments as any);
};

import { StoreIndexer } from '../../services/StoreIndexer';
import { VuexHoverProvider } from '../../providers/VuexHoverProvider';
const vscode = require('vscode');

class MockStoreIndexer extends StoreIndexer {
    constructor() { super('/mock/workspace'); }

    getStoreMap() {
        const mkLoc = (file: string, line: number = 0) => new (vscode as any).Location((vscode as any).Uri.file(file), new (vscode as any).Position(line, 0));
        return {
            state: [
                { name: 'count', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 5), displayType: 'number' },
                { name: 'profile', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 10), displayType: 'Object' },
                { name: 'name', modulePath: ['user', 'profile'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 20), displayType: 'string' }
            ],
            getters: [
                { name: 'isAdmin', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 50) },
                { name: 'isActive', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 40) }
            ],
            mutations: [],
            actions: []
        } as any;
    }
}

class MockStoreIndexerWithoutLeaf extends StoreIndexer {
    constructor() { super('/mock/workspace'); }

    getStoreMap() {
        const mkLoc = (file: string, line: number = 0) => new (vscode as any).Location((vscode as any).Uri.file(file), new (vscode as any).Position(line, 0));
        return {
            state: [
                { name: 'profile', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 10), displayType: 'Object' }
            ],
            getters: [],
            mutations: [],
            actions: []
        } as any;
    }
}

class MockCommitHoverStoreIndexer extends StoreIndexer {
    constructor() { super('/mock/workspace'); }

    getStoreMap() {
        const mkLoc = (file: string, line: number = 0) => new (vscode as any).Location((vscode as any).Uri.file(file), new (vscode as any).Position(line, 0));
        return {
            state: [],
            getters: [],
            mutations: [
                { name: 'SET_NAME', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 40) },
                { name: 'SET_NAME', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 10) }
            ],
            actions: [
                { name: 'fetchProfile', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 41) },
                { name: 'fetchProfile', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 11) }
            ]
        } as any;
    }

    getNamespace(filePath: string) {
        if (filePath.includes('/src/store/modules/user')) {
            return ['user'];
        }
        return undefined;
    }
}

function createDocument(text: string, fileName: string) {
    const lines = text.split('\n');
    return {
        fileName,
        languageId: fileName.endsWith('.vue') ? 'vue' : 'javascript',
        version: 1,
        uri: { toString: () => `file://${fileName}` },
        getText: (range?: any) => {
            if (!range) return text;
            const line = lines[range.start.line] || '';
            return line.slice(range.start.character, range.end.character);
        },
        lineAt: (lineOrPos: any) => {
            const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
            return { text: lines[lineNum] || '' };
        },
        offsetAt: (pos: any) => {
            let offset = 0;
            for (let i = 0; i < pos.line; i++) {
                offset += (lines[i] || '').length + 1;
            }
            return offset + pos.character;
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

describe('VuexHoverProvider state access', () => {
    it('should show Vuex hover for state.profile.name inside mapState callback', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexer());
        const text = `<script>\nimport { createNamespacedHelpers } from 'vuex'\nconst { mapState: mapUserState } = createNamespacedHelpers('user')\nexport default {\n  computed: {\n    ...mapUserState({ profileName: state => state.profile.name })\n  }\n}\n</script>`;
        const line = text.split('\n')[5];
        const char = line.lastIndexOf('name') + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const hover = await provider.provideHover(document, { line: 5, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('State: profile.name'), 'Hover should include full state path');
        assert.ok(md.includes('/mock/workspace/src/store/modules/user.js'), 'Hover should include definition file');
    });

    it('should not provide Vuex hover when nested leaf does not exist', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexerWithoutLeaf());
        const text = `<script>\nimport { createNamespacedHelpers } from 'vuex'\nconst { mapState: mapUserState } = createNamespacedHelpers('user')\nexport default {\n  computed: {\n    ...mapUserState({ profileName: state => state.profile.name })\n  }\n}\n</script>`;
        const line = text.split('\n')[5];
        const char = line.lastIndexOf('name') + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const hover = await provider.provideHover(document, { line: 5, character: char } as any, {} as any);
        assert.strictEqual(hover, undefined, 'Hover should not fallback to parent state');
    });
});

describe('VuexHoverProvider commit/dispatch context', () => {
    it('should prefer local mutation hover for bare commit in module context', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `function action({ commit }) { commit('SET_NAME') }`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/modules/user.js'), 'Hover should resolve to local mutation');
    });

    it('should prefer root mutation hover for this.$store.commit in module file', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `this.$store.commit('SET_NAME')`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/component.vue');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/index.js'), 'Hover should resolve to root mutation');
    });

    it('should prefer root mutation hover for this.$store optional chain commit in module file', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `this.$store?.commit('SET_NAME')`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/component.vue');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/index.js'), 'Hover should resolve to root mutation');
    });

    it('should prefer root action hover for this alias optional chain dispatch in module file', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `const vm = this; vm.$store?.dispatch('fetchProfile')`;
        const char = text.indexOf('fetchProfile') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/component.vue');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/index.js'), 'Hover should resolve to root action');
    });

    it('should prefer root action hover when dispatch uses { root: true } option', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `function action({ dispatch }) { dispatch('fetchProfile', null, { root: true }) }`;
        const char = text.indexOf('fetchProfile') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/index.js'), 'Hover should resolve to root action');
    });

    it('should prefer root hover when commit root option is long and multiline', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `<script>
export default {
  methods: {
    run({ commit }) {
      commit(
        'SET_NAME',
        {
          filler1: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          filler2: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          filler3: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
        },
        {
          root: true
        }
      )
    }
  }
}
</script>`;
        const lines = text.split('\n');
        const lineIndex = lines.findIndex((line) => line.includes('SET_NAME'));
        const char = lines[lineIndex].indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/component.vue');

        const hover = await provider.provideHover(document, { line: lineIndex, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/index.js'), 'Hover should resolve to root mutation');
    });

    it('should prefer local hover when commit is destructured as alias', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `function action({ commit: c }) { c('SET_NAME') }`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/modules/user.js'), 'Hover should resolve to local mutation');
    });

    it('should prefer local hover when commit alias comes from member assignment', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `function action(ctx) { const c = ctx.commit; c('SET_NAME') }`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/modules/user.js'), 'Hover should resolve to local mutation');
    });

    it('should prefer root hover when dispatch alias uses options variable root true', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `const opts = { root: true }; function action({ dispatch: d }) { d('fetchProfile', null, opts) }`;
        const char = text.indexOf('fetchProfile') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('/mock/workspace/src/store/index.js'), 'Hover should resolve to root action');
    });
});

describe('VuexHoverProvider rootState/rootGetters', () => {
    it('should show hover for rootState.count in module context', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexer());
        const text = `function action({ rootState }) { return rootState.count }`;
        const char = text.indexOf('rootState.count') + 'rootState.'.length + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('State: count'), 'Hover should include state name');
        assert.ok(md.includes('/mock/workspace/src/store/index.js'), 'Hover should resolve to root state file');
    });

    it('should show hover for rootState.user.profile nested access', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexer());
        const text = `function action({ rootState }) { return rootState.user.profile }`;
        const char = text.indexOf('rootState.user.profile') + 'rootState.user.'.length + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('State:'), 'Hover should include state label');
        assert.ok(md.includes('/mock/workspace/src/store/modules/user.js'), 'Hover should resolve to user module');
    });

    it('should show hover for rootGetters.isAdmin in module context', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexer());
        const text = `function action({ rootGetters }) { return rootGetters.isAdmin }`;
        const char = text.indexOf('isAdmin') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('Getter: isAdmin'), 'Hover should include getter name');
        assert.ok(md.includes('/mock/workspace/src/store/index.js'), 'Hover should resolve to root getter file');
    });
});
