// Centralized vscode runtime mock for unit testing
export class Uri {
    constructor(public fsPath: string, public scheme: string = 'file', public fragment: string = '') {}
    static file(path: string) { return new Uri(path); }
    static parse(value: string) {
        const match = /^([^:]+):\/\/([^#]*)(?:#(.*))?$/.exec(value);
        if (!match) return new Uri(value);
        return new Uri(match[2], match[1], match[3] || '');
    }
    with(change: { fragment?: string }) { return new Uri(this.fsPath, this.scheme, change.fragment ?? this.fragment); }
    toString() { return `${this.scheme}://${this.fsPath}${this.fragment ? `#${this.fragment}` : ''}`; }
}

export class Position {
    constructor(public line: number, public character: number) {}
}

export class Range {
    start: { line: number; character: number };
    end: { line: number; character: number };

    constructor(start: Position, end: Position);
    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
    constructor(
        a: Position | number,
        b: Position | number,
        c?: number,
        d?: number
    ) {
        if (typeof a === 'number' && typeof b === 'number' && typeof c === 'number' && typeof d === 'number') {
            this.start = { line: a, character: b };
            this.end = { line: c, character: d };
            return;
        }

        this.start = { line: (a as Position).line, character: (a as Position).character };
        this.end = { line: (b as Position).line, character: (b as Position).character };
    }
}

export class Location {
    public range: Range;

    constructor(public uri: Uri, public rangeOrPosition: Position | Range | any) {
        this.range = rangeOrPosition instanceof Range
            ? rangeOrPosition
            : new Range(rangeOrPosition, rangeOrPosition);
    }
}

export class MarkdownString {
    public value = '';
    public isTrusted?: boolean | { enabledCommands: readonly string[] };

    constructor(initialValue?: string) {
        if (initialValue) this.value = initialValue;
    }

    appendCodeblock(text: string, lang?: string) {
        this.value += `\`\`\`${lang || ''}\n${text}\n\`\`\``;
        return this;
    }

    appendMarkdown(text: string) {
        this.value += text;
        return this;
    }
}

export class Hover {
    constructor(public contents: any) {}
}

export class SnippetString {
    constructor(public value: string) {}
}

export class CompletionItem {
    public range: any;
    public detail: any;
    public sortText: any;
    public filterText: any;
    public documentation: any;
    public insertText: any;

    constructor(public label: string, public kind?: number) {}
}

export class CompletionList {
    constructor(public items: any[], public isIncomplete: boolean = false) {}
}

export class EventEmitter<T = any> {
    public readonly event = (_listener: (value: T) => any) => noopDisposable;
    fire(_value?: T) {}
    dispose() {}
}

export class TreeItem {
    public contextValue?: string;
    public description?: string | boolean;
    public iconPath?: any;
    public command?: any;

    constructor(public label: any, public collapsibleState?: number) {}
}

export class Selection extends Range {}

export const CompletionItemKind = {
    Property: 1,
    Field: 2,
    Method: 3,
    Function: 4,
    Module: 5
};

export const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
};

export const ProgressLocation = {
    Notification: 15
};

export const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2
};

export const ThemeIcon = {
    File: { id: 'file' },
    Folder: { id: 'folder' }
};

export class Diagnostic {
    source?: string;
    constructor(public range: Range, public message: string, public severity?: number) {}
}

export const DiagnosticSeverity = {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
};

const noopDisposable = { dispose: () => undefined };

export const commands = {
    registerCommand: (_command: string, _callback: (...args: any[]) => any) => noopDisposable,
    executeCommand: async (..._args: any[]) => undefined
};

export const workspace = {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
    asRelativePath: (value: string | Uri | { fsPath?: string; toString?: () => string }) =>
        (value as any)?.fsPath || (value as any)?.toString?.() || String(value),
    getConfiguration: (_section?: string, _scope?: any) => ({
        get: (_key: string, defaultValue?: any) => defaultValue,
        update: async (_key: string, _value: any, _target?: any) => undefined
    }),
    onDidSaveTextDocument: (_listener: any) => noopDisposable,
    onDidOpenTextDocument: (_listener: any) => noopDisposable,
    onDidCloseTextDocument: (_listener: any) => noopDisposable,
    onDidChangeConfiguration: (_listener: any) => noopDisposable,
    onDidCreateFiles: (_listener: any) => noopDisposable,
    onDidDeleteFiles: (_listener: any) => noopDisposable,
    onDidRenameFiles: (_listener: any) => noopDisposable,
    findFiles: async (_include: any, _exclude?: any) => [] as Uri[],
    openTextDocument: async (_uri: any) => undefined,
    textDocuments: [] as any[]
};

export const window = {
    showInformationMessage: async (..._args: any[]) => undefined,
    showWarningMessage: async (..._args: any[]) => undefined,
    showErrorMessage: async (..._args: any[]) => undefined,
    showInputBox: async (..._args: any[]) => undefined,
    showOpenDialog: async (..._args: any[]) => undefined,
    withProgress: async (_options: any, task: any) => task({ report: () => undefined }, { isCancellationRequested: false })
};

export const languages = {
    registerDefinitionProvider: (_selector: any, _provider: any) => noopDisposable,
    registerCompletionItemProvider: (_selector: any, _provider: any, ..._triggerCharacters: string[]) => noopDisposable,
    registerHoverProvider: (_selector: any, _provider: any) => noopDisposable,
    registerReferenceProvider: (_selector: any, _provider: any) => noopDisposable,
    createDiagnosticCollection: (_name?: string) => ({
        set: (_uri: any, _diagnostics: any) => undefined,
        delete: (_uri: any) => undefined,
        clear: () => undefined,
        dispose: () => undefined,
        forEach: (_callback: any) => undefined,
        get: (_uri: any) => undefined,
        has: (_uri: any) => false,
        name: _name || 'mock',
    })
};

export const extensions = {
    getExtension: (_id: string) => undefined as any
};
