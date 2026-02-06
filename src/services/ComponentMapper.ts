import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as vscode from 'vscode';

export interface ComponentMapInfo {
    // Map local name to Vuex item Info
    // type: 'state' | 'getter' | 'mutation' | 'action'
    // originalName: string (the name in the store)
    // namespace?: string (the namespace if any)
    [localName: string]: {
        type: 'state' | 'getter' | 'mutation' | 'action';
        originalName: string;
        namespace?: string;
    };
}

export class ComponentMapper {
    
    private cache: Map<string, { version: number, mapping: ComponentMapInfo }> = new Map();

    /**
     * Analyzes the given document to find Vuex mapHelpers and build a mapping.
     */
    public getMapping(document: vscode.TextDocument): ComponentMapInfo {
        const text = document.getText();
        const uri = document.uri.toString();
        
        // Use cache if document hasn't changed or if current parse fails
        const cached = this.cache.get(uri);
        
        // For Vue files, extract script content
        let scriptContent = text;
        
        if (document.languageId === 'vue') {
            const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/);
            if (scriptMatch) {
                scriptContent = scriptMatch[1];
            }
        }
        
        try {
            const ast = parser.parse(scriptContent, {
                sourceType: 'module',
                plugins: ['typescript', 'decorators-legacy', 'classProperties', 'jsx'],
                errorRecovery: true // Crucial for completion while typing
            });
            
            const mapping: ComponentMapInfo = {};
            const validHelpers = ['mapState', 'mapGetters', 'mapMutations', 'mapActions'];

            traverse(ast, {
                CallExpression(path: any) {
                    const callee = path.node.callee;
                    const calleeName = callee.name || (callee.property && callee.property.name);

                    if (typeof calleeName === 'string' && validHelpers.includes(calleeName)) {
                        const helperName = calleeName;
                        
                        let type: 'state' | 'getter' | 'mutation' | 'action' | undefined;
                        
                        if (helperName === 'mapState') type = 'state';
                        else if (helperName === 'mapGetters') type = 'getter';
                        else if (helperName === 'mapMutations') type = 'mutation';
                        else if (helperName === 'mapActions') type = 'action';
                        
                        if (!type) return;
                        
                        const args = path.node.arguments;
                        if (args.length === 0) return;
                        
                        let namespace: string | undefined;
                        let mapObj: any;
                        
                        // Check for namespace: mapState('ns', [...])
                        if (args[0].type === 'StringLiteral') {
                            namespace = args[0].value;
                            if (args.length > 1) {
                                mapObj = args[1];
                            }
                        } else {
                            mapObj = args[0];
                        }
                        
                        if (!mapObj) return;
                        
                        // Handle Array: mapState(['count']) -> local 'count' maps to store 'count'
                        if (mapObj.type === 'ArrayExpression') {
                            mapObj.elements.forEach((el: any) => {
                                if (el && el.type === 'StringLiteral') {
                                    const name = el.value;
                                    mapping[name] = { type: type!, originalName: name, namespace };
                                }
                            });
                        } 
                        // Handle Object: mapState({ alias: 'count' })
                        else if (mapObj.type === 'ObjectExpression') {
                            mapObj.properties.forEach((prop: any) => {
                                if (prop.type === 'ObjectProperty') {
                                    const localName = prop.key.name || prop.key.value;
                                    
                                    if (prop.value.type === 'StringLiteral') {
                                        mapping[localName] = { type: type!, originalName: prop.value.value, namespace };
                                    } 
                                }
                            });
                        }
                    }
                }
            });
            
            // Success, update cache
            this.cache.set(uri, { version: document.version, mapping });
            return mapping;
            
        } catch (e) {
            // console.error('[VuexHelper] ComponentMapper parse error', e);
            // If failed (highly unlikely with errorRecovery, but still), return cache
            return cached ? cached.mapping : {};
        }
    }
}
