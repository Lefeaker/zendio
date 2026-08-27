# 设计系统治理基线

日期：2026-08-27

适用范围：Options、content、onboarding 的共享 UI、样式宿主、运行时 surface 与长期守门规则。

UI 文件的逐路径生产归属、迁移状态和替代 owner 以
`tools/ui-production-ownership.json` 为可执行真值。本文描述分层规则，不另建目录级 allowlist。

## 1. 当前正式入口

### foundation 与样式真值

- 唯一 token 真值：`src/styles/design-tokens.css`
- 图标白名单：`src/ui/foundation/icons/index.ts`
- a11y 状态：`src/ui/foundation/a11y/index.ts`
- shadow style bridge：`src/ui/foundation/style-host/index.ts`
- 通用 UI 类型：`src/ui/foundation/types/index.ts`
- 仍由 Card/Table 编译依赖的 BaseComponent 深层 owner：`src/ui/foundation/lifecycle/BaseComponent.ts`

已删除的 token metadata、keyboard barrel 与 lifecycle barrel 没有兼容 wrapper；不得恢复。

### neutral runtime 与 surfaces

- neutral renderer 入口：`src/ui/stitch-runtime/index.ts`
- neutral schema/surface 入口：`src/ui/stitch-surfaces/index.ts`
- 基础按钮：`src/ui/primitives/button/index.ts`

Options、Reader、Video 与 Support Prompt 的生产 UI 都通过 neutral runtime/surface
契约呈现。feature 层持有业务状态与编排；neutral UI 层不得反向导入 options、content、
background 或 platform feature。

### 当前 feature owner

- Options 页面：`src/options/app/productionStitchShell.ts`、`src/options/stitch/schema/settings/overview.ts`
- Reader：`src/content/reader/ui/ReaderDialogPanel.ts`
- Video：`src/content/video/ui/VideoDialogPanel.ts`
- Support Prompt：`src/content/ui/supportPrompt.ts`
- 使用量图表仍由 manifest 中的 usage-chart production-runtime 行持有

旧 domain/host 壳已删除。隐私迁移期仅保留 manifest 中两条 U02C4
`deferred-state-convergence` 类型契约；它们不是第二套 view、controller 或 persistence owner。

### 已退役入口

以下 legacy wrapper / 旧入口别名已退役，不得再恢复：

- Options 的 Daisy\*、OptionsLayout、旧 Vault/YAML/privacy controls
- content 的 Daisy wrapper、旧 ReaderDialog / VideoDialog wrapper
- 旧 content/shadow/options host shell 与重复 domain view
- 已删除的 theme、vault-router、reader、video、support-prompt UI-domain barrel
- U02C3 删除的六个 patterns、六个 primitives、旧 focus-trap 与其专用 facades

## 2. 组件分层规则

### foundation

- 只承接 icon、a11y、style-host、共享类型与仍有明确编译 owner 的基础能力。
- 禁止业务术语、仓储、页面装配和 feature 状态进入 foundation。

### primitives

- 保留的基础 owner 只承接仍由生产/runtime 使用的 button、input、select、textarea、toggle、badge、card 与 table 等能力。
- checkbox 与 dialog 语义由 neutral runtime input/modal contract 持有，不恢复已删除的专用 primitive。
- 不允许在 neutral runtime 之外复制 button、dialog 或表单控件语义。
- manifest 中的每个 primitive 都必须有逐文件 disposition；目录存在本身不构成保留理由。

### runtime / surfaces

- stitch-runtime 负责通用节点渲染、动作适配与 modal 语义。
- stitch-surfaces 负责无业务依赖的 schema/builder；feature 通过 context、binding 与 dispatch 接入。
- 新增 runtime kind 必须同时有生产 caller、类型契约和 focused test。

### patterns / hosts / domains

- patterns、hosts、domains 不再享有目录级默认保留。
- U02C3 的十二条 retirement row 已随其完整 dependent closure 删除，manifest 不再保留这些路径。
- 当前生产 owner 必须由生产 build graph 或 compile-import proof 支撑。
- 最终 closureState 为 final 时，只允许 production-runtime 与 production-compile 行。

## 3. 命名与交互现状

### 按钮语义

- 正式 variant：primary、secondary、ghost、outline、danger、error。
- 危险操作首选 danger；error 仅保留为兼容语义。
- loading 按钮必须同时输出禁用态与 `aria-busy="true"`。

### 输入与校验态

- validationState：default、success、error。
- error 态必须输出 `aria-invalid="true"`。
- 有说明文本时必须通过 aria-describedby 关联。

### dialog contract

- modal 由 neutral runtime 输出 `role="dialog"` 与 aria-modal。
- 关闭行为通过显式 action/dispatch 实现，不复制旧 host lifecycle。
- `src/dev/interactionContractHarness.ts` 仅消费 neutral runtime/surface builder；checkbox probe 使用 neutral runtime input 的 `type: checkbox` 路径，并保留真实 validation 与 Open dialog 浏览器 smoke contract。

## 4. 样式与 Token 真值

当前生产 UI 样式路径以 Stitch runtime CSS 为准，覆盖 Options、content runtime panels 与
onboarding。Tailwind / DaisyUI 相关文档、注释或历史记录只用于迁移追溯，不得作为新生产
样式入口或构建链。

### 唯一 token 真值源

- 正式 token 文件：`src/styles/design-tokens.css`
- legacy wrapper：src/options/styles/design-tokens.css（已删除）

### 正式样式入口

- Options：`src/options/stitch/styles/stitch.css` 与 `src/options/stitch/styles/variants/stitch-secondary.css`
- content runtime：同一 Stitch 样式经 `src/ui/foundation/style-host/index.ts` 注入
- onboarding：同一 Stitch 样式链
- reader highlight themes：`src/styles/clipper/highlight-themes.css`

### icon 规则

- 只允许 `src/ui/foundation/icons/index.ts` 从 lucide 导入白名单图标。
- 禁止其他 src 文件直接从 lucide 导入。
- 品牌、二维码媒体保持原图；单色功能 SVG 只在明确暗色宿主下主题化。

## 5. 迁移期兼容层与归档资产

### 已归档 legacy 资产

- `docs/archive/legacy-options-assets/obsidian-clipper-style.css`
- `docs/archive/legacy-options-assets/obsidian-hybrid-preview.html`
- `docs/archive/legacy-options-assets/optionuicsssuggest.md`

### 禁止规则

- 生产代码、正式 harness、构建脚本不得重新引用 archive 资产。
- compatibility shell、barrel/type-only 文件必须由 ownership manifest 精确分类。
- 不得用 domains/**、patterns/** 或 primitives/\*\* 之类通配规则绕过 Non-Production Code 3.0。
- session/UI state 不得回流到 window.\_\_aiob\* 全局命名空间。
- 已退役 wrapper / alias 不得恢复为 fallback shell。

## 6. 持续守门

- UI ownership：`node tools/report-ui-production-ownership.mjs --check`
- UI 架构：`npm run audit:ui-architecture:report`
- 交互 contract：`npm run audit:interaction-contract:report`
- token：`npm run audit:design-tokens:report`
- 设计系统文档：`npm run audit:design-system-doc:report`
- 依赖与深层导入：`npm run audit:deps:report`、`npm run audit:imports:report`
- 非生产源码：`npm run audit:non-production-source:report` 与 `npm run audit:non-production-source:check`
- 构建与性能：`npm run audit:build:report`、`npm run audit:performance:report`

设计系统文档审计扫描 tracked/non-ignored 的 active guidance，同时以 ownership manifest
校验本文中的精确 src/ui 引用。历史 archive 与明确 historical debt 记录不作为当前样式真值。

## 7. 开发要求

- 先确认真实 production owner，再决定新增 neutral primitive、surface 或 feature-local 实现。
- 新增 UI 路径必须同步 ownership manifest 的精确行、digest、生产图证据和 focused test。
- 删除路径必须完成六类 owner proof，不得依赖目录约定或仅凭单测缺失判断。
- 当前 U02C3 后的 manifest 为 54 条 UI 路径，并仍仅含两条 U02C4 `deferred-state-convergence` 行。
- 若重新引入已退役 wrapper/alias，应视为架构回退并阻塞合并。
