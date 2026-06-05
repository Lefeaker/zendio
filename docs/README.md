# 工程文档入口

最后更新：2026-06-05

## 当前真值入口

- [`engineering-entrypoints.md`](./engineering-entrypoints.md)
- [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md)
- [`performance-baseline.md`](./performance-baseline.md)
- [`source-of-truth-index.md`](./source-of-truth-index.md)
- [`non-production-code-ownership.md`](./non-production-code-ownership.md)
- [`typescript-strict-roadmap.md`](./typescript-strict-roadmap.md)
- [`long-term-maintenance-backlog-2026-03-29.md`](./long-term-maintenance-backlog-2026-03-29.md)
- [`release-readiness-handoff-2026-05-20.md`](./release-readiness-handoff-2026-05-20.md)
- [`project-stabilization-plan-2026-04-13.md`](./project-stabilization-plan-2026-04-13.md)
- [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md)

## 当前正式代码入口

- `src/ui/foundation/*`
- `src/ui/primitives/*`
- `src/ui/patterns/*`
- `src/ui/hosts/*`
- `src/ui/domains/*`
- `src/options/index.ts -> src/options/app/bootstrap.ts`
- `src/content/index.ts -> src/content/runtime/*`

## 当前口径

- `quality` / `verify:preflight` / CI 对三项 typecheck 口径已经对齐
- `lint:type-any` 当前 GA release env close-out 口径为扫描 `1041` files，实测 overall `0/1064/1727/41/4`、src `0/576/592/5/0`、tests `0/488/1135/36/4`；`lint:type-any:ratchet` 仍守住 checked-in 上限 overall `0/1064/1736/41/4`、src `0/576/596/5/0`、tests `0/488/1140/36/4`，`any` 保持 `0`，`non-null` 与 `ts-expect-error` 上限未放宽
- `quality` 与 CI 已包含 `lint:hardcoded`；当前 hardcoded config 守卫是 `0` errors / `8` warning-only findings
- `audit:build:report` 使用 2026-05-24 M2.5 复核后的预算真值
- `audit:non-production-source:report` 是 inventory evidence，完成态必须退出 0；`audit:non-production-source:check` 是 hard gate
- GA production release public config 由 ignored `.env.production.local` 注入；owner 命令见 [`engineering-entrypoints.md`](./engineering-entrypoints.md) 与 [`analytics-configuration-guide.md`](./analytics-configuration-guide.md)
- `M4` 已按重定义口径通过：当前分支保留已验真的 retained set，原始规模预算已下沉到 backlog
- 当前交付归属统一落到 [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md)

## 归档与参考

- 历史状态、旧迁移方案、旧验收记录都在 `archive/status-*` 或旧日期文档里
- `archive/legacy-options-assets/` 与 `reference-fixtures/legacy-options/` 仅作参考
- archive 与 legacy 默认不作为生产代码或正式入口真值
