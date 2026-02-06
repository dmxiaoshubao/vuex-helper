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
- **Multiline Support**:
  ```javascript
  ...mapMutations([
    'INCREMENT',
    'DECREMENT'
  ])
  ```

## Requirements

- A Vue 2 project with Vuex.
- Store defined in `src/store/index.js` or `src/store/index.ts`.

## Extension Settings

- `vuexHelper.trace.server`: Traces the communication between VS Code and the language server.

## Release Notes

### 0.0.1

Initial release with support for:

- State, Getters, Mutations, Actions
- Namespace filtering
- JSDoc hover documentation
