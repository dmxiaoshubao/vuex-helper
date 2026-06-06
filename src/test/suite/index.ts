import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'bdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');
	const setupFile = path.resolve(testsRoot, 'setup.js');
	const files = await collectTestFiles(path.join(testsRoot, 'unit'), testsRoot);

	// Load global test setup first (vscode runtime mock, shared hooks, etc.).
	mocha.addFile(setupFile);

	// Add files to the test suite
	files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

	return new Promise((resolve, reject) => {
		try {
			// Run the mocha test
			mocha.run((failures: number) => {
				if (failures > 0) {
					reject(new Error(`${failures} tests failed.`));
				} else {
					resolve();
				}
			});
		} catch (err) {
			console.error(err);
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
