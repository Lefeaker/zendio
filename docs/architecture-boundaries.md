# 平台、UI 宿主与领域边界基线

日期：2026-08-28

当前技术栈：TypeScript、esbuild、Vitest、Playwright、ESLint、Prettier、Stylelint、Zod、Stitch runtime CSS、WebExtension APIs。正式计划与规格文档归属外层 workspace `docs/codex-superpowers/*`。

## 1. Composition Root 与平台调用边界

正式 composition root 保持不变：

- `src/background/index.ts`
- `src/content/index.ts`
- `src/onboarding/index.ts`
- `src/options/index.ts -> src/options/runtimeEntry.ts -> src/options/app/bootstrap.ts -> src/options/app/productionStitchShell.ts`
- `src/platform/services.ts`

Options runtime 在 Chrome storage 可用分支将调用方的 storage、messaging、tabs、runtime 显式交给 `registerRepositories`。非 Chrome 分支动态加载 `src/platform/preview/optionsRepository.ts` 的 `configurePreviewOptionsRuntime`；该 owner 依次安装 preview platform services、fallback repositories 与内存 Options repository，再返回同一组 services。两个分支完成后，选定的 storage/runtime 才进入 Options bootstrap；runtimeEntry 不直接调用旧 fallback 注册代替 preview composition。

`npm run audit:repository-composition:report` 通过 TypeScript AST 检查上述实际函数、分支、导入 owner、服务连线与顺序；回归用例直接读取当前源码并在内存中注入反例。其他入口注册与 registry 禁止隐式 fallback 的原有检查保留。这是静态 composition 证据，不能替代浏览器中的持久化与交互验收。

验证命令：`npm run audit:platform-services:report`

## 2. UI 分层边界

- `src/ui/foundation/*`：横切真值，不承载业务。
- `src/ui/primitives/*`：统一基础语义，不感知仓储与 feature 生命周期。
- `src/ui/stitch-runtime/*` / `src/ui/stitch-surfaces/*`：neutral runtime 与共享 surface graph。
- `src/ui/foundation/style-host/*`：共享样式注入边界；`src/ui/hosts/*` 只保留 content focus 与 shared host contract helper。
- `src/ui/domains/usage-chart/*`：当前唯一保留的共享 usage-chart 实现；该精确 owner
  不授权恢复通用 `patterns` 或其他 generic domain。

## 3. neutral shared UI 与 feature owner 的依赖方向

允许：

- `Options section / content session / presentation` → `src/ui/stitch-runtime/*` /
  `src/ui/stitch-surfaces/*` / retained primitives and foundation helpers
- exact `usage-chart` owner → `src/ui/primitives/*` / `src/ui/foundation/*`
- feature-local Options / Clipper / Reader / Video UI → shared neutral runtime or primitives, without recreating a generic host layer

禁止：

- shared `src/ui/*` → `src/options/*` or `src/content/*` feature implementation
- `foundation / primitives / neutral runtime` 反向依赖 feature 或 repository

## 4. 宿主与 style host 边界

- `src/ui/foundation/style-host/index.ts` 承接 stylesheet bridge 真值
- `src/ui/hosts/content/contentDialogFocus.ts` 只承接共享 focus lifecycle；`src/ui/hosts/shared/contract.ts` 只承接 host type contract
- Options modal 由 `src/options/stitch/render/renderStitchView.ts` 经 neutral runtime 渲染
- Clipper host 由 `src/content/clipper/components/clipperDialogHostAdapter.ts` feature-local 挂载；Reader / Video panel 分别由 `src/content/reader/ui/ReaderDialogPanel.ts` 与 `src/content/video/ui/VideoDialogPanel.ts` 拥有
- Reader / Video session panel 的固定 shell、named refs 与 keyed item reconciliation 继续由 `src/ui/stitch-runtime/render/{renderRuntimeSurface,keyedSessionList}.ts` 提供；Reader 使用 `src/ui/stitch-runtime/render/rootActionDispatcher.ts`，Video 的 cross-realm-safe event bindings 由 `src/content/video/ui/videoDialogPanelEvents.ts` feature owner 持有；feature facade 只注入 surface content、回调与生命周期，routine update 不得替换 shadow root、完整 window 或未变化 item
- Reader / Video action 成功、失败、取消、dismiss、supersede 与 late completion 继续由 feature session/mutation owner 决定；neutral renderer 只负责稳定 DOM、可访问 status 与幂等 dispose，不得持久化业务状态或发送 telemetry
- Options routine update 通过 feature callback 进入 lazy `src/ui/stitch-runtime/render/sectionInvalidation.ts` runtime chunk；该 neutral owner 只接受 `theme`、`sidebar`、`resource-modal`、六个 section owner、`locale-schema` 与显式 `all-invariant-recovery` 的闭合集合，不得把未知 caller 降级为整页重建
- Options feature 层负责 scope-to-action、success/failure/cancel/dismiss/dispose/retry/late-completion 与 rollback 语义；neutral invalidator 只合并 pending scopes、保存/恢复 focus/selection/scroll 并在 dispose 后 no-op。普通 section invalidation 保留 `.main`、sidebar、未变化 section、modal 与 YAML widget 身份
- Options invalidation loader 拒绝或 owned root 缺失时只进入已枚举 `all-invariant-recovery`；privacy 字段共享同一串行 persistence owner，连接/文件夹/usage 等异步完成使用 active generation guard。dirty YAML 只在 `output`、`locale-schema`、`all-invariant-recovery` 或最终 collect/teardown 边界 flush/destroy；durable import 成功后先重置完整 draft/state/domain/widget truth，再对所有依赖 owner 做全量 invalidation，即使 analytics transfer 随后失败也不得保留 stale DOM
- `src/content/shared/panels/styleSheetManager.ts` 与 `src/content/clipper/shared/styleSheetManager.ts` 只能经由 foundation/style-host 访问 shadow bridge

## 5. Repository 与状态边界

- `IOptionsRepository`、`IMessagingRepository`、`IYamlRepository` 仍是正式主合同
- `productionStitchShell.ts` 是当前 Options 生产 UI 适配入口
- 旧 Options layout shell 与最终旧 section/form 兼容源码已退役；retired Options 兼容类不得重新接入生产启动链
- retired Options compatibility classes 与旧 preview runtime 不得作为 experimental shell、fallback shell 或 verification shortcut 恢复
- session / UI state 禁止重新使用 `window.__aiob*` 全局变量传递

## 5.1 Content Session Mutation 与 Draft Terminal 边界

- `src/content/sessionMutations/sessionMutationTransaction.ts` 是 reader / video 会话中“乐观 UI 变更 -> 持久化 -> commit/rollback”合同的共享边界；reader 通过 `ReaderSession.runDraftMutation` 进入该边界，video 通过 `runVideoCaptureMutationTransaction` 适配同一共享 runner。
- Reader / video 的 draft-backed mutation 不得在 durable save 成功前发送成功 telemetry，也不得在 save 失败后保留已回滚的 UI / DOM / draft 状态。
- `src/content/sessionDrafts/sessionDraftRepository.ts` 是 session draft restore 选择的唯一仓储边界；`discarded` 与 `exported` 属于 terminal 状态，允许留存在 exact storage key / index 中作为 cleanup evidence，但不得被 `loadLatest` 或 `listCandidates` 恢复。
- Reader / video cancel 与 export success 必须先写入 exact-key terminal draft envelope，再执行 cleanup / success analytics；terminal 写入失败必须保留 mounted session 与 retryable visible state。
- 已知 exact storage key 时不得用 draft id 做清理范围，因为同一 `draftId` 可能与不同 page / owner context 的 durable draft 共存。

## 6. registry 式协调的当前口径

- `sectionRegistry.ts` 仅保留极少量兼容协调，不再接受新增职责
- 新增协作优先采用 typed controller、explicit callback 或 state-driven rendering
- Privacy 与 vault-router 的真实 Options UI 所有权在 `src/options/stitch/**`、`src/options/app/**`；Reader / Video 与 support prompt 的真实 UI 所有权在 `src/content/**` feature-local modules。共享 `src/ui/domains/*` 不再声明这些 owner；YAML 配置 UI 的当前 owner 是 `src/options/yaml-config-editor/**`。
- 旧 Options preview 验证源码已迁到 `tests/fixtures/options-preview/**`；retired preview 源树不再是生产或验证 owner
- `src/options/widgets/**` 不得重新获得非 YAML production UI ownership；非 YAML widget 只能在明确 owner 与删除条件下作为迁移资产保留。
- compatibility shells、barrel/type-only files 与 source aliases 不是 source-of-truth docs；它们必须有明确 owner 与删除条件，且删除前必须通过 Non-Production Code 3.0 六项 owner proof。
- `npm run quality` 当前强制执行 retired-code、production-shape、build-graph、non-production-source check 与 dependency-cruiser hard gates；架构边界变更必须保持这些 hard gates 为绿。
- `npm run audit:non-production-source:report` 是 inventory evidence，完成态必须退出 0；若出现 report blocker，必须逐 exact path 迁移、六证据删除或显式 retained-contract 分类。`npm run audit:non-production-source:check` 才是可接入 hard gate 的安全命令。
- 2026-05-21 owner-proof checkpoint：`src/options/app/changelogContent.ts` 与 `src/components/trial-notice.ts` 仍是 retained facade；`src/content/reader/highlightController.ts` 与 `src/content/runtime/contentClipOrchestrator.ts` 仍是 migrate-import-owner。它们不得进入 M6.2 删除批次，除非新的六项 owner proof 表明确标记 `delete-approved`。
- 2026-06-22 commercial capability boundary checkpoint：`src/components/trial-notice.ts` 继续是 retained facade，仍未获得 delete-approved 六项 owner proof；本 milestone 不删除、不挂载该组件。`src/background/trialLifecycle.ts`、`src/utils/trial-manager.ts` 与 `src/utils/trial-manager-ports.ts` 是 production-owned，因为 background startup imports the trial lifecycle path. Public Reader / Video / Options code must not import private entitlement, subscription, customer, payment, or Pro concepts.

## 7. 持续审计

- `npm run audit:platform-services:report`
- `npm run audit:repository-composition:report`
- `npm run audit:ui-architecture:report`
- `npm run audit:components:report`
- `npm run audit:imports:report`
