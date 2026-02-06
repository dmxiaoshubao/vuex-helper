# Vuex Helper (中文说明)

适用于 Vuex 2 的 VS Code 插件，提供 **跳转定义**、**代码补全** 和 **悬浮提示** 功能。支持 State, Getters, Mutations 和 Actions。

## 功能特性

### 1. 跳转定义 (Go to Definition)

从组件中直接跳转到 Vuex Store 的定义处。

- **支持**: `this.$store.state/getters/commit/dispatch`
- **Map 辅助函数**: `mapState`, `mapGetters`, `mapMutations`, `mapActions`
- **命名空间**: 完美支持 Namespaced 模块及其嵌套。

### 2. 代码补全 (IntelliSense)

智能提示 Vuex 的各种 Key。

- **上下文感知**: 在 `dispatch` 中提示 Actions，在 `commit` 中提示 Mutations。
- **命名空间过滤**: 当使用 `mapState('user', [...])` 时，会自动过滤并仅显示 `user` 模块下的内容。
- **语法支持**: 支持数组语法和对象别名语法 (例如 `...mapActions({ alias: 'name' })`)。

### 3. 悬浮提示 (Hover Information)

无需跳转即可查看文档和详情。

- **JSDoc 支持**: 提取并显示 Store 定义处的 `/** ... */` 注释文档。
- **详细信息**: 显示类型（State/Mutation等）及定义所在的文件路径。

## 支持的语法示例

- **辅助函数 (Helpers)**:
  ```javascript
  ...mapState(['count'])
  ...mapState('user', ['name']) // 命名空间支持
  ...mapActions({ add: 'increment' }) // 对象别名支持
  ```
- **Store 方法**:
  ```javascript
  this.$store.commit("SET_NAME", value);
  this.$store.dispatch("user/updateName", value);
  ```
- **多行书写支持**:
  ```javascript
  ...mapMutations([
    'INCREMENT',
    'DECREMENT'
  ])
  ```

## 使用要求

- 使用 Vuex 的 Vue 2 项目。
- Store 入口位于 `src/store/index.js` 或 `src/store/index.ts`（支持自动探测）。
- 若无法自动找到，请在设置中配置 `vuexHelper.storeEntry`。

## 配置项

- `vuexHelper.storeEntry`: 手动指定 Store 入口文件路径。支持：
  - 别名路径: `@/store/index.js` (需在 jsconfig/tsconfig 中配置)
  - 相对路径: `src/store/index.js`
  - 绝对路径: `/User/xxx/project/src/store/index.js`

## 已知问题

暂时仅支持静态分析，对于极其动态生成的模块可能支持有限。

## 更新日志

### 0.0.1

初始版本，支持功能：

- 全面支持 State, Getters, Mutations, Actions
- 支持命名空间过滤 (Namespace Filtering)
- 支持 JSDoc 悬浮文档显示
