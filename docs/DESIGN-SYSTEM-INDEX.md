# 设计系统文档索引

> 最后更新：2026-03-29
> 口径：当前工程真值优先，其次才是历史 POC 与归档资料

## 当前正式文档

- [`design-system-governance.md`](./design-system-governance.md)
  当前 `src/ui` 分层、兼容层、归档资产与守门基线
- [`architecture-boundaries.md`](./architecture-boundaries.md)
  UI 宿主、domains / features 依赖方向与 composition root 边界
- [`engineering-entrypoints.md`](./engineering-entrypoints.md)
  当前守门命令、构建/测试入口与浏览器 harness 入口
- [`目标架构迁移执行方案-2026-03-29.md`](./目标架构迁移执行方案-2026-03-29.md)
  本轮目标架构迁移的执行基线
- [`目标架构迁移-milestone-核查清单-2026-03-29.md`](./目标架构迁移-milestone-核查清单-2026-03-29.md)
  本轮迁移的台账与回写入口
- [`final-acceptance-report-2026-03-29.md`](./final-acceptance-report-2026-03-29.md)
  本轮目标架构迁移的最终验收结论
- [`long-term-maintenance-backlog-2026-03-29.md`](./long-term-maintenance-backlog-2026-03-29.md)
  本轮迁移收口后的长期维护议题池

## 历史参考资料

- [`251126-design-system-poc/`](./251126-design-system-poc/)
- [`archive/execution-baselines/`](./archive/execution-baselines/)
- [`archive/legacy-options-assets/`](./archive/legacy-options-assets/)

## 阅读顺序

1. 先读 [`design-system-governance.md`](./design-system-governance.md)
2. 再读 [`architecture-boundaries.md`](./architecture-boundaries.md)
3. 需要执行迁移核查时看执行方案与 checklist
4. 需要跑守门与回归时查看 [`engineering-entrypoints.md`](./engineering-entrypoints.md)
5. 需要核对最终状态时查看最新验收报告与长期 backlog

## 维护规则

- 如果 `src/ui/*` 正式入口、compat wrapper、token 真值或守门脚本发生变化，必须同步更新本索引
- 历史 POC、archive 资料与正式文档冲突时，以正式文档、最终验收报告和长期 backlog 为准
