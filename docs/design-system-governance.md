# 设计系统治理基线

日期：2026-03-30

适用范围：`Options`、`content`、`onboarding` 的共享 UI、样式宿主、领域控件与长期守门规则。

## 1. 当前正式入口

### foundation

- token 真值：`src/ui/foundation/tokens/index.ts` → `src/styles/design-tokens.css`
- icon 白名单：`src/ui/foundation/icons/index.ts`
- a11y / focus trap：`src/ui/foundation/a11y/index.ts`
- keyboard：`src/ui/foundation/keyboard/index.ts`
- lifecycle / BaseComponent：`src/ui/foundation/lifecycle/index.ts`、`src/ui/foundation/lifecycle/BaseComponent.ts`
- style host / shadow bridge：`src/ui/foundation/style-host/index.ts`
- 通用 UI 类型：`src/ui/foundation/types/index.ts`

### primitives

- button：`src/ui/primitives/button/index.ts`
- input：`src/ui/primitives/input/index.ts`
- select：`src/ui/primitives/select/index.ts`
- checkbox：`src/ui/primitives/checkbox/index.ts`
- textarea：`src/ui/primitives/textarea/index.ts`
- toggle：`src/ui/primitives/toggle/index.ts`
- badge：`src/ui/primitives/badge/index.ts`
- alert：`src/ui/primitives/alert/index.ts`
- dialog：`src/ui/primitives/dialog/index.ts`
- panel / layout：`src/ui/primitives/panel/index.ts`、`src/ui/primitives/layout/index.ts`

### patterns / hosts / domains

- patterns：`src/ui/patterns/*`
  - 正式 section shell：`src/ui/patterns/section-shell/index.ts`
- hosts：`src/ui/hosts/*`
  - 正式 shadow host：`src/ui/hosts/shadow/index.ts`
  - `ShadowDialogHost`：`src/ui/hosts/shadow/ShadowDialogHost.ts`
  - `ContentDialogHost`：`src/ui/hosts/content/ContentDialogHost.ts`
- domains：`src/ui/domains/*`
  - 代表性领域入口：`src/ui/domains/vault-router/index.ts`
  - `vault-router`、`yaml-config`、`privacy`、`reading`、`video`

### 已退役入口

以下兼容 wrapper / 旧入口别名已退役，不得再恢复：

- `src/options/components/shared/Daisy*.ts` 与 OptionsLayout 旧入口
- Options controls 旧入口：VaultRouterView / YamlConfigView / privacySettings / yamlConfigTable\*
- `src/content/shared/daisy/*` 与 ReaderDialog / VideoDialog / SupportPromptView 旧入口

## 2. 组件分层规则

### foundation

- 只承接 token、icon、a11y、keyboard、lifecycle、style-host、类型等横切真值。
- 禁止业务术语、仓储、页面装配与 feature 状态进入 foundation。

### primitives

- 统一基础语义：variant、size、loading、validationState、dialog marker、dismiss contract。
- 不允许在 `src/ui/primitives` 之外重新定义基础 button / dialog / layout 语义。

### patterns

- 负责结构组合，不负责业务数据来源。
- `section-shell`、`confirm-flow`、`setting-row` 是正式组合入口。

### hosts

- 负责宿主差异：mount / update / destroy、普通 DOM、shadow DOM、样式桥接。
- feature 不应直接重写宿主挂载、销毁和样式注入细节。

### domains

- `src/ui/domains/*` 负责真实实现所有权。
- feature 可以依赖 domains；domains 不可反向依赖 `options/*`、`content/*` 旧 feature 文件。
- 当前 `privacy`、`yaml-config`、`vault-router`、`reading`、`video` 已满足该依赖方向。

## 3. 命名与交互现状

### 按钮语义

- 正式 variant：`primary`、`secondary`、`ghost`、`outline`、`danger`、`error`
- 危险操作首选 `danger`；`error` 仅保留为语义兼容值
- loading 按钮必须同时输出禁用态与 `aria-busy="true"`

### 输入与校验态

- `validationState: default | success | error`
- error 态必须输出 `aria-invalid="true"`
- 如存在说明文本，必须通过 `aria-describedby` 关联

### dialog contract

- 统一使用 `header / body / footer` marker
- 必须输出 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`
- 关闭行为需显式声明：close button / backdrop / escape / programmatic

## 4. 样式与 Token 真值

### 唯一 token 真值源

- 正式 token 文件：`src/styles/design-tokens.css`
- legacy wrapper：src/options/styles/design-tokens.css（已删除）

### 正式样式入口

- `Options`：`src/styles/design-tokens.css` + `src/styles/global.tailwind.css` + `src/options/styles/tailwind.css`
- `content`：`src/styles/design-tokens.css` + `src/styles/global.tailwind.css` + `src/styles/clipper/clipper.tailwind.css` + `src/styles/clipper/video.tailwind.css`
- shadow 样式桥：`src/ui/foundation/style-host/index.ts`

### icon 规则

- 只允许 `src/ui/foundation/icons/index.ts` 从 `lucide` 导入白名单图标
- 禁止任何其他 `src/*` 文件直接从 `lucide` 导入
- `src/shared/utils/iconHelpers.ts` 仅保留为对 foundation icon helper 的兼容 re-export

## 5. 迁移期兼容层与归档资产

### 已归档 legacy 资产

以下文件已移出主源码入口，当前只允许作为归档参考：

- `docs/archive/legacy-options-assets/obsidian-clipper-style.css`
- `docs/archive/legacy-options-assets/obsidian-hybrid-preview.html`
- `docs/archive/legacy-options-assets/optionuicsssuggest.md`

### 禁止规则

- 生产代码、正式 harness、构建脚本不得重新引用上述 archive 资产
- session / UI state 不得重新回流到 `window.__aiob*` 全局命名空间
- 已退役 wrapper / alias 不得再恢复为 compatibility wrapper

## 6. 持续守门

- UI 架构守门：`npm run audit:ui-architecture:report`
- 组件入口守门：`npm run audit:components:report`
- 交互 contract 审计：`npm run audit:interaction-contract:report`
- token / wrapper 审计：`npm run audit:design-tokens:report`
- 平台 allowlist 审计：`npm run audit:platform-services:report`
- 依赖与深层导入审计：`npm run audit:deps:report`、`npm run audit:imports:report`
- 构建 / 性能审计：`npm run audit:build:report`、`npm run audit:performance:report`

## 7. 开发要求

- 新增基础控件时，优先修改 `src/ui/primitives/*`
- 新增组合模式时，优先补入 `src/ui/patterns/*`
- 新增宿主差异时，优先补入 `src/ui/hosts/*`
- 新增稳定业务控件时，优先补入 `src/ui/domains/*`
- 若任何人试图重新引入已退役 wrapper / alias，应视为架构回退并阻塞合并
