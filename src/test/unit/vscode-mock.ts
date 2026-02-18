// Centralized vscode runtime mock for unit testing
export class Uri {
    constructor(public fsPath: string, public scheme: string = 'file') {}
    static file(path: string) { return new Uri(path); }
    toString() { return `${this.scheme}://${this.fsPath}`; }
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
    constructor(public uri: Uri, public rangeOrPosition: Position | Range | any) {}
}

export class MarkdownString {
    public value = '';

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

const noopDisposable = { dispose: () => undefined };

export const workspace = {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
    asRelativePath: (value: string | Uri | { fsPath?: string; toString?: () => string }) =>
        (value as any)?.fsPath || (value as any)?.toString?.() || String(value),
    getConfiguration: (_section?: string, _scope?: any) => ({
        get: (_key: string, defaultValue?: any) => defaultValue,
        update: async (_key: string, _value: any, _target?: any) => undefined
    }),
    onDidSaveTextDocument: (_listener: any) => noopDisposable,
    onDidChangeConfiguration: (_listener: any) => noopDisposable
};

export const window = {
    showInformationMessage: async (..._args: any[]) => undefined,
    showWarningMessage: async (..._args: any[]) => undefined,
    showErrorMessage: async (..._args: any[]) => undefined,
    showInputBox: async (..._args: any[]) => undefined
};

export const languages = {
    registerDefinitionProvider: (_selector: any, _provider: any) => noopDisposable,
    registerCompletionItemProvider: (_selector: any, _provider: any, ..._triggerCharacters: string[]) => noopDisposable,
    registerHoverProvider: (_selector: any, _provider: any) => noopDisposable
};
