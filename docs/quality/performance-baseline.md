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
4. Timing guard (in `Large Fixture Performance Regression`):
   - full index duration < `4000ms`
   - incremental index duration < `2500ms`
   - incremental duration <= `full * 1.5 + 50ms`
   - `VuexContextScanner` p95 < `80ms` on large synthetic input

## Acceptance Gates

- Full index on large fixture remains functionally correct (non-empty rich state/getter sets).
- Incremental reindex of a single indexed module preserves unrelated module data.
- Providers short-circuit on cancelled requests.
- ComponentMapper and VuexContextScanner remain stable on large-document test cases.

## Notes

- The current timing thresholds are intentionally conservative to reduce CI flakiness while still catching obvious regressions.
- If CI variance becomes lower, tighten thresholds gradually and add completion p95 targets.
