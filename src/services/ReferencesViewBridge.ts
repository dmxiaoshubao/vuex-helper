import * as vscode from 'vscode';

type ReferenceTreeNode = ReferenceFileNode | ReferenceItemNode;

interface ReferencesViewApi {
    setInput(input: VuexReferencesInput): void | Thenable<void>;
}

class ReferenceFileNode {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly references: ReferenceItemNode[]
    ) {}
}

class ReferenceItemNode {
    constructor(
        public readonly location: vscode.Location,
        public readonly file: ReferenceFileNode
    ) {}
}

class VuexReferencesModel {
    public readonly items: ReferenceFileNode[] = [];

    constructor(locations: vscode.Location[]) {
        let currentFile: ReferenceFileNode | undefined;

        for (const location of [...locations].sort(compareLocations)) {
            const uri = location.uri.with({ fragment: '' });
            if (!currentFile || currentFile.uri.toString() !== uri.toString()) {
                currentFile = new ReferenceFileNode(uri, []);
                this.items.push(currentFile);
            }
            currentFile.references.push(new ReferenceItemNode(location, currentFile));
        }
    }

    get message(): string {
        const referenceCount = this.items.reduce((count, item) => count + item.references.length, 0);
        const fileCount = this.items.length;
        if (referenceCount === 1 && fileCount === 1) return '1 result in 1 file';
        if (referenceCount === 1) return `1 result in ${fileCount} files`;
        if (fileCount === 1) return `${referenceCount} results in 1 file`;
        return `${referenceCount} results in ${fileCount} files`;
    }

    location(node: ReferenceTreeNode): vscode.Location {
        if (node instanceof ReferenceItemNode) return node.location;
        return node.references[0]?.location ?? new vscode.Location(node.uri, new vscode.Position(0, 0));
    }

    nearest(uri: vscode.Uri, position: vscode.Position): ReferenceTreeNode | undefined {
        const sameFile = this.items.find(item => item.uri.toString() === uri.with({ fragment: '' }).toString());
        if (sameFile) {
            return sameFile.references.find(ref => isRangeAfterOrContains(ref.location.range, position))
                ?? sameFile.references[sameFile.references.length - 1];
        }
        return this.items[0]?.references[0];
    }

    next(node: ReferenceTreeNode): ReferenceTreeNode {
        return this.move(node, 1);
    }

    previous(node: ReferenceTreeNode): ReferenceTreeNode {
        return this.move(node, -1);
    }

    getEditorHighlights(node: ReferenceTreeNode, uri: vscode.Uri): vscode.Range[] | undefined {
        const file = node instanceof ReferenceFileNode ? node : node.file;
        if (file.uri.toString() !== uri.with({ fragment: '' }).toString()) return undefined;
        return file.references.map(ref => ref.location.range);
    }

    getDragUri(node: ReferenceTreeNode): vscode.Uri {
        const location = this.location(node);
        const range = location.range;
        return location.uri.with({
            fragment: `L${range.start.line + 1},${range.start.character}-${range.end.line + 1},${range.end.character}`
        });
    }

    private move(node: ReferenceTreeNode, offset: 1 | -1): ReferenceTreeNode {
        const flat = this.items.flatMap(item => item.references);
        const reference = node instanceof ReferenceFileNode ? node.references[0] : node;
        const index = Math.max(0, flat.indexOf(reference));
        return flat[(index + offset + flat.length) % flat.length] ?? reference;
    }
}

class VuexReferencesTreeProvider implements vscode.TreeDataProvider<ReferenceTreeNode> {
    private readonly changeEmitter = new vscode.EventEmitter<ReferenceTreeNode | undefined | void>();
    public readonly onDidChangeTreeData = this.changeEmitter.event;

    constructor(private readonly model: VuexReferencesModel) {}

    dispose(): void {
        this.changeEmitter.dispose();
    }

    getTreeItem(node: ReferenceTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (node instanceof ReferenceFileNode) {
            const item = new vscode.TreeItem(node.uri, vscode.TreeItemCollapsibleState.Expanded);
            item.contextValue = 'file-item';
            item.description = true;
            item.iconPath = vscode.ThemeIcon.File;
            return item;
        }

        return this.createReferenceItem(node);
    }

    getChildren(node?: ReferenceTreeNode): vscode.ProviderResult<ReferenceTreeNode[]> {
        if (!node) return this.model.items;
        if (node instanceof ReferenceFileNode) return node.references;
        return [];
    }

    getParent(node: ReferenceTreeNode): vscode.ProviderResult<ReferenceTreeNode> {
        return node instanceof ReferenceItemNode ? node.file : undefined;
    }

    private async createReferenceItem(node: ReferenceItemNode): Promise<vscode.TreeItem> {
        const document = await vscode.workspace.openTextDocument(node.location.uri);
        const label = getReferenceLineLabel(document, node.location.range);
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.contextValue = 'reference-item';
        item.command = {
            command: 'vscode.open',
            title: 'Open Reference',
            arguments: [
                node.location.uri,
                { selection: new vscode.Selection(node.location.range.start, node.location.range.start) }
            ]
        };
        return item;
    }
}

class VuexReferencesInput {
    public readonly title = 'Vuex References';
    public readonly contextValue = 'vscode.executeReferenceProvider';

    constructor(
        public readonly location: vscode.Location,
        private readonly references: vscode.Location[]
    ) {}

    async resolve() {
        const model = new VuexReferencesModel(this.references);
        if (model.items.length === 0) return undefined;

        const provider = new VuexReferencesTreeProvider(model);
        return {
            provider,
            get message() {
                return model.message;
            },
            navigation: model,
            highlights: model,
            dnd: model,
            dispose() {
                provider.dispose();
            }
        };
    }

    with(location: vscode.Location): VuexReferencesInput {
        return new VuexReferencesInput(location, this.references);
    }
}

export async function openReferencesInSideView(
    sourceUri: vscode.Uri,
    sourcePosition: vscode.Position,
    references: vscode.Location[]
): Promise<boolean> {
    try {
        const referencesView = vscode.extensions.getExtension<ReferencesViewApi>('vscode.references-view');
        if (!referencesView) return false;

        const api = await referencesView.activate();
        if (!api || typeof api.setInput !== 'function') return false;

        const input = new VuexReferencesInput(new vscode.Location(sourceUri, sourcePosition), references);
        await Promise.resolve(api.setInput(input));
        return true;
    } catch {
        return false;
    }
}

function getReferenceLineLabel(document: vscode.TextDocument, range: vscode.Range): vscode.TreeItemLabel {
    const line = document.lineAt(range.start.line).text;
    const leadingWhitespace = line.length - line.trimStart().length;
    const label = line.slice(leadingWhitespace);
    const start = Math.max(0, range.start.character - leadingWhitespace);
    const end = Math.max(start, range.end.character - leadingWhitespace);
    return {
        label,
        highlights: [[start, end]]
    };
}

function compareLocations(a: vscode.Location, b: vscode.Location): number {
    const uriCompare = a.uri.toString().localeCompare(b.uri.toString());
    if (uriCompare !== 0) return uriCompare;
    return comparePositions(a.range.start, b.range.start);
}

function comparePositions(a: vscode.Position, b: vscode.Position): number {
    if (a.line !== b.line) return a.line - b.line;
    return a.character - b.character;
}

function isRangeAfterOrContains(range: vscode.Range, position: vscode.Position): boolean {
    return comparePositions(range.end, position) >= 0;
}
