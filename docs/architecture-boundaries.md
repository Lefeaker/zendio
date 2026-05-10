# 平台、UI 宿主与领域边界基线

日期：2026-03-30

## 1. Composition Root 与平台调用边界

正式 composition root 保持不变：

- `src/background/index.ts`
- `src/content/index.ts`
- `src/onboarding/index.ts`
- `src/options/index.ts -> src/options/app/bootstrap.ts -> src/options/app/productionStitchShell.ts`
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
- `MainContent.ts`、`BaseSection`、`FormSectionRegistry` 属于旧 Options 兼容/验证路径；除兼容修复和验证迁移外，不得重新接入生产启动链
- session / UI state 禁止重新使用 `window.__aiob*` 全局变量传递

## 6. registry 式协调的当前口径

- `sectionRegistry.ts` 仅保留极少量兼容协调，不再接受新增职责
- 新增协作优先采用 typed controller、explicit callback 或 state-driven rendering
- `privacy`、`vault-router`、`yaml-config`、`reading`、`video` 的真实 UI 所有权已进入 `src/ui/domains/*`
- 旧 Options preview 验证源码已迁到 `tests/fixtures/options-preview/**`；retired preview 源树不再是生产或验证 owner

## 7. 持续审计

- `npm run audit:platform-services:report`
- `npm run audit:repository-composition:report`
- `npm run audit:ui-architecture:report`
- `npm run audit:components:report`
- `npm run audit:imports:report`
