# Feature Backlog

按投入产出比排序的待做功能方向。

## 1. 命名空间继承修正
父模块开启 `namespaced: true` 时，子模块应沿注册路径继承命名空间，即使子模块自身未显式声明 `namespaced: true`。

- 目标：修正索引结果，避免嵌套模块 getter / mutation / action 被错误视为全局资源。
- 影响：completion / definition / hover / diagnostics / parser tests。

## 2. namespaced 模块中的全局 action 注册
支持 Vuex 文档中的对象式 action 写法：

```js
actions: {
  someAction: {
    root: true,
    handler(ctx, payload) {}
  }
}
```

- 目标：正确把这类 action 索引为根 action，而不是模块内 action。
- 影响：parser / completion / definition / hover / diagnostics。

## 3. Action Context 成员访问 ✅ 已完成
支持 store 内部通过 `context.state`、`context.getters`、`context.rootState`、`context.rootGetters` 访问 Vuex 资源。

- 目标：补全、跳转、悬浮、诊断统一支持 action context 对象写法，不只支持解构参数。
- 风险：需要做好作用域判断，避免把普通对象成员误识别为 Vuex context。

## 4. Store 内部 getters.xxx Hover 一致性 ✅ 已完成
store 内部 `getters.xxx` 已支持 completion / definition / diagnostics，hover 需要保持同一语义和同样的作用域校验。

- 目标：补齐 provider 行为一致性。
- 状态：已完成。

## 5. 非命名空间 getter 冲突诊断 ✅ 已完成
Vuex 非 namespaced 模块的 getter 会注册到全局；同名 getter 冲突应尽早暴露。

- 目标：在索引或诊断阶段提示重复 getter 名，降低运行时报错概率。
- 形式：可评估为启动期 warning、输出 channel 提示，或 diagnostics/日志。
