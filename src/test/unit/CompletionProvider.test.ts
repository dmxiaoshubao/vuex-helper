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
            mutations: [],
            actions: []
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
        // 1. insertText should be just the name "count" (no quotes)
        assert.strictEqual(countItem.insertText, 'count', 'Insert text should be property name without quotes');

        // 2. Kind should be Field
        // assert.strictEqual(countItem.kind, vscode.CompletionItemKind.Field); // Mock kind check might be tricky if not exported

        // 3. Range should NOT replace the dot
        // The text is "... state."
        // prefix is "state."
        // currentWordLength should be 0 (as dot is a delimiter and we stop at it)
        // So range should be (line, 36, line, 36) -> empty range at cursor

        // Verify range
        const range = countItem.range as any;
        assert.strictEqual(range.start.character, 36);
        assert.strictEqual(range.end.character, 36);
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

        // This fails if isPropertyAccess is false
        assert.strictEqual(countItem.insertText, 'count', 'Insert text should be property name without quotes even with partial input');
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
});
