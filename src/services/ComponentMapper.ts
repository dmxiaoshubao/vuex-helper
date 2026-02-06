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
    
    /**
     * Analyzes the given document to find Vuex mapHelpers and build a mapping.
     */
    public getMapping(document: vscode.TextDocument): ComponentMapInfo {
        const text = document.getText();
        const mapping: ComponentMapInfo = {};
        
        // For Vue files, extract script content?
        // Actually babel parser handles generic JS. But if it contains HTML/template it might fail.
        // Simple extraction for Vue:
        let scriptContent = text;
        let offset = 0;
        
        if (document.languageId === 'vue') {
            const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/);
            if (scriptMatch) {
                scriptContent = scriptMatch[1];
                offset = scriptMatch.index! + scriptMatch[0].indexOf(scriptMatch[1]);
            }
        }
        
        try {
            const ast = parser.parse(scriptContent, {
                sourceType: 'module',
                plugins: ['typescript', 'decorators-legacy', 'classProperties'] // Add 'jsx' if needed, but 'typescript' usually covers most
            });
            
            traverse(ast, {
                CallExpression(path: any) {
                    const callee = path.node.callee;
                    if (callee.type === 'Identifier' && callee.name.startsWith('map')) {
                        const helperName = callee.name;
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
                        // Handle Object: mapState({ alias: 'count' }) or mapState({ alias: state => state.count }) <- ignoring functions for now
                        else if (mapObj.type === 'ObjectExpression') {
                            mapObj.properties.forEach((prop: any) => {
                                if (prop.type === 'ObjectProperty') {
                                    const localName = prop.key.name || prop.key.value; // Identifier or StringLiteral key
                                    
                                    // Value can be StringLiteral or ...
                                    if (prop.value.type === 'StringLiteral') {
                                        const originalName = prop.value.value;
                                        mapping[localName] = { type: type!, originalName, namespace };
                                    } 
                                    // Complex cases (arrow function) are skipped for now
                                }
                            });
                        }
                    }
                }
            });
            
        } catch (e) {
            // console.error('ComponentMapper parse error', e); 
            // Silent fail is ok, maybe syntax error in user code
        }
        
        return mapping;
    }
}
