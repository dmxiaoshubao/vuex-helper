# Changelog

All notable changes to the "Vuex Helper" extension will be documented in this file.

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
