import * as vscode from "vscode";
import { StoreIndexer } from "../services/StoreIndexer";
import { VuexContextScanner } from "../services/VuexContextScanner";
import { ComponentMapper } from "../services/ComponentMapper";

export class VuexCompletionItemProvider
  implements vscode.CompletionItemProvider
{
  private contextScanner: VuexContextScanner;
  private componentMapper: ComponentMapper;
  private storeIndexer: StoreIndexer;

  constructor(storeIndexer: StoreIndexer) {
    this.storeIndexer = storeIndexer;
    this.contextScanner = new VuexContextScanner();
    this.componentMapper = new ComponentMapper();
  }

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
    const storeMap = this.storeIndexer.getStoreMap();
    if (!storeMap) {
      return undefined;
    }

    const currentNamespace = this.storeIndexer.getNamespace(document.fileName);

    // 1. Vuex Context (String literals) - existing logic
    const vuexContext = this.contextScanner.getContext(document, position);

    if (vuexContext && vuexContext.type !== "unknown") {
      const contextLineText = document.lineAt(position.line).text;
      const contextPrefix = contextLineText.substring(0, position.character);
      const callName =
        vuexContext.method === "commit" || vuexContext.method === "dispatch"
          ? (vuexContext.calleeName || vuexContext.method).trim()
          : "";
      const escapedCallName = callName
        ? callName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        : "";
      const commitDispatchArgMatch =
        vuexContext.method === "commit" || vuexContext.method === "dispatch"
          ? contextPrefix.match(new RegExp(`${escapedCallName}\\(\\s*['"]([^'"]*)$`))
          : null;
      const hasExplicitNamespaceInput =
        !!commitDispatchArgMatch && commitDispatchArgMatch[1].includes("/");
      const hasRootTrueOption =
        vuexContext.method === "commit" || vuexContext.method === "dispatch"
          ? this.hasRootTrueOption(document, position, vuexContext.method, vuexContext.calleeName)
          : false;

      let items: {
        name: string;
        documentation?: string;
        modulePath: string[];
      }[] = [];
      let kind = vscode.CompletionItemKind.Property;

      // Special Case: mapHelper arg 0 -> Show Modules
      if (
        vuexContext.method === "mapHelper" &&
        vuexContext.argumentIndex === 0 &&
        !vuexContext.isNested
      ) {
        // Collect all unique modules
        const allModules = new Set<string>();
        // Gather modules from all stores
        [
          ...storeMap.state,
          ...storeMap.getters,
          ...storeMap.mutations,
          ...storeMap.actions,
        ].forEach((item) => {
          const path = item.modulePath.join("/");
          if (path) allModules.add(path);
        });

        // Create Module items
        const moduleItems: vscode.CompletionItem[] = [];
        allModules.forEach((mod) => {
          const item = this.createCompletionItem(
            mod,
            vscode.CompletionItemKind.Module,
            "[Vuex Module]",
          );
          moduleItems.push(item);
        });

        items = []; // Clear other items
        // We will use existing robust quote/range logic below to render these moduleItems
        // Just map them to the structure expected by the logic below?
        // The logic below expects { name, documentation, modulePath }.
        // Let's adapt.

        // We can just return here?
        // Wait, existing logic below handles "Smart Quote Insertion". WE NEED THAT.
        // So we should populate `items` with our module items but adapted to the interface expected?
        // The interface is `{ name: string, documentation?: string, modulePath: string[] }[]`.
        // If we treat "module path" as the "name" and empty modulePath?

        // Let's create a temporary list compatible with the logic below.
        const tempItems = Array.from(allModules).map((mod) => ({
          name: mod,
          modulePath: [] as string[], // It's just a name
          documentation: `Vuex Module: ${mod}`,
        }));

        // Update items
        items = tempItems;
        kind = vscode.CompletionItemKind.Module;
      } else {
        // Normal Logic
        if (vuexContext.type === "state") {
          items = storeMap.state;
          kind = vscode.CompletionItemKind.Field;
        } else if (vuexContext.type === "getter") {
          items = storeMap.getters;
          kind = vscode.CompletionItemKind.Property;
        } else if (vuexContext.type === "mutation") {
          items = storeMap.mutations;
          kind = vscode.CompletionItemKind.Method;
        } else if (vuexContext.type === "action") {
          items = storeMap.actions;
          kind = vscode.CompletionItemKind.Function;
        }

        // Filtering by Namespace
        if (vuexContext.namespace) {
          const ns = vuexContext.namespace;
          items = items.filter((i) => i.modulePath.join("/") === ns);
        } else if (
          currentNamespace &&
          (vuexContext.type === "mutation" || vuexContext.type === "action") &&
          !hasRootTrueOption &&
          !(hasExplicitNamespaceInput && (vuexContext.method === "commit" || vuexContext.method === "dispatch"))
        ) {
          // If inside a module, scoped completion for commit/dispatch
          // Filter to only current module items (Strict scoping as per user request)
          const nsJoined = currentNamespace.join("/");
          items = items.filter((i) => i.modulePath.join("/") === nsJoined);
        }
      }

      // Smart Quote Insertion - Robust Logic (Manual Scan)
      const lineText = document.lineAt(position.line).text;
      const prefix = lineText.substring(0, position.character);

      let currentWordLength = 0;
      let foundContent = false;
      let whitespaceSuffix = "";

      // Scan backwards to find the current "word" (key path) plus trailing spaces
      // Robust logic:
      // 1. Absorb trailing spaces into whitespaceSuffix.
      // 2. If we find content (non-space), we keep the whitespaceSuffix as part of the match.
      // 3. If we hit the start of line (or limit) and NO content was found (pure whitespace/indentation), we IGNORE the whitespace.

      for (let i = prefix.length - 1; i >= 0; i--) {
        const char = prefix.charAt(i);

        // Hard separators - stop immediately
        if (
          [
            "'",
            '"',
            "`",
            "[",
            "]",
            "(",
            ")",
            ",",
            "{",
            "}",
            ":",
            ";",
            ".",
          ].includes(char)
        ) {
          break;
        }

        // Space handling
        if ([" ", "\t", "\n", "\r"].includes(char)) {
          if (foundContent) {
            // Space AFTER content -> This suggests we hit a word boundary
            // e.g. "param1 param2" -> param2 is the word, param1 is separate.
            break;
          }
          // Space BEFORE content (trailing space relative to typing direction) -> absorb it
          whitespaceSuffix = char + whitespaceSuffix;
        } else {
          // Non-space content found
          foundContent = true;
        }

        // Non-space content found, count it
        currentWordLength++;
      }

      // CRITICAL FIX: If we only found whitespace (indentation), DO NOT include it in replacement.
      if (!foundContent) {
        currentWordLength = 0;
        whitespaceSuffix = "";
      }

      // Calculate the range to replace.
      const replacementRange = new vscode.Range(
        position.line,
        position.character - currentWordLength,
        position.line,
        position.character,
      );

      // Look at what's before the current word to detect context
      const effectivePrefix = prefix
        .substring(0, prefix.length - currentWordLength)
        .trimEnd();
      const lastChar = effectivePrefix.charAt(effectivePrefix.length - 1);

      const isInsideQuote = ["'", '"', "`"].includes(lastChar);

      const isPropertyAccess = lastChar === ".";

      // Handling Property Access (e.g. "state." or "state.user.")
      if (isPropertyAccess && vuexContext.type === "state") {
        // 1. Extract the dotted path after "state." relative to the current namespace
        // effectivePrefix (e.g. "... state.user.") -> split by dot
        const match = effectivePrefix.match(/state\.([\w\.]*)$/);
        let relativePath: string[] = [];
        let pathPrefix = ""; // 用于 filterText 优化

        if (match && match[1] !== undefined) {
          const pathStr = match[1]; // e.g. "user." or ""
          pathPrefix = pathStr; // 保留完整路径（包括尾部点号）用于 filterText
          const inner = pathStr.slice(0, -1); // remove trailing dot
          if (inner.length > 0) {
            relativePath = inner.split(".");
          }
        }

        // Combined path = helper namespace (if present) + relativePath.
        // For createNamespacedHelpers/mapState('ns', {...}) callback, `state` is module-local state,
        // so we must anchor suggestions to that namespace instead of current file namespace.
        const contextNamespace = vuexContext.namespace
          ? vuexContext.namespace.split("/").filter(Boolean)
          : undefined;
        const baseNamespace = contextNamespace || currentNamespace || [];
        const targetPath = [...baseNamespace, ...relativePath];

        // 计算正确的替换范围：从点号位置到光标位置
        // 光标位置 - currentWordLength 是用户输入的起始位置
        // 再 -1 是点号的位置
        const dotPosition = position.character - currentWordLength - 1;
        const dotRange = new vscode.Range(
          position.line,
          Math.max(0, dotPosition),
          position.line,
          position.character,
        );

        const suggestions = new Map<string, vscode.CompletionItem>();

        // Use full state collection for path traversal. `items` may be pre-filtered for non-property
        // contexts, which would lose descendant paths in namespaced state callbacks.
        const stateTraversalItems = storeMap.state;
        stateTraversalItems.forEach((item) => {
          // Check if item belongs to the target path hierarchy
          // item.modulePath must start with targetPath

          // Check match:
          if (item.modulePath.length < targetPath.length) return;

          for (let i = 0; i < targetPath.length; i++) {
            if (item.modulePath[i] !== targetPath[i]) return;
          }

          // Now determine if it's a direct property or a submodule
          const remainingPath = item.modulePath.slice(targetPath.length);

          if (remainingPath.length === 0) {
            // Direct property
            const label = item.name;
            if (!suggestions.has(label)) {
              const ci = this.createCompletionItem(
                label,
                vscode.CompletionItemKind.Field,
                "[Vuex] State",
                item.documentation,
              );
              // 使用点号范围的插入文本，包含点号
              ci.insertText = "." + label;
              ci.range = dotRange;
              // filterText 包含点号以便正确过滤
              ci.filterText = "." + pathPrefix + label;
              suggestions.set(label, ci);
            }
          } else {
            // Submodule
            // Suggest the next segment
            const nextModule = remainingPath[0];
            if (!suggestions.has(nextModule)) {
              const ci = this.createCompletionItem(
                nextModule,
                vscode.CompletionItemKind.Module,
                "[Vuex] Module",
              );
              ci.insertText = "." + nextModule;
              ci.range = dotRange;
              ci.filterText = "." + pathPrefix + nextModule;
              suggestions.set(nextModule, ci);
            }
          }
        });

        return new vscode.CompletionList(
          Array.from(suggestions.values()),
          false,
        );
      }

      const results = items.map((item) => {
        let label = [...item.modulePath, item.name].join("/");
        const isCommitDispatchArg0 =
          (vuexContext.method === "commit" || vuexContext.method === "dispatch") &&
          vuexContext.argumentIndex === 0;
        const isLocalCommitDispatchArg0 =
          isCommitDispatchArg0 && !vuexContext.isStoreMethod && !hasRootTrueOption;
        // If inside a module and matches current namespace, use short name
        if (
          currentNamespace &&
          item.modulePath.join("/") === currentNamespace.join("/") &&
          (!isCommitDispatchArg0 || isLocalCommitDispatchArg0)
        ) {
          label = item.name;
        }
        // OR if explicit namespace arg was provided (handled by existing logic, but let's be safe)
        if (vuexContext.namespace) {
          label = item.name;
        }

        const completionItem = this.createCompletionItem(
          label,
          kind,
          `[Vuex] ${vuexContext.type}`,
          item.documentation,
        );

        // 始终设置 filterText 以确保一致的过滤和排序行为
        completionItem.filterText = label + (whitespaceSuffix || "");

        // 处理替换范围和插入文本，考虑光标右侧的空格和引号
        if (isInsideQuote) {
          // 获取开始引号的类型
          const quoteChar = lastChar; // lastChar 就是开始引号（' 或 "）

          // 在引号内，需要检查右侧是否有空格和相同类型的引号
          const lineTextAfterCursor = lineText.substring(position.character);

          // 计算右侧需要包含的字符数和闭合引号位置
          const { spacesCount, hasClosing: hasClosingQuote, closingIndex } =
            this.scanRightSide(lineTextAfterCursor, quoteChar);

          if (hasClosingQuote) {
            // 如果有闭合引号，扩展范围到包含引号之前的内容（包括中间的字符如 "Name"）
            // closingIndex 是相对于 lineTextAfterCursor 的位置
            const rightExtension = closingIndex; // 包含从光标到闭合引号之间的所有内容
            const extendedRange = new vscode.Range(
              replacementRange.start.line,
              replacementRange.start.character,
              replacementRange.end.line,
              replacementRange.end.character + rightExtension,
            );
            completionItem.range = extendedRange;
            completionItem.insertText = label;
          } else {
            // 如果没有闭合引号，只包含空格，并添加闭合引号
            const extendedRange = new vscode.Range(
              replacementRange.start.line,
              replacementRange.start.character,
              replacementRange.end.line,
              replacementRange.end.character + spacesCount,
            );
            completionItem.range = extendedRange;
            completionItem.insertText = `${label}${quoteChar}`;
          }
        } else {
          // 不在引号内，添加引号
          completionItem.range = replacementRange;
          if (vuexContext.isObject) {
            const alias = item.name;
            completionItem.insertText = `${alias}: '${label}'`;
            completionItem.filterText = `${alias}: '${label}'`;
          } else {
            completionItem.insertText = `'${label}'`;
            completionItem.filterText = `'${label}'`;
          }
        }

        return completionItem;
      });

      return new vscode.CompletionList(results, false);
    }

    // 2. this.$store.state. or this.$store.getters. completion
    const lineText = document.lineAt(position.line).text;
    const prefix = lineText.substring(0, position.character);
    const normalizedPrefix = prefix.replace(/\?\./g, ".");

    // 2a. Match bracket notation: this.$store.state['xxx'] or this.$store.getters['xxx']
    // 匹配到开始引号为止，后面的内容（包括可能的结束引号）通过 prefix 来确定
    const storeBracketMatch = normalizedPrefix.match(
      /(?:this|vm)\.\$store\.(state|getters)\[['"]([^'"]*)/,
    );

    if (storeBracketMatch) {
      const propertyType = storeBracketMatch[1]; // 'state' or 'getters'
      const partialInput = storeBracketMatch[2]; // e.g., "others/hasRole " or ""

      const items: vscode.CompletionItem[] = [];

      // Get the appropriate store items
      const storeItems =
        propertyType === "state" ? storeMap.state : storeMap.getters;

      storeItems.forEach((item: any) => {
        const fullPath = this.getFullPath(item);

        // 如果 partialInput 有内容且包含空格，进行精确匹配
        const trimmedInput = partialInput.trim();
        if (partialInput !== trimmedInput && trimmedInput !== fullPath) {
          // 有空格但不匹配，跳过
          return;
        }

        const completionItem = this.createCompletionItem(
          fullPath,
          propertyType === "state"
            ? vscode.CompletionItemKind.Field
            : vscode.CompletionItemKind.Property,
          `[Vuex Store] ${propertyType}`,
          item.documentation,
        );

        // 计算替换范围：从引号之后到光标位置，并延伸到右侧包含空格和结束符号
        const bracketIndex = prefix.lastIndexOf("[");
        const quoteChar = prefix.charAt(bracketIndex + 1); // 获取使用的引号类型（' 或 "）
        const quoteIndex = bracketIndex + 2; // [ 后面是引号，引号后面才是内容起始位置

        // 检查光标后面的内容
        const lineTextAfterCursor = lineText.substring(position.character);

        // 计算右侧需要包含的字符数：空格 + 可能的 ']
        const closingBracket = `${quoteChar}]`;
        const { spacesCount, hasClosing: hasClosingBracket, closingIndex } =
          this.scanRightSide(lineTextAfterCursor, closingBracket);

        // 简化逻辑：始终替换从引号后到闭合符号（如果有）或光标位置的内容
        if (hasClosingBracket) {
          // 如果有闭合符号，替换从引号后到闭合符号结束的所有内容
          // closingIndex 是闭合符号在 lineTextAfterCursor 中的起始位置
          // 需要包含的内容：closingIndex 个字符 + closingBracket 的长度
          const rightExtension = closingIndex + closingBracket.length;
          const replacementRange = new vscode.Range(
            position.line,
            quoteIndex,
            position.line,
            position.character + rightExtension,
          );
          completionItem.range = replacementRange;
          // 插入完整路径和闭合符号
          completionItem.insertText = `${fullPath}${closingBracket}`;
        } else {
          // 如果没有闭合符号，只包含空格，并添加闭合符号
          const rightExtension = spacesCount;
          const replacementRange = new vscode.Range(
            position.line,
            quoteIndex,
            position.line,
            position.character + rightExtension,
          );
          completionItem.range = replacementRange;
          completionItem.insertText = `${fullPath}${closingBracket}`;
        }

        // filterText 需要匹配用户的实际输入（包括空格），这样 VS Code 才能正确过滤
        completionItem.filterText =
          partialInput.trim() === fullPath ? partialInput : fullPath;

        items.push(completionItem);
      });

      return new vscode.CompletionList(items, false);
    }

    // 2b. Match this.$store.state.xxx or this.$store.getters.xxx (支持多级访问)
    const storePropertyMatch = normalizedPrefix.match(
      /(?:this|vm)\.\$store\.(state|getters)\.([\w\.\/]*)$/,
    );

    if (storePropertyMatch) {
      const propertyType = storePropertyMatch[1]; // 'state' or 'getters'
      const pathInput = storePropertyMatch[2]; // e.g., "user." or "user.na" or ""

      // 解析路径：分离模块路径和当前输入
      // "user.name" -> modulePath: ["user"], currentInput: "name"
      // "user." -> modulePath: ["user"], currentInput: ""
      // "name" -> modulePath: [], currentInput: "name"
      const pathParts = pathInput.split(".");
      const currentInput = pathParts[pathParts.length - 1] || "";
      const modulePath = pathParts.slice(0, -1);
      const accessToken = this.getAccessToken(prefix, currentInput.length);

      const items: vscode.CompletionItem[] = [];

      // Get the appropriate store items
      const storeItems =
        propertyType === "state" ? storeMap.state : storeMap.getters;

      const suggestions = new Map<string, vscode.CompletionItem>();

      storeItems.forEach((item: any) => {
        // 检查 item 是否匹配当前模块路径
        if (item.modulePath.length < modulePath.length) return;
        for (let i = 0; i < modulePath.length; i++) {
          if (item.modulePath[i] !== modulePath[i]) return;
        }

        const remainingPath = item.modulePath.slice(modulePath.length);

        if (remainingPath.length === 0) {
          // 直接属性
          const label = item.name;
          if (!suggestions.has(label)) {
            const ci = this.createCompletionItem(
              label,
              propertyType === "state"
                ? vscode.CompletionItemKind.Field
                : vscode.CompletionItemKind.Property,
              `[Vuex Store] ${propertyType}`,
              item.documentation,
            );

            const dotRange = this.createDotRange(
              position.line,
              position.character,
              currentInput.length,
              accessToken,
            );
            ci.range = dotRange;
            ci.insertText = accessToken + label;
            ci.filterText = accessToken + pathInput + label;
            this.boostOptionalChainPriority(ci, accessToken);
            suggestions.set(label, ci);
          }
        } else {
          // 子模块
          const nextModule = remainingPath[0];
          if (!suggestions.has(nextModule)) {
            const ci = this.createCompletionItem(
              nextModule,
              vscode.CompletionItemKind.Module,
              `[Vuex Store] Module`,
            );

            const dotRange = this.createDotRange(
              position.line,
              position.character,
              currentInput.length,
              accessToken,
            );
            ci.range = dotRange;
            ci.insertText = accessToken + nextModule;
            ci.filterText = accessToken + pathInput + nextModule;
            this.boostOptionalChainPriority(ci, accessToken);
            suggestions.set(nextModule, ci);
          }
        }
      });

      return new vscode.CompletionList(Array.from(suggestions.values()), false);
    }

    // 3. this.$store. completion (state, getters, commit, dispatch)
    const storeMatch = normalizedPrefix.match(
      /(?:this|vm)\.\$store\.([a-zA-Z0-9_$]*)$/,
    );

    if (storeMatch) {
      const partialInput = storeMatch[1]; // e.g., "d" or "dis" or ""
      const accessToken = this.getAccessToken(prefix, partialInput.length);
      const items: vscode.CompletionItem[] = [];

      // Calculate replacement range to include the dot
      const replacementRange = this.createDotRange(
        position.line,
        position.character,
        partialInput.length,
        accessToken,
      );

      // state
      const stateItem = this.createCompletionItem(
        "state",
        vscode.CompletionItemKind.Property,
        "[Vuex Store] Access state",
        "Access the Vuex store state tree",
      );
      stateItem.range = replacementRange;
      stateItem.insertText = `${accessToken}state`;
      stateItem.filterText = accessToken + partialInput + "state";
      this.boostOptionalChainPriority(stateItem, accessToken);
      items.push(stateItem);

      // getters
      const gettersItem = this.createCompletionItem(
        "getters",
        vscode.CompletionItemKind.Property,
        "[Vuex Store] Access getters",
        "Access the Vuex store getters",
      );
      gettersItem.range = replacementRange;
      gettersItem.insertText = `${accessToken}getters`;
      gettersItem.filterText = accessToken + partialInput + "getters";
      this.boostOptionalChainPriority(gettersItem, accessToken);
      items.push(gettersItem);

      // commit
      const commitItem = this.createCompletionItem(
        "commit",
        vscode.CompletionItemKind.Method,
        "[Vuex Store] Commit mutation",
        "Commit a mutation to the Vuex store",
      );
      commitItem.insertText = new vscode.SnippetString(
        `${accessToken}commit($0)`,
      );
      commitItem.range = replacementRange;
      commitItem.filterText = accessToken + partialInput + "commit";
      this.boostOptionalChainPriority(commitItem, accessToken);
      items.push(commitItem);

      // dispatch
      const dispatchItem = this.createCompletionItem(
        "dispatch",
        vscode.CompletionItemKind.Method,
        "[Vuex Store] Dispatch action",
        "Dispatch an action to the Vuex store",
      );
      dispatchItem.insertText = new vscode.SnippetString(
        `${accessToken}dispatch($0)`,
      );
      dispatchItem.range = replacementRange;
      dispatchItem.filterText = accessToken + partialInput + "dispatch";
      this.boostOptionalChainPriority(dispatchItem, accessToken);
      items.push(dispatchItem);

      return new vscode.CompletionList(items, false);
    }

    // 3. In-Module State Completion (state.xxx / state.a.b.xxx)
    if (currentNamespace) {
      const inModuleStateMatch = prefix.match(/\bstate\.([a-zA-Z0-9_$\.]*)$/);
      if (inModuleStateMatch) {
        const pathInput = inModuleStateMatch[1] || "";
        const pathParts = pathInput.split(".");
        const currentInput = pathParts[pathParts.length - 1] || "";
        const relativePath = pathParts.slice(0, -1).filter(Boolean);
        const targetPath = [...currentNamespace, ...relativePath];

        const replacementRange = this.createDotRange(
          position.line,
          position.character,
          currentInput.length,
        );

        const suggestions = new Map<string, vscode.CompletionItem>();

        storeMap.state.forEach((item: any) => {
          if (item.modulePath.length < targetPath.length) return;
          for (let i = 0; i < targetPath.length; i++) {
            if (item.modulePath[i] !== targetPath[i]) return;
          }

          const remainingPath = item.modulePath.slice(targetPath.length);
          if (remainingPath.length === 0) {
            const label = item.name;
            if (!suggestions.has(label)) {
              const completionItem = this.createCompletionItem(
                label,
                vscode.CompletionItemKind.Field,
                "[Vuex Module] state",
                item.documentation,
              );
              completionItem.range = replacementRange;
              completionItem.insertText = "." + label;
              completionItem.filterText = "." + pathInput + label;
              if (item.displayType) {
                completionItem.detail += ` : ${item.displayType}`;
              }
              suggestions.set(label, completionItem);
            }
          } else {
            const nextModule = remainingPath[0];
            if (!suggestions.has(nextModule)) {
              const completionItem = this.createCompletionItem(
                nextModule,
                vscode.CompletionItemKind.Module,
                "[Vuex Module] state",
              );
              completionItem.range = replacementRange;
              completionItem.insertText = "." + nextModule;
              completionItem.filterText = "." + pathInput + nextModule;
              suggestions.set(nextModule, completionItem);
            }
          }
        });

        return new vscode.CompletionList(Array.from(suggestions.values()), false);
      }
    }

    // 4. this.xxx or vm.xxx completion (mapped properties)
    const match = normalizedPrefix.match(/(?:this|vm)\.([a-zA-Z0-9_$]*)$/);

    // 4b. this['xxx'] or vm['xxx'] bracket notation completion
    const bracketMatch = normalizedPrefix.match(/(?:this|vm)\[['"]([^'"]*)$/);

    if (match || bracketMatch) {
      const mapping = this.componentMapper.getMapping(document);
      const items: vscode.CompletionItem[] = [];

      // 判断是点号访问还是方括号访问
      const isBracketAccess = !!bracketMatch;
      const partialInput = isBracketAccess ? bracketMatch![1] : match![1];

      if (isBracketAccess) {
        // 方括号访问: this['xxx']
        // 找到开始引号的位置来计算 range
        const quoteChar = prefix[prefix.lastIndexOf("[") + 1];

        // 检查光标后面的内容
        const lineTextAfterCursor = lineText.substring(position.character);
        const closingBracket = `${quoteChar}]`;
        const { closingIndex } = this.scanRightSide(lineTextAfterCursor, closingBracket);

        // 计算结束位置：包含右侧的结束引号和方括号
        const bracketEndChar = closingIndex >= 0
          ? position.character + closingIndex + closingBracket.length
          : position.character;

        for (const localName in mapping) {
          const info = mapping[localName];
          let kind = vscode.CompletionItemKind.Method;
          if (info.type === "state") kind = vscode.CompletionItemKind.Field;
          if (info.type === "getter") kind = vscode.CompletionItemKind.Property;

          const mappedDetail = `[Vuex Mapped] ${info.type} -> ${info.namespace ? info.namespace + "/" : ""}${info.originalName}`;
          const item = this.createCompletionItem(localName, kind, mappedDetail);

          // Range 从引号后开始到结束引号和方括号
          item.range = new vscode.Range(
            position.line,
            position.character - partialInput.length,
            position.line,
            bracketEndChar,
          );

          item.filterText = localName;

          const safeName = localName.replace(/'/g, "\\'");
          const endQuote = quoteChar === "'" ? "'" : '"';

          // 不自动添加 ()，让用户自己填写
          item.insertText = `${safeName}${endQuote}]`;

          items.push(item);
        }
      } else {
        // 点号访问: this.xxx
        // Range covering the dot and the identifier typed so far
        const validIdLength = partialInput.length;
        const accessToken = this.getAccessToken(prefix, validIdLength);

        // Range that includes the dot (e.g. ".o")
        const bracketReplacementRange = this.createDotRange(
          position.line,
          position.character,
          validIdLength,
          accessToken,
        );

        for (const localName in mapping) {
          const info = mapping[localName];
          let kind = vscode.CompletionItemKind.Method;
          if (info.type === "state") kind = vscode.CompletionItemKind.Field;
          if (info.type === "getter") kind = vscode.CompletionItemKind.Property;

          const mappedDetail = `[Vuex Mapped] ${info.type} -> ${info.namespace ? info.namespace + "/" : ""}${info.originalName}`;
          const item = this.createCompletionItem(localName, kind, mappedDetail);

          const storeMatch = this.findStoreItem(
            info.originalName,
            info.type,
            info.namespace,
            storeMap,
          );
          if (storeMatch && storeMatch.documentation) {
            item.documentation = new vscode.MarkdownString(
              storeMatch.documentation,
            );
          }

          // Handling namespaced helpers (containing slashes)
          if (localName.includes("/")) {
            // Use bracket notation: this['others/ADD_ROLE']
            // We must replace the dot typed by the user.
            item.range = bracketReplacementRange;
            // Ensure filterText allows matching ".foo" against this item
            item.filterText = accessToken + localName;
            this.boostOptionalChainPriority(item, accessToken);

            // Escape quotes in name just in case
            const safeName = localName.replace(/'/g, "\\'");

            // 不自动添加 ()，让用户自己填写
            item.insertText =
              accessToken === "?."
                ? `?.['${safeName}']`
                : `['${safeName}']`;
          } else {
            // 普通映射属性
            item.range = bracketReplacementRange;
            item.filterText = accessToken + localName;
            this.boostOptionalChainPriority(item, accessToken);
            // 不自动添加括号，避免与用户已输入的括号冲突
            item.insertText = accessToken + localName;
          }

          items.push(item);
        }
      }

      if (items.length > 0) {
        return new vscode.CompletionList(items, false);
      }
    }

    return undefined;
  }

  /** 创建带 Vuex 优先级的 CompletionItem */
  private createCompletionItem(
    label: string,
    kind: vscode.CompletionItemKind,
    detail: string,
    documentation?: string,
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(label, kind);
    item.detail = detail;
    item.sortText = `\u0000\u0000${label}`;
    item.preselect = true;
    if (documentation) {
      item.documentation = new vscode.MarkdownString(documentation);
    }
    return item;
  }

  /** 创建包含前导点号的替换范围 */
  private createDotRange(
    line: number,
    cursorChar: number,
    inputLength: number,
    accessToken: "." | "?." = ".",
  ): vscode.Range {
    const accessTokenLength = accessToken.length;
    return new vscode.Range(
      line,
      cursorChar - inputLength - accessTokenLength,
      line,
      cursorChar,
    );
  }

  /** 判断当前访问链使用的是 `.` 还是 `?.`，用于提升补全排序权重 */
  private getAccessToken(prefix: string, inputLength: number): "." | "?." {
    const dotIndex = prefix.length - inputLength - 1;
    if (
      dotIndex >= 1 &&
      prefix.charAt(dotIndex) === "." &&
      prefix.charAt(dotIndex - 1) === "?"
    ) {
      return "?.";
    }
    return ".";
  }

  /** 可选链访问时，进一步提前 Vuex 补全项排序 */
  private boostOptionalChainPriority(
    item: vscode.CompletionItem,
    accessToken: "." | "?.",
  ): void {
    if (accessToken !== "?.") return;
    const labelText =
      typeof item.label === "string" ? item.label : item.label.label;
    item.sortText = `\u0000\u0000\u0000${labelText}`;
    item.preselect = true;
  }

  /** 扫描光标右侧的空格数量和结束符号 */
  private scanRightSide(
    textAfterCursor: string,
    closingPattern: string,
  ): { spacesCount: number; hasClosing: boolean; closingIndex: number } {
    let spacesCount = 0;
    let i = 0;
    while (i < textAfterCursor.length && textAfterCursor[i] === " ") {
      spacesCount++;
      i++;
    }
    // 检查闭合符号是否在后面的任何位置（而不仅仅是开头）
    const closingIndex = textAfterCursor.indexOf(closingPattern, i);
    const hasClosing = closingIndex !== -1;
    return { spacesCount, hasClosing, closingIndex };
  }

  /** 拼接 store item 的完整路径 */
  private getFullPath(item: { name: string; modulePath: string[] }): string {
    return item.modulePath.length > 0
      ? `${item.modulePath.join("/")}/${item.name}`
      : item.name;
  }

  private hasRootTrueOption(
    document: vscode.TextDocument,
    position: vscode.Position,
    method: "commit" | "dispatch",
    calleeName?: string,
  ): boolean {
    const source = document.getText();
    const offset = document.offsetAt(position);
    const start = Math.max(0, offset - 2000);
    const end = Math.min(source.length, offset + 2000);
    const windowText = source.substring(start, end);
    const callName = (calleeName || method).trim();
    const escapedCallName = callName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedMethod = method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const literalPattern = new RegExp(
      `${escapedCallName}\\(\\s*['"\`][^'"\`]*['"\`][\\s\\S]{0,1800}?\\broot\\s*:\\s*true\\b`,
    );
    if (literalPattern.test(windowText)) {
      return true;
    }

    const thirdArgIdentifierPattern = new RegExp(
      `${escapedCallName}\\(\\s*['"\`][^'"\`]*['"\`][\\s\\S]{0,1300}?,[\\s\\S]{0,500}?,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`,
      "g",
    );
    const identifiers = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = thirdArgIdentifierPattern.exec(windowText)) !== null) {
      if (match[1]) identifiers.add(match[1]);
    }
    if (identifiers.size === 0) return false;

    for (const id of identifiers) {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const declPattern = new RegExp(
        `\\b(?:const|let|var)\\s+${escapedId}\\s*=\\s*\\{[\\s\\S]{0,600}?\\broot\\s*:\\s*true\\b`,
      );
      if (declPattern.test(windowText)) {
        return true;
      }
      const assignPattern = new RegExp(
        `\\b${escapedId}\\s*=\\s*\\{[\\s\\S]{0,600}?\\broot\\s*:\\s*true\\b`,
      );
      if (assignPattern.test(windowText)) {
        return true;
      }
      // allow helper call result like buildOpts({ root: true }) assigned to opts
      const methodLikePattern = new RegExp(
        `\\b(?:const|let|var)\\s+${escapedId}\\s*=\\s*[A-Za-z_$][\\w$]*\\([\\s\\S]{0,300}?\\broot\\s*:\\s*true\\b`,
      );
      if (methodLikePattern.test(windowText)) {
        return true;
      }
    }

    // conservative fallback for alias confusion: if direct method call exists with literal root:true
    const fallbackPattern = new RegExp(
      `${escapedMethod}\\(\\s*['"\`][^'"\`]*['"\`][\\s\\S]{0,1800}?\\broot\\s*:\\s*true\\b`,
    );
    return fallbackPattern.test(windowText);
  }

  private findStoreItem(
    name: string,
    type: string,
    namespace: string | undefined,
    storeMap: any,
  ) {
    let lookupName = name;
    let lookupNamespace = namespace;
    if (type === "state" && lookupName.includes(".")) {
      const parts = lookupName.split(".").filter(Boolean);
      const leaf = parts.pop();
      if (leaf) {
        lookupName = leaf;
        const nestedNs = parts.join("/");
        if (nestedNs) {
          lookupNamespace = lookupNamespace
            ? `${lookupNamespace}/${nestedNs}`
            : nestedNs;
        }
      }
    }

    const matchItem = (item: { name: string; modulePath: string[] }) => {
      if (lookupNamespace) {
        return (
          item.name === lookupName &&
          item.modulePath.join("/") === lookupNamespace
        );
      } else {
        if (lookupName.includes("/")) {
          const parts = lookupName.split("/");
          const realName = parts.pop()!;
          const namespaceStr = parts.join("/");
          return (
            item.name === realName && item.modulePath.join("/") === namespaceStr
          );
        }
        return item.name === lookupName;
      }
    };

    if (type === "action") return storeMap.actions.find(matchItem);
    else if (type === "mutation") return storeMap.mutations.find(matchItem);
    else if (type === "getter") return storeMap.getters.find(matchItem);
    else if (type === "state") return storeMap.state.find(matchItem);
    return undefined;
  }
}
