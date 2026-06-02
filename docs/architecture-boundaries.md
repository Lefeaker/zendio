# 平台、UI 宿主与领域边界基线

日期：2026-05-11

当前技术栈：TypeScript、esbuild、Vitest、Playwright、ESLint、Prettier、Stylelint、Zod、Stitch runtime CSS、WebExtension APIs。正式计划与规格文档归属外层 workspace `docs/codex-superpowers/*`。

## 1. Composition Root 与平台调用边界

正式 composition root 保持不变：

- `src/background/index.ts`
- `src/content/index.ts`
- `src/onboarding/index.ts`
- `src/options/index.ts -> src/options/runtimeEntry.ts -> src/options/app/bootstrap.ts -> src/options/app/productionStitchShell.ts`
- `src/platform/services.ts`

验证命令：`npm run audit:platform-services:report`

## 2. UI 分层边界

- `src/ui/foundation/*`：横切真值，不承载业务。
- `src/ui/primitives/*`：统一基础语义，不感知仓储与 feature 生命周期。
- `src/ui/patterns/*`：结构组合层，不直接读 store / repository。
- `src/ui/hosts/*`：宿主与样式注入边界。
- `src/ui/domains/*`：稳定领域控件与真实实现所有权边界。

## 3. domains 与 features 的依赖方向

允许：

- `Options section / content session / presentation` → `src/ui/domains/*`
- `domains` → `src/ui/primitives/*` / `patterns/*` / `hosts/*` / `foundation/*`

禁止：

- `src/ui/domains/*` → `src/options/*`
- `src/ui/domains/*` → `src/content/*` 旧 feature 文件
- `foundation / primitives` 反向依赖 feature 或 repository

## 4. 宿主与 style host 边界

- `src/ui/hosts/options/index.ts` 统一承接 Options main host / section host contract
- `src/ui/hosts/content/index.ts` 与 `ContentDialogHost.ts` 统一承接 content host mount / unmount / dialog shell
- `src/ui/hosts/shadow/index.ts` 与 `ShadowDialogHost.ts` 承接 shadow host 与 shadow dialog contract
- `src/ui/foundation/style-host/index.ts` 承接 stylesheet bridge 真值
- `src/content/shared/panels/styleSheetManager.ts` 与 `src/content/clipper/shared/styleSheetManager.ts` 只能经由 foundation/style-host 访问 shadow bridge

## 5. Repository 与状态边界

- `IOptionsRepository`、`IMessagingRepository`、`IYamlRepository` 仍是正式主合同
- `productionStitchShell.ts` 是当前 Options 生产 UI 适配入口
- 旧 Options layout shell 与最终旧 section/form 兼容源码已退役；retired Options 兼容类不得重新接入生产启动链
- retired Options compatibility classes 与旧 preview runtime 不得作为 experimental shell、fallback shell 或 verification shortcut 恢复
- session / UI state 禁止重新使用 `window.__aiob*` 全局变量传递

## 6. registry 式协调的当前口径

- `sectionRegistry.ts` 仅保留极少量兼容协调，不再接受新增职责
- 新增协作优先采用 typed controller、explicit callback 或 state-driven rendering
- `privacy`、`vault-router`、`reading`、`video` 的真实 UI 所有权已进入 `src/ui/domains/*`；YAML 配置 UI 的当前 owner 是 `src/options/yaml-config-editor/**`。
- 旧 Options preview 验证源码已迁到 `tests/fixtures/options-preview/**`；retired preview 源树不再是生产或验证 owner
- `src/options/widgets/**` 不得重新获得非 YAML production UI ownership；非 YAML widget 只能在明确 owner 与删除条件下作为迁移资产保留。
- compatibility shells、barrel/type-only files 与 source aliases 不是 source-of-truth docs；它们必须有明确 owner 与删除条件，且删除前必须通过 Non-Production Code 3.0 六项 owner proof。
- `npm run quality` 当前强制执行 retired-code、production-shape、build-graph、non-production-source check 与 dependency-cruiser hard gates；架构边界变更必须保持这些 hard gates 为绿。
- `npm run audit:non-production-source:report` 是 inventory evidence，完成态必须退出 0；若出现 report blocker，必须逐 exact path 迁移、六证据删除或显式 retained-contract 分类。`npm run audit:non-production-source:check` 才是可接入 hard gate 的安全命令。
- 2026-05-21 owner-proof checkpoint：`src/options/app/changelogContent.ts` 与 `src/components/trial-notice.ts` 仍是 retained facade；`src/content/reader/highlightController.ts` 与 `src/content/runtime/contentClipOrchestrator.ts` 仍是 migrate-import-owner。它们不得进入 M6.2 删除批次，除非新的六项 owner proof 表明确标记 `delete-approved`。

## 7. 持续审计

- `npm run audit:platform-services:report`
- `npm run audit:repository-composition:report`
- `npm run audit:ui-architecture:report`
- `npm run audit:components:report`
- `npm run audit:imports:report`
