import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';

export class VuexHoverProvider implements vscode.HoverProvider {
    private contextScanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;

    constructor(storeIndexer: StoreIndexer) {
        this.storeIndexer = storeIndexer;
        this.contextScanner = new VuexContextScanner();
        this.componentMapper = new ComponentMapper();
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;
        const word = document.getText(range);
        
        // 1. Vuex Context (String literals)
        // Moved logical check down to combine with context awareness
        const context = this.contextScanner.getContext(document, position);

        // 2. Component Mapping (this.methodName)
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, range.start.character).trimEnd();
        
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = mapping[word];
        
        if (mappedItem) {
            return this.findHover(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }

        const currentNamespace = this.storeIndexer.getNamespace(document.fileName);

        // 3. Local State Hover (state.xxx)
        const rawPrefix = lineText.substring(0, range.start.character);
        const stateAccessPath = this.extractStateAccessPath(rawPrefix, word);
        
        if (currentNamespace && /\bstate\.$/.test(rawPrefix)) {
             return this.findHover(word, 'state', currentNamespace.join('/'));
        }

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
                 return this.findHover(stateAccessPath, 'state', context.namespace, currentNamespace, preferLocalFromContext);
             }
             return this.findHover(word, context.type, context.namespace, currentNamespace, preferLocalFromContext);
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

    private findHover(
        name: string,
        type: 'state' | 'getter' | 'mutation' | 'action',
        namespace?: string,
        currentNamespace?: string[],
        preferLocal: boolean = true
    ): vscode.Hover | undefined {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

        const lookups = this.buildLookupCandidates(name, type, namespace, currentNamespace);
        let result: { defLocation: vscode.Location, documentation?: string } | undefined;
        let labelPrefix = '';

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

            if (preferLocal && !lookupNamespace && currentNamespace && !lookupName.includes('/')) {
                const checkLocal = (item: { name: string, modulePath: string[] }) =>
                    item.name === lookupName && item.modulePath.join('/') === currentNamespace.join('/');

                if (type === 'action') result = storeMap.actions.find(checkLocal);
                else if (type === 'mutation') result = storeMap.mutations.find(checkLocal);
                else if (type === 'state') result = storeMap.state.find(checkLocal);
                else if (type === 'getter') result = storeMap.getters.find(checkLocal);
            }

            if (!result) {
                if (type === 'action') result = storeMap.actions.find(matchItem);
                else if (type === 'mutation') result = storeMap.mutations.find(matchItem);
                else if (type === 'state') result = storeMap.state.find(matchItem);
                else if (type === 'getter') result = storeMap.getters.find(matchItem);
            }

            if (result) break;
        }

        if (type === 'action') labelPrefix = 'Action';
        else if (type === 'mutation') labelPrefix = 'Mutation';
        else if (type === 'state') labelPrefix = 'State';
        else if (type === 'getter') labelPrefix = 'Getter';

        if (result) {
            const md = new vscode.MarkdownString();
            
            let label = `${labelPrefix}: ${name}`;
            if (type === 'state') {
                const stateInfo = result as any; // Cast to access displayType
                if (stateInfo.displayType) {
                    label += `: ${stateInfo.displayType}`;
                }
            }
            
            md.appendCodeblock(label, 'typescript');
            if (result.documentation) {
                md.appendMarkdown(`\n\n${result.documentation}\n\n`);
            }
            md.appendMarkdown(`Defined in: **${vscode.workspace.asRelativePath(result.defLocation.uri)}**`);
            return new vscode.Hover(md);
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
