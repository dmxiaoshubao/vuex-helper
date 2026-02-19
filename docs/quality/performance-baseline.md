# Performance Baseline

Related default rules: `docs/quality/engineering-rules.md`

## Scope

This baseline tracks performance-sensitive paths for Vuex Helper:

- Store indexing (full + incremental)
- Completion response under Vuex-heavy contexts
- Context/mapping computation stability on large component files

## Fixture

- Workspace fixture: `test/fixtures/large-project`
- Characteristics:
  - Multi-module Vuex store (`alpha`/`beta`/`gamma`/`delta`/`epsilon`)
  - Nested state trees in root and modules
  - Sufficient item volume to expose linear-scan regressions

## Baseline Checks

1. `npm run compile`
2. `npm run test:unit`
3. `npm run test:host` (VS Code 宿主环境 smoke)
4. Must pass `Large Fixture Performance Regression` suite.
5. Must pass `StoreParser Incremental` suite.
6. Must pass `Provider Cancellation` suite.
7. Must pass `Host Performance Smoke` suite.
8. Timing guard (in `Large Fixture Performance Regression`):
full index duration < `4000ms`; incremental index duration < `2500ms`; incremental duration <= `full * 1.5 + 50ms`; `VuexContextScanner` p95 < `80ms`.
9. Host smoke timing guard (in `Host Performance Smoke`):
definition p95 < `1200ms`; hover p95 < `1200ms`.

## Host Reproducibility

- `npm run test:host`:
  - 完全隔离模式（`--disable-extensions`），不加载任何本机扩展。
- `npm run test:host:vue`:
  - 仅加载一个 Vue 语言扩展 + 当前开发扩展。
  - 选择优先级：`vue.volar` -> `octref.vetur`（自动回退）。
- 锁定 Vue 插件版本（推荐团队统一）:
  - `HOST_TEST_EXT_MODE=with-vue HOST_TEST_LANG_EXT_VERSION=3.2.4 node ./out/test/runHostTest.js`
  - 或使用脚本：`npm run test:host:vue:pinned`
- 指定精确插件目录（最高可复现性）:
  - `HOST_TEST_EXT_MODE=with-vue HOST_TEST_LANG_EXT_PATH=/abs/path/to/vue.volar-3.2.4 node ./out/test/runHostTest.js`
  - 如需强制指定扩展 ID（例如强制 vetur）：`HOST_TEST_LANG_EXT_ID=octref.vetur`

说明：
- 支持扩展 ID：`vue.volar`、`octref.vetur`。
- 当 `HOST_TEST_LANG_EXT_PATH`（兼容旧变量 `HOST_TEST_VUE_EXT_PATH`）存在时，优先使用该路径。
- 否则按 `HOST_TEST_LANG_EXT_VERSION`（兼容旧变量 `HOST_TEST_VUE_EXT_VERSION`）从本机扩展目录选择匹配版本。
- 两者都未指定时，默认按 `vue.volar-*` 再 `octref.vetur-*` 的顺序选择最新版本目录。

## Acceptance Gates

- Full index on large fixture remains functionally correct (non-empty rich state/getter sets).
- Incremental reindex of a single indexed module preserves unrelated module data.
- Providers short-circuit on cancelled requests.
- ComponentMapper and VuexContextScanner remain stable on large-document test cases.

## Notes

- The current timing thresholds are intentionally conservative to reduce CI flakiness while still catching obvious regressions.
- If CI variance becomes lower, tighten thresholds gradually and add completion p95 targets.
