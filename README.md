# Vuex Helper

VS Code extension for Vuex 2 that provides **Go to Definition**, **Code Completion**, and **Hover Information** for State, Getters, Mutations, and Actions.

## Features

### 1. Go to Definition

Jump directly to the definition of Vuex store properties from your components.

- **Support**: `this.$store.state/getters/commit/dispatch`
- **Map Helpers**: `mapState`, `mapGetters`, `mapMutations`, `mapActions`
- **Namespace**: Supports namespaced modules.

### 2. Code Completion (IntelliSense)

Intelligent suggestions for Vuex keys.

- **Context Aware**: Suggests actions for `dispatch`, mutations for `commit`, etc.
- **Namespace Filtering**: When using `mapState('user', [...])`, it correctly filters and shows only items from the `user` module.
- **Map Helpers**: Supports array and object syntax (e.g., `...mapActions({ alias: 'name' })`).

### 3. Hover Information

View JSDoc documentation and details without leaving your code.

- **JSDoc Support**: Displays comments written in `/** ... */` format from your store definitions.
- **Details**: Shows the type (State/Mutation/etc.) and the file path of the definition.

### 4. Component Mapped Methods Support

Full IntelliSense support for methods mapped via `mapHelpers` in your components.

- **Completion**: Type `this.` to see mapped methods (e.g., `this.increment` mapped from `...mapMutations(['increment'])`).
- **Definition**: Go to Definition on `this.methodName()`.
- **Hover**: View documentation for mapped methods.

### 5. Type Inference

- **State Types**: Automatically infers and displays the type of State properties in hover tooltips (e.g., `(State) appName: string`).

## Configuration

You can configure the extension via `.vscode/settings.json` or `package.json`:

- `vuexHelper.storeEntry` (default: `src/store/index.js`): Path to your Vuex store entry file. Supports aliases like `@/store/index.js` or relative paths.

## Supported Syntax

- **Helper Functions**:
  ```javascript
  ...mapState(['count'])
  ...mapState('user', ['name']) // Namespaced
  ...mapActions({ add: 'increment' }) // Object aliasing
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

### 0.1.0

Major update with stability and feature enhancements:

- **New**: Support for mapped component methods (`this.method`).
- **New**: State type inference in Hover.
- **New**: Configurable store entry path (`vuexHelper.storeEntry`).
- **Improved**: `this.` completion trigger and prioritization.
- **Improved**: AST error recovery for better suggestions while typing.
- **Fixed**: Namespace filtering and JSDoc extraction.
