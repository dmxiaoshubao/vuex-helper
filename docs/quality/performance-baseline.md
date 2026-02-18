# Performance Baseline

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
3. Must pass:
   - `Large Fixture Performance Regression` suite
   - `StoreParser Incremental` suite
   - `Provider Cancellation` suite

## Acceptance Gates

- Full index on large fixture remains functionally correct (non-empty rich state/getter sets).
- Incremental reindex of a single indexed module preserves unrelated module data.
- Providers short-circuit on cancelled requests.
- ComponentMapper and VuexContextScanner remain stable on large-document test cases.

## Notes

- This baseline currently focuses on behavioral regression detection instead of absolute timing thresholds.
- If future CI environments become stable enough for timing assertions, add explicit p95 targets for:
  - full index duration
  - incremental index duration
  - completion request latency
