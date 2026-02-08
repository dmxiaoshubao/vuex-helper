# Vuex Helper

[中文文档](./docs/README.zh-CN.md)

VS Code extension for Vuex 2 that provides **Go to Definition**, **Code Completion**, and **Hover Information** for State, Getters, Mutations, and Actions.

## Features

### 1. Go to Definition

Jump directly to the definition of Vuex store properties from your components.

#### Demo: Jump to Definition

![Jump to Definition](images/jump_definition.gif)

- **Support**: `this.$store.state/getters/commit/dispatch`
- **Map Helpers**: `mapState`, `mapGetters`, `mapMutations`, `mapActions`
- **Namespace**: Supports namespaced modules.

### 2. Intelligent Code Completion (IntelliSense)

Intelligent suggestions for Vuex keys and mapped methods.

#### Demo: Context-Aware Completion

![Code Completion (Variables)](images/auto_tips_and_complete_for_var.gif)
![Code Completion (Functions)](images/auto_tips_and_complete_for_func.gif)

- **Context Aware**: Suggests actions for `dispatch`, mutations for `commit`, etc.
- **Namespace Filtering**: When using `mapState('user', [...])`, it correctly filters and shows only items from the `user` module.
- **Mapped Methods**: Type `this.` to see mapped methods (e.g., `this.increment` mapped from `...mapMutations(['increment'])`).
- **Map Helpers**: Supports array and object syntax (e.g., `...mapActions({ alias: 'name' })`).

### 3. Hover Information & Type Inference

View JSDoc documentation, details, and inferred types without leaving your code.

#### Demo: Hover Documentation

![Hover Info](images/hover_info_and_type_inference.gif)

- **JSDoc Support**: Displays comments written in `/** ... */` format from your store definitions.
- **Type Inference**: Automatically infers and displays the type of State properties in hover tooltips (e.g., `(State) appName: string`).
- **Mapped Methods**: View documentation for mapped methods.
- **Details**: Shows the type (State/Mutation/etc.) and the file path of the definition.

### 4. Store Internal Usage

Also supports code completion, jump to definition, and hover information within the Vuex Store.

#### Demo: Store Internal Code Completion, Jump to Definition, Hover Information

![Internal Usage](images/internal_usage.gif)

- **Module Scope**: When writing actions in a module (e.g., `user.js`), suggestions for `commit` and `dispatch` are automatically filtered to the current module's context.

## Configuration

You can configure the extension via `.vscode/settings.json` or `package.json`:

- `vuexHelper.storeEntry` (default: `src/store/index.js`): Path to your Vuex store entry file. Supports aliases like `@/store/index.js` or relative paths.

## Supported Syntax

- **Helper Functions**:
  ```javascript
  ...mapState(['count'])
  ...mapState('user', ['name']) // Namespaced
  ...mapActions({ add: 'increment' }) // Object aliasing
  ...mapActions(['add/increment'])
  ```
- **Store Methods**:
  ```javascript
  this.$store.commit("SET_NAME", value);
  this.$store.dispatch("user/updateName", value);
  ```
- **Component Methods**:
  ```javascript
  this.increment(); // Mapped via mapMutations
  this.appName; // Mapped via mapState
  ```

## Release Notes

### 0.0.1

Initial release with features:

- **Scoped Logic**: Commit and State completions are context-aware inside modules.
- **Hover Support**: Local state hover tooltips in mutations/getters.
- **Improved**: Namespace filtering and JSDoc support.
