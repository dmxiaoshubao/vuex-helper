import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

type HostExtMode = 'isolated' | 'with-vue';

function resolveHostExtMode(): HostExtMode {
    const mode = (process.env.HOST_TEST_EXT_MODE || 'isolated').trim().toLowerCase();
    return mode === 'with-vue' ? 'with-vue' : 'isolated';
}

function resolveInstalledVueExtensionDir(): string | undefined {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return undefined;

    const extensionsDir = path.join(home, '.vscode', 'extensions');
    if (!fs.existsSync(extensionsDir)) return undefined;

    const candidates = fs.readdirSync(extensionsDir)
        .filter((name) => /^vue\.volar-/i.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    if (candidates.length === 0) return undefined;
    return path.join(extensionsDir, candidates[0]);
}

async function main() {
    const tempDirs: string[] = [];
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './host/index');
        const workspacePath = path.resolve(__dirname, '../../test/fixtures/simple-project');
        const launchArgs = [workspacePath];
        const mode = resolveHostExtMode();

        if (mode === 'isolated') {
            launchArgs.push('--disable-extensions');
        } else {
            const vueExtensionDir = resolveInstalledVueExtensionDir();
            if (!vueExtensionDir) {
                throw new Error('HOST_TEST_EXT_MODE=with-vue requires local Vue (Official) extension (id: Vue.volar).');
            }

            const isolatedExtensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-host-ext-'));
            const isolatedUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-host-user-'));
            tempDirs.push(isolatedExtensionsDir, isolatedUserDataDir);

            const targetDir = path.join(isolatedExtensionsDir, path.basename(vueExtensionDir));
            fs.cpSync(vueExtensionDir, targetDir, { recursive: true });

            launchArgs.push('--extensions-dir', isolatedExtensionsDir, '--user-data-dir', isolatedUserDataDir);
            console.log(`[host-test] with-vue mode: loaded ${path.basename(vueExtensionDir)} only`);
        }

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs
        });
    } catch (err) {
        console.error(err);
        console.error('Failed to run host integration tests');
        process.exit(1);
    } finally {
        for (const dir of tempDirs) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch {
                // Best-effort cleanup for temporary host test folders.
            }
        }
    }
}

main();
