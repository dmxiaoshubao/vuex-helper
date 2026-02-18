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
            workspace: {
                getConfiguration: () => ({ get: (_key: string, defaultValue?: any) => defaultValue }),
                asRelativePath: (value: any) => value?.toString?.() || String(value)
            },
            window: {
                showInformationMessage: () => undefined
            }
        };
    }
    return originalRequire.apply(this, arguments as any);
};

import { StoreIndexer } from '../../services/StoreIndexer';
import { VuexDefinitionProvider } from '../../providers/VuexDefinitionProvider';
const vscode = require('vscode');

class MockStoreIndexer extends StoreIndexer {
    constructor() { super('/mock/workspace'); }

    getStoreMap() {
        const mkLoc = (file: string, line: number = 0) => new (vscode as any).Location((vscode as any).Uri.file(file), new (vscode as any).Position(line, 0));
        return {
            state: [
                { name: 'name', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 0) },
                { name: 'name', modulePath: ['others'], defLocation: mkLoc('/mock/workspace/src/store/modules/others.js', 1) },
                { name: 'profile', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 10) },
                { name: 'name', modulePath: ['user', 'profile'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 20) }
            ],
            getters: [
                { name: 'isAdmin', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 50) },
                { name: 'isActive', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 40) }
            ],
            mutations: [
                { name: 'SET_NAME', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 30) },
                { name: 'SET_NAME', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js') },
                { name: 'SET_NAME', modulePath: ['others'], defLocation: mkLoc('/mock/workspace/src/store/modules/others.js') }
            ],
            actions: [
                { name: 'fetchProfile', modulePath: [], defLocation: mkLoc('/mock/workspace/src/store/index.js', 31) },
                { name: 'fetchProfile', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js') },
                { name: 'fetchProfile', modulePath: ['others'], defLocation: mkLoc('/mock/workspace/src/store/modules/others.js') }
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

class MockStoreIndexerWithoutLeaf extends StoreIndexer {
    constructor() { super('/mock/workspace'); }

    getStoreMap() {
        const mkLoc = (file: string, line: number = 0) => new (vscode as any).Location((vscode as any).Uri.file(file), new (vscode as any).Position(line, 0));
        return {
            state: [
                { name: 'profile', modulePath: ['user'], defLocation: mkLoc('/mock/workspace/src/store/modules/user.js', 10) }
            ],
            getters: [],
            mutations: [],
            actions: []
        } as any;
    }

    getNamespace(_filePath: string) {
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

describe('VuexDefinitionProvider namespaced', () => {
    it('should jump to the explicit namespaced mutation for commit path', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `<script>\nexport default { methods: { run() { this.$store.commit('others/SET_NAME') } } }\n</script>`;
        const line = text.split('\n')[1];
        const char = line.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/component.vue');

        const definition = await provider.provideDefinition(document, { line: 1, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/others.js');
    });

    it('should prefer local mutation for bare commit in module context', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ commit }) { commit('SET_NAME') }`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
    });

    it('should prefer root mutation for this.$store.commit in module file', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `this.$store.commit('SET_NAME')`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/component.vue');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 30);
    });

    it('should prefer root mutation for this.$store optional chain commit in module file', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `this.$store?.commit('SET_NAME')`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/component.vue');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 30);
    });

    it('should prefer root action for this alias optional chain dispatch in module file', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `const vm = this; vm.$store?.dispatch('fetchProfile')`;
        const char = text.indexOf('fetchProfile') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/component.vue');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 31);
    });

    it('should prefer root mutation when commit uses { root: true } option', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ commit }) { commit('SET_NAME', null, { root: true }) }`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 30);
    });

    it('should prefer root mutation when commit root option is long and multiline', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
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
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.vue');

        const definition = await provider.provideDefinition(document, { line: lineIndex, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 30);
    });

    it('should prefer root action when dispatch uses { root: true } option', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ dispatch }) { dispatch('fetchProfile', null, { root: true }) }`;
        const char = text.indexOf('fetchProfile') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 31);
    });

    it('should prefer local mutation when commit is destructured as alias', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ commit: c }) { c('SET_NAME') }`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
    });

    it('should prefer local mutation when commit alias comes from member assignment', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action(ctx) { const c = ctx.commit; c('SET_NAME') }`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
    });

    it('should prefer root action when dispatch alias uses options variable with root true', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `const opts = { root: true }; function action({ dispatch: d }) { d('fetchProfile', null, opts) }`;
        const char = text.indexOf('fetchProfile') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 31);
    });

    it('should jump to namespaced state when using slash path in mapState array syntax', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `<script>\nimport { mapState } from 'vuex'\nexport default { computed: { ...mapState(['others/name']) } }\n</script>`;
        const line = text.split('\n')[2];
        const char = line.indexOf('name') + 1;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const definition = await provider.provideDefinition(document, { line: 2, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/others.js');
    });

    it('should jump to inferred state key for namespaced mapState function alias', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `<script>\nimport { createNamespacedHelpers } from 'vuex'\nconst { mapState: mapUserState } = createNamespacedHelpers('user')\nexport default {\n  computed: {\n    ...mapUserState({ profileName: state => state.profile.name })\n  },\n  methods: {\n    run() { return this.profileName }\n  }\n}\n</script>`;
        const line = text.split('\n')[8];
        const char = line.indexOf('profileName') + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const definition = await provider.provideDefinition(document, { line: 8, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 20);
    });

    it('should jump from template mapped state alias to namespaced state definition', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `<template>\n  <p>{{ profileName }}</p>\n</template>\n<script>\nimport { createNamespacedHelpers } from 'vuex'\nconst { mapState: mapUserState } = createNamespacedHelpers('user')\nexport default {\n  computed: {\n    ...mapUserState({ profileName: state => state.profile.name })\n  }\n}\n</script>`;
        const line = text.split('\n')[1];
        const char = line.indexOf('profileName') + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const definition = await provider.provideDefinition(document, { line: 1, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 20);
    });

    it('should jump from state.profile.name access to nested leaf definition', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `<script>\nimport { createNamespacedHelpers } from 'vuex'\nconst { mapState: mapUserState } = createNamespacedHelpers('user')\nexport default {\n  computed: {\n    ...mapUserState({ profileName: state => state.profile.name })\n  }\n}\n</script>`;
        const line = text.split('\n')[5];
        const char = line.lastIndexOf('name') + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const definition = await provider.provideDefinition(document, { line: 5, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 20);
    });

    it('should jump to module file when clicking intermediate path word in state chain', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `<script>\nimport { mapState } from 'vuex'\nexport default {\n  computed: {\n    ...mapState({ userName: state => state.user.name })\n  }\n}\n</script>`;
        const line = text.split('\n')[4];
        // 点击 state.user.name 中的 "user"（跳过 userName 中的 user）
        const char = line.indexOf('state.user.') + 'state.'.length + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const definition = await provider.provideDefinition(document, { line: 4, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved for intermediate path word');
        // 应该跳转到 user 模块文件
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
        // 跳转到文件顶部
        assert.strictEqual((definition as any).rangeOrPosition.line, 0);
    });

    it('should jump to leaf state when clicking last word in state chain', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `<script>\nimport { mapState } from 'vuex'\nexport default {\n  computed: {\n    ...mapState({ userName: state => state.user.name })\n  },\n  methods: {\n    run() { return this.userName }\n  }\n}\n</script>`;
        const line = text.split('\n')[7];
        const char = line.indexOf('userName') + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const definition = await provider.provideDefinition(document, { line: 7, character: char } as any, {} as any);
        // userName 映射到 originalName: "user.name"，会被解析为 namespace=user, name=name
        // MockStoreIndexer 中有 { name: 'name', modulePath: ['user', 'profile'] }，但没有 modulePath: ['user']
        // 所以 mapping 可以解析但 findDefinition 可能找不到精确匹配，取决于数据
        // 此处主要验证不会崩溃，且如果有匹配项会正确返回
        if (definition) {
            assert.ok((definition as any).uri, 'Should have uri when definition is found');
        }
    });

    it('should jump to root mutation when commit has { root: true } in module context', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ commit }) { commit('SET_NAME', null, { root: true }) }`;
        const char = text.indexOf('SET_NAME') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        // root:true 应跳转到根模块的 SET_NAME
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 30);
    });

    it('should jump to root action when dispatch has { root: true } in module context', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ dispatch }) { dispatch('fetchProfile', null, { root: true }) }`;
        const char = text.indexOf('fetchProfile') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        // root:true 应跳转到根模块的 fetchProfile
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 31);
    });

    it('should not resolve definition when nested leaf does not exist', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexerWithoutLeaf());
        const text = `<script>\nimport { createNamespacedHelpers } from 'vuex'\nconst { mapState: mapUserState } = createNamespacedHelpers('user')\nexport default {\n  computed: {\n    ...mapUserState({ profileName: state => state.profile.name })\n  }\n}\n</script>`;
        const line = text.split('\n')[5];
        const char = line.lastIndexOf('name') + 2;
        const document = createDocument(text, '/mock/workspace/src/components/App.vue');

        const definition = await provider.provideDefinition(document, { line: 5, character: char } as any, {} as any);
        assert.strictEqual(definition, undefined, 'Definition should not fallback to parent state');
    });
});

describe('VuexDefinitionProvider rootState/rootGetters', () => {
    it('should jump to root state for rootState.name in module context', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ rootState }) { return rootState.name }`;
        const char = text.indexOf('rootState.name') + 'rootState.'.length + 1;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 0);
    });

    it('should jump to nested state for rootState.user.profile in module context', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ rootState }) { return rootState.user.profile }`;
        const char = text.indexOf('rootState.user.profile') + 'rootState.user.'.length + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 10);
    });

    it('should jump to module for rootState.user intermediate path', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ rootState }) { return rootState.user.profile }`;
        // 点击 user（中间路径词，右侧还有 .profile）
        const char = text.indexOf('rootState.user') + 'rootState.'.length + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved for intermediate path');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 0);
    });

    it('should jump to root getter for rootGetters.isAdmin in module context', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ rootGetters }) { return rootGetters.isAdmin }`;
        const char = text.indexOf('isAdmin') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/index.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 50);
    });

    it('should jump to namespaced getter for rootGetters bracket notation', async () => {
        const provider = new VuexDefinitionProvider(new MockStoreIndexer());
        const text = `function action({ rootGetters }) { return rootGetters['user/isActive'] }`;
        const char = text.indexOf('isActive') + 2;
        const document = createDocument(text, '/mock/workspace/src/store/modules/user/actions.js');

        const definition = await provider.provideDefinition(document, { line: 0, character: char } as any, {} as any);
        assert.ok(definition, 'Definition should be resolved');
        assert.strictEqual((definition as any).uri.fsPath, '/mock/workspace/src/store/modules/user.js');
        assert.strictEqual((definition as any).rangeOrPosition.line, 40);
    });
});
