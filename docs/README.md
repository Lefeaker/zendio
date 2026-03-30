# 工程文档入口

最后更新：2026-03-29

## 当前真值入口

- [`design-system-governance.md`](./design-system-governance.md)
- [`architecture-boundaries.md`](./architecture-boundaries.md)
- [`engineering-entrypoints.md`](./engineering-entrypoints.md)
- [`目标架构迁移执行方案-2026-03-29.md`](./目标架构迁移执行方案-2026-03-29.md)
- [`目标架构迁移-milestone-核查清单-2026-03-29.md`](./目标架构迁移-milestone-核查清单-2026-03-29.md)
- [`final-acceptance-report-2026-03-29.md`](./final-acceptance-report-2026-03-29.md)
- [`long-term-maintenance-backlog-2026-03-29.md`](./long-term-maintenance-backlog-2026-03-29.md)

## 当前正式代码入口

- foundation：`src/ui/foundation/*`
- primitives：`src/ui/primitives/*`
- patterns：`src/ui/patterns/*`
- hosts：`src/ui/hosts/*`
- domains：`src/ui/domains/*`
- Options / content 旧 shared 路径当前仅作为兼容层存在

## 归档与参考

- 历史执行基线：[`archive/execution-baselines/`](./archive/execution-baselines/)
- legacy Options 资产：[`archive/legacy-options-assets/`](./archive/legacy-options-assets/)
- 浏览器 / 站点参考 HTML：[`reference-fixtures/README.md`](./reference-fixtures/README.md)
- 历史 POC 与迁移草案：[`251126-design-system-poc/`](./251126-design-system-poc/)

## 使用规则

- 判断“当前应该改哪里”，优先看 `src/ui/*` 与本入口列出的正式文档
- milestone checklist 只作为本轮迁移台账，不再替代长期工程入口
- archive 与 legacy-assets 默认不再作为生产代码引用源
- 如果新增正式入口、守门脚本或回归 harness，必须同步更新本文
