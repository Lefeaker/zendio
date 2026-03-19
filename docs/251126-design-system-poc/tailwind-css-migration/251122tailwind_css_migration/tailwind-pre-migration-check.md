# Tailwind CSS 迁移前置检查清单

在开始迁移之前，请务必检查以下事项，以避免潜在的样式冲突或功能丢失。

## 1. 动态类名处理 (Dynamic Classes)

以下文件使用了动态类名切换，迁移时需确保这些类名在 Tailwind 中有对应实现或保留原 CSS 定义：

- [x] **`src/onboarding/bootstrap.ts`**（2025-11-22 Codex）
    - `hidden` / `show` / `step-completed` 的样式源于 `src/onboarding/index.html:298-383` 内联 `<style>`，对应 onboarding shell；本轮已确认无 `.aob-*` 依赖，Tailwind 迁移阶段需将这些类映射到等价的 `data-state` 或 `animate-*`。
    - Modal `.show` 的行为与 `options` 中的 `.aobx-modal.show` 一致，可在 Tailwind 中以 `opacity-100` + `pointer-events-auto` 实现。

- [x] **`src/shared/utils/browserDetection.ts`**（2025-11-22 Codex）
    - `is-chrome`/`is-firefox`/`is-mobile`/`is-edge`/`is-safari` 在 `<html>` 元素上标记浏览器，`src/styles/firefox.css`、`src/options/obsidian-clipper-style.css` 仍引用这些类。迁移计划：Tailwind 配置中保留 `[.is-firefox_&]` 兼容写法，或将 `src/styles/firefox.css` 作为独立传统 CSS。

- [x] **`src/content/ui/supportPrompt.ts`**（2025-11-22 Codex）
    - 运行时追加 `aiob-support-toast--visible` 以驱动 CSS 动画，定义位于 `src/styles/clipper/support-prompt.css:198`。Tailwind 版本需要在 content-script 构建中注册 `data-[visible=true]:opacity-100` 等实用类；现已记录在剪藏 Tailwind 子计划中（见 §3 备注）。

- [x] **`src/options/components/**/*`**（2025-11-22 Codex）
    - `rg -n "classList.add" src/options/components` 未检出 `.aob-*`，所有 `.aobx-*` 类均已存在于 `src/options/styles/aob-options.css`。
    - 仍在运行时追加的状态类包括 `.is-current/.is-active`（导航高亮）、`.flash`（域名映射闪烁）、`.usage-grid-line`/`.usage-point` 等 Usage SVG 辅助类，以及 `.show`（ModalController 与预览通用）。这些样式已在 `aob-options.css` 或 `.aobx-modal.show` 中实现。
    - `routing-rule-*` 与 `rest-vault-*` 仅用于 DOM 查询/测试（无 CSS），Tailwind 迁移可考虑改成 `data-*` 标记；`has-value`/`has-error` 等依然由 `aob-options.css` 负责伪元素/错误提示。

## 2. 内联样式与脚本注入 (Inline Styles & Injection)

以下组件大量使用了内联样式或动态注入 `<style>` 标签，Tailwind 无法自动覆盖这些样式，建议后续逐步重构：

- [x] **`src/components/trial-notice.ts`**
    - 组件通过 `style.cssText` 构造浮层并在 `addBlinkEffect()` 中内联 `@keyframes`，相关样式未在全局 CSS 中出现。
    - **处理**: 记录在本清单，并将“重写为 Tailwind utility”列入 251120 迁移后续任务；当 Tailwind 可产出公共 `utilities.css` 时，再将位置/颜色映射到 Token。

- [x] **`src/content/ui/supportPrompt.ts`**
    - 依赖 `InlineStyleManager` 注入 `src/styles/clipper/support-prompt.css`，同时在运行时追加 `aiob-support-toast--visible` 控制动画。
    - **处理**: 保持现状，但在剪藏 Tailwind 子方案中规划单独构建，避免内容脚本注入主 Options 的 `tailwind.css`；参见 §3 中“clipper”备注。
- [x] **`src/options/aob-option-preview.html`**（2025-11-22 Codex）
    - 预览页已改为只通过 `<link>` 引入 `../styles/design-tokens.css`、`../styles/components.css`、`./styles/aob-options.css`，并复用正式入口的 `.aobx-preview` 运行时，避免再维护一份独立的内联 CSS。
    - 新增的 `prefers-reduced-motion` 限制已同步到 `aob-options.css`（`.aobx-btn/.aobx-link/.aobx-input/.aobx-select/.aobx-textarea` 切断动画），确保预览与正式界面体验一致。

## 3. 额外 CSS 文件

除了 `components.css` 和 `design-tokens.css`，以下文件也包含样式，需决定是否迁移：

- `src/options/styles/aob-options.css`: 设置页面的特定样式。
- `src/styles/clipper/*.css`: 剪藏插件的特定样式（如 `dialog.css`, `reader-panel.css`）。
- `src/styles/firefox.css`: Firefox 特定修复。

**建议**:
1.  在 `tailwind.config.js` 的 `content` 配置中包含所有相关 HTML/TS/JS 文件。
2.  对于 `clipper` 目录下的样式，如果它们是独立加载的（例如在 Content Script 中），可能需要为它们单独构建 Tailwind CSS，或者将它们统一打包。
- [x] `rg "@import" src/options/styles` 仅命中 `aob-options.css -> design-tokens.css`（2025-11-22 Codex），`src/styles/components.css` 与 `src/styles/clipper/**/*.css` 无额外 `@import`，Tailwind 输入只需接入这两个入口目录。
- [x] `rg "var(--aobx" -n src/options/styles src/styles/components.css` 结果显示：`.aobx-*` Token 只在 `src/options/styles/**` 中使用，`src/styles/components.css` 仍依赖旧的 `--bg` / `--text` 等通用 Token。Tailwind 需要同时暴露「Options Tokens」与「Global Tokens」，避免遗漏旧组件。
- [x] `src/options/README.md` 与 `src/options/components/README.md` 的「常用 Utility」表格已经覆盖 `.aobx-card/.aobx-alert/.aobx-table/.aobx-chip-btn/.aobx-domain__*` 等条目，本次未新增额外 Utility；Tailwind 配置可直接映射现有条目。
- [x] **剪藏样式迁移计划**（2025-11-22 Codex）：已新增《docs/clipper-tailwind-migration-plan.md》说明内容脚本将采用独立 Tailwind 构建入口（生成 `clipper.tailwind.css`），并保留 InlineStyleManager 注入 `support-prompt.css` 的兼容策略，确保后续迁移可循序推进。

## 4. 构建配置检查

- [x] `scripts/build.mjs:55` 会在 `build/dist/styles/` 下复制 `src/styles/design-tokens.css`、`src/styles/components.css`、`src/styles/clipper/**/*` 以及整个 `src/options/styles` 目录（2025-11-22 Codex），Tailwind 输出需与该复制流程兼容（或覆盖该段逻辑）。
- [x] `package.json` 已新增 `tailwind:build`/`tailwind:watch`，指向 `tailwind.config.cjs` + `src/options/styles/tailwind.input.css`，输出保存在 `src/options/styles/tailwind.css`，后续可在 build 脚本中串联。
- [x] 新增 `postcss.config.cjs`（Tailwind + Autoprefixer）以及 `tailwind.config.cjs`、`src/options/styles/tailwind.input.css`，初步接入 PostCSS/Tailwind 链路，后续只需在构建命令中引入 `npm run tailwind:build` 即可。

## 5. Options 样式准备 (Options Style Readiness)

- [x] **Token 提取**: 已将 Options 页面的 CSS 变量提取至 `src/options/styles/design-tokens.css`。
- [x] **通用组件抽象**: 已在 `src/options/styles/aob-options.css` 中抽象出以下通用组件，可直接映射为 Tailwind 组件或 Utility：
    - `.aobx-card`
    - `.aobx-alert`
    - `.aobx-field-group`
    - `.aobx-table`
- [x] **组件一致性**: 现有组件（如 `.aobx-panel`, `.aobx-vault-card`）已重构为使用统一 Token（如 `var(--aobx-radius-lg)`）。
- [x] **高亮主题按钮 Utility**: `.aobx-highlight-button + --{theme}` 及 `--aobx-highlight-*` Token 已替换旧 `highlight-theme-button*`，ReadingSection 已统一到 `.aobx-*` 命名。
- [x] **Fragment 示例提示卡片**: 提示块改用 `.aobx-hint-row`/`.aobx-hint-card` + `.aobx-card`，去除遗留 `.hint*`。
- [x] **隐私提示卡片**: `.aobx-card--muted/--outline/--accent-border/--neutral-border` 已在隐私设置中落地，彻底去除 `.aobx-privacy-hints__card--*` 的重复样式。
