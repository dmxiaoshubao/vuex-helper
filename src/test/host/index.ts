import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
        timeout: 30000
    });

    const testsRoot = __dirname;
    const files = await collectTestFiles(testsRoot, testsRoot);
    files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

    return new Promise((resolve, reject) => {
        try {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} host tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}

async function collectTestFiles(dir: string, root: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectTestFiles(fullPath, root));
        } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
            files.push(path.relative(root, fullPath));
        }
    }

    return files.sort();
}
