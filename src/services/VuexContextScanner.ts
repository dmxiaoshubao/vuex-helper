
import * as vscode from 'vscode';

export type VuexContextType = 'state' | 'getter' | 'mutation' | 'action' | 'unknown';

export interface VuexContext {
    type: VuexContextType;
    method: 'mapHelper' | 'dispatch' | 'commit' | 'access'; // 'access' for this.$store.state.xxx
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
        
        let bracketStack: string[] = []; // ), ], }
        
        // Lexer state
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inBacktick = false;
        let inLineComment = false;
        let inBlockComment = false;

        // Traverse backwards from current position
        // We need to skip the current "word" or string we are hovering/typing in
        // So actually, if we are INSIDE a string, we simply treat it as "content". 
        // But for the scanner, we initiate from OUTSIDE the current string if possible, 
        // OR we just scan backwards char by char and handle state.
        
        // To simplify: let's scan backwards from the character BEFORE the current cursor/word.
        // But if we are in "SET_NAME", we are inside a string.
        // The scanner logic below assumes we are looking for the *container*.
        // So we need to handle the fact that we might be in a string currently.
        
        // Better approach:
        // 1. Identify if we are inside a string at `position`. If so, start scan from start of string.
        // 2. Identify if we are inside a generic identifier.
        // But the robust way is: strict backward scan tracking state.
        
        // Let's implement strict scan from `offset - 1`.
        
        for (let i = offset - 1; i >= searchLimit; i--) {
            const char = text[i];
            const prevChar = text[i - 1] || '';
            const nextChar = text[i + 1] || ''; // 'next' in forward sense, but we are looking backward. 
            // Actually 'text[i+1]' is physically next.
            
            // Handle Comments/Strings "Un-Entering" (since we go backwards)
            // It's tricky to go backwards because we don't know if a quote is opening or closing without context from start.
            // BUT, usually for syntax highlighting, we go forward.
            // Backwards lexing is notorious for being hard due to ambiguity (is ' the start or end?).
            
            // COMPROMISE:
            // Since we only look back 200 character usually for mapHelpers...
            // AND we know JS syntax is well structured.
            
            // Simplification: 
            // Identify the CallExpression signature.
            // We want to find `mapMutations(` or `commit(` or `dispatch(`.
            
            // Let's try a regex on the substring preceding the cursor?
            // "mapMutations\s*\(\s*(\"|'|`).*?,\s*(\[|\{)"
            // This is hard for nested structures.
            
            // Let's stick to the stack based scanner but handle the "End of string" issue properly?
            // Actually, we can just filter out all contents of strings/comments by replacing them with whitespace
            // in a forward pass on the window of text?
            
            // YES. Get text from (offset - 2000) to (offset).
            // Strip comments and strings.
            // Then look at the remaining tokens.
        }
        
        // Implementation: Forward Scan on Window
        const windowStart = Math.max(0, offset - 2000);
        const windowEnd = offset; // Scan up to cursor
        const snippet = text.substring(windowStart, windowEnd);
        
        // Strip string literals and comments to simplify parsing
        const cleaned = this.stripCode(snippet);
        
        // Now looks like: mapMutations ( "..." , [  ...      
        // With current cursor at end.
        
        // Find the last "meaningful" context opener
        // We look for patterns like:
        // mapHelpers ( ... 
        // $store.commit ( ...
        
        // Since we blindly stripped strings, the "namespace" arg in mapMutations is gone (replaced by space/placeholder).
        // That's fine. We just want to know WHICH helper it is.
        
        return this.analyzeContext(cleaned);
    }
    
    private stripCode(code: string): string {
        // Replace string contents and comments with spaces, preserving length/layout? 
        // Length preservation is important if we used absolute offsets, but here we just analyze structure.
        // Actually we don't need to preserve length for this logic, just structure.
        
        return code
            .replace(/\/\/.*$/gm, ' ') // Line comments
            .replace(/\/\*[\s\S]*?\*\//g, ' ') // Block comments
            .replace(/'[^']*'/g, "''") // Single quotes
            .replace(/"[^"]*"/g, '""') // Double quotes
            .replace(/`[^`]*`/g, '``'); // Backticks (simple, ignores templates ${})
    }
    
    private analyzeContext(code: string): VuexContext | undefined {
        // We want to find the "closest" call that encloses the end of the string.
        // We can simply stack-parse the cleaned code.
        
        const stack: { char: string, index: number }[] = [];
        // Tracks: (, {, [
        
        // We also need to track the "keyword" before the stored '('.
        // But simplified: Just parse, and when we hit the end of string, check the stack.
        
        let lastToken = '';
        const tokens: { text: string, end: number }[] = [];
        
        // Simple tokenizer
        const regex = /([a-zA-Z0-9_$]+)|([(){},\[\]])/g;
        let match;
        
        while ((match = regex.exec(code)) !== null) {
            tokens.push({ text: match[0], end: regex.lastIndex });
        }
        
        // Iterate tokens
        // For '(', '{', '[' push
        // For ')', '}', ']' pop
        // If stack is not empty at end... process it.
        
        const outputStack: { token: string, index: number, precedingWord: string }[] = [];
        
        let prevWord = '';
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const t = token.text;
            
            if (['(', '{', '['].includes(t)) {
                outputStack.push({ token: t, index: token.end, precedingWord: prevWord });
                prevWord = ''; // Reset
            } else if ([')', '}', ']'].includes(t)) {
                if (outputStack.length > 0) {
                    const last = outputStack[outputStack.length - 1];
                    // Basic matching check
                    if ((t === ')' && last.token === '(') ||
                        (t === '}' && last.token === '{') ||
                        (t === ']' && last.token === '[')) {
                        outputStack.pop();
                    }
                }
                prevWord = '';
            } else {
                // It's a word
                prevWord = t;
            }
        }
        
        // If we are "inside" something, the stack will have leftovers.
        // We look at the innermost relevant container.
        
        // Case: mapMutations(['...'])
        // Stack: 
        // 1. ( -> preceding: mapMutations
        // 2. [ -> preceding: (empty)
        
        // Case: mapMutations({ ... })
        // Stack:
        // 1. ( -> preceding: mapMutations
        // 2. { -> preceding: (empty)
        
        // Case: commit('...')
        // Stack:
        // 1. ( -> preceding: commit
        
        // We iterate stack from bottom up (outer to inner) or top down?
        // We want the most specific Vuex context.
        
        for (let i = outputStack.length - 1; i >= 0; i--) {
            const frame = outputStack[i];
            
            if (frame.token === '(') {
                // Check preceding word
                const func = frame.precedingWord;
                
                // Handle "state.count" access? Not a function call. skip.
                
                if (func === 'mapState') return { type: 'state', method: 'mapHelper' };
                if (func === 'mapGetters') return { type: 'getter', method: 'mapHelper' };
                if (func === 'mapMutations') return { type: 'mutation', method: 'mapHelper' };
                if (func === 'mapActions') return { type: 'action', method: 'mapHelper' };
                
                if (func === 'commit') return { type: 'mutation', method: 'commit' }; // Could be store.commit
                if (func === 'dispatch') return { type: 'action', method: 'dispatch' };
            }
            
            // If inside [ or {
            // We need to look at parent of [ or {.
            // The loop continues up the stack.
        }
        
        return undefined;
    }
}
