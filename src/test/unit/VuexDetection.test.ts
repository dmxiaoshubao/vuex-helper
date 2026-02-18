import * as assert from 'assert';
import * as path from 'path';
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

import { hasVuexDependency } from '../../extension';

describe('hasVuexDependency', () => {
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

    it('should return true for project with vuex dependency', () => {
        const result = hasVuexDependency(path.join(fixturesDir, 'vue2-project'));
        assert.strictEqual(result, true);
    });

    it('should return false for project without vuex dependency', () => {
        const result = hasVuexDependency(path.join(fixturesDir, 'non-vue-project'));
        assert.strictEqual(result, false);
    });

    it('should return true when package.json does not exist (conservative)', () => {
        const result = hasVuexDependency(path.join(fixturesDir, 'nonexistent-dir'));
        assert.strictEqual(result, true);
    });

    it('should return true for simple-project with vuex', () => {
        const result = hasVuexDependency(path.join(fixturesDir, 'simple-project'));
        // simple-project 没有 package.json，应返回 true（保守策略）
        assert.strictEqual(result, true);
    });
});
