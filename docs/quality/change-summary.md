# Change Summary

## Scope
- 建立问题清单与生命周期管理能力（IssueRegistry）
- 建立项目扫描能力（IssueScanner）
- 建立质量门禁能力（QualityGate）
- 修复缓存内存增长、路径越界、重建并发/资源释放问题
- 补齐对应单测并通过

## Performance/Memory Notes
- 通过缓存上限控制避免文档数量增长引起的内存持续增长
- 通过防抖调度和并发合并减少重复索引带来的性能损耗
- 通过可释放调度器保证定时器资源可清理

## Residual Risks
- 当前未发现新增高优先级风险；后续按常规依赖升级节奏持续维护。
