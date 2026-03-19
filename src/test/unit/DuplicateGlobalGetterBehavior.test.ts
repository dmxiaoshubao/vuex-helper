import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { StoreIndexer } from '../../services/StoreIndexer';
import { VuexDefinitionProvider } from '../../providers/VuexDefinitionProvider';
import { VuexLookupService } from '../../services/VuexLookupService';
const vscode = require('vscode');

const fixtureRoot = path.resolve(__dirname, '../../../test/fixtures/duplicate-global-getter-project');

function createDocument(text: string, fileName: string) {
    const lines = text.split('\n');
    return {
        fileName,
        languageId: fileName.endsWith('.vue') ? 'vue' : 'javascript',
        version: 1,
        uri: vscode.Uri.file(fileName),
        getText: (range?: any) => {
            if (!range) return text;
            const line = lines[range.start.line] || '';
            return line.slice(range.start.character, range.end.character);
        },
        offsetAt: (pos: any) => {
            let offset = 0;
            for (let i = 0; i < pos.line; i++) {
                offset += (lines[i] || '').length + 1;
            }
            return offset + pos.character;
        },
        lineAt: (lineOrPos: any) => {
            const line = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
            return { text: lines[line] || '' };
        },
        getWordRangeAtPosition: (position: any) => {
            const line = lines[position.line] || '';
            let start = position.character;
            let end = position.character;
            while (start > 0 && /[A-Za-z0-9_$]/.test(line[start - 1])) start--;
            while (end < line.length && /[A-Za-z0-9_$]/.test(line[end])) end++;
            if (start === end) return undefined;
            return new vscode.Range(position.line, start, position.line, end);
        },
    } as any;
}

describe('Duplicate Global Getter Behavior', () => {
    it('should resolve duplicated global getter lookup to the root definition for unqualified access', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const lookupService = new VuexLookupService(indexer);
        const found = lookupService.findItem({
            name: 'sharedTotal',
            type: 'getter',
        });

        assert.ok(found, 'Unqualified duplicate global getter lookup should still return one result');
        assert.strictEqual(
            found?.defLocation.uri.fsPath,
            path.join(fixtureRoot, 'src/store/index.js'),
            'Current lookup fallback prefers the root getter definition when duplicates exist',
        );
    });

    it('should still resolve one getter definition for duplicated global getter usage', async () => {
        const indexer = new StoreIndexer(fixtureRoot);
        await indexer.index();

        const provider = new VuexDefinitionProvider(indexer);
        const fileName = path.join(fixtureRoot, 'src/App.vue');
        const text = fs.readFileSync(fileName, 'utf-8');
        const target = 'sharedTotal';
        const targetOffset = text.indexOf(target) + 2;
        const before = text.slice(0, targetOffset);
        const line = before.split('\n').length - 1;
        const character = before.length - before.lastIndexOf('\n') - 1;
        const document = createDocument(text, fileName);

        const definition = await provider.provideDefinition(
            document,
            { line, character } as any,
            {} as any,
        );

        assert.ok(definition, 'Duplicated global getter usage should still resolve to one definition');
        assert.strictEqual(
            (definition as any).uri.fsPath,
            path.join(fixtureRoot, 'src/store/index.js'),
            'Current definition behavior prefers the root getter definition when duplicates exist',
        );
    });
});
