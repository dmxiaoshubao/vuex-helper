import * as vscode from 'vscode';
import * as fs from 'fs';
import { StoreIndexer, VuexAnyItem, VuexItemType } from '../services/StoreIndexer';
import { ComponentMapper } from '../services/ComponentMapper';
import { VuexDefinitionProvider } from './VuexDefinitionProvider';

interface VuexTargetItem {
    type: VuexItemType;
    item: VuexAnyItem;
}

const REFERENCE_INCLUDE = '**/*.{vue,js,ts}';
const REFERENCE_EXCLUDE = '**/{node_modules,dist,out,build,coverage,unpackage,.git,.vscode-test,.nuxt,.output}/**';
const MAX_REFERENCE_FILES = 500;
const MAX_REFERENCE_FILE_BYTES = 1024 * 1024;

export class VuexReferenceProvider implements vscode.ReferenceProvider {
    private readonly definitionProvider: VuexDefinitionProvider;

    constructor(
        private readonly storeIndexer: StoreIndexer,
        componentMapper?: ComponentMapper
    ) {
        this.definitionProvider = new VuexDefinitionProvider(storeIndexer, componentMapper);
    }

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        if (token.isCancellationRequested) return [];

        const target = await this.resolveTargetItem(document, position, token);
        if (!target) return [];

        const references = new Map<string, vscode.Location>();
        if (context.includeDeclaration !== false) {
            this.addLocation(references, target.item.defLocation);
        }

        const documents = await this.getCandidateDocuments(document, token);
        for (const candidate of documents) {
            if (token.isCancellationRequested) return Array.from(references.values());
            await this.collectReferencesInDocument(candidate, target, references, token);
        }

        return Array.from(references.values());
    }

    private async resolveTargetItem(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<VuexTargetItem | undefined> {
        const direct = this.findStoreDefinitionAtPosition(document, position);
        if (direct) return direct;

        const definition = await this.definitionProvider.provideDefinition(document, position, token);
        const definitionLocation = firstLocation(definition);
        if (!definitionLocation) return undefined;
        return this.findStoreItemByLocation(definitionLocation);
    }

    private findStoreDefinitionAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): VuexTargetItem | undefined {
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;

        const word = document.getText(range);
        return this.getAllItems().find(({ item }) => {
            if (item.name !== word) return false;
            if (item.defLocation.uri.fsPath !== document.uri.fsPath) return false;
            const defStart = locationStart(item.defLocation);
            if (!defStart) return false;
            return defStart.line === range.start.line
                && defStart.character >= range.start.character
                && defStart.character <= range.end.character;
        });
    }

    private findStoreItemByLocation(location: vscode.Location): VuexTargetItem | undefined {
        return this.getAllItems().find(({ item }) => sameDefinitionLocation(item.defLocation, location));
    }

    private async getCandidateDocuments(
        currentDocument: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.TextDocument[]> {
        const byUri = new Map<string, vscode.TextDocument>();
        this.addDocument(byUri, currentDocument);

        for (const openDocument of vscode.workspace.textDocuments || []) {
            if (token.isCancellationRequested) return Array.from(byUri.values());
            this.addDocument(byUri, openDocument);
        }

        if (typeof (vscode.workspace as any).findFiles !== 'function') {
            return Array.from(byUri.values());
        }

        const uris = await vscode.workspace.findFiles(REFERENCE_INCLUDE, REFERENCE_EXCLUDE, MAX_REFERENCE_FILES);
        for (const uri of uris) {
            if (token.isCancellationRequested) return Array.from(byUri.values());
            if (typeof (vscode.workspace as any).openTextDocument !== 'function') continue;
            try {
                if (await isLargeReferenceFile(uri)) continue;
                const doc = await vscode.workspace.openTextDocument(uri);
                this.addDocument(byUri, doc);
            } catch {
                // 单个文件打开失败不应阻塞其它引用结果。
            }
        }

        return Array.from(byUri.values());
    }

    private async collectReferencesInDocument(
        document: vscode.TextDocument,
        target: VuexTargetItem,
        references: Map<string, vscode.Location>,
        token: vscode.CancellationToken
    ): Promise<void> {
        const text = document.getText();
        const targetName = target.item.name;
        let index = text.indexOf(targetName);
        while (index >= 0) {
            if (token.isCancellationRequested) return;

            if (isIdentifierBoundary(text, index, targetName.length)) {
                const position = positionAt(document, index + Math.min(1, targetName.length));
                const definition = await this.definitionProvider.provideDefinition(document, position, token);
                if (definitionMatchesTarget(definition, target.item.defLocation)) {
                    const range = document.getWordRangeAtPosition(position)
                        ?? new vscode.Range(positionAt(document, index), positionAt(document, index + targetName.length));
                    this.addLocation(references, new vscode.Location(document.uri, range));
                }
            }

            index = text.indexOf(targetName, index + targetName.length);
        }
    }

    private getAllItems(): VuexTargetItem[] {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return [];

        return [
            ...storeMap.state.map((item) => ({ type: 'state' as const, item })),
            ...storeMap.getters.map((item) => ({ type: 'getter' as const, item })),
            ...storeMap.mutations.map((item) => ({ type: 'mutation' as const, item })),
            ...storeMap.actions.map((item) => ({ type: 'action' as const, item })),
        ];
    }

    private addDocument(target: Map<string, vscode.TextDocument>, document: vscode.TextDocument): void {
        if (!['vue', 'javascript', 'typescript'].includes(document.languageId)) return;
        target.set(document.uri.toString(), document);
    }

    private addLocation(target: Map<string, vscode.Location>, location: vscode.Location): void {
        target.set(locationKey(location), location);
    }
}

function firstLocation(definition: vscode.Definition | undefined): vscode.Location | undefined {
    if (!definition) return undefined;
    if (Array.isArray(definition)) {
        const first = definition[0] as vscode.Location | vscode.LocationLink | undefined;
        return toLocation(first);
    }
    return toLocation(definition as vscode.Location | vscode.LocationLink);
}

function toLocation(value: vscode.Location | vscode.LocationLink | undefined): vscode.Location | undefined {
    if (!value) return undefined;
    if ('targetUri' in value) {
        return new vscode.Location(value.targetUri, value.targetRange);
    }
    return value;
}

function definitionMatchesTarget(definition: vscode.Definition | undefined, target: vscode.Location): boolean {
    if (!definition) return false;
    const definitions = Array.isArray(definition) ? definition : [definition];
    return definitions.some((item) => {
        const location = toLocation(item as vscode.Location | vscode.LocationLink);
        return !!location && sameDefinitionLocation(location, target);
    });
}

function sameDefinitionLocation(a: vscode.Location, b: vscode.Location): boolean {
    const aStart = locationStart(a);
    const bStart = locationStart(b);
    return a.uri.fsPath === b.uri.fsPath
        && !!aStart
        && !!bStart
        && aStart.line === bStart.line
        && aStart.character === bStart.character;
}

function locationStart(location: vscode.Location): vscode.Position | undefined {
    const range = (location as any).range;
    if (range?.start) return range.start;

    const rangeOrPosition = (location as any).rangeOrPosition;
    if (rangeOrPosition?.start) return rangeOrPosition.start;
    if (typeof rangeOrPosition?.line === 'number') return rangeOrPosition;
    return undefined;
}

function locationKey(location: vscode.Location): string {
    const start = locationStart(location);
    const end = (location as any).range?.end ?? (location as any).rangeOrPosition?.end ?? start;
    return `${location.uri.fsPath}:${start?.line ?? 0}:${start?.character ?? 0}:${end?.line ?? 0}:${end?.character ?? 0}`;
}

function positionAt(document: vscode.TextDocument, offset: number): vscode.Position {
    if (typeof (document as any).positionAt === 'function') {
        return (document as any).positionAt(offset);
    }

    const lines = document.getText().split('\n');
    let remaining = offset;
    for (let line = 0; line < lines.length; line++) {
        const length = lines[line].length;
        if (remaining <= length) {
            return new vscode.Position(line, remaining);
        }
        remaining -= length + 1;
    }
    return new vscode.Position(Math.max(0, lines.length - 1), lines[lines.length - 1]?.length ?? 0);
}

function isIdentifierBoundary(text: string, start: number, length: number): boolean {
    const before = start > 0 ? text[start - 1] : '';
    const after = text[start + length] || '';
    return !isIdentifierChar(before) && !isIdentifierChar(after);
}

function isIdentifierChar(value: string): boolean {
    return /[A-Za-z0-9_$]/.test(value);
}

async function isLargeReferenceFile(uri: vscode.Uri): Promise<boolean> {
    if (!uri.fsPath) return false;
    try {
        const stat = await fs.promises.stat(uri.fsPath);
        return stat.isFile() && stat.size > MAX_REFERENCE_FILE_BYTES;
    } catch {
        return false;
    }
}
