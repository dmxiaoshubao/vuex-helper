# Issue-Test Mapping

## ISSUE-001
- Problem: ComponentMapper 缓存无上限
- Fix: LRU 上限 + 同版本缓存命中
- Pre-fix path covered by: `src/test/unit/ComponentMapperCache.test.ts`
- Post-fix path covered by: `src/test/unit/ComponentMapperCache.test.ts`
- Status: PASS

## ISSUE-002
- Problem: 路径越界访问风险
- Fix: PathResolver/EntryAnalyzer 增加工作区边界检查
- Pre-fix path covered by: `src/test/unit/PathResolverSecurity.test.ts`
- Post-fix path covered by: `src/test/unit/PathResolverSecurity.test.ts`
- Status: PASS

## ISSUE-003
- Problem: 高频重建导致性能与资源风险
- Fix: 防抖调度 + 并发合并
- Pre-fix path covered by: `src/test/unit/ReindexScheduler.test.ts`, `src/test/unit/StoreIndexerConcurrency.test.ts`
- Post-fix path covered by: `src/test/unit/ReindexScheduler.test.ts`, `src/test/unit/StoreIndexerConcurrency.test.ts`
- Status: PASS

## DEP-001
- Problem: glob@8 风险跟踪
- Fix: 已升级项目依赖到 `glob@^10.5.0` 并适配 Promise API
- Evidence: `src/services/EntryAnalyzer.ts`, `src/test/suite/index.ts`
- Status: PASS
