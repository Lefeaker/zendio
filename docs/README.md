# 工程文档入口

最后更新：2026-08-28

## 当前真值入口

- 工程命令、类型与门禁：[`engineering-entrypoints.md`](./engineering-entrypoints.md)
- 文档状态与维护：[`document-status-governance.md`](./document-status-governance.md)
- [`i18n-production-copy-governance.md`](./i18n-production-copy-governance.md)
- [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md)
- [`analytics-operations-runbook.md`](./analytics-operations-runbook.md)
- [`performance-baseline.md`](./performance-baseline.md)
- [`source-of-truth-index.md`](./source-of-truth-index.md)
- [`non-production-code-ownership.md`](./non-production-code-ownership.md)

## 当前正式代码入口

- `src/ui/foundation/*` 与 `src/ui/primitives/*`：保留的横切语义、基础控件与
  style-host 能力
- `src/ui/stitch-runtime/*` 与 `src/ui/stitch-surfaces/*`：中性 runtime、稳定 DOM
  reconciliation 与共享 surface graph
- `src/ui/foundation/style-host/*`、`src/ui/hosts/content/contentDialogFocus.ts` 与
  `src/ui/hosts/shared/contract.ts`：精确保留的样式/宿主 helper
- `src/ui/domains/usage-chart/*`：唯一保留的共享 usage-chart owner；不能据此恢复通用
  `patterns`、`hosts` 或 `domains` 层
- `src/options/index.ts -> src/options/runtimeEntry.ts -> src/options/app/bootstrap.ts -> src/options/app/productionStitchShell.ts`
- `src/content/index.ts -> src/content/runtime/*`

## 当前口径

- `quality` / `verify:preflight` / CI 对 `typecheck:app`、`typecheck:tests` 与
  `typecheck:strict` 口径已经对齐；type debt 与 warning 数值必须从当前工具输出读取，
  不在入口页冻结某次历史快照
- 文档治理由 `audit:active-documents:{report,check}` 动态验证当前 Git tree；当前
  `143 tracked = 143 classified = 93 active + 49 historical + 1 fixture`，零 findings，
  但后续验收仍以每次 fresh report/check 为准
- UI production ownership manifest 已是 `final`：共 `56` rows，其中
  `47 production-runtime + 9 production-compile`，零 deferred rows；完整 exact-path 真值只来自
  `tools/ui-production-ownership.json` 与对应 report/check
- `quality` 与 CI 已包含 `lint:hardcoded`、动态 active-document、UI ownership、
  design-token、performance 与 GitHub Actions supply-chain hard gates
- Chrome/Firefox release auditors 锁定 first-attempt policy、无凭据 prepare、exact SHA/CI provenance、immutable artifact ID/digest、受保护 Environment、fresh reauthorization、单一 mutation credential step、durable state evidence 与 terminal verdict
- Firefox release tooling 不再依赖 `web-ext` / `addons-linter`：仓库内静态 manifest/release-surface 检查负责 XPI 前置门禁，AMO upload validation 提供完整 linter 结论；发布使用 first-party AMO API v5 adapter，exact-XPI smoke 使用 pinned geckodriver `0.37.1` 与 WebDriver BiDi install/bootstrap/uninstall/reinstall identity 契约
- i18n production copy 当前不变量：production user-visible copy 只能来自 i18n catalog 或 `UserVisibleMessageDescriptor` key；background/content 边界传 descriptor/code/params；`quality` 已包含 CJK/descriptor hard gate `audit:i18n-hardcoded-user-copy:check`，当前 audit truth 为 `scanned=579 findings=19 unexpected=0 staleAllowlist=0`；English uncatalogued-copy hard gate `audit:i18n-uncatalogued-user-copy:check` 已接入 `quality` 与 `verify:preflight`，覆盖 raw English `defaultMessage` fallback 与 `subtitle` / `hint` / `body` 等 production-visible fields，当前 audit truth 为 `scanned=575 findings=0 unexpected=0 staleAllowlist=0`
- i18n 当前由 `src/i18n/catalog/messages/<lang>/{runtime,static,schema}.json` 驱动生成 `src/i18n/generated/**` 与 `public/_locales/**`；root `_locales/**` 已退役，不再作为 compatibility duplicate 保留
- Chrome ZIP 与 Firefox XPI 在 package 脚本中会解包后执行 release-surface 审计，最终包不得包含 `qps-ploc` loader/chunk 或 `_locales/qps-ploc/messages.json`
- build、performance、dependency、type 与 lint 的当前数值以 fresh report 输出和
  [`performance-baseline.md`](./performance-baseline.md) 为准；dated 段落仅是历史证据
- `audit:non-production-source:report` 是 inventory evidence，完成态必须退出 0；`audit:non-production-source:check` 是 hard gate
- ignored `.env.production.local` 仅用于明确标注的非发布开发/analytics smoke。GitHub release prepare 只从冻结的 repository/organization Variables 读取三项 public GA build values；受保护的 Chrome/Firefox Environments 只保存 store credentials 与 reviewer policy。详见 [`analytics-configuration-guide.md`](./analytics-configuration-guide.md)
- `M4` 已按重定义口径通过：当前分支保留已验真的 retained set，原始规模预算已下沉到 backlog

## 归档与参考

- 历史状态、旧迁移方案、旧验收记录都在 `archive/status-*` 或旧日期文档里
- `archive/legacy-options-assets/` 与 `reference-fixtures/legacy-options/` 仅作参考
- archive 与 legacy 默认不作为生产代码或正式入口真值
- [`project-stabilization-plan-2026-04-13.md`](./project-stabilization-plan-2026-04-13.md) 与 [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md) 是 dated execution / batch 记录
- [`long-term-maintenance-backlog-2026-03-29.md`](./long-term-maintenance-backlog-2026-03-29.md) 与 [`release-readiness-handoff-2026-05-20.md`](./release-readiness-handoff-2026-05-20.md) 是历史 backlog / handoff
