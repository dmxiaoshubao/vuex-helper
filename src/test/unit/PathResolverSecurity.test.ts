import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PathResolver } from '../../utils/PathResolver';

describe('PathResolver Security', () => {
    function createWorkspace(): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-pathresolver-'));
        // macOS 上 /var 是 /private/var 的符号链接，realpathSync 确保路径一致
        const realRoot = fs.realpathSync(root);
        fs.mkdirSync(path.join(realRoot, 'src', 'store'), { recursive: true });
        fs.writeFileSync(path.join(realRoot, 'src', 'store', 'index.js'), 'export default {}');
        fs.writeFileSync(path.join(realRoot, 'src', 'main.js'), 'import store from "./store/index"');
        fs.writeFileSync(path.join(realRoot, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                paths: {
                    '@/*': ['src/*']
                }
            }
        }));
        return realRoot;
    }

    it('should resolve alias path inside workspace', async () => {
        const workspace = createWorkspace();
        const resolver = new PathResolver(workspace);
        const resolved = await resolver.resolve('@/store/index', path.join(workspace, 'src', 'main.js'));
        assert.strictEqual(resolved, path.join(workspace, 'src', 'store', 'index.js'));
    });

    it('should block path traversal outside workspace', async () => {
        const workspace = createWorkspace();
        const outside = path.join(workspace, '..', 'outside.js');
        fs.writeFileSync(outside, 'export default 1');

        const resolver = new PathResolver(workspace);
        const resolved = await resolver.resolve('../../outside', path.join(workspace, 'src', 'main.js'));
        assert.strictEqual(resolved, null, 'Resolver should reject paths outside workspace');
    });

    it('should not match alias by loose prefix', async () => {
        const workspace = createWorkspace();
        const resolver = new PathResolver(workspace);

        const resolved = await resolver.resolve('@foo/store/index', path.join(workspace, 'src', 'main.js'));
        assert.strictEqual(resolved, null, 'Alias @/* should not match @foo/*');
    });
});
