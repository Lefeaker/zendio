# 改代码前样式完全迁移检查清单

> **更新日期**：2026-03-13  
> **用途**：在开始任何 CSS / Tailwind / 设计系统相关代码改动前，先完成这份准备清单，确保执行范围、终态和验收标准固定  
> **目标口径**：样式边界以**完全迁移**为目标，不以“长期混用”作为正式终态

---

## 1. 总目标确认

- [x] 明确本轮目标是“完全迁移”，不是“边界收口后接受混用”
- [x] 明确所有模块最终都必须退出主路径中的 legacy CSS / inline `<style>` / runtime 注入
- [x] 明确过渡方案只允许阶段性存在，不能在文档里写成长期保留架构

---

## 2. 模块范围确认

以下模块必须全部纳入迁移范围：

- [x] `Options`
- [x] `Onboarding`
- [x] `Clipper`
- [x] `Reader`
- [x] `Video`
- [x] `SupportPrompt`

---

## 3. 逐模块终态定义

每个模块在开工前都要写清楚“唯一主样式入口 / 允许保留层 / 必须退出主路径的样式形态 / 验收方式”。

### `Onboarding`

- [x] **最终唯一主样式入口**：`src/styles/global.tailwind.css` + `src/styles/design-tokens.css` 的静态 `<link>` 组合；Onboarding 页面与 support modal 只能消费这条静态链路中的类名 / token
- [x] **必须退出主路径的样式实现**：`src/onboarding/index.html` 现有大块 inline `<style>` 必须整体删除；删除范围至少覆盖页面 reset、布局容器、header、step 卡片、按钮、footer、progress、responsive 规则，以及 support modal 相关选择器
- [x] **允许短期存在的过渡桥**：只允许在迁移 PR 过程中临时保留旧类名映射或共享组件类名适配；`src/onboarding/bootstrap.ts` 不允许继续拼接 CSS 文本、创建 `<style>` 节点、写入 `style.textContent`，只允许负责 DOM、事件绑定与 i18n
- [x] **完成后的代码判定方式**：`src/onboarding/index.html` 不再包含业务 `<style>`；`src/onboarding/bootstrap.ts` 中不再出现 `createElement('style')`、`style.textContent`、模板字符串 CSS；support modal 复用共享组件层，样式来源全部可追溯到静态 `<link>`

### `Options`

- [x] **最终唯一主样式入口**：`src/options/styles/tailwind.css`；`src/styles/global.tailwind.css` 只作为共享组件 / 全局 utility 补充层，不能承担页面主布局职责
- [x] **必须退出主路径的样式实现**：`aob-options.css` 不得继续承担页面主视觉兜底；凡是已能由 Tailwind utility 或共享组件层稳定表达的布局、配色、组件外观规则，必须从 `aob-options.css` 迁出
- [x] **允许短期存在的过渡桥**：`src/options/styles/aob-options.css` 只允许暂存结构补丁、兼容性修正、可访问性细节；`src/options/styles/design-tokens.css` 与 `src/styles/design-tokens.css` 作为 token 基座继续存在，但仅提供变量，不承担页面视觉实现
- [x] **完成后的代码判定方式**：`tailwind.css` 成为页面主视觉唯一主入口；`aob-options.css` 只剩少量受控保留项；`src/options` 下不再新增 inline `<style>`、运行时 `<style>` 注入或新的 `style=` DOM 拼接链路

### `SupportPrompt`

- [x] **最终唯一主样式入口**：`src/styles/clipper/clipper.tailwind.css`
- [x] **必须退出主路径的样式实现**：`src/content/ui/supportPrompt.ts` 不允许继续持有业务样式模板字符串、私有 prompt CSS、或按状态拼 CSS 的逻辑；`support-prompt.css` 不得回到主路径
- [x] **允许短期存在的过渡桥**：`loadClipperStyle()` 与现有装载器只允许在阶段性过渡中加载编译产物文本，不能定义样式；若后续切换到统一 stylesheet manager，过渡桥可继续存在到替换完成
- [x] **完成后的代码判定方式**：`src/content/ui/supportPrompt.ts` 中不再出现业务 `<style>` 生成逻辑；dialog / toast / feedback UI 只复用 `clipper.tailwind.css` 与共享组件层

### `Video`

- [x] **最终唯一主样式入口**：`src/styles/clipper/video.tailwind.css`；共享 panel 基底仅允许叠加 `clipper.tailwind.css`
- [x] **必须退出主路径的样式实现**：`src/content/video/session.ts` 与 `src/content/video/prompt.ts` 中的业务样式 runtime 注入必须退出主路径；历史 `video-panel.css`、`video-prompt.css` 不得恢复
- [x] **允许短期存在的过渡桥**：`InlineStyleManager`、`panelStyleSheetManager`、`loadClipperStyle()` 只允许在迁移过渡期装载编译产物文本，不能拼接业务 CSS；高亮主题仍可由 `highlight-themes.css` 提供事实资产，但不得承担 panel / prompt 主视觉
- [x] **完成后的代码判定方式**：floating prompt、session panel、capture 列表、按钮状态都能追溯到 `video.tailwind.css` / 共享层；`src/content/video/session.ts` 中不再存在业务 CSS 文本注入

### `Clipper`

- [x] **最终唯一主样式入口**：`src/styles/clipper/clipper.tailwind.css`
- [x] **必须退出主路径的样式实现**：历史 `dialog.css`、`comment-form.css` 等旧文件不得回到主路径；`styleRegistry` / `clipperStyleSheetManager` 不允许继续承担第二套样式来源
- [x] **允许短期存在的过渡桥**：`styleRegistry` / `clipperStyleSheetManager` 只允许作为阶段性样式装载桥 / Shadow DOM 适配桥存在，只能加载编译好的静态 CSS 产物；`highlight-themes.css` 只作为独立高亮主题资产事实存在
- [x] **完成后的代码判定方式**：Clipper dialog 的视觉来源只追溯到 `clipper.tailwind.css`；runtime bridge 只负责装载，不再承载样式定义职责或模块私有视觉规则

### `Reader`

- [x] **最终唯一主样式入口**：panel 与共享 UI 统一走 `src/styles/clipper/clipper.tailwind.css`
- [x] **必须退出主路径的样式实现**：`src/content/reader/session.ts` 中 `READER_STYLES` 与 `InlineStyleManager.mount()` 不得继续承载主视觉 CSS；`reader-panel.css` 不得回到主路径
- [x] **允许短期存在的过渡桥**：共享 panel 样式链路与高亮系统最小样式可暂存于迁移过渡期；`highlight-themes.css` 只作为高亮主题事实资产，不能承担 Reader panel 主视觉
- [x] **完成后的代码判定方式**：Reader session 启动后，不再通过 `READER_STYLES` 或 `InlineStyleManager.mount()` 注入主视觉 CSS；panel 与高亮视觉来源都可明确追溯

---

## 4. 禁区清单

在开始代码改动前，必须先明确以下禁区：

- [x] **legacy CSS 禁区已定死**：`comment-form.css`、`dialog.css`、`video-panel.css`、`video-prompt.css`、`support-prompt.css`、`reader-panel.css` 必须删除或退出主路径；`components.css` 不得再被表述为任一模块的正式主样式入口
- [x] **inline `<style>` 禁区已定死**：`src/onboarding/index.html` 内所有业务 `<style>` 必须消失；`src/onboarding/bootstrap.ts` 内动态创建 `<style>`、拼接 CSS 模板字符串、向 modal append style 节点绝不允许保留
- [x] **runtime 注入禁区已定死**：`src/content/reader/session.ts`、`src/content/video/session.ts`、`src/content/ui/supportPrompt.ts` 中任何新的 `style.textContent = ...`、`document.createElement('style')`、`innerHTML` 内嵌 `<style>`、业务 CSS 模板字符串都禁止进入主路径
- [x] **临时桥边界已定死**：`styleSheetManager` / `InlineStyleManager` 只允许临时装载编译产物文本；`src/content/clipper/shared/styleManager.ts`、`src/content/shared/panels/styleSheetManager.ts`、`src/content/clipper/shared/styleSheetManager.ts` 不得扩权为长期业务样式定义点；高亮系统最小必需样式是唯一允许的例外
- [x] **禁止的“以后再说”做法已定死**：禁止“先保留 legacy CSS 兜底，等全部模块迁完再删”“先把新类名加上，旧规则继续生效”“临时在 TS 里补一段 style 保证上线”；`design-tokens.css`、`src/options/styles/design-tokens.css`、`highlight-themes.css` 只能按事实资产层管理，不能被借口性地无限延期

---

## 5. 文档同步前置项

- [x] `archived/next-steps/NEXT-STEPS-EXECUTION-PLAN.md` 已明确“完全迁移”目标
- [x] `INTEGRATED-EXECUTION-PRIORITY-PLAN.md` 已明确“先准备、后改代码”的顺序
- [x] `TAILWIND-MIGRATION-STATUS.md` 已标出哪些模块仍未完成迁移
- [x] `PENDING-TASKS.md` 不再使用“接受混用”口径

---

## 6. 验收与回归前置项

- [x] 已为每个模块列出迁移完成后的 DOM / 样式入口验收点
- [x] 已为每个模块列出需要回归的测试或手工验证场景
- [x] 已明确迁移过程中哪些行为绝不能改
- [x] 已明确完成后哪些历史文档可以归档

### 模块验收标准

#### `Onboarding`

- [x] **代码搜索验收**：`src/onboarding` 下搜索 `<style>`、`createElement('style')`、`style.textContent` 必须为空
- [x] **DOM / 样式入口验收**：页面源码与运行后 DOM 中都不再出现业务 `<style>` 节点；DevTools 可确认样式只来自静态 `<link>` 产物
- [x] **交互回归验收**：support modal 打开/关闭、i18n 文案、按钮交互、进度条、完成态显隐与迁移前一致
- [x] **不允许回退的行为**：不得因为迁移而恢复 JS 动态 style 注入、丢失 modal 关闭逻辑或破坏完成态切换

#### `Options`

- [x] **代码搜索验收**：`src/options` 下不存在新增 runtime 样式注入点、inline `<style>` 或业务 CSS 模板字符串
- [x] **DOM / 样式入口验收**：`tailwind.css` 承担主视觉；`aob-options.css` 中不存在新的大面积页面外观规则；token 供值链路无断裂
- [x] **交互回归验收**：主要设置区块、弹窗、表单、列表、响应式布局无视觉回退
- [x] **不允许回退的行为**：不得重新把 `aob-options.css` 写回为页面主视觉兜底或恢复旧入口声明

#### `Clipper`

- [x] **代码搜索验收**：`styleRegistry` / `clipperStyleSheetManager` 中不含新增业务样式定义、业务 CSS 模板字符串或第二套主样式来源
- [x] **DOM / 样式入口验收**：dialog、comment form、按钮、状态区的主视觉都可追溯到 `clipper.tailwind.css`
- [x] **交互回归验收**：Shadow DOM 与 fallback 路径下视觉一致，dialog / comment form / 高亮交互行为不变
- [x] **不允许回退的行为**：不得让 `dialog.css`、`comment-form.css` 回流主路径，不得新增桥接层私有视觉规则

#### `Reader`

- [x] **代码搜索验收**：搜索 `READER_STYLES`、`style.textContent`、`createElement('style')` 时，不再存在新的 Reader 页面级 CSS 模板字符串
- [x] **DOM / 样式入口验收**：`READER_STYLES` 不再承载业务样式；panel 样式、highlight 样式来源清晰
- [x] **交互回归验收**：全文阅读、高亮、注释、导出流程行为不变
- [x] **不允许回退的行为**：不得因迁移破坏高亮恢复、panel 展示或重新把 Reader session 写回主视觉注入器

#### `Video`

- [x] **代码搜索验收**：`src/content/video/session.ts`、`src/content/video/prompt.ts` 中搜索 `<style>`、`createElement('style')`、`style.textContent`，不得再出现业务样式 runtime 注入
- [x] **DOM / 样式入口验收**：floating prompt、session panel、capture 列表、按钮状态都可追溯到 `video.tailwind.css` / 共享层；`InlineStyleManager` 若仍存在，只挂载编译产物文本
- [x] **交互回归验收**：视频识别、快捷键、拖拽 prompt、fragment capture、主题切换行为与迁移前一致
- [x] **不允许回退的行为**：不得恢复旧 `video-prompt.css` / `video-panel.css` 入口，不得破坏拖拽定位与 capture 流程

#### `SupportPrompt`

- [x] **代码搜索验收**：`src/content/ui/supportPrompt.ts` 中不存在新增样式模板字符串、私有 CSS 入口、`createElement('style')` 或 `style.textContent`
- [x] **DOM / 样式入口验收**：dialog、toast、like/dislike 分支 UI 全部复用 `clipper.tailwind.css` 与共享组件层
- [x] **交互回归验收**：review / dislike / 外链 / dismiss 行为与迁移前一致，i18n 文案不回退
- [x] **不允许回退的行为**：不得重新引入独立 `support-prompt.css` 或恢复按状态拼 CSS 的实现

### 通用验收动作

- [x] **代码搜索通用动作已定死**：对每个模块执行一次 `<style>`、`createElement('style')`、`style.textContent`、业务样式 runtime 注入搜索，确认没有新增违规入口
- [x] **样式入口通用动作已定死**：验证每个模块的 DOM / 样式入口都能追溯到本节定义的唯一主入口或允许的临时桥
- [x] **回归通用动作已定死**：对每个模块至少执行一次手工回归，验证布局、交互、i18n、暗亮主题相关 token 消费均正常
- [x] **完成判定通用动作已定死**：任何无法明确归属到“主入口 / 事实资产层 / 临时桥”的样式实现，都视为未迁完；任何仍存在业务样式 runtime 注入的模块都不得判完成

---

## 7. 开工门槛

只有在以下条件全部满足后，才进入代码改动阶段：

- [x] 模块范围已锁定
- [x] 每个模块终态已定义
- [x] 禁区清单已完成
- [x] 文档口径已统一到“完全迁移”
- [x] 验收与回归标准已写明

### 当前门槛判断

- [x] 当前允许进入代码改动阶段
- [ ] 当前**不允许**进入代码改动阶段
- [x] 原因：第 3 / 4 / 6 节已补成可执行版本并完成勾选，准备阶段门槛已过线；下一步应按既定顺序进入 `Onboarding` 第一刀代码迁移

---

## 当前结论

**这份清单的目的，是先把“怎么才算迁完”写死，再进入代码改动。任何在终态、禁区、验收标准未明确前的样式迁移，都视为高返工风险工作。**
