import * as assert from 'assert';
import * as path from 'path';
import { StoreIndexer } from '../../services/StoreIndexer';
import { VuexDiagnosticProvider } from '../../services/VuexDiagnosticProvider';
const vscode = require('vscode');

// ---- Mock StoreIndexer ----
class MockStoreIndexer extends StoreIndexer {
    constructor() { super('/mock/workspace'); }

    getStoreMap() {
        const mkLoc = (file: string, line = 0) =>
            new vscode.Location(vscode.Uri.file(file), new vscode.Position(line, 0));
        const root = '/mock/workspace';
        return {
            state: [
                { name: 'count', modulePath: [], defLocation: mkLoc(`${root}/store/index.js`) },
                { name: 'preferences', modulePath: [], defLocation: mkLoc(`${root}/store/index.js`) },
                { name: 'items', modulePath: ['cart'], defLocation: mkLoc(`${root}/store/modules/cart.js`) },
            ],
            getters: [
                { name: 'total', modulePath: [], defLocation: mkLoc(`${root}/store/index.js`) },
                { name: 'cartTotal', modulePath: ['cart'], defLocation: mkLoc(`${root}/store/modules/cart.js`) },
            ],
            mutations: [
                { name: 'SET_COUNT', modulePath: [], defLocation: mkLoc(`${root}/store/index.js`) },
                { name: 'ADD_ITEM', modulePath: ['cart'], defLocation: mkLoc(`${root}/store/modules/cart.js`) },
            ],
            actions: [
                { name: 'fetchData', modulePath: [], defLocation: mkLoc(`${root}/store/index.js`) },
                { name: 'addToCart', modulePath: ['cart'], defLocation: mkLoc(`${root}/store/modules/cart.js`) },
            ],
        } as any;
    }

    getNamespace(_filePath: string) {
        // store 模块文件返回对应命名空间，非 store 文件返回 undefined
        if (_filePath.includes('/store/modules/cart')) return ['cart'];
        if (_filePath.includes('/store/index')) return [];
        return undefined;
    }
    getStoreEntryPath() { return '/mock/workspace/store/index.js'; }
}

// ---- createDocument helper ----
function createDocument(text: string, fileName = '/mock/workspace/src/App.vue') {
    const lines = text.split('\n');
    return {
        fileName,
        languageId: fileName.endsWith('.vue') ? 'vue' : (fileName.endsWith('.ts') ? 'typescript' : 'javascript'),
        uri: vscode.Uri.file(fileName),
        getText: () => text,
        lineAt: (lineOrPos: any) => {
            const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
            return { text: lines[lineNum] || '' };
        },
        positionAt: (offset: number) => {
            let remaining = offset;
            for (let i = 0; i < lines.length; i++) {
                const lineLen = lines[i].length + 1; // +1 for \n
                if (remaining < lineLen) {
                    return new vscode.Position(i, remaining);
                }
                remaining -= lineLen;
            }
            return new vscode.Position(lines.length - 1, 0);
        },
    } as any;
}

describe('VuexDiagnosticProvider', () => {
    let provider: VuexDiagnosticProvider;

    beforeEach(() => {
        provider = new VuexDiagnosticProvider(new MockStoreIndexer());
    });

    // ---- mapState / mapGetters ----
    it('should not warn for valid mapState key', () => {
        const doc = createDocument(`<template></template>
<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState(['count'])
  }
}
</script>`);
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid mapState key', () => {
        const doc = createDocument(`<template></template>
<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState(['nonExistent'])
  }
}
</script>`);
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('nonExistent')), 'Expected warning for nonExistent');
    });

    it('should not warn for valid namespaced mapMutations', () => {
        const doc = createDocument(`<template></template>
<script>
import { mapMutations } from 'vuex';
export default {
  methods: {
    ...mapMutations('cart', ['ADD_ITEM'])
  }
}
</script>`);
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid namespaced mapActions key', () => {
        const doc = createDocument(`<template></template>
<script>
import { mapActions } from 'vuex';
export default {
  methods: {
    ...mapActions('cart', ['noSuchAction'])
  }
}
</script>`);
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('noSuchAction')), 'Expected warning for noSuchAction');
    });

    it('should not warn for string literals inside mapState function bodies', () => {
        const doc = createDocument(`<template></template>
<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState({
      themeLabel(state) {
        return state.count > 0 ? 'dark' : 'light';
      }
    })
  }
}
</script>`);
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for all invalid items in a mapMutations array', () => {
        const doc = createDocument(`<template></template>
<script>
import { mapMutations } from 'vuex';
export default {
  methods: {
    ...mapMutations('cart', ['ADD_ITEM', 'BAD_MUTATION', 'ANOTHER_BAD'])
  }
}
</script>`);
        const diags = provider.diagnose(doc);
        // ADD_ITEM 存在，不应有 warning；BAD_MUTATION 和 ANOTHER_BAD 不存在，各产生一个 warning
        assert.ok(!diags.some(d => d.message.includes('ADD_ITEM')), 'ADD_ITEM should not warn');
        assert.ok(diags.some(d => d.message.includes('BAD_MUTATION')), 'Expected warning for BAD_MUTATION');
        assert.ok(diags.some(d => d.message.includes('ANOTHER_BAD')), 'Expected warning for ANOTHER_BAD');
    });

    it('should warn for all invalid items in a root mapState array', () => {
        const doc = createDocument(`<template></template>
<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState(['count', 'noSuchA', 'noSuchB'])
  }
}
</script>`);
        const diags = provider.diagnose(doc);
        assert.ok(!diags.some(d => d.message.includes('count')), 'count should not warn');
        assert.ok(diags.some(d => d.message.includes('noSuchA')), 'Expected warning for noSuchA');
        assert.ok(diags.some(d => d.message.includes('noSuchB')), 'Expected warning for noSuchB');
    });

    // ---- commit / dispatch ----
    it('should not warn for valid commit', () => {
        const doc = createDocument(`export default {
  methods: {
    doIt() { this.$store.commit('SET_COUNT'); }
  }
}`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid commit', () => {
        const doc = createDocument(`export default {
  methods: {
    doIt() { this.$store.commit('UNKNOWN_MUTATION'); }
  }
}`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('UNKNOWN_MUTATION')), 'Expected warning for UNKNOWN_MUTATION');
    });

    it('should not warn for valid namespaced dispatch', () => {
        const doc = createDocument(`export default {
  methods: {
    doIt() { this.$store.dispatch('cart/addToCart'); }
  }
}`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should not warn for non-Vuex bare dispatch call in non-store file', () => {
        const doc = createDocument(`function dispatch(type) {
  console.log(type);
}

dispatch('local-event');`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    // ---- $store.state / $store.getters bracket access ----
    it('should not warn for valid $store.getters bracket access', () => {
        const doc = createDocument(`export default {
  computed: {
    t() { return this.$store.getters['total']; }
  }
}`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid $store.state bracket access', () => {
        const doc = createDocument(`export default {
  computed: {
    x() { return this.$store.state['ghost']; }
  }
}`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('ghost')), 'Expected warning for ghost');
    });

    // ---- 注释行不触发诊断 ----
    it('should not warn for commented-out references', () => {
        const doc = createDocument(`export default {
  methods: {
    // this.$store.commit('UNKNOWN_MUTATION');
    doIt() {}
  }
}`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Commented-out references should not trigger diagnostics');
    });

    // ---- 无 storeMap 时返回空 ----
    it('should return empty diagnostics when store is not indexed', () => {
        class EmptyIndexer extends StoreIndexer {
            constructor() { super('/mock/workspace'); }
            getStoreMap() { return null as any; }
            getNamespace() { return undefined; }
        }
        const p = new VuexDiagnosticProvider(new EmptyIndexer());
        const doc = createDocument(`export default {
  methods: {
    doIt() { this.$store.commit('ANYTHING'); }
  }
}`, '/mock/workspace/src/App.js');
        assert.strictEqual(p.diagnose(doc).length, 0);
    });

    // ---- 点号链只诊断第一层，第二层及以上一律跳过 ----
    it('should not warn for nested plain object state access', () => {
        const doc = createDocument(`export default {
  computed: {
    t1() { return this.$store.state.preferences.theme; },
    t2() { return this.$store.state.preferences.theme2; }
  }
}`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Second-level dot chain should not produce warnings');
    });

    it('should not warn for second-level dot chain even in known module', () => {
        // cart 是已知模块，但点号链第二层也不诊断——无法区分模块与普通对象
        const doc = createDocument(`export default {
  computed: {
    t() { return this.$store.state.cart.noSuchField; }
  }
}`, '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Second-level dot chain should not produce warnings');
    });

    // ---- rootState / rootGetters 内部引用 ----
    it('should not warn for valid rootState dot access', () => {
        const doc = createDocument(`export default {
  getters: {
    myGetter(state, getters, rootState) { return rootState.count; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid rootState dot access', () => {
        const doc = createDocument(`export default {
  getters: {
    myGetter(state, getters, rootState) { return rootState.noSuch; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('noSuch')), 'Expected warning for noSuch');
    });

    it('should not warn for valid rootState namespaced dot access', () => {
        const doc = createDocument(`export default {
  getters: {
    myGetter(state, getters, rootState) { return rootState.cart.items; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should not warn for valid rootGetters dot access', () => {
        const doc = createDocument(`export default {
  getters: {
    myGetter(state, getters, rootState, rootGetters) { return rootGetters.total; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid rootGetters dot access', () => {
        const doc = createDocument(`export default {
  getters: {
    myGetter(state, getters, rootState, rootGetters) { return rootGetters.noSuchGetter; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('noSuchGetter')), 'Expected warning for noSuchGetter');
    });

    it('should not warn for valid rootGetters bracket access', () => {
        const doc = createDocument(`export default {
  actions: {
    myAction({ rootGetters }) { return rootGetters['cart/cartTotal']; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid rootGetters bracket access', () => {
        const doc = createDocument(`export default {
  actions: {
    myAction({ rootGetters }) { return rootGetters['cart/noSuch']; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('noSuch')), 'Expected warning for noSuch');
    });

    it('should not match context.rootState member access', () => {
        const doc = createDocument(`export default {
  actions: {
    myAction(context) { return context.rootState.count; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'context.rootState should not trigger diagnostics');
    });

    it('should warn for invalid context.rootState dot access', () => {
        const doc = createDocument(`export default {
  actions: {
    myAction(context) { return context.rootState.noSuchRoot; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('noSuchRoot')), 'Expected warning for invalid context.rootState access');
    });

    it('should not warn for context.rootState dot access in non-store file', () => {
        const doc = createDocument(`function helper(context) { return context.rootState.noSuchRoot; }`, '/mock/workspace/src/components/App.vue');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Non-store context.rootState should be ignored');
    });

    it('should warn for invalid context.rootGetters dot access', () => {
        const doc = createDocument(`export default {
  actions: {
    myAction(context) { return context.rootGetters.noSuchGetter; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('noSuchGetter')), 'Expected warning for invalid context.rootGetters access');
    });

    // ---- store 内部裸 state.xxx 访问 ----
    it('should not warn for valid internal state access in module file', () => {
        const doc = createDocument(`const mutations = {
  SET_ITEMS(state) { state.items = []; }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid internal state access in module file', () => {
        const doc = createDocument(`const mutations = {
  doSomething(state) { state.noSuchField = 1; }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('noSuchField')), 'Expected warning for noSuchField');
    });

    it('should not warn for valid internal state access in root store file', () => {
        const doc = createDocument(`export default {
  mutations: {
    increment(state) { state.count++; }
  }
}`, '/mock/workspace/store/index.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid internal state access in root store file', () => {
        const doc = createDocument(`export default {
  mutations: {
    doSomething(state) { state.ghostField = 1; }
  }
}`, '/mock/workspace/store/index.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('ghostField')), 'Expected warning for ghostField');
    });

    it('should not scan internal state in non-store files', () => {
        // 非 store 文件中的 state.xxx 不应触发诊断
        const doc = createDocument(`function foo(state) { state.whatever = 1; }`,
            '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Non-store file should not scan internal state');
    });

    it('should not warn for shadowed local state variable in store file', () => {
        const doc = createDocument(`function helper() {
  const state = { tmp: 1 };
  return state.tmp;
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should not warn for bare state access when action context omits state binding', () => {
        const doc = createDocument(`export default {
  actions: {
    myAction({}) { return state.noSuchField; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Bare state without binding should be ignored');
    });

    it('should warn for invalid context.state access in module file', () => {
        const doc = createDocument(`export default {
  actions: {
    myAction(context) { return context.state.noSuchField; }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('noSuchField')), 'Expected warning for invalid context.state access');
    });

    it('should not warn for context.state access in non-store file', () => {
        const doc = createDocument(`function helper(context) { return context.state.noSuchField; }`, '/mock/workspace/src/components/App.vue');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Non-store context.state should be ignored');
    });

    it('should not warn for valid bare commit in store action context', () => {
        const doc = createDocument(`export default {
  actions: {
    addItem({ commit }) {
      commit('ADD_ITEM');
    }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should not warn for valid context.commit in store action context', () => {
        const doc = createDocument(`export default {
  actions: {
    addItem(context) {
      context.commit('ADD_ITEM');
    }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should not warn for valid context optional-chain commit in store action context', () => {
        const doc = createDocument(`export default {
  actions: {
    addItem(context) {
      context?.commit('ADD_ITEM');
    }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should not warn for context.commit in non-store file', () => {
        const doc = createDocument(`function helper(context) { context.commit('NO_SUCH'); }`, '/mock/workspace/src/components/App.vue');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Non-store context.commit should be ignored');
    });

    it('should ignore bare commit when action context omits commit binding', () => {
        const doc = createDocument(`export default {
  actions: {
    addItem({}) {
      commit('NO_SUCH');
    }
  }
}`, '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Bare commit without binding should be ignored');
    });

    // ---- 内部 getters.xxx 访问 ----
    it('should not warn for valid internal getters access in module file', () => {
        const doc = createDocument(
            `const g = (state, getters) => getters.cartTotal`,
            '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join(', ')}`);
    });

    it('should warn for invalid internal getters access in module file', () => {
        const doc = createDocument(
            `const g = (state, getters) => getters.nonExistent`,
            '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.length > 0, 'Should warn for invalid getters access');
        assert.ok(diags[0].message.includes('nonExistent'));
    });

    it('should not scan internal getters in non-store files', () => {
        const doc = createDocument(
            `const result = getters.nonExistent`,
            '/mock/workspace/src/App.js');
        const diags = provider.diagnose(doc);
        assert.strictEqual(diags.length, 0, 'Non-store file should not scan internal getters');
    });

    it('should warn for invalid context.getters access in module file', () => {
        const doc = createDocument(
            `export default {
  actions: {
    myAction(context) { return context.getters.nonExistent; }
  }
}`,
            '/mock/workspace/store/modules/cart.js');
        const diags = provider.diagnose(doc);
        assert.ok(diags.some(d => d.message.includes('nonExistent')), 'Expected warning for invalid context.getters access');
    });
});
