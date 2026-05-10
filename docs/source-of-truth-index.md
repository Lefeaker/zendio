# Source of Truth 索引

最后更新：2026-05-10

## 正式入口

- 工程命令与门禁：[`engineering-entrypoints.md`](./engineering-entrypoints.md)
- 性能与热点真值：[`performance-baseline.md`](./performance-baseline.md)
- 类型收口路线：[`typescript-strict-roadmap.md`](./typescript-strict-roadmap.md)
- 当前执行计划：[`project-stabilization-plan-2026-04-13.md`](./project-stabilization-plan-2026-04-13.md)
- 当前工作树批次归属：[`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md)
- 架构边界：[`architecture-boundaries.md`](./architecture-boundaries.md)
- 设计系统治理：[`design-system-governance.md`](./design-system-governance.md)
- Options 主链说明：[`../src/options/README.md`](../src/options/README.md)
- 长期维护 backlog：[`long-term-maintenance-backlog-2026-03-29.md`](./long-term-maintenance-backlog-2026-03-29.md)

## 当前执行主线

- 当前统一门禁以 `quality` / `verify:preflight` / CI 三者一致为准
- 当前性能真值以 `audit:build:report` 与 `audit:performance:report` 为准
- 当前依赖边界真值以 `npm run audit:deps:report` 为准；该命令必须巡检完整 `src` graph，并对 dependency-cruiser violations fail closed
- 当前生产 UI 样式真值以 Stitch runtime CSS、`src/styles/design-tokens.css`、`src/options/stitch/styles/*` 为准
- Tailwind / DaisyUI 只作为历史迁移材料或归档参考；除非本页和设计系统治理文档同步恢复，否则不得作为新生产路径
- `src/options/preview/**`、旧 Options layout/formSections/section classes 在验证 owner 迁出或替换前属于验证/兼容资产，不是可直接删除的生产真值
- 当前 `M4` 已按重定义口径通过；旧版工作树/批次规模预算已下沉到 backlog
- 当前交付归属以 [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md) 为准

## 历史与归档

- `archive/status-*`、历史 milestone 文档、旧迁移方案只用于追溯
- `archive/legacy-options-assets/` 与 `reference-fixtures/legacy-options/` 仅作参考夹具
- 看到 `archive` / `legacy` / `compatibility` / `retired` 时，默认不要把它当成生产真值

## 使用规则

- 想知道“现在该跑什么命令”，先看 [`engineering-entrypoints.md`](./engineering-entrypoints.md)
- 想知道“现在包体和热点是多少”，先看 [`performance-baseline.md`](./performance-baseline.md)
- 想知道“当前脏工作树属于哪个交付批次”，先看 [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md)
- formal `superpowers` specs/plans 固定存放在外层 workspace 的 `docs/codex-superpowers/*`，不得移入本仓库源码目录
- 如果新增正式入口、门禁口径或批次归属规则，必须同步更新本页与 [`README.md`](./README.md)
