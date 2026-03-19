# 全项目样式混用审计

> **更新日期**：2026-03-13  
> **判定口径**：以当前仓库代码、HTML 入口、CSS 产物、构建脚本与运行时注入链路的真实状态为准  
> **用途**：作为“当前仓库仍有哪些样式混用事实存在”的证据文档；用于支持状态判断，不用于裁决哪些混用可以长期保留

---

## 结论摘要

当前项目**不是**“纯 Tailwind 已完成，只剩少量文档收尾”的状态。

基于 `src/` 内样式入口、构建脚本与运行时样式加载链路交叉核对，项目目前属于**混合样式架构**：

- Tailwind 已成为多个模块的主要视觉样式来源
- 设计变量层仍广泛依赖 `design-tokens.css`
- Options 已退出模块级 legacy CSS 主路径，页面与 preview 改由静态 Tailwind 产物 + token 链路承载
- Onboarding 已退出 `index.html` inline `<style>` 与 `bootstrap.ts` 动态 `<style>` 主路径
- Content 侧剩余样式兼容点已统一收口到 `shadowStyleBridge.ts`
- `highlight-themes.css`、`firefox.css` 仍是独立样式资产，不属于 Tailwind 主线统一结果

因此，本审计文档只负责回答两件事：

1. **哪些混用事实当前确实存在**
2. **哪些位置仍然处于迁移未完成状态**

哪些样式入口允许保留、哪些必须退出主路径、什么才算迁完，一律不由本文件裁决，而由 `PRE-CODE-STYLE-MIGRATION-CHECKLIST.md` 统一定义。

---

## 核心证据

### CSS 入口与产物

当前 `src/` 中仍存在以下主要样式文件：

- `src/options/styles/design-tokens.css`
- `src/options/styles/tailwind.input.css`
- `src/options/styles/tailwind.css`
- `src/styles/design-tokens.css`
- `src/styles/global.tailwind.css`
- `src/styles/clipper/clipper.tailwind.css`
- `src/styles/clipper/video.tailwind.css`
- `src/styles/clipper/highlight-themes.css`
- `src/styles/firefox.css`

### Tailwind 构建链路

`package.json` 当前仍保留并实际支持以下产物构建：

- `tailwind:build`
- `tailwind:build:global`
- `tailwind:build:clipper`
- `tailwind:build:video`

这说明 Tailwind 产物已是正式构建链路的一部分，但并不等于旧 CSS 与运行时样式层已退出。

### 典型混用证据

- `src/options/index.html` 同时加载：
  - `./styles/design-tokens.css`
  - `../styles/global.tailwind.css`
  - `./styles/tailwind.css`
- `src/onboarding/index.html` 现在只保留静态 `<link>` 链路，页面样式已并入共享 Tailwind 产物
- `src/onboarding/bootstrap.ts` 已不再创建 modal 动态 `<style>`
- `src/content/clipper/shared/styleSheetManager.ts`、`src/content/shared/panels/styleSheetManager.ts` 统一通过 `src/content/shared/shadowStyleBridge.ts` 管理 Shadow DOM 样式桥接
- `src/content/reader/session.ts`、`src/content/video/session.ts`、`src/content/ui/supportPrompt.ts` 已退出旧式 `InlineStyleManager` 主路径
- `src/content/video/fragmentHighlighter.ts` 与相关 panel/prompt 入口已改为复用受控 bridge，而不是各自直接创建 `<style>`

---

## 模块分级

本审计采用以下四类分级：

- **A：基本已 Tailwind 主导**
- **B：Tailwind + legacy CSS 混用**
- **C：Tailwind + runtime 注入 / inline styles 混用**
- **D：基本未纳入 Tailwind 主线**

---

## 模块审计结果

### 1. Options

**判定**：`A. 基本已 Tailwind 主导`

**当前样式来源**

- `src/options/index.html`
- `src/options/styles/design-tokens.css`
- `src/options/styles/tailwind.css`
- `src/styles/global.tailwind.css`
- `src/options/styles/tailwind.input.css`

**现状判断**

- Options 页已经明显由 Tailwind utility 与 DaisyUI 风格组件主导
- `aob-options.css` 已删除；原先承担的 preview `color-scheme` 与 reduced-motion 兼容约束已迁入共享 `global.tailwind.css` 输入层
- `design-tokens.css` 仍是变量基座，不是可直接删除的“旧 CSS”
- 当前 `Options` 主路径不再保留模块级 legacy CSS 兜底；剩余样式来源为静态 Tailwind 产物与 token 链路

**结论**

- Options 已完成本轮 legacy CSS 清零
- `design-tokens.css` 继续作为变量基座存在，但不构成模块级 legacy 样式回退层

**建议动作**

- 保持 `global.tailwind.css` + `tailwind.css` + `design-tokens.css` 为唯一静态入口组合
- 不得恢复 `aob-options.css` 或新增新的 `options-legacy.css` 类替代文件

### 2. Onboarding

**判定**：`A. 基本已 Tailwind 主导`

**当前样式来源**

- `src/onboarding/index.html`
- `src/styles/design-tokens.css`
- `src/styles/global.tailwind.css`

**现状判断**

- 页面与 modal 已并入静态产物链路
- `index.html` 已不再保留 inline `<style>`
- `bootstrap.ts` 已不再通过 JS 动态插入 modal 样式文本

**结论**

- Onboarding 第一刀样式迁移已通过
- 当前主路径样式入口已收口为静态 `<link>` 组合

**建议动作**

- 保持当前静态产物入口，不得恢复 inline `<style>` 或动态 `<style>`
- 后续仅保留回归验证与文档归档动作

### 3. Clipper

**判定**：`C. Tailwind +受控 Shadow DOM bridge 混用`

**当前样式来源**

- `src/styles/clipper/clipper.tailwind.css`
- `src/styles/clipper/highlight-themes.css`
- `src/content/clipper/shared/styleSheetManager.ts`
- `src/content/clipper/shared/styleRegistry.ts`
- `src/content/clipper/components/dialog.ts`

**现状判断**

- Clipper 的视觉主体已经切到 `clipper.tailwind.css`
- 运行时桥接已统一收口到 `shadowStyleBridge.ts`
- Firefox WebExtension content script 主线仍需保留受控 fallback
- `highlight-themes.css` 是独立主题层，并未并入 Tailwind 主线

**结论**

- Clipper 代码侧的 Tailwind rollout 已完成
- 当前剩余问题已缩到统一 bridge 内部 fallback，而不是业务模块各自注入 `<style>`
- 因此未完成点只剩 bridge 兼容层，而非新的模块级样式迁移

**建议动作**

- 当前只允许通过统一 `shadowStyleBridge.ts` 管理 bridge 与 fallback
- 禁止在 Clipper 业务模块继续新增直接 `<style>` 注入
- Firefox fallback 的去留与退出条件以 `SHADOW-STYLE-BRIDGE-EXIT-EVALUATION.md` 为准

### 4. Reader

**判定**：`C. Tailwind +受控 Shadow DOM bridge 混用`

**当前样式来源**

- `src/content/reader/session.ts`
- `src/content/shared/panels/styleSheetManager.ts`
- `src/content/reader/ui/panel.ts`
- `src/styles/clipper/clipper.tailwind.css`
- `src/styles/clipper/highlight-themes.css`

**现状判断**

- Reader Panel 复用 content panel 的样式注入链路
- `InlineStyleManager` 与会话层样式挂载职责已退出主路径
- 剩余 bridge/fallback 已统一收口到 `shadowStyleBridge.ts`
- 与高亮相关的主题样式继续依赖 `highlight-themes.css`

**结论**

- Reader 已退出旧式 runtime `<style>` 注入主路径
- 当前剩余兼容点只在统一 bridge 与高亮主题层

**建议动作**

- 保持 Reader panel 仅复用统一 bridge
- 禁止恢复 `InlineStyleManager` 或独立业务层 `<style>` 注入
- 文档需把剩余问题表述为 bridge 兼容层，而不是 Reader 自身旧链路未迁完

### 5. Video

**判定**：`C. Tailwind +受控 Shadow DOM bridge / 平台适配混用`

**当前样式来源**

- `src/styles/clipper/video.tailwind.css`
- `src/styles/clipper/clipper.tailwind.css`
- `src/content/video/prompt.ts`
- `src/content/video/session.ts`
- `src/content/video/fragmentHighlighter.ts`
- `src/content/shared/panels/styleSheetManager.ts`
- `src/styles/clipper/highlight-themes.css`

**现状判断**

- Video Prompt / Session 已退出旧式 runtime `<style>` 注入主路径
- fragment highlight 已改为复用受控 bridge
- Video panel 仍走 content panel 的 Shadow DOM / fallback 样式链路
- 高亮主题继续依赖 `highlight-themes.css`

**结论**

- Video 模块的 Tailwind 主线已经落地
- 当前剩余问题集中在统一 bridge 兼容层与平台样本差异，不再是业务层旧注入链路

**建议动作**

- 将剩余未完成点限定为 bridge 兼容性与平台例外说明
- 不再把 Video 描述成 `InlineStyleManager` 或直接 `<style>` 注入未退出

### 6. Support Prompt

**判定**：`C. Tailwind +受控 Shadow DOM bridge 混用`

**当前样式来源**

- `src/content/ui/supportPrompt.ts`
- `src/content/shared/panels/styleSheetManager.ts`
- `src/content/shared/shadowStyleBridge.ts`
- `clipper.tailwind.css` / panel 样式桥接链路

**现状判断**

- Support Prompt 已明显复用 Tailwind 产物
- 主 prompt 与 toast 已切到受控 Shadow DOM bridge
- 已退出旧式 `InlineStyleManager.mount()` 直接注入 `<style>` 主路径

**结论**

- Support Prompt 已纳入 Tailwind 主线
- 当前剩余兼容点只在统一 bridge，而不是 Support Prompt 自身保留旧式注入链路

**建议动作**

- 继续沿用统一 bridge
- 禁止恢复业务层直接 `<style>` 注入
- 文档需把残留点表述为 content bridge 兼容层，而不是 Support Prompt 单模块旧链路

### 7. Firefox-specific 样式

**判定**：`D. 基本未纳入 Tailwind 主线`

**当前样式来源**

- `src/styles/firefox.css`

**现状判断**

- 这是浏览器兼容层样式资产
- 当前不适合简单纳入 Tailwind 成果叙述

**结论**

- 应作为平台兼容样式独立保留
- 不纳入 Tailwind 完成率口径

---

## 总体判断

### 当前最明显的未迁完证据

以下事实足以证明项目仍未完成完全迁移：

- `Clipper` 的 Firefox content script 主线仍依赖统一 `shadowStyleBridge.ts` fallback
- `Reader` / `Video` / `SupportPrompt` 的剩余兼容点已统一收口到同一 bridge，而非彻底 adoptedStyleSheets-only
- `highlight-themes.css`、`firefox.css` 仍是独立样式资产
- 尽管 `Options` 与 `Onboarding` 已清零通过，但 content 侧 bridge 兼容层尚未完全退出

---

## 下一步建议

### P0

- 以本审计提供的事实证据回写 `TAILWIND-MIGRATION-STATUS.md`
- 用 checklist 而不是本审计，统一模块终态、禁区与验收标准

### P1

- 校正 `STAGE3-IMPLEMENTATION-PLAN.md` 与 `ARCHITECTURE-REFACTOR-PLAN.md` 中关于“Tailwind 基本完成”的叙述

### P2

- 保持 `Options` / `Onboarding` / `SupportPrompt` / `Video` / `Reader` 的当前收口结论，不再回退
- 不再保留“是否接受混用”的判断题

### P3

- 最后再统一回写 `PENDING-TASKS.md`、`README.md`、`ARCHIVE-INDEX.md`

---

## 最终判定

当前项目更准确的状态应表述为：

**Tailwind 已成为主要视觉样式手段，但项目整体仍存在明确的混用事实；这些事实只能作为现状证据，不能自动推导为长期保留方案。正式目标仍是把主路径中的 legacy CSS、inline `<style>` 与 runtime 注入全部迁出。**
