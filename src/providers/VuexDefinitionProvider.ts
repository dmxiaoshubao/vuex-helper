import * as vscode from 'vscode';
import { StoreIndexer } from '../services/StoreIndexer';
import { VuexContextScanner } from '../services/VuexContextScanner';
import { ComponentMapper } from '../services/ComponentMapper';

export class VuexDefinitionProvider implements vscode.DefinitionProvider {
    private scanner: VuexContextScanner;
    private componentMapper: ComponentMapper;
    private storeIndexer: StoreIndexer;

    constructor(storeIndexer: StoreIndexer) {
        this.storeIndexer = storeIndexer;
        this.scanner = new VuexContextScanner();
        this.componentMapper = new ComponentMapper();
    }

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;

        const word = document.getText(range);

        // 1. Try VuexContextScanner (for String Literal contexts like mapState('...'))
        const context = this.scanner.getContext(document, position);
        if (context && context.type !== 'unknown') {
            return this.findDefinition(word, context.type, context.namespace);
        }

        // 2. Try Component Mapping (for this.methodName usage)
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, range.start.character).trimEnd();
        
        // Simplified check: if it looks like a property access (this.xxx or vm.xxx)
        // For strictness, maybe just check if it's NOT a string literal? 
        // ComponentMapper logic relies on the word matching a mapped key.
        const mapping = this.componentMapper.getMapping(document);
        const mappedItem = mapping[word];

        if (mappedItem) {
             console.log(`Found mapped item for ${word}:`, mappedItem);
             return this.findDefinition(mappedItem.originalName, mappedItem.type, mappedItem.namespace);
        }

        return undefined;
    }

    private findDefinition(name: string, type: 'state' | 'getter' | 'mutation' | 'action', namespace?: string): vscode.Definition | undefined {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

        const matchItem = (item: { name: string, modulePath: string[] }) => {
            if (namespace) {
                // Exact namespace match
                // If namespace is 'user/profile', modulePath should be ['user', 'profile']
                return item.name === name && item.modulePath.join('/') === namespace;
            } else {
                // No namespace specified in the call/mapping.
                // It could be a root item or a namespaced item referenced by full path?
                // e.g. mapActions(['user/update']) -> name is 'user/update', namespace undefined.
                // But the store item name is 'update', modulePath is ['user'].
                
                // Case A: name contains slashes (e.g. 'user/update')
                if (name.includes('/')) {
                    const parts = name.split('/');
                    const realName = parts.pop()!;
                    const namespaceStr = parts.join('/');
                    return item.name === realName && item.modulePath.join('/') === namespaceStr;
                }
                
                // Case B: Simple name match (root or searching global)
                // If strict mode, maybe only root? But let's match any if simplest.
                // However, usually without namespace arg, it implies root or current module (if mapped inside a component? complex).
                // Let's assume root or exact match of partials.
                // Actually, if I write mapState(['count']), I expect root count.
                // If I write mapState('user', ['count']), then context.namespace is 'user'.
                
                return item.name === name;
            }
        };

        let found: { defLocation: vscode.Location } | undefined;

        if (type === 'action') found = storeMap.actions.find(matchItem);
        else if (type === 'mutation') found = storeMap.mutations.find(matchItem);
        else if (type === 'getter') found = storeMap.getters.find(matchItem);
        else if (type === 'state') found = storeMap.state.find(matchItem);

        return found ? found.defLocation : undefined;
    }
}
