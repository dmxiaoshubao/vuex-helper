import * as vscode from 'vscode';

export type VuexItemType = 'state' | 'getter' | 'mutation' | 'action';
export type VuexMappedItemType = 'state' | 'getter' | 'mutation' | 'action';

export interface VuexMappedInfo {
    type: VuexMappedItemType;
    originalName: string;
    namespace?: string;
}

export interface StringLiteralAtPosition {
    path: string;
    range: vscode.Range;
}

/**
 * 三个 Provider（Completion / Definition / Hover）共用的工具函数。
 * 提取自各 Provider 中完全重复的私有方法，统一维护。
 */

/** 从 rawPrefix 中提取 state.xxx 访问路径 */
export function extractStateAccessPath(rawPrefix: string, word: string): string | undefined {
    const match = rawPrefix.match(/\bstate(?:\?\.|\.)([A-Za-z0-9_$\.?]*)$/);
    if (!match) return undefined;
    const left = (match[1] || '').replace(/\?\./g, '.').replace(/\?/g, '');
    if (!left) return word;
    return `${left}${word}`;
}

/** rootState.xxx / rootGetters.xxx 的路径提取 */
export function extractRootAccessPath(rawPrefix: string, word: string, keyword: 'rootState' | 'rootGetters'): string | undefined {
    const pattern = new RegExp(`\\b${keyword}(?:\\?\\.|\\.)([A-Za-z0-9_$\\.?]*)$`);
    const match = rawPrefix.match(pattern);
    if (!match) return undefined;
    const left = (match[1] || '').replace(/\?\./g, '.').replace(/\?/g, '');
    if (!left) return word;
    return `${left}${word}`;
}

/** rootGetters['xxx'] 方括号语法路径提取 */
export function extractBracketPath(rawPrefix: string, keyword: string): string | undefined {
    const pattern = new RegExp(`\\b${keyword}(?:\\?\\.)?\\[['"]([^'"]*)$`);
    const match = rawPrefix.match(pattern);
    if (!match) return undefined;
    return match[1] || '';
}

/** 从光标位置提取字符串字面量路径（支持 'a/b'） */
export function extractStringLiteralPathAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): StringLiteralAtPosition | undefined {
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
    return {
        path: lineText.substring(start + 1, end).trim(),
        range: new vscode.Range(position.line, start, position.line, end + 1),
    };
}

/** 检测字符串前缀是否是 store getter/state 方括号访问 */
export function detectStoreBracketAccessor(
    textBefore: string,
    currentNamespace?: string[],
): 'getter' | 'state' | undefined {
    const normalized = textBefore.replace(/\?\./g, '.');

    if (/\brootGetters\.?\s*\[$/.test(normalized)) return 'getter';
    if (/\brootState\.?\s*\[$/.test(normalized)) return 'state';

    const storeMatch = normalized.match(/\$store\.(getters|state)\.?\s*\[$/);
    if (storeMatch) {
        return storeMatch[1] === 'getters' ? 'getter' : 'state';
    }

    if (currentNamespace && /(?:^|[\s,(\[{;:=])getters\.?\s*\[$/.test(normalized)) {
        return 'getter';
    }
    if (currentNamespace && /(?:^|[\s,(\[{;:=])state\.?\s*\[$/.test(normalized)) {
        return 'state';
    }

    return undefined;
}

/** 提取 this.$store.state/getters 链式访问路径（支持可选链） */
export function extractStoreAccessPath(
    rawPrefix: string,
    word: string
): { type: 'state' | 'getter'; accessPath: string } | undefined {
    const match = rawPrefix.match(/\$store(?:\?\.|\.)((?:state|getters))(?:\?\.|\.)([A-Za-z0-9_$.?]*)$/);
    if (!match) return undefined;

    const accessType = match[1] === 'state' ? 'state' : 'getter';
    const leftPath = (match[2] || '').replace(/\?\./g, '.').replace(/\?/g, '');
    const accessPath = leftPath ? `${leftPath}${word}` : word;
    return { type: accessType, accessPath };
}

/** 判断 suffix 是否表示链式属性继续（.foo 或 ?.foo） */
export function hasChainedPropertySuffix(rawSuffix: string): boolean {
    return /^(?:\?\.|\.)([A-Za-z0-9_$\.]+)/.test(rawSuffix);
}

/** 解析 this['a/b'] / vm['a/b'] 或 this.foo 场景下的映射项 */
export function resolveMappedItem(
    mapping: Record<string, VuexMappedInfo>,
    rawPrefix: string,
    word: string
): VuexMappedInfo | undefined {
    const direct = mapping[word];
    if (direct) return direct;

    const bracketMappedPathPrefix = extractBracketPath(rawPrefix, 'this') ?? extractBracketPath(rawPrefix, 'vm');
    if (!bracketMappedPathPrefix) return undefined;

    const fullMappedKey = `${bracketMappedPathPrefix}${word}`;
    return mapping[fullMappedKey];
}

/** 构建查找候选项，统一处理命名空间和点号路径 */
export function buildLookupCandidates(
    name: string,
    type: VuexItemType,
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

/**
 * 精确检测光标所在的 commit/dispatch 调用是否携带 { root: true } 选项。
 * 通过括号配对提取当前调用体，避免误匹配同函数内其他调用。
 */
export function hasRootTrueOption(
    document: vscode.TextDocument,
    position: vscode.Position,
    method: 'commit' | 'dispatch',
    calleeName?: string,
): boolean {
    const MAX_SCAN_WINDOW = 5000;
    const offset = document.offsetAt(position);
    const hasRangeApi =
        typeof (document as any).positionAt === 'function' &&
        typeof (document as any).lineCount === 'number';

    let source: string;
    let localOffset: number;
    if (hasRangeApi) {
        const startOffset = Math.max(0, offset - MAX_SCAN_WINDOW);
        const lastLine = document.lineAt(document.lineCount - 1);
        const documentEndOffset = document.offsetAt(new vscode.Position(document.lineCount - 1, lastLine.text.length));
        const endOffset = Math.min(documentEndOffset, offset + MAX_SCAN_WINDOW);
        source = document.getText(
            new vscode.Range(
                document.positionAt(startOffset),
                document.positionAt(endOffset),
            ),
        );
        localOffset = offset - startOffset;
    } else {
        // Unit-test fallback where mock TextDocument may only implement getText()/offsetAt.
        source = document.getText();
        localOffset = offset;
    }
    const callName = (calleeName || method).trim();

    // 精确提取光标所在的那个 commit/dispatch 调用体
    const callBody = extractCurrentCallBody(source, localOffset, callName);
    if (!callBody) return false;

    // 1. 直接在调用体内检测 { root: true }
    if (/\broot\s*:\s*true\b/.test(callBody)) {
        return true;
    }

    // 2. 检测第三个参数是标识符引用（如 opts），再在附近查找该变量的定义
    const thirdArgMatch = callBody.match(
        /,\s*([A-Za-z_$][\w$]*)\s*\)?\s*$/,
    );
    if (!thirdArgMatch) return false;

    const id = thirdArgMatch[1];
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const localWindowStart = Math.max(0, localOffset - 2000);
    const localWindowEnd = Math.min(source.length, localOffset + 2000);
    const windowText = source.substring(localWindowStart, localWindowEnd);

    // 变量声明: const opts = { root: true }
    const declPattern = new RegExp(
        `\\b(?:const|let|var)\\s+${escapedId}\\s*=\\s*\\{[\\s\\S]{0,600}?\\broot\\s*:\\s*true\\b`,
    );
    if (declPattern.test(windowText)) return true;

    // 变量赋值: opts = { root: true }
    const assignPattern = new RegExp(
        `\\b${escapedId}\\s*=\\s*\\{[\\s\\S]{0,600}?\\broot\\s*:\\s*true\\b`,
    );
    if (assignPattern.test(windowText)) return true;

    // 工厂函数: const opts = buildOpts({ root: true })
    const methodLikePattern = new RegExp(
        `\\b(?:const|let|var)\\s+${escapedId}\\s*=\\s*[A-Za-z_$][\\w$]*\\([\\s\\S]{0,300}?\\broot\\s*:\\s*true\\b`,
    );
    if (methodLikePattern.test(windowText)) return true;

    return false;
}

/**
 * 从光标位置向前找到当前所在的 callName( 调用，
 * 然后用括号配对提取整个调用体文本。
 */
export function extractCurrentCallBody(
    source: string,
    cursorOffset: number,
    callName: string,
): string | undefined {
    const searchStart = Math.max(0, cursorOffset - 2000);
    const before = source.substring(searchStart, cursorOffset);

    const escaped = callName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\s*\\(`, 'g');
    let lastMatch: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(before)) !== null) {
        lastMatch = m;
    }
    if (!lastMatch) return undefined;

    // 开始括号在源码中的绝对位置
    const openParenOffset = searchStart + lastMatch.index + lastMatch[0].length - 1;

    // 从开始括号向后用括号配对找到闭合括号
    let depth = 1;
    let i = openParenOffset + 1;
    const limit = Math.min(source.length, openParenOffset + 2000);
    let inString: string | false = false;
    while (i < limit && depth > 0) {
        const ch = source[i];
        if (inString) {
            if (ch === inString && source[i - 1] !== '\\') {
                inString = false;
            }
        } else {
            if (ch === '\x27' || ch === '\x22' || ch === '\x60') {
                inString = ch;
            } else if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
            }
        }
        i++;
    }

    return source.substring(openParenOffset, i);
}
