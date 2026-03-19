# Stage 6：Video 模块 Tailwind

> **更新日期**：2026-03-13  
> **目标口径**：现状可以记录混用事实，但正式目标固定为完全退出主路径中的 legacy CSS / inline `<style>` / 业务层 runtime `<style>` 注入

---

## 当前定位

Stage 6 不是“Video 已稳定完成，可长期保留 runtime 注入”的阶段，而是**主路径已切到 Tailwind 产物、剩余 bridge 与主题层待继续收口**的阶段。

当前代码真值：

- `video.tailwind.css` 已进入构建链路
- `src/content/video/prompt.ts` 已退出直接样式文本注入
- `src/content/video/fragmentHighlighter.ts` 已切到统一 `shadowStyleBridge`
- Video prompt 首次挂载的异步样式重放竞态已有测试覆盖

---

## 已完成

- `video.tailwind.css` 已承担 Video prompt / panel 主视觉样式
- `panelStyleSheetManager` 已承接 Video prompt 与 panel 的共享样式桥
- `fragmentHighlighter` 不再自己创建 `<style>`

---

## 当前残留

### 统一 bridge 仍在主路径

- `src/content/shared/panels/styleSheetManager.ts`
- `src/content/shared/shadowStyleBridge.ts`

这意味着 Video 已退出“分散注入”，但还没有退出“受控 bridge”。

### 高亮主题仍独立存在

- `src/styles/clipper/highlight-themes.css` 仍服务 Reader / Video 主题态
- 它不应再被误写成 Video 主视觉入口

### 人工浏览器回归

以下仍未关闭：

- Video prompt 首次打开样式
- 不同站点 / Shadow DOM 宿主下的 fragment highlight 稳定性
- i18n 与拖拽交互回归

---

## 完全迁移目标

Stage 6 的完成标准固定为：

1. Video 主视觉由 `video.tailwind.css` 承担
2. 业务模块不再直接创建 `<style>`
3. bridge 如仍存在，只允许统一桥接入口，不允许新增旁路
4. 人工浏览器回归完成后，才可判定本阶段真正闭环

---

## 当前结论

**Stage 6 主线迁移已落地，但尚未完全完成。当前剩余项是统一 bridge 仍在主路径，以及 Video prompt / fragment highlight 的人工浏览器回归未关闭。**
