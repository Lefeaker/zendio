# Source of Truth 索引

最后更新：2026-05-11

## 正式入口

- 工程命令与门禁：[`engineering-entrypoints.md`](./engineering-entrypoints.md)
- 性能与热点真值：[`performance-baseline.md`](./performance-baseline.md)
- 类型收口路线：[`typescript-strict-roadmap.md`](./typescript-strict-roadmap.md)
- 当前执行计划：[`project-stabilization-plan-2026-04-13.md`](./project-stabilization-plan-2026-04-13.md)
- 当前工作树批次归属：[`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md)
- 架构边界：[`architecture-boundaries.md`](./architecture-boundaries.md)
- 设计系统治理：[`design-system-governance.md`](./design-system-governance.md)
- Retired code inventory：[`retired-code-inventory.md`](./retired-code-inventory.md)
- Non-production source ownership：[`non-production-code-ownership.md`](./non-production-code-ownership.md)
- Production code hotspots：[`production-code-hotspots.md`](./production-code-hotspots.md)
- Options 主链说明：[`../src/options/README.md`](../src/options/README.md)
- 长期维护 backlog：[`long-term-maintenance-backlog-2026-03-29.md`](./long-term-maintenance-backlog-2026-03-29.md)

## 当前执行主线

- 当前统一门禁以 `quality` / `verify:preflight` / CI 三者一致为准
- 当前技术栈真值：TypeScript、esbuild、Vitest、Playwright、ESLint、Prettier、Stylelint、Zod、Stitch runtime CSS、WebExtension APIs
- 当前性能真值以 `audit:build:report` 与 `audit:performance:report` 为准
- 当前依赖边界真值以 `npm run audit:deps:report` 为准；该命令必须巡检完整 `src` graph，并对 dependency-cruiser violations fail closed
- 当前 production build ownership 真值以 `npm run audit:build-graph:report` 为准；retired `src` 删除必须先证明 production、harness、validation、public/script/test owner 均已迁出
- 当前 non-production source ownership 规则以 [`non-production-code-ownership.md`](./non-production-code-ownership.md) 为准
- 当前 non-production source ownership inventory 以 `npm run audit:non-production-source:report` 为准；该命令会输出完整分类，可因保留的 `migrate-*` / `retain-*` inventory 以 report-only 语义退出非零，不能直接作为 hard gate
- 当前 non-production source hard gate 以 `npm run audit:non-production-source:check` 为准；只阻断 `stop-unknown`、不安全 `delete-now` 证明矛盾或缺失结构化证据，不因已确认保留/迁移中的 inventory 阻断
- 当前 retired-code 决策以 `docs/retired-code-inventory.md` 和 `npm run audit:retired-code:report` 为准
- 当前 hotspot 体量观察以 `docs/production-code-hotspots.md` 和 `npm run audit:production-shape:report` 为准
- 当前生产 UI 样式真值以 Stitch runtime CSS、`src/styles/design-tokens.css`、`src/options/stitch/styles/*` 为准
- Tailwind / DaisyUI 只作为历史迁移材料或归档参考；除非本页和设计系统治理文档同步恢复，否则不得作为新生产路径
- 旧 Options preview 验证源码已迁到 `tests/fixtures/options-preview/**`；retired preview runtime 不得重新接入生产或验证主链
- 旧 Options layout/formSections/section classes 与非 YAML widgets 在验证 owner 迁出或替换前属于 `migrate-then-delete` 资产，不是可直接删除的生产真值
- source aliases、compatibility shells、barrel/type-only entrypoints 不是 source-of-truth docs；它们必须有明确 owner 与删除条件，删除前必须满足 Non-Production Code 3.0 六项 owner proof
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
