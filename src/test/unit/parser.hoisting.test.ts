import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as Module from 'module';

// --- Hack to mock 'vscode' module ---
const originalRequire = Module.prototype.require;
const vscodeMock = require('./vscode-mock');

(Module.prototype as any).require = function(id: string) {
    if (id === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments as any);
};
// ------------------------------------

import { StoreParser } from '../../services/StoreParser';

describe('StoreParser Hoisting Issue', () => {
    const root = path.resolve(__dirname, '../../../test/fixtures/repro');
    const tempFile = path.join(root, 'repro_hoisting.js');

    before(() => {
        if (!fs.existsSync(root)) {
            fs.mkdirSync(root, { recursive: true });
        }
    });

    after(() => {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    });

    it('should identify store even if defined after usage (hoisting)', async () => {
        const parser = new StoreParser(root);
        
        const content = `
            import Vue from 'vue';
            import Vuex from 'vuex';

            Vue.use(Vuex);

            const store = createStore(); 

            store.registerModule('nested', {
                state: { val: 1 }
            });

            function createStore() {
                return new Vuex.Store({
                    state: {}
                });
            }
            
            export default store;
        `;
        
        fs.writeFileSync(tempFile, content);

        const result = await parser.parse(tempFile);
        
        const hasNestedState = result.state.some(s => s.modulePath.includes('nested'));
        assert.ok(hasNestedState, 'Nested module state should be found. If failed, StoreParser missed "registerModule" due to hoisting.');
    });
});
