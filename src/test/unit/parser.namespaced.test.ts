import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { StoreParser } from '../../services/StoreParser';

function createWorkspace(files: Record<string, string>): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-parser-ns-')));
    for (const [relativePath, content] of Object.entries(files)) {
        const absPath = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content);
    }
    return root;
}

function removeWorkspace(root: string): void {
    fs.rmSync(root, { recursive: true, force: true });
}

describe('Vuex Parser Namespaced Inheritance', () => {
    it('should inherit asset namespace from a namespaced parent while keeping structural state path', async () => {
        const root = createWorkspace({
            'package.json': JSON.stringify({ dependencies: { vuex: '^3.6.2' } }),
            'src/store/index.js': `
                import Vue from 'vue';
                import Vuex from 'vuex';
                import account from './modules/account/index.js';
                Vue.use(Vuex);
                export default new Vuex.Store({
                  modules: { account }
                });
            `,
            'src/store/modules/account/index.js': `
                import profile from './profile.js';
                export default {
                  namespaced: true,
                  state: { ready: true },
                  getters: {
                    readyLabel: () => 'ready',
                  },
                  mutations: {
                    SET_READY() {},
                  },
                  actions: {
                    loadAccount() {},
                  },
                  modules: { profile },
                };
            `,
            'src/store/modules/account/profile.js': `
                export default {
                  state: { name: 'guest' },
                  getters: {
                    fullName: (state) => state.name,
                  },
                  mutations: {
                    SET_NAME() {},
                  },
                  actions: {
                    rename() {},
                  },
                };
            `,
        });

        try {
            const parser = new StoreParser(root);
            const profilePath = path.join(root, 'src/store/modules/account/profile.js');
            const storeMap = await parser.parse(path.join(root, 'src/store/index.js'));
            const profileState = storeMap.state.find((item) =>
                item.name === 'name' && item.defLocation.uri.fsPath === profilePath
            );
            const profileGetter = storeMap.getters.find((item) => item.name === 'fullName' && item.modulePath.join('/') === 'account');
            const inheritedMutation = storeMap.mutations.find((item) => item.name === 'SET_NAME' && item.modulePath.join('/') === 'account');
            const inheritedAction = storeMap.actions.find((item) => item.name === 'rename' && item.modulePath.join('/') === 'account');
            const structuralMutation = storeMap.mutations.find((item) => item.name === 'SET_NAME' && item.modulePath.join('/') === 'account/profile');
            const globalAction = storeMap.actions.find((item) => item.name === 'rename' && item.modulePath.length === 0);

            assert.deepStrictEqual(parser.getNamespace(profilePath), ['account', 'profile']);
            assert.deepStrictEqual(parser.getAssetNamespace(profilePath), ['account']);
            assert.deepStrictEqual(profileState?.modulePath, ['account', 'profile']);
            assert.ok(profileGetter, 'Child getter should inherit parent namespace');
            assert.ok(inheritedMutation, 'Child mutation should inherit parent namespace');
            assert.ok(inheritedAction, 'Child action should inherit parent namespace');
            assert.strictEqual(structuralMutation, undefined, 'Child mutation should not use structural path as namespace');
            assert.strictEqual(globalAction, undefined, 'Inherited child action should not leak to global namespace');
        } finally {
            removeWorkspace(root);
        }
    });

    it('should keep child assets global when no ancestor contributes a namespace', async () => {
        const root = createWorkspace({
            'package.json': JSON.stringify({ dependencies: { vuex: '^3.6.2' } }),
            'src/store/index.js': `
                import Vue from 'vue';
                import Vuex from 'vuex';
                import account from './modules/account/index.js';
                Vue.use(Vuex);
                export default new Vuex.Store({
                  modules: { account }
                });
            `,
            'src/store/modules/account/index.js': `
                import profile from './profile.js';
                export default {
                  state: { ready: true },
                  modules: { profile },
                };
            `,
            'src/store/modules/account/profile.js': `
                export default {
                  state: { name: 'guest' },
                  mutations: {
                    SET_NAME() {},
                  },
                  actions: {
                    rename() {},
                  },
                };
            `,
        });

        try {
            const parser = new StoreParser(root);
            const profilePath = path.join(root, 'src/store/modules/account/profile.js');
            const storeMap = await parser.parse(path.join(root, 'src/store/index.js'));
            const profileState = storeMap.state.find((item) =>
                item.name === 'name' && item.defLocation.uri.fsPath === profilePath
            );
            const globalMutation = storeMap.mutations.find((item) => item.name === 'SET_NAME' && item.modulePath.length === 0);
            const globalAction = storeMap.actions.find((item) => item.name === 'rename' && item.modulePath.length === 0);
            const inheritedMutation = storeMap.mutations.find((item) => item.name === 'SET_NAME' && item.modulePath.join('/') === 'account');
            const inheritedAction = storeMap.actions.find((item) => item.name === 'rename' && item.modulePath.join('/') === 'account');

            assert.deepStrictEqual(parser.getNamespace(profilePath), ['account', 'profile']);
            assert.deepStrictEqual(parser.getAssetNamespace(profilePath), []);
            assert.deepStrictEqual(profileState?.modulePath, ['account', 'profile']);
            assert.ok(globalMutation, 'Non-namespaced child mutation should stay global');
            assert.ok(globalAction, 'Non-namespaced child action should stay global');
            assert.strictEqual(inheritedMutation, undefined, 'Non-namespaced child mutation should not gain parent namespace');
            assert.strictEqual(inheritedAction, undefined, 'Non-namespaced child action should not gain parent namespace');
        } finally {
            removeWorkspace(root);
        }
    });
});

describe('Vuex Parser Root Action Registration', () => {
    it('should index object-style root actions from namespaced modules as root actions', async () => {
        const root = createWorkspace({
            'package.json': JSON.stringify({ dependencies: { vuex: '^3.6.2' } }),
            'src/store/index.js': `
                import Vue from 'vue';
                import Vuex from 'vuex';
                import user from './modules/user.js';
                Vue.use(Vuex);
                export default new Vuex.Store({
                  modules: { user }
                });
            `,
            'src/store/modules/user.js': `
                const saveHandler = () => {};
                export default {
                  namespaced: true,
                  actions: {
                    publishProfile: {
                      root: true,
                      handler: saveHandler,
                    },
                    updateProfile: {
                      root: false,
                      handler() {},
                    },
                    fetchProfile() {},
                  },
                };
            `,
        });

        try {
            const parser = new StoreParser(root);
            const storeMap = await parser.parse(path.join(root, 'src/store/index.js'));

            const rootRegistered = storeMap.actions.find((item) => item.name === 'publishProfile' && item.modulePath.length === 0);
            const namespacedRegistered = storeMap.actions.find((item) => item.name === 'publishProfile' && item.modulePath.join('/') === 'user');
            const scopedDescriptor = storeMap.actions.find((item) => item.name === 'updateProfile' && item.modulePath.join('/') === 'user');
            const leakedScopedDescriptor = storeMap.actions.find((item) => item.name === 'updateProfile' && item.modulePath.length === 0);
            const regularAction = storeMap.actions.find((item) => item.name === 'fetchProfile' && item.modulePath.join('/') === 'user');

            assert.ok(rootRegistered, 'root:true action descriptor should register as a root action');
            assert.strictEqual(namespacedRegistered, undefined, 'root:true action descriptor should not remain namespaced');
            assert.ok(scopedDescriptor, 'root:false action descriptor should remain namespaced');
            assert.strictEqual(leakedScopedDescriptor, undefined, 'root:false action descriptor should not leak to root');
            assert.ok(regularAction, 'Regular action methods should keep their namespaced registration');
        } finally {
            removeWorkspace(root);
        }
    });
});
