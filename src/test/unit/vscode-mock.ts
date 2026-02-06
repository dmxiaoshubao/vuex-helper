// Mock vscode module for unit testing
export class Uri {
    constructor(public fsPath: string, public scheme: string = 'file') {}
    static file(path: string) { return new Uri(path); }
    toString() { return this.scheme + '://' + this.fsPath; }
}

export class Position {
    constructor(public line: number, public character: number) {}
}

export class Location {
    constructor(public uri: Uri, public rangeOrPosition: Position | any) {}
}

export const workspace = {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
    asRelativePath: (path: string | Uri) => path.toString()
};

export const window = {
    showInformationMessage: () => {}
};
