# 设计系统文档索引

> 最后更新：2026-08-28
> 口径：当前工程真值优先，其次才是历史 POC 与归档资料

## 当前正式文档

- [`design-system-governance.md`](./design-system-governance.md)
  当前 `src/ui` 分层、兼容层、归档资产与守门基线
- [`architecture-boundaries.md`](./architecture-boundaries.md)
  UI 宿主、domains / features 依赖方向与 composition root 边界
- [`engineering-entrypoints.md`](./engineering-entrypoints.md)
  当前守门命令、构建/测试入口与浏览器 harness 入口
- [`document-status-governance.md`](./document-status-governance.md)
  当前文档状态、入口索引与维护规则

## 历史参考资料

- [`archive/legacy-options-assets/`](./archive/legacy-options-assets/)
- [`long-term-maintenance-backlog-2026-03-29.md`](./long-term-maintenance-backlog-2026-03-29.md)
  2026-03-29 收口后的历史维护 backlog

## 阅读顺序

1. 先读 [`design-system-governance.md`](./design-system-governance.md)
2. 再读 [`architecture-boundaries.md`](./architecture-boundaries.md)
3. 需要跑守门与回归时查看 [`engineering-entrypoints.md`](./engineering-entrypoints.md)
4. 需要判断文档是否为当前真值时查看 [`document-status-governance.md`](./document-status-governance.md)

## 维护规则

- 如果 `src/ui/*` 正式入口、compat wrapper、token 真值或守门脚本发生变化，必须同步更新本索引
- 历史 POC、archive 资料或 dated backlog 与正式文档冲突时，以当前正式文档为准
