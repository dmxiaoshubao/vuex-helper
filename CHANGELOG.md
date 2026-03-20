# Changelog

All notable changes to the "Vuex Helper" extension will be documented in this file.

## [1.2.0] - 2026-03-20

### Added

- **Action context member access**: Added store-internal completion / definition / hover / diagnostics support for `context.state`, `context.getters`, `context.rootState`, and `context.rootGetters`, not just destructured Vuex callback params.
- **Inherited module namespaces**: Added nested-module asset namespace inheritance so child modules under a namespaced parent are indexed with the correct getter / mutation / action namespace even when the child omits `namespaced: true`.
- **Duplicate global getter diagnostics**: Added warnings for duplicate getter names registered into the global namespace by root or non-namespaced modules.
- **Object-style action handlers**: Added support for Vuex object-style action descriptors such as `{ handler(ctx) {}, root: true }`, including root registration and store-internal completion / definition / hover / diagnostics inside `handler(...)`.

### Improved

- **Host regression coverage**: Expanded isolated host coverage with real nested-module and object-style action handler fixtures to verify inherited namespaces, action-context access, object-style handlers, and duplicate-global-getter diagnostics under the VS Code host.

## [1.1.1] - 2026-03-18

### Fixed

- **Definition navigation accuracy**: Corrected Vuex definition lookup for module/root context switches and mapped access paths so go-to-definition lands on the expected store target more consistently.
- **Vuex internal getter scoping**: Limited internal getter resolution in completion, definition, hover, and diagnostics to real Vuex callback parameters, preventing local function scopes from being mistaken for store context.

### Improved

- **Host verification stability**: Tightened host test stability and fixture alignment to reduce release verification drift.

## [1.1.0] - 2026-03-14

### Added

- **Diagnostics provider**: Highlights invalid Vuex store references (state/getter/mutation/action) as warnings in the editor. Covers `mapState`/`mapGetters`/`mapMutations`/`mapActions` string arguments, `commit()`/`dispatch()` calls, `$store.state/getters` access, and store-file `state.xxx` / `rootState` / `rootGetters` references.
- **Manual reindex command**: Registered `vuexHelper.reindex` command accessible from the Command Palette to trigger a full store re-index on demand.

### Improved

- **Diagnostics lifecycle**: Refreshes diagnostics after initial indexing, reindex completion, non-store file saves, and document open/close events.
- **Activation guard**: Skips activation when workspace `package.json` is missing unless `vuexHelper.storeEntry` is configured, preventing false activation in standalone `.vue` directories while preserving manual setup.
- **Code organization**: Reordered diagnostic definitions before scheduler creation in extension activation to eliminate temporal dead zone risk in closure captures.
- **Host regression coverage**: Expanded real host assertions for diagnostics, module-scoped `commit` / `dispatch` completion, `rootState` / `rootGetters`, and mapped bracket-access navigation using the `simple-project` fixture.
- **Test reliability**: Moved global mock state cleanup to `finally` blocks to prevent state leakage on test assertion failures.

### Fixed

- **Diagnostics false positives**: Avoided misreporting helper callback string literals, non-Vuex local `dispatch` / `commit` calls, and shadowed local `state` variables in store files.
- **StoreParser scope handling**: Limited declaration collection to module-level scope so nested local `state` / `getters` / `mutations` / `actions` / `modules` variables no longer pollute indexed store assets.
- **Host smoke fixture sync**: Updated the App.vue host performance anchor to match the current simple-project fixture.

## [1.0.0] - 2026-02-19

### Added

- **Imported store instance support**: Added completion / definition / hover support for direct store imports (e.g. `import store from '@/store'`).
- **Vue host smoke expansion**: Added App.vue real-case host smoke coverage and Vue extension fallback strategy (prefer Volar, fallback to Vetur).
- **Engineering workflow rules**: Added developer-facing engineering rules for quality, caching, performance, and test gates.

### Fixed

- **Optional-chain store access gaps**: Fixed multiple unresolved cases in optional-chain dot/bracket access across completion, hover, and definition.
- **Direct imported store method context**: Fixed missing root-store behavior for imported `store.commit/dispatch` in module context.
- **Comment-line false positives**: Hover/definition no longer trigger on single-line and block comment lines.
- **Module namespace segment jump target**: Namespace-segment jump now consistently targets module file top.
- **Unit test runner isolation**: Fixed host test loading leakage in unit test runs.
- **PathResolver/StoreParser robustness**: Fixed path resolver race condition and store parser hoisting-related resolution failures.
- **Root option detection precision**: Fixed `commit/dispatch` root option parsing by narrowing to the active call body.

### Improved

- **Indexing performance**: Reduced incremental overhead and unnecessary full reindex operations.
- **Hot-path caching**: Consolidated provider/scanner utility logic and tightened cache reuse in hot paths.
- **Performance baselines**: Tightened quality/performance baseline gates with large-fixture and host smoke coverage.
- **Type safety and lint quality**: Replaced broad `any` usage in critical paths and strengthened lint gates.

## [0.1.0] - 2026-02-14

### Added

- **`this` alias completion support**: Added completion support for `const _t = this; _t.` and `_t?.` patterns, including mapped properties and `$store` access chains.
- **Vuex edge-case coverage**: Added regression tests for optional chaining aliases, namespaced helper combinations, and module-scoped completion behavior.

### Fixed

- **Namespaced completion/definition/hover consistency**: Fixed multiple namespace-related mismatches in completion items, hover info, and go-to-definition.
- **Nested state leaf resolution**: Definition/hover now resolve exact leaf nodes (e.g., `state.profile.name`) and avoid incorrect parent fallback when leaf keys are absent.
- **Alias path matching boundary**: Tightened alias resolution to prevent loose-prefix matching issues (e.g., `@/*` no longer matches `@foo/*`).

### Improved

- **Version bump**: Upgraded extension version to `0.1.0` and synchronized lockfile version metadata.
- **Reindex performance**: Reduced unnecessary reindexing on unrelated file saves and reused shared mapper/cache instances to lower repeated parsing costs.
- **Runtime signal quality**: Reduced noisy indexing logs and restored lint gate to strengthen release quality checks.

## [0.0.2] - 2026-02-12

### Added

- **`this.xxx` mapped property completion**: Support for `this.` and `vm.` to show mapped properties from `mapState`, `mapGetters`, `mapMutations`, `mapActions`
- **`this['xxx']` bracket notation completion**: Support for bracket syntax to access mapped properties with namespaced names

### Fixed

- **ComponentMapper preprocessing**: Fixed Babel parsing failures caused by incomplete code (e.g., `this.` at end of line)
- **Range calculation for bracket notation**: Fixed issue where right-side content (closing quotes and brackets) was not properly replaced during completion
- **Removed auto-added parentheses**: Mutation/action completions no longer auto-add `()` to avoid conflicts with user-typed parentheses

### Improved

- **Unit tests**: Added 17 new test cases covering:
  - `this.$store` bracket and dot notation access
  - `this.` mapped property completion
  - `this['xxx']` bracket notation completion
  - ComponentMapper preprocessing edge cases
- **Mocha configuration**: Changed mocha UI from `tdd` to `bdd` to support `describe`/`it` syntax

## [0.0.1] - Initial Release

- **Go to Definition**: Jump to Vuex store property definitions
- **Code Completion**: Intelligent suggestions for Vuex keys and mapped methods
- **Hover Information**: View JSDoc documentation and type inference
- **Store Internal Usage**: Support within Vuex Store files
- **Namespace Support**: Full support for namespaced modules
