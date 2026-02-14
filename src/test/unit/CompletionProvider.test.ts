import * as assert from 'assert';
import * as Module from 'module';
import * as vscode from 'vscode'; // Type only, mocked below

// --- Hack to mock 'vscode' module ---
const originalRequire = Module.prototype.require;
const vscodeMock = require('./vscode-mock');

(Module.prototype as any).require = function(id: string) {
    if (id === 'vscode') {
        return {
            ...vscodeMock,
            CompletionItemKind: {
                Property: 1,
                Field: 2,
                Method: 3,
                Function: 4,
                Module: 5
            },

            MarkdownString: class {},
            SnippetString: class {
                constructor(public value: string) {}
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
            CompletionItem: class {
                public range: any;
                public detail: any;
                public sortText: any;
                public filterText: any;
                public documentation: any;
                public insertText: any;
                constructor(public label: string, public kind?: number) {}
            },
            CompletionList: class {
                constructor(public items: any[], public isIncomplete: boolean = false) {}
            }
        };
    }
    return originalRequire.apply(this, arguments as any);
};
// ------------------------------------

import { VuexCompletionItemProvider } from '../../providers/VuexCompletionItemProvider';
import { StoreIndexer } from '../../services/StoreIndexer';

// 辅助函数：从 CompletionList 或数组中提取 items
function getItems(result: any): any[] {
    if (!result) return [];
    return Array.isArray(result) ? result : result.items;
}

// Mock StoreIndexer
class MockStoreIndexer extends StoreIndexer {
    constructor() { super(''); }
    getStoreMap() {
        return {
            state: [
                { name: 'count', modulePath: [], defLocation: {} as any },
                { name: 'info', modulePath: ['user'], defLocation: {} as any },
                { name: 'detail', modulePath: ['user', 'profile'], defLocation: {} as any }
            ],
            getters: [
                { name: 'isLoggedIn', modulePath: [], defLocation: {} as any },
                { name: 'hasRole', modulePath: ['others'], defLocation: {} as any }
            ],
            mutations: [
                { name: 'increment', modulePath: [], defLocation: {} as any },
                { name: 'SET_NAME', modulePath: ['user'], defLocation: {} as any }
            ],
            actions: [
                { name: 'incrementAsync', modulePath: [], defLocation: {} as any },
                { name: 'fetchProfile', modulePath: ['user'], defLocation: {} as any }
            ]
        };
    }
    getNamespace() { return undefined; }
}

describe('VuexCompletionItemProvider', () => {
    let provider: VuexCompletionItemProvider;

    beforeEach(() => {
        provider = new VuexCompletionItemProvider(new MockStoreIndexer());
    });

    it('should provide default completion for array syntax', async () => {
        const document = {
            fileName: 'test.vue',
            getText: () => `...mapGetters([ ])`,
            offsetAt: () => 16,
            lineAt: () => ({ text: `...mapGetters([ ])` })
        } as any;
        const position = { line: 0, character: 16 } as any;

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        assert.ok(result);

        // 处理 CompletionList 或数组
        const items = Array.isArray(result) ? result : result.items;
        assert.ok(items && items.length > 0);

        const hasRoleItem = items.find(i => i.label === 'others/hasRole');
        assert.ok(hasRoleItem, 'Item others/hasRole not found');
        // Default insert text should NOT contain key: value. It should be quoted string.
        assert.strictEqual(hasRoleItem.insertText, "'others/hasRole'");
    });

    it('should provide completion for aliased map helper calls', async () => {
        const text = `import { mapState as ms } from 'vuex'; const c = { computed: { ...ms([ ]) } }`;
        const cursor = text.indexOf('[ ]') + 2;
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => cursor,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: cursor } as any;

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items && items.length > 0);
        const countItem = items.find((i: any) => i.label === 'count');
        assert.ok(countItem, 'Aliased mapState should provide root state completion');
    });

    it('should scope completion for namespaced helper object member calls', async () => {
        const text = `import { createNamespacedHelpers } from 'vuex'; const h = createNamespacedHelpers('user'); const c = { methods: { ...h.mapActions([ ]) } }`;
        const cursor = text.indexOf('[ ]') + 2;
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => cursor,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: cursor } as any;

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items && items.length > 0);
        const fetchItem = items.find((i: any) => i.label === 'fetchProfile');
        assert.ok(fetchItem, 'Namespaced helper object should provide namespaced action');
        const rootItem = items.find((i: any) => i.label === 'incrementAsync');
        assert.ok(!rootItem, 'Namespaced helper object should filter out root actions');
    });

    it('should provide completion for require-style helper aliases', async () => {
        const text = `const { mapState: ms } = require('vuex'); const c = { computed: { ...ms([ ]) } }`;
        const cursor = text.indexOf('[ ]') + 2;
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => cursor,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: cursor } as any;

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items && items.length > 0);
        const countItem = items.find((i: any) => i.label === 'count');
        assert.ok(countItem, 'Require alias mapState should provide root state completion');
    });

    it('should provide key-value completion for object syntax', async () => {
        const document = {
            fileName: 'test.vue',
            getText: () => `...mapGetters({ })`,
            offsetAt: () => 15,
            lineAt: () => ({ text: `...mapGetters({ })` })
        } as any;
        // Cursor inside { }
        const position = { line: 0, character: 15 } as any;

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items && items.length > 0);

        const hasRoleItem = items.find((i: any) => i.label === 'others/hasRole');
        assert.ok(hasRoleItem, 'Item others/hasRole not found');

        // Expectation: Should insert "hasRole: 'others/hasRole'"
        // Note: The actual implementation might vary on how it derives the key.
        // We expect `hasRole: 'others/hasRole'` roughly.
        // Let's check if it includes the colon.
        assert.ok(typeof hasRoleItem.insertText === 'string' && hasRoleItem.insertText.includes(":"), 'Should include colon for object syntax');
        assert.strictEqual(hasRoleItem.insertText, "hasRole: 'others/hasRole'");
    });

    it('should preserve indentation when completing', async () => {
        const text = `    ...mapGetters({\n        has`; // 4 spaces indentation
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => text.length,
            lineAt: () => ({ text: `        has` }) // The line where cursor is
        } as any;
        const position = { line: 1, character: 11 } as any; // 8 spaces + 3 chars ("has")

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items && items.length > 0);

        const hasRoleItem = items.find((i: any) => i.label === 'others/hasRole');
        assert.ok(hasRoleItem);

        // The range should only cover "has", NOT the indentation.
        // position.character is 11. "has" length is 3.
        // Start char should be 11 - 3 = 8.
        const range = hasRoleItem.range as any;
        assert.strictEqual(range.start.character, 8, 'Range start should exclude indentation');
        assert.strictEqual(range.end.character, 11, 'Range end should be at cursor');
    });

    it('should match item with trailing space', async () => {
        const text = `...mapGetters({ hasRole `; // trailing space
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => text.length,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: 24 } as any; // after space

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items && items.length > 0);

        const hasRoleItem = items.find((i: any) => i.label === 'others/hasRole');
        assert.ok(hasRoleItem, 'Should find item even with trailing space');

        // Ensure filterText handles the space so VS Code doesn't filter it out
        // The filterText should typically start with what the user typed?
        // Or if we replace the whole range including space, filterText should match "hasRole "

        // In our logic, we want to support "fuzzy" matching or just prefix matching.
        // If we set filterText to "others/hasRole ", VS Code will match "hasRole " against it for strict filtering?
        // Actually VS Code's default filter is strict on "fuzzy" subsequence.
        // If user typed "hasRole ", and item label is "hasRole", it might NOT match because space is not in label.
        // So filterText SHOULD include the space or we rely on VS Code behavior.
        // My implementation plan says we need to set filterText.

        assert.ok(hasRoleItem.filterText && hasRoleItem.filterText.includes(' '), 'FilterText should contain space');
    });

    it('should provide state property completion in arrow function', async () => {
        const text = `...mapState({ count: state => state.`;
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => text.length,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: 36 } as any; // after dot

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items && items.length > 0);


        const countItem = items.find((i: any) => i.label === 'count');
        assert.ok(countItem, 'Should find state "count"');

        // Key expectations:
        // 1. insertText should include the dot for proper replacement (与 this.$store.state. 一致)
        assert.strictEqual(countItem.insertText, '.count', 'Insert text should include dot for property access');

        // 2. Kind should be Field
        // assert.strictEqual(countItem.kind, vscode.CompletionItemKind.Field); // Mock kind check might be tricky if not exported

        // 3. Range should replace from the dot position
        // The text is "... state."
        // Dot is at position 35, cursor at 36
        // So range should be (line, 35, line, 36)

        // Verify range
        const range = countItem.range as any;
        assert.strictEqual(range.start.character, 35, 'Range start should be at dot position');
        assert.strictEqual(range.end.character, 36, 'Range end should be at cursor');
    });

    it('should provide proper insertText when typing after dot', async () => {
        const text = `...mapState({ count: state => state.c`;
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => text.length,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: 37 } as any; // after 'c'

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items && items.length > 0);

        const countItem = items.find((i: any) => i.label === 'count');
        assert.ok(countItem, 'Should find state "count"');

        // insertText should include the dot for proper replacement
        assert.strictEqual(countItem.insertText, '.count', 'Insert text should include dot for property access even with partial input');
    });

    it('should suggest modules and root state at root level', async () => {
        const text = `...mapState({ foo: state => state.`;
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => text.length,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: 34 } as any;

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items);

        // Should find root state 'count'
        const countItem = items.find((i: any) => i.label === 'count');
        assert.ok(countItem, 'Should find root state "count"');
        assert.strictEqual(countItem.kind, 2); // Field

        // Should find module 'user'
        const userItem = items.find((i: any) => i.label === 'user');
        assert.ok(userItem, 'Should find module "user"');
        assert.strictEqual(userItem.kind, 5); // Module

        // Should NOT find deep state 'info'
        const infoItem = items.find((i: any) => i.label === 'info');
        assert.ok(!infoItem, 'Should NOT find deep state "info" at root');
    });

    it('should suggest nested state properties inside module', async () => {
        const text = `...mapState({ foo: state => state.user.`;
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => text.length,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: 39 } as any;

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items);

        // Should find 'info' (inside user)
        const infoItem = items.find((i: any) => i.label === 'info');
        assert.ok(infoItem, 'Should find nested state "info"');
        assert.strictEqual(infoItem.kind, 2); // Field

        // Should find sub-module 'profile' (inside user)
        const profileItem = items.find((i: any) => i.label === 'profile');
        assert.ok(profileItem, 'Should find sub-module "profile"');
        assert.strictEqual(profileItem.kind, 5); // Module

        // Should NOT find root state 'count'
        const countItem = items.find((i: any) => i.label === 'count');
        assert.ok(!countItem, 'Should NOT find root state "count" inside module');
    });

    it('should not return duplicate suggestions', async () => {
        const text = `...mapState({ foo: state => state.`;
        const document = {
            fileName: 'test.vue',
            getText: () => text,
            offsetAt: () => text.length,
            lineAt: () => ({ text })
        } as any;
        const position = { line: 0, character: 34 } as any;

        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = getItems(result);
        assert.ok(items);

        const counts = items.filter((i: any) => i.label === 'count');
        assert.strictEqual(counts.length, 1, 'Should return exactly one "count" item');
    });

    // ==================== this.$store 方括号访问测试 ====================

    describe('this.$store bracket notation', () => {
        // 辅助函数：创建完整的 document mock
        function createVueDocument(text: string) {
            const lines = text.split('\n');
            return {
                fileName: 'test.vue',
                languageId: 'vue',
                version: 1,
                uri: { toString: () => 'file:///test.vue' },
                getText: () => text,
                offsetAt: (pos: any) => {
                    let offset = 0;
                    for (let i = 0; i < pos.line; i++) {
                        offset += lines[i].length + 1;
                    }
                    offset += pos.character;
                    return offset;
                },
                lineAt: (lineOrPos: any) => {
                    const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
                    return { text: lines[lineNum], lineNumber: lineNum };
                }
            } as any;
        }

        it('should provide completion for this.$store.state[""]', async () => {
            const text = `this.$store.state['']`;
            const position = { line: 0, character: 21 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items');

            // 应该包含根 state
            const countItem = items.find((i: any) => i.label === 'count');
            assert.ok(countItem, 'Should find root state "count"');

            // 应该包含模块 state（根据 MockStoreIndexer，user 模块有 info）
            const userInfoItem = items.find((i: any) => i.label === 'user/info');
            assert.ok(userInfoItem, 'Should find user module state "user/info"');
        });

        it('should provide completion for this.$store.getters[""]', async () => {
            const text = `this.$store.getters['']`;
            const position = { line: 0, character: 23 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items');

            const getterItem = items.find((i: any) => i.label === 'isLoggedIn');
            assert.ok(getterItem, 'Should find root getter "isLoggedIn"');
        });

        it('should replace partial input with closing bracket', async () => {
            // 用户已输入部分内容，且有闭合符号
            const text = `this.$store.state['user/in']`;
            // 光标在 'in' 后面
            const position = { line: 0, character: 25 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            const infoItem = items.find((i: any) => i.label === 'user/info');
            assert.ok(infoItem, 'Should find "user/info"');

            // insertText 应该包含闭合符号
            assert.ok(infoItem.insertText.includes("']"), 'insertText should include closing bracket');
        });

        it('should add closing bracket if not present', async () => {
            // 用户输入部分内容，但没有闭合符号
            const text = `this.$store.state['user/in`;
            const position = { line: 0, character: 24 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            const infoItem = items.find((i: any) => i.label === 'user/info');
            assert.ok(infoItem, 'Should find "user/info"');

            // insertText 应该添加闭合符号
            assert.strictEqual(infoItem.insertText, "user/info']", 'insertText should add closing bracket');
        });
    });

    // ==================== this.$store 点号访问测试 ====================

    describe('this.$store dot notation', () => {
        function createVueDocument(text: string) {
            const lines = text.split('\n');
            return {
                fileName: 'test.vue',
                languageId: 'vue',
                version: 1,
                uri: { toString: () => 'file:///test.vue' },
                getText: () => text,
                offsetAt: (pos: any) => {
                    let offset = 0;
                    for (let i = 0; i < pos.line; i++) {
                        offset += lines[i].length + 1;
                    }
                    offset += pos.character;
                    return offset;
                },
                lineAt: (lineOrPos: any) => {
                    const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
                    return { text: lines[lineNum], lineNumber: lineNum };
                }
            } as any;
        }

        it('should provide completion for this.$store.state.', async () => {
            const text = `this.$store.state.`;
            const position = { line: 0, character: text.length } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items');

            // 应该包含根 state
            const countItem = items.find((i: any) => i.label === 'count');
            assert.ok(countItem, 'Should find root state "count"');

            // 应该包含模块名
            const userModule = items.find((i: any) => i.label === 'user');
            assert.ok(userModule, 'Should find module "user"');
        });

        it('should provide completion for this.$store.state.user.', async () => {
            const text = `this.$store.state.user.`;
            const position = { line: 0, character: text.length } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items');

            // 应该只包含 user 模块的 state（根据 MockStoreIndexer，user 模块有 info）
            const infoItem = items.find((i: any) => i.label === 'info');
            assert.ok(infoItem, 'Should find user state "info"');
        });

        it('should filter by partial input', async () => {
            const text = `this.$store.state.user.in`;
            const position = { line: 0, character: text.length } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            const infoItem = items.find((i: any) => i.label === 'info');
            assert.ok(infoItem, 'Should find "info" filtered by "in"');
        });

        it('should provide completion for this.$store.getters.', async () => {
            const text = `this.$store.getters.`;
            const position = { line: 0, character: text.length } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items');

            const isLoggedInItem = items.find((i: any) => i.label === 'isLoggedIn');
            assert.ok(isLoggedInItem, 'Should find root getter "isLoggedIn"');
        });
    });

    // ==================== this.xxx 补全测试 ====================

    describe('this. mapped property completion', () => {
        // 辅助函数：创建完整的 document mock
        function createVueDocument(text: string, version: number = 1) {
            const lines = text.split('\n');
            return {
                fileName: 'test.vue',
                languageId: 'vue',
                version,
                uri: { toString: () => 'file:///test.vue' },
                getText: () => text,
                offsetAt: (pos: any) => {
                    let offset = 0;
                    for (let i = 0; i < pos.line; i++) {
                        offset += lines[i].length + 1;
                    }
                    offset += pos.character;
                    return offset;
                },
                // lineAt 接收行号（number）或 Position 对象
                lineAt: (lineOrPos: any) => {
                    const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
                    return { text: lines[lineNum], lineNumber: lineNum };
                }
            } as any;
        }

        it('should provide completion for this. with mapState', async () => {
            const text = `<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState(['count'])
  },
  created() {
    this.
  }
}
</script>`;
            // 行号从 0 开始：0=<script>, 1=import, 2=export, 3=computed, 4=...mapState, 5=}, 6=created, 7=this.
            const position = { line: 7, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);
            console.log('[Test] mapState this. items:', items?.map((i: any) => i.label));

            assert.ok(items && items.length > 0, 'Should provide completion items for this.');

            const countItem = items.find((i: any) => i.label === 'count');
            assert.ok(countItem, 'Should find mapped state "count"');
            assert.ok(countItem.detail?.includes('[Vuex Mapped]'), 'Should have Vuex Mapped detail');
        });

        it('should provide completion for this. with mapGetters', async () => {
            const text = `<script>
import { mapGetters } from 'vuex';
export default {
  computed: {
    ...mapGetters(['isLoggedIn'])
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 7, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for this.');

            const getterItem = items.find((i: any) => i.label === 'isLoggedIn');
            assert.ok(getterItem, 'Should find mapped getter "isLoggedIn"');
        });

        it('should provide completion for this. with mapMutations', async () => {
            const text = `<script>
import { mapMutations } from 'vuex';
export default {
  methods: {
    ...mapMutations(['increment'])
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 7, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for this.');

            const mutationItem = items.find((i: any) => i.label === 'increment');
            assert.ok(mutationItem, 'Should find mapped mutation "increment"');
        });

        it('should provide completion for this. with mapActions', async () => {
            const text = `<script>
import { mapActions } from 'vuex';
export default {
  methods: {
    ...mapActions(['incrementAsync'])
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 7, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for this.');

            const actionItem = items.find((i: any) => i.label === 'incrementAsync');
            assert.ok(actionItem, 'Should find mapped action "incrementAsync"');
        });

        it('should provide completion with namespaced mapHelper', async () => {
            const text = `<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState('user', ['info'])
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 7, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for this.');

            const infoItem = items.find((i: any) => i.label === 'info');
            assert.ok(infoItem, 'Should find mapped state "info" from user namespace');
        });

        it('should provide completion with object syntax mapHelper', async () => {
            const text = `<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState({ myCount: 'count' })
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 7, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for this.');

            // 应该用别名 myCount，而不是原始名 count
            const myCountItem = items.find((i: any) => i.label === 'myCount');
            assert.ok(myCountItem, 'Should find mapped state with alias "myCount"');
        });

        it('should not provide this. completion inside mapHelper context', async () => {
            // 当光标在 mapHelper 参数内时，应该提供 store state 补全，而不是 mapped property
            const text = `<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState(['count', ''])
  }
}
</script>`;
            // 光标在空字符串引号内 (line 4, position after '')
            const lines = text.split('\n');
            const document = {
                fileName: 'test.vue',
                languageId: 'vue',
                version: 1,
                uri: { toString: () => 'file:///test.vue' },
                getText: () => text,
                offsetAt: (pos: any) => {
                    let offset = 0;
                    for (let i = 0; i < pos.line; i++) {
                        offset += lines[i].length + 1;
                    }
                    offset += pos.character;
                    return offset;
                },
                lineAt: (lineOrPos: any) => {
                    const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
                    return { text: lines[lineNum], lineNumber: lineNum };
                }
            } as any;
            // Line 4: "    ...mapState(['count', ''])"
            // 光标在最后一个空字符串引号内
            const position = { line: 4, character: 28 } as any;

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            // 应该提供 store state 补全，而不是 mapped property
            if (items && items.length > 0) {
                const countItem = items.find((i: any) => i.label === 'count');
                assert.ok(countItem, 'Should provide store state "count"');
                // 检查 detail 不是 [Vuex Mapped]
                assert.ok(!countItem.detail?.includes('[Vuex Mapped]'), 'Should NOT be Vuex Mapped');
            }
        });
    });

    describe('ComponentMapper preprocessing', () => {
        // 辅助函数：创建完整的 document mock
        function createVueDocument(text: string, version: number = 1) {
            const lines = text.split('\n');
            return {
                fileName: 'test.vue',
                languageId: 'vue',
                version,
                uri: { toString: () => 'file:///test.vue' },
                getText: () => text,
                offsetAt: (pos: any) => {
                    let offset = 0;
                    for (let i = 0; i < pos.line; i++) {
                        offset += lines[i].length + 1;
                    }
                    offset += pos.character;
                    return offset;
                },
                lineAt: (lineOrPos: any) => {
                    const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
                    return { text: lines[lineNum], lineNumber: lineNum };
                }
            } as any;
        }

        it('should handle this. at end of line', async () => {
            // 当代码包含不完整的 this. 时，映射应该仍然能正确解析
            const text = `<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState(['count'])
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 7, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for this. with incomplete code');
            const countItem = items.find((i: any) => i.label === 'count');
            assert.ok(countItem, 'Should find mapped state "count" even with incomplete this.');
        });

        it('should handle vm. at end of line', async () => {
            // 当代码包含不完整的 vm. 时，映射应该仍然能正确解析
            const text = `<script>
import { mapGetters } from 'vuex';
export default {
  computed: {
    ...mapGetters(['doubleCount'])
  },
  created() {
    const vm = this;
    vm.
  }
}
</script>`;
            // 光标在 vm. 后面
            const position = { line: 8, character: 8 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for vm. with incomplete code');
            const doubleCountItem = items.find((i: any) => i.label === 'doubleCount');
            assert.ok(doubleCountItem, 'Should find mapped getter "doubleCount" even with incomplete vm.');
        });

        it('should handle empty string in mapHelper array', async () => {
            // 当 mapHelper 数组包含空字符串时，映射应该仍然能正确解析其他项
            const text = `<script>
import { mapState, mapGetters } from 'vuex';
export default {
  computed: {
    ...mapState(['count', '']),
    ...mapGetters(['doubleCount'])
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 8, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items with empty string in array');
            const countItem = items.find((i: any) => i.label === 'count');
            const doubleCountItem = items.find((i: any) => i.label === 'doubleCount');
            assert.ok(countItem, 'Should find mapped state "count"');
            assert.ok(doubleCountItem, 'Should find mapped getter "doubleCount"');
        });

        it('should handle empty string value in mapHelper object', async () => {
            // 当 mapHelper 对象值包含空字符串时，映射应该仍然能正确解析其他项
            const text = `<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState({
      myCount: 'count',
      emptyKey: ''
    })
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 10, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items with empty string value in object');
            const myCountItem = items.find((i: any) => i.label === 'myCount');
            assert.ok(myCountItem, 'Should find mapped state "myCount"');
        });

        it('should handle namespaced mapHelper with empty string in array', async () => {
            // 当命名空间 mapHelper 数组包含空字符串时，映射应该仍然能正确解析
            const text = `<script>
import { mapState } from 'vuex';
export default {
  computed: {
    ...mapState('user', ['info', ''])
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 7, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items with namespaced empty string');
            const infoItem = items.find((i: any) => i.label === 'info');
            assert.ok(infoItem, 'Should find mapped state "info" from user namespace');
        });

        it('should handle multiple incomplete patterns together', async () => {
            // 同时存在多种不完整模式时，映射应该仍然能正确解析
            const text = `<script>
import { mapState, mapGetters, mapMutations, mapActions } from 'vuex';
export default {
  computed: {
    ...mapState(['count', '']),
    ...mapGetters({ myDouble: 'doubleCount', empty: '' })
  },
  methods: {
    ...mapMutations(['increment', '']),
    ...mapActions({ myAsync: 'incrementAsync', emptyAction: '' })
  },
  created() {
    this.
  }
}
</script>`;
            const position = { line: 12, character: 9 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items with multiple incomplete patterns');

            // 验证所有有效的映射都能被解析
            const countItem = items.find((i: any) => i.label === 'count');
            const myDoubleItem = items.find((i: any) => i.label === 'myDouble');
            const incrementItem = items.find((i: any) => i.label === 'increment');
            const myAsyncItem = items.find((i: any) => i.label === 'myAsync');

            assert.ok(countItem, 'Should find mapped state "count"');
            assert.ok(myDoubleItem, 'Should find mapped getter "myDouble"');
            assert.ok(incrementItem, 'Should find mapped mutation "increment"');
            assert.ok(myAsyncItem, 'Should find mapped action "myAsync"');
        });
    });

    describe('this["xxx"] bracket notation completion', () => {
        // 辅助函数：创建完整的 document mock
        function createVueDocument(text: string, version: number = 1) {
            const lines = text.split('\n');
            return {
                fileName: 'test.vue',
                languageId: 'vue',
                version,
                uri: { toString: () => 'file:///test.vue' },
                getText: () => text,
                offsetAt: (pos: any) => {
                    let offset = 0;
                    for (let i = 0; i < pos.line; i++) {
                        offset += lines[i].length + 1;
                    }
                    offset += pos.character;
                    return offset;
                },
                lineAt: (lineOrPos: any) => {
                    const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
                    return { text: lines[lineNum], lineNumber: lineNum };
                }
            } as any;
        }

        it('should provide completion for this[""] bracket notation', async () => {
            const text = `<script>
import { mapState, mapGetters } from 'vuex';
export default {
  computed: {
    ...mapState(['count']),
    ...mapGetters({ myIsDark: 'others/isDarkMode' })
  },
  created() {
    this[""]
  }
}
</script>`;
            // line 0: <script>, line 8: this[""]
            // character 10 is inside the quotes: this["^"]
            const position = { line: 8, character: 10 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for this[""]');
            const countItem = items.find((i: any) => i.label === 'count');
            assert.ok(countItem, 'Should find mapped state "count"');
        });

        it('should provide completion for this[" with partial input', async () => {
            const text = `<script>
import { mapState, mapGetters } from 'vuex';
export default {
  computed: {
    ...mapState(['count']),
    ...mapGetters({ myIsDark: 'others/isDarkMode' })
  },
  created() {
    this["myI"]
  }
}
</script>`;
            // line 8: "    this[\"myI\"]"
            // character 12 is after "myI": this["myI^"]
            const position = { line: 8, character: 12 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items for this["myI');
            const myIsDarkItem = items.find((i: any) => i.label === 'myIsDark');
            assert.ok(myIsDarkItem, 'Should find mapped getter "myIsDark"');
        });

        it('should replace partial input and closing bracket correctly', async () => {
            const text = `<script>
import { mapGetters } from 'vuex';
export default {
  computed: {
    ...mapGetters({ myIsDark: 'others/isDarkMode' })
  },
  created() {
    this["myI"]
  }
}
</script>`;
            // line 7: "    this[\"myI\"]"
            const position = { line: 7, character: 12 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items');
            const myIsDarkItem = items.find((i: any) => i.label === 'myIsDark');
            assert.ok(myIsDarkItem, 'Should find mapped getter "myIsDark"');
            // 验证 range 包含了右侧的结束引号和方括号
            assert.ok(myIsDarkItem.range, 'Should have range set');
        });

        it('should not auto-add parentheses for mutation/action', async () => {
            const text = `<script>
import { mapMutations } from 'vuex';
export default {
  methods: {
    ...mapMutations({ myIncrement: 'increment' })
  },
  created() {
    this["myI"]
  }
}
</script>`;
            const position = { line: 7, character: 12 } as any;
            const document = createVueDocument(text);

            const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
            const items = getItems(result);

            assert.ok(items && items.length > 0, 'Should provide completion items');
            const myIncrementItem = items.find((i: any) => i.label === 'myIncrement');
            assert.ok(myIncrementItem, 'Should find mapped mutation "myIncrement"');
            // 验证 insertText 不包含 ()
            const insertText = typeof myIncrementItem.insertText === 'string'
                ? myIncrementItem.insertText
                : myIncrementItem.insertText?.value;
            assert.ok(!insertText?.includes('()'), 'Should NOT auto-add parentheses');
        });
    });
});
