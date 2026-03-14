# Feature Backlog

按投入产出比排序的待做功能方向。

## 1. Reindex 命令 ✅ 已完成
注册 `vuexHelper.reindex` 命令，让用户手动触发 store 重索引。

## 2. Diagnostics 诊断 ✅ 已完成
在组件中标记引用了不存在的 state/mutation/action/getter 为 Warning。
覆盖：mapHelper 字符串参数、commit/dispatch、$store.state/getters 第一层点号和方括号访问、store 内部引用（state/rootState/rootGetters）。

## 3. DocumentSymbol
在 store 文件的大纲视图中展示 state/getters/mutations/actions 层级结构。

## 4. CodeLens 引用计数
在 store 定义处显示 "N references"。

## 5. Find All References
右键"查找所有引用"，列出所有使用某个 store 项的组件位置。

## 6. Vuex 代码片段
提供 `vstate`、`vmutation`、`vaction` 等常用代码片段。
