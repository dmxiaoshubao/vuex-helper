import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';
import { VuexHoverProvider } from '../../providers/VuexHoverProvider';
const vscode = require('vscode');

class MockStoreIndexer extends StoreIndexer {
    private workspaceRootForTest: string;
    private storeEntryPathForTest: string | null;
    constructor(workspaceRootForTest: string = '/mock/workspace', storeEntryPathForTest: string | null = null) {
        super(workspaceRootForTest);
        this.workspaceRootForTest = workspaceRootForTest;
        this.storeEntryPathForTest = storeEntryPathForTest;
    }

    getStoreMap() {
        const mkLoc = (file: string, line: number = 0) => new (vscode as any).Location((vscode as any).Uri.file(file), new (vscode as any).Position(line, 0));
        const root = this.workspaceRootForTest;
        return {
            state: [
                { name: 'count', modulePath: [], defLocation: mkLoc(path.join(root, 'src/store/index.js'), 5), displayType: 'number' },
                { name: 'language', modulePath: ['others'], defLocation: mkLoc(path.join(root, 'src/store/modules/others.js'), 6), displayType: 'string' },
                { name: 'profile', modulePath: ['user'], defLocation: mkLoc(path.join(root, 'src/store/modules/user.js'), 10), displayType: 'Object' },
                { name: 'name', modulePath: ['user', 'profile'], defLocation: mkLoc(path.join(root, 'src/store/modules/user.js'), 20), displayType: 'string' }
            ],
            getters: [
                { name: 'isAdmin', modulePath: [], defLocation: mkLoc(path.join(root, 'src/store/index.js'), 50) },
                { name: 'isActive', modulePath: ['user'], defLocation: mkLoc(path.join(root, 'src/store/modules/user.js'), 40) },
                { name: 'hasNotifications', modulePath: ['others'], defLocation: mkLoc(path.join(root, 'src/store/modules/others.js'), 41) }
            ],
            mutations: [],
            actions: []
        } as any;
    }

    getStoreEntryPath() {
        return this.storeEntryPathForTest;
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
    private workspaceRootForTest: string;
    private storeEntryPathForTest: string | null;
    constructor(workspaceRootForTest: string = '/mock/workspace', storeEntryPathForTest: string | null = null) {
        super(workspaceRootForTest);
        this.workspaceRootForTest = workspaceRootForTest;
        this.storeEntryPathForTest = storeEntryPathForTest;
    }

    getStoreMap() {
        const mkLoc = (file: string, line: number = 0) => new (vscode as any).Location((vscode as any).Uri.file(file), new (vscode as any).Position(line, 0));
        const root = this.workspaceRootForTest;
        return {
            state: [],
            getters: [],
            mutations: [
                { name: 'SET_NAME', modulePath: [], defLocation: mkLoc(path.join(root, 'src/store/index.js'), 40) },
                { name: 'SET_NAME', modulePath: ['user'], defLocation: mkLoc(path.join(root, 'src/store/modules/user.js'), 10) },
                { name: 'SET_THEME', modulePath: ['others'], defLocation: mkLoc(path.join(root, 'src/store/modules/others.js'), 12) }
            ],
            actions: [
                { name: 'fetchProfile', modulePath: [], defLocation: mkLoc(path.join(root, 'src/store/index.js'), 41) },
                { name: 'fetchProfile', modulePath: ['user'], defLocation: mkLoc(path.join(root, 'src/store/modules/user.js'), 11) },
                { name: 'changeTheme', modulePath: ['others'], defLocation: mkLoc(path.join(root, 'src/store/modules/others.js'), 13) }
            ]
        } as any;
    }

    getStoreEntryPath() {
        return this.storeEntryPathForTest;
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

function createAliasWorkspace() {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-hover-store-')));
    fs.mkdirSync(path.join(root, 'src', 'store'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'store', 'index.js'), 'export default {}');
    fs.writeFileSync(
        path.join(root, 'tsconfig.json'),
        JSON.stringify({
            compilerOptions: {
                paths: {
                    '@/*': ['src/*']
                }
            }
        })
    );
    return {
        root,
        storeEntry: path.join(root, 'src', 'store', 'index.js'),
        componentFile: path.join(root, 'src', 'components', 'App.vue'),
    };
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

    it('should prefer root mutation hover for alias-imported store.commit in module file', async () => {
        const workspace = createAliasWorkspace();
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer(workspace.root, workspace.storeEntry));
        const text = `import store from '@/store'\nfunction run(){ store.commit('SET_NAME') }`;
        const char = text.split('\n')[1].indexOf('SET_NAME') + 2;
        const document = createDocument(text, path.join(workspace.root, 'src/store/modules/user/actions.js'));

        const hover = await provider.provideHover(document, { line: 1, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes(path.join(workspace.root, 'src/store/index.js')), 'Hover should resolve to root mutation');
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

    it('should resolve hover for mapped mutation via this bracket full path', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `<script>\nimport { mapMutations } from 'vuex'\nexport default { methods: { ...mapMutations(['others/SET_THEME']), run() { this['others/SET_THEME']() } } }\n</script>`;
        const line = text.split('\n')[2];
        const char = line.lastIndexOf('SET_THEME') + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const hover = await provider.provideHover(document, { line: 2, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('Mutation: others/SET_THEME'), 'Hover should include mapped mutation full path');
        assert.ok(md.includes('/mock/workspace/src/store/modules/others.js'), 'Hover should resolve to namespaced mutation');
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

    it('should show hover for optional-chain this.$store?.getters?.["others/hasNotifications"]', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexer());
        const text = `this.$store?.getters?.['others/hasNotifications']`;
        const char = text.indexOf('hasNotifications') + 2;
        const document = createDocument(text, '/mock/workspace/src/pages/index.vue');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved for optional-chain bracket getter access');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('Getter: others/hasNotifications'), 'Hover should include full namespaced getter path');
        assert.ok(md.includes('/mock/workspace/src/store/modules/others.js'), 'Hover should resolve to namespaced getter file');
    });

    it('should show hover for alias-imported store getter bracket access', async () => {
        const workspace = createAliasWorkspace();
        const provider = new VuexHoverProvider(new MockStoreIndexer(workspace.root, workspace.storeEntry));
        const text = `import store from '@/store'\nstore.getters['others/hasNotifications']`;
        const char = text.split('\n')[1].indexOf('hasNotifications') + 2;
        const document = createDocument(text, workspace.componentFile);

        const hover = await provider.provideHover(document, { line: 1, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved for imported store getter access');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('Getter: others/hasNotifications'), 'Hover should include namespaced getter path');
        assert.ok(md.includes(path.join(workspace.root, 'src/store/modules/others.js')), 'Hover should resolve to namespaced getter file');
    });

    it('should show hover for optional-chain this.$store?.getters?.user?.isActive', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexer());
        const text = `this.$store?.getters?.user?.isActive`;
        const char = text.indexOf('isActive') + 2;
        const document = createDocument(text, '/mock/workspace/src/pages/index.vue');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved for optional-chain dot getter access');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('Getter: isActive'), 'Hover should include getter name');
        assert.ok(md.includes('/mock/workspace/src/store/modules/user.js'), 'Hover should resolve to user getter file');
    });

    it('should show hover for optional-chain this.$store?.state?.["others/language"]', async () => {
        const provider = new VuexHoverProvider(new MockStoreIndexer());
        const text = `this.$store?.state?.["others/language"]`;
        const char = text.indexOf('language') + 2;
        const document = createDocument(text, '/mock/workspace/src/pages/index.vue');

        const hover = await provider.provideHover(document, { line: 0, character: char } as any, {} as any);
        assert.ok(hover, 'Hover should be resolved for optional-chain bracket state access');
        const md = (hover as any).contents?.value || '';
        assert.ok(md.includes('State: others/language'), 'Hover should include full namespaced state path');
        assert.ok(md.includes('/mock/workspace/src/store/modules/others.js'), 'Hover should resolve to namespaced state file');
    });
});

describe('VuexHoverProvider comment skipping', () => {
    it('should not provide hover when cursor is on a single-line comment', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `function action({ commit }) {\n  // commit('SET_NAME')\n  commit('SET_NAME')\n}`;
        const line = text.split('\n')[1];
        const char = line.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 1, character: char } as any, {} as any);
        assert.strictEqual(hover, undefined, 'Hover should not be resolved inside a comment');
    });

    it('should not provide hover when cursor is on a block comment line', async () => {
        const provider = new VuexHoverProvider(new MockCommitHoverStoreIndexer());
        const text = `function action({ commit }) {\n  /*\n   * commit('SET_NAME')\n   */\n  commit('SET_NAME')\n}`;
        const line = text.split('\n')[2];
        const char = line.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const hover = await provider.provideHover(document, { line: 2, character: char } as any, {} as any);
        assert.strictEqual(hover, undefined, 'Hover should not be resolved inside a block comment');
    });
});
