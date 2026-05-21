# Source of Truth 索引

最后更新：2026-05-21

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
- 2026-05-20 release readiness handoff：[`release-readiness-handoff-2026-05-20.md`](./release-readiness-handoff-2026-05-20.md)

## 当前执行主线

- 当前统一门禁以 `quality` / `verify:preflight` / CI 三者一致为准
- 当前性能真值以 `audit:build:report` 与 `audit:performance:report` 为准
- 当前 `M4` 已按重定义口径通过；旧版工作树/批次规模预算已下沉到 backlog
- 2026-05-18 stabilization 的 audit-time dirty tree 归属以 [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md) 为准；该文档不再声明当前工作树为 `0` open paths
- 2026-05-19 gap closure 后，batch handoff 使用 post-fact amended ownership；不要再声称历史 committed path manifests exactly once
- Local Vault / offscreen / manifest / release 风险的当前真值来自 2026-05-18 stabilization ledger、2026-05-19 gap closure ledger、集成提交和 `audit:local-vault-release:report`
- Chrome Web Store release 真值：`release:chrome` 默认 dry-run；真实发布只允许 `release:chrome:publish -- --zip <release.zip>` 并需要 owner credentials / manual confirmation
- 2026-05-20 release readiness 真值：Node `20.20.2` / npm `10.8.2` 下全量 release gate 通过，`npm audit --omit=dev` 为 `0`，`npm audit --audit-level=low` 仍作为 dev/release toolchain 后续计划记录
- 2026-05-21 owner-proof 真值：低复用/retained source 删除只接受 M6.1 六项 owner proof 表中 `delete-approved` 的 exact path；当前 `changelogContent`、`trial-notice`、reader `highlightController` 与 `contentClipOrchestrator` 均未获删除批准

## 历史与归档

- `archive/status-*`、历史 milestone 文档、旧迁移方案只用于追溯
- `archive/legacy-options-assets/` 与 `reference-fixtures/legacy-options/` 仅作参考夹具
- 看到 `archive` / `legacy` / `compatibility` / `retired` 时，默认不要把它当成生产真值

## 使用规则

- 想知道“现在该跑什么命令”，先看 [`engineering-entrypoints.md`](./engineering-entrypoints.md)
- 想知道“现在包体和热点是多少”，先看 [`performance-baseline.md`](./performance-baseline.md)
- 想知道“审计时的脏工作树属于哪个交付批次”，先看 [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md)
- 如果新增正式入口、门禁口径或批次归属规则，必须同步更新本页与 [`README.md`](./README.md)
