# Refactor Plan

面向下一阶段代码整理的执行计划。目标是先做低风险、高复用收益的重构，减少 `providers/services` 的体量和重复逻辑，同时不引入新的行为回退。

## 1. 第一阶段：Definition / Hover 公共骨架抽取

- 目标：抽出 `VuexDefinitionProvider` 和 `VuexHoverProvider` 里重复的上下文准备、路径判定顺序、store 访问识别逻辑。
- 推荐落点：`src/utils/VuexProviderUtils.ts` 新增更高层的 provider context / member access helper，或新增一个专门的 provider context utility 文件。
- 预期收益：先减少两份 provider 的漂移风险，为后续拆 `CompletionProvider` 打基础。
- 风险控制：只抽公共流程，不改变 lookup 优先级、不改现有匹配顺序。
- 验证要求：`npm run test:unit` + `npm run test:host`。

## 2. 第二阶段：CompletionProvider 内部拆段

- 目标：将 `VuexCompletionItemProvider` 的 `provideCompletionItems` 按语义拆成多个私有方法。
- 建议拆分方向：
  - Vuex 上下文字符串参数补全
  - `rootState` / `rootGetters`
  - store 内部 `state/getters/context`
  - `this.` / `this['...']` 映射补全
  - `$store` / 导入 store 实例访问补全
- 原则：先做“文件内拆分”，不急着跨文件搬运，确保风险可控。
- 验证要求：相关单测 + `npm run test:unit` + `npm run test:host`。

## 3. 第三阶段：DiagnosticProvider 扫描 / 诊断生成分层

- 目标：拆开 `VuexDiagnosticProvider` 里的文本扫描、命中解析、diagnostic 构造。
- 建议方向：
  - `VuexDiagnosticScanner`
  - `VuexDiagnosticBuilder`
- 预期收益：降低单文件复杂度，便于后续扩展新的诊断类型。
- 风险控制：保持现有 warning 文案、range 计算和忽略规则不变。
- 验证要求：diagnostic 相关单测 + host diagnostics。

## 4. 第四阶段：StoreParser Collector 拆分

- 目标：将 `StoreParser` 中不同资产类型和模块递归逻辑拆成更清晰的 collector/helper。
- 优先拆分方向：
  - state collection
  - getter / mutation / action collection
  - modules processing
  - documentation / property helpers
- 风险控制：先保持主流程入口和缓存结构不变，不同时修改 parser 与 indexer 的外部契约。
- 验证要求：parser 单测、增量索引单测、`npm run test:unit`。

## 5. 执行原则

- 小步推进，每个阶段都能单独提交。
- 优先抽公共，不优先做抽象层设计。
- Provider 热路径不增加重复 AST 解析和重复扫描。
- 任何重构都必须以回归测试先行或同步补齐为前提。
- 除非已有充分测试兜底，不同时改动多个核心模块的行为逻辑。
