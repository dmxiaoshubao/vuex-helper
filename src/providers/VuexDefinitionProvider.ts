import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';

export class VuexDefinitionProvider implements vscode.DefinitionProvider {
    private scanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;

    constructor(storeIndexer: StoreIndexer, componentMapper?: ComponentMapper) {
        this.storeIndexer = storeIndexer;
        this.scanner = new VuexContextScanner();
        this.componentMapper = componentMapper ?? new ComponentMapper();
    }

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;

        const word = document.getText(range);

        // 1. Component Mapping (for this.methodName usage)
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, range.start.character).trimEnd();
        
        // Simplified check: if it looks like a property access (this.xxx or vm.xxx)
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = mapping[word];

        if (mappedItem) {
             console.log(`Found mapped item for ${word}:`, mappedItem);
             return this.findDefinition(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }

        const currentNamespace = this.storeIndexer.getNamespace(document.fileName);

        // 2. Local State Definition (state.xxx)
        // Check if preceding text ends with "state."
        const rawPrefix = lineText.substring(0, range.start.character);
        const stateAccessPath = this.extractStateAccessPath(rawPrefix, word);
        
        if (currentNamespace && /\bstate\.$/.test(rawPrefix)) {
             return this.findDefinition(word, 'state', currentNamespace.join('/'));
        }

        // 3. Try VuexContextScanner (for String Literal contexts like mapState('...'))
        const context = this.scanner.getContext(document, position);
        // Re-check context with awareness of current file namespace
        if (context && context.type !== 'unknown') {
            const preferLocalFromContext = !(
                (context.method === 'commit' || context.method === 'dispatch') &&
                (
                    context.isStoreMethod === true ||
                    this.hasRootTrueOption(document, position, context.method, context.calleeName)
                )
            );
            if (context.type === 'state' && stateAccessPath) {
                return this.findDefinition(stateAccessPath, 'state', context.namespace, currentNamespace, preferLocalFromContext);
            }
            const explicitPath = this.extractStringLiteralPathAtPosition(document, position);
            if (explicitPath && explicitPath.includes('/')) {
                const parts = explicitPath.split('/');
                const nameFromPath = parts.pop();
                const namespaceFromPath = parts.join('/');
                if (nameFromPath && namespaceFromPath) {
                    return this.findDefinition(nameFromPath, context.type, namespaceFromPath, currentNamespace, preferLocalFromContext);
                }
            }
            return this.findDefinition(word, context.type, context.namespace, currentNamespace, preferLocalFromContext);
        }

        return undefined;
    }

    private extractStateAccessPath(rawPrefix: string, word: string): string | undefined {
        const match = rawPrefix.match(/\bstate\.([A-Za-z0-9_$\.]*)$/);
        if (!match) return undefined;
        const left = match[1] || '';
        if (!left) return word;
        return `${left}${word}`;
    }

    private extractStringLiteralPathAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): string | undefined {
        const lineText = document.lineAt(position.line).text;
        const cursor = position.character;
        const quoteChars = [`'`, `"`, '`'];

        let start = -1;
        let quoteChar = '';
        for (let i = cursor; i >= 0; i--) {
            const ch = lineText.charAt(i);
            if (quoteChars.includes(ch)) {
                start = i;
                quoteChar = ch;
                break;
            }
        }
        if (start < 0 || !quoteChar) return undefined;

        let end = -1;
        for (let i = start + 1; i < lineText.length; i++) {
            if (lineText.charAt(i) === quoteChar && lineText.charAt(i - 1) !== '\\') {
                end = i;
                break;
            }
        }
        if (end < 0) return undefined;

        if (cursor <= start || cursor > end) return undefined;
        return lineText.substring(start + 1, end).trim();
    }

    private hasRootTrueOption(
        document: vscode.TextDocument,
        position: vscode.Position,
        method: 'commit' | 'dispatch',
        calleeName?: string
    ): boolean {
        const source = document.getText();
        const offset = document.offsetAt(position);
        const start = Math.max(0, offset - 2000);
        const end = Math.min(source.length, offset + 2000);
        const windowText = source.substring(start, end);
        const callName = (calleeName || method).trim();
        const escapedCallName = callName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedMethod = method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const literalPattern = new RegExp(
            `${escapedCallName}\\(\\s*['"\`][^'"\`]*['"\`][\\s\\S]{0,1800}?\\broot\\s*:\\s*true\\b`
        );
        if (literalPattern.test(windowText)) {
            return true;
        }

        const thirdArgIdentifierPattern = new RegExp(
            `${escapedCallName}\\(\\s*['"\`][^'"\`]*['"\`][\\s\\S]{0,1300}?,[\\s\\S]{0,500}?,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`,
            'g'
        );
        const identifiers = new Set<string>();
        let match: RegExpExecArray | null;
        while ((match = thirdArgIdentifierPattern.exec(windowText)) !== null) {
            if (match[1]) identifiers.add(match[1]);
        }
        for (const id of identifiers) {
            const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const declPattern = new RegExp(
                `\\b(?:const|let|var)\\s+${escapedId}\\s*=\\s*\\{[\\s\\S]{0,600}?\\broot\\s*:\\s*true\\b`
            );
            if (declPattern.test(windowText)) return true;
            const assignPattern = new RegExp(
                `\\b${escapedId}\\s*=\\s*\\{[\\s\\S]{0,600}?\\broot\\s*:\\s*true\\b`
            );
            if (assignPattern.test(windowText)) return true;
            const methodLikePattern = new RegExp(
                `\\b(?:const|let|var)\\s+${escapedId}\\s*=\\s*[A-Za-z_$][\\w$]*\\([\\s\\S]{0,300}?\\broot\\s*:\\s*true\\b`
            );
            if (methodLikePattern.test(windowText)) return true;
        }

        const fallbackPattern = new RegExp(
            `${escapedMethod}\\(\\s*['"\`][^'"\`]*['"\`][\\s\\S]{0,1800}?\\broot\\s*:\\s*true\\b`
        );
        return fallbackPattern.test(windowText);
    }

    private findDefinition(
        name: string,
        type: 'state' | 'getter' | 'mutation' | 'action',
        namespace?: string,
        currentNamespace?: string[],
        preferLocal: boolean = true
    ): vscode.Definition | undefined {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

        const lookups = this.buildLookupCandidates(name, type, namespace, currentNamespace);
        for (const lookup of lookups) {
            const lookupName = lookup.name;
            const lookupNamespace = lookup.namespace;

            const matchItem = (item: { name: string, modulePath: string[] }) => {
                if (lookupNamespace) {
                    return item.name === lookupName && item.modulePath.join('/') === lookupNamespace;
                }

                if (preferLocal && currentNamespace && !lookupName.includes('/')) {
                    const isLocal = item.name === lookupName && item.modulePath.join('/') === currentNamespace.join('/');
                    if (isLocal) return true;
                }

                if (lookupName.includes('/')) {
                    const parts = lookupName.split('/');
                    const realName = parts.pop()!;
                    const namespaceStr = parts.join('/');
                    return item.name === realName && item.modulePath.join('/') === namespaceStr;
                }

                return item.name === lookupName;
            };

            let found: { defLocation: vscode.Location } | undefined;

            if (preferLocal && !lookupNamespace && currentNamespace && !lookupName.includes('/')) {
                const checkLocal = (item: { name: string, modulePath: string[] }) =>
                    item.name === lookupName && item.modulePath.join('/') === currentNamespace.join('/');

                if (type === 'action') found = storeMap.actions.find(checkLocal);
                else if (type === 'mutation') found = storeMap.mutations.find(checkLocal);
                else if (type === 'getter') found = storeMap.getters.find(checkLocal);
                else if (type === 'state') found = storeMap.state.find(checkLocal);

                if (found) return found.defLocation;
            }

            if (type === 'action') found = storeMap.actions.find(matchItem);
            else if (type === 'mutation') found = storeMap.mutations.find(matchItem);
            else if (type === 'getter') found = storeMap.getters.find(matchItem);
            else if (type === 'state') found = storeMap.state.find(matchItem);

            if (found) return found.defLocation;
        }

        return undefined;
    }

    private buildLookupCandidates(
        name: string,
        type: 'state' | 'getter' | 'mutation' | 'action',
        namespace?: string,
        currentNamespace?: string[]
    ): Array<{ name: string; namespace?: string }> {
        let normalizedName = name.trim();
        let normalizedNamespace = namespace?.trim();

        const absorbSlashPath = () => {
            if (!normalizedName.includes('/')) return;
            const parts = normalizedName.split('/');
            const last = parts.pop();
            if (!last) return;
            const pathNs = parts.join('/');
            normalizedName = last;
            normalizedNamespace = normalizedNamespace
                ? `${normalizedNamespace}/${pathNs}`
                : pathNs;
        };

        if (type === 'state') {
            absorbSlashPath();
            if (normalizedName.includes('.')) {
                const parts = normalizedName.split('.').filter(Boolean);
                const leaf = parts.pop();
                if (leaf) {
                    normalizedName = leaf;
                    const dottedNs = parts.join('/');
                    if (dottedNs) {
                        normalizedNamespace = normalizedNamespace
                            ? `${normalizedNamespace}/${dottedNs}`
                            : currentNamespace && currentNamespace.length > 0
                                ? `${currentNamespace.join('/')}/${dottedNs}`
                                : dottedNs;
                    }
                }
            }
        } else if (!normalizedNamespace) {
            absorbSlashPath();
        }

        return [{ name: normalizedName, namespace: normalizedNamespace }];
    }
}
