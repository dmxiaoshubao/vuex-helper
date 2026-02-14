import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PathResolver } from '../../utils/PathResolver';

describe('PathResolver Security', () => {
    function createWorkspace(): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-pathresolver-'));
        fs.mkdirSync(path.join(root, 'src', 'store'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'store', 'index.js'), 'export default {}');
        fs.writeFileSync(path.join(root, 'src', 'main.js'), 'import store from "./store/index"');
        fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                paths: {
                    '@/*': ['src/*']
                }
            }
        }));
        return root;
    }

    it('should resolve alias path inside workspace', () => {
        const workspace = createWorkspace();
        const resolver = new PathResolver(workspace);
        const resolved = resolver.resolve('@/store/index', path.join(workspace, 'src', 'main.js'));
        assert.strictEqual(resolved, path.join(workspace, 'src', 'store', 'index.js'));
    });

    it('should block path traversal outside workspace', () => {
        const workspace = createWorkspace();
        const outside = path.join(workspace, '..', 'outside.js');
        fs.writeFileSync(outside, 'export default 1');

        const resolver = new PathResolver(workspace);
        const resolved = resolver.resolve('../../outside', path.join(workspace, 'src', 'main.js'));
        assert.strictEqual(resolved, null, 'Resolver should reject paths outside workspace');
    });
});
