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
        
        if (currentNamespace && /\bstate\.$/.test(rawPrefix)) {
             return this.findDefinition(word, 'state', currentNamespace.join('/'));
        }

        // 3. Try VuexContextScanner (for String Literal contexts like mapState('...'))
        const context = this.scanner.getContext(document, position);
        // Re-check context with awareness of current file namespace
        if (context && context.type !== 'unknown') {
            return this.findDefinition(word, context.type, context.namespace, currentNamespace);
        }

        return undefined;
    }

    private findDefinition(name: string, type: 'state' | 'getter' | 'mutation' | 'action', namespace?: string, currentNamespace?: string[]): vscode.Definition | undefined {
        const storeMap = this.storeIndexer.getStoreMap();
        if (!storeMap) return undefined;

        const matchItem = (item: { name: string, modulePath: string[] }) => {
            if (namespace) {
                // Exact namespace match (explicitly provided e.g. mapState('user', ...))
                return item.name === name && item.modulePath.join('/') === namespace;
            } else {
                // No explicit namespace arg.
                
                // 1. If we are inside a namespaced module, and looking for mutation/action/state
                // and the name is simple (no slashes), prefer local item.
                if (currentNamespace && !name.includes('/')) {
                     const isLocal = item.name === name && item.modulePath.join('/') === currentNamespace.join('/');
                     if (isLocal) return true;
                }

                // 2. Global / Namespaced string match
                if (name.includes('/')) {
                    const parts = name.split('/');
                    const realName = parts.pop()!;
                    const namespaceStr = parts.join('/');
                    return item.name === realName && item.modulePath.join('/') === namespaceStr;
                }
                
                // 3. Simple name match (fallback)
                // If we found a local match above, we returned.
                // If not, maybe it's a global action committed from anywhere context? 
                // BUT if we are strict about namespaced modules, we shouldn't match global.
                // However, user might be in a file that ISN'T the module itself, or legacy code.
                // Let's keep existing looser match but maybe deprioritize?
                // `find` returns first match. If we prioritize finding local first, we need to iterate smartly
                // BUT here we iterate once.
                
                return item.name === name;
            }
        };

        let found: { defLocation: vscode.Location } | undefined;

        // Optimized lookup: try to look for exact local match first if context exists?
        // Array.find finds the FIRST match.
        // If we want to prioritize local, we should perhaps modify matchItem to ONLY return true for local IF local exists?
        // Or sort the list? No, that's expensive.
        // Let's refine matchItem to be smarter.
        
        // Actually, let's try to match strictly first if currentNamespace is present and name is simple.
        if (currentNamespace && !name.includes('/')) {
             const checkLocal = (item: { name: string, modulePath: string[] }) => 
                item.name === name && item.modulePath.join('/') === currentNamespace.join('/');
             
             if (type === 'action') found = storeMap.actions.find(checkLocal);
             else if (type === 'mutation') found = storeMap.mutations.find(checkLocal);
             else if (type === 'getter') found = storeMap.getters.find(checkLocal);
             else if (type === 'state') found = storeMap.state.find(checkLocal);
             
             if (found) return found.defLocation;
        }

        // Fallback to broad search
        if (type === 'action') found = storeMap.actions.find(matchItem);
        else if (type === 'mutation') found = storeMap.mutations.find(matchItem);
        else if (type === 'getter') found = storeMap.getters.find(matchItem);
        else if (type === 'state') found = storeMap.state.find(matchItem);

        return found ? found.defLocation : undefined;
    }
}
