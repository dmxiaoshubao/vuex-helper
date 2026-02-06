import * as vscode from 'vscode';

export type VuexContextType = 'state' | 'getter' | 'mutation' | 'action' | 'unknown';

export interface VuexContext {
    type: VuexContextType;
    method: 'mapHelper' | 'dispatch' | 'commit' | 'access'; // 'access' for this.$store.state.xxx
    namespace?: string;
}

export class VuexContextScanner {
    
    /**
     * Determines the Vuex context at the given position.
     * Scans backwards to find if we are inside matchers like mapState([...]), this.$store.commit(...), etc.
     */
    public getContext(document: vscode.TextDocument, position: vscode.Position): VuexContext | undefined {
        const offset = document.offsetAt(position);
        const text = document.getText();
        
        // Safety check limit (look back max 2000 chars)
        const searchLimit = Math.max(0, offset - 2000);
        
        // Forward Scan on Window to simplify parsing
        const windowStart = searchLimit;
        const windowEnd = offset;
        const snippet = text.substring(windowStart, windowEnd);
        
        // Tokenize properly retaining string values to extract arguments
        const tokens = this.tokenize(snippet);
        
        // Parse stack to find enclosing function call and extracted args
        return this.analyzeTokens(tokens);
    }
    
    private tokenize(code: string): { type: 'word' | 'symbol' | 'string', value: string, index: number }[] {
        const tokens: { type: 'word' | 'symbol' | 'string', value: string, index: number }[] = [];
        
        // Regex: 
        // 1. Strings: "...", '...', `...` - match content non-greedily including newlines
        // 2. Symbols: ( ) [ ] { } ,
        // 3. Words: identifiers
        
        // Note: [\s\S] matches any character including newline
        const tokenRegex = /("[\s\S]*?"|'[\s\S]*?'|`[\s\S]*?`)|([(){},\[\]])|([a-zA-Z0-9_$]+)/g;
        
        // Pre-process: replace comments with spaces to avoid matching inside comments
        // Block comments: /\*[\s\S]*?\*/
        // Line comments: //.*$
        
        // We do this carefully. If we just blindly replace, we might mess up if a comment looks like a string or vice versa.
        // But for a simple scanner, standard strip is usually okay.
        const codeWithoutComments = code.replace(/\/\/.*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        
        let match;
        while ((match = tokenRegex.exec(codeWithoutComments)) !== null) {
            if (match[1]) {
                tokens.push({ type: 'string', value: match[1], index: match.index });
            } else if (match[2]) {
                tokens.push({ type: 'symbol', value: match[2], index: match.index });
            } else if (match[3]) {
                tokens.push({ type: 'word', value: match[3], index: match.index });
            }
        }
        return tokens;
    }
    
    private analyzeTokens(tokens: { type: string, value: string }[]): VuexContext | undefined {
        // Stack to track brackets/parentheses and what precedes them
        // We also want to track arguments 'accumulated' inside the current parentheses scope
        const outputStack: { token: string, index: number, precedingWord: string, extractedArgs: string[] }[] = [];
        
        let prevWord = '';
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            if (token.type === 'symbol') {
                if (['(', '{', '['].includes(token.value)) {
                    outputStack.push({ 
                        token: token.value, 
                        index: i, 
                        precedingWord: prevWord,
                        extractedArgs: [] 
                    });
                    prevWord = '';
                } else if ([')', '}', ']'].includes(token.value)) {
                    if (outputStack.length > 0) {
                        const last = outputStack[outputStack.length - 1];
                        // Basic matching check
                        if ((token.value === ')' && last.token === '(') ||
                            (token.value === '}' && last.token === '{') ||
                            (token.value === ']' && last.token === '[')) {
                            outputStack.pop();
                        }
                    }
                    prevWord = '';
                } else if (token.value === ',') {
                     // Comma separates arguments. 
                     // We don't strictly need to track commas unless we want to know WHICH arg index we are at.
                     // But for namespace extraction, we just grab all strings seen so far at this level.
                     prevWord = '';
                }
            } else if (token.type === 'string') {
                // If we are directly inside a function call '(', this string is an argument
                 if (outputStack.length > 0) {
                     const last = outputStack[outputStack.length - 1];
                     if (last.token === '(') {
                        last.extractedArgs.push(token.value);
                     }
                 }
                 prevWord = '';
            } else {
                // word
                prevWord = token.value;
            }
        }
        
        // Now, look at the stack to find the immediate Vuex context.
        // We traverse from innermost (top of stack) to outwards.
        
        for (let i = outputStack.length - 1; i >= 0; i--) {
            const frame = outputStack[i];
            
            if (frame.token === '(') {
                const func = frame.precedingWord;
                let namespace: string | undefined = undefined;
                
                // Identify namespace if present
                // Typically mapState('namespace', [...])
                // The frame.extractedArgs contains all strings encountered *directly* in this scope BEFORE the cursor.
                // If use wrote mapState('ns', [ ... cursor ... ]), the scanner sees 'ns' then '[' then cursor is inside brackets.
                // So the PARENT frame (the mapState call) will have 'ns' in its extractedArgs.
                // But wait, the loop above processes tokens *linearly*.
                // If we entered '[', we pushed a new frame.
                // The `extractedArgs` of the PARENT frame (mapState) *already* captured 'ns' before pushing '[' ?
                // YES, because 'ns' appeared before '['.
                
                if (frame.extractedArgs.length > 0) {
                    const firstArg = frame.extractedArgs[0];
                    // Strip quotes
                    if (firstArg.length >= 2) {
                         namespace = firstArg.slice(1, -1);
                    }
                }
                
                if (func === 'mapState') return { type: 'state', method: 'mapHelper', namespace };
                if (func === 'mapGetters') return { type: 'getter', method: 'mapHelper', namespace };
                if (func === 'mapMutations') return { type: 'mutation', method: 'mapHelper', namespace };
                if (func === 'mapActions') return { type: 'action', method: 'mapHelper', namespace };
                
                if (func === 'commit') return { type: 'mutation', method: 'commit', namespace }; // commit('ns/mut') is one string, not separate args usually.
                if (func === 'dispatch') return { type: 'action', method: 'dispatch', namespace };
            }
        }
        
        return undefined;
    }
}
