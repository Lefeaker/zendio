# Stage 5：全局组件与 SupportPrompt

> **更新日期**：2026-03-13  
> **目标口径**：现状可以记录混用事实，但正式目标固定为完全退出主路径中的 legacy CSS / inline `<style>` / 业务层 runtime `<style>` 注入

---

## 当前定位

Stage 5 不是“可以长期保留混用”的归档阶段，而是**已完成主线切换、仍有残留要继续收口**的阶段。

当前代码真值：

- 全局 Tailwind 构建链路已经落地
- `global.tailwind.css` 已进入正式产物链路
- SupportPrompt prompt / toast 已切到共享 panel stylesheet bridge
- 主路径中不再允许 SupportPrompt 自己创建 `<style>` 节点承担业务样式

---

## 已完成

- `src/styles/global.tailwind.css` 已进入静态产物链路
- `src/styles/tailwind.input.global.css` 已承接 Onboarding / 全局 UI 的 Tailwind 输入
- `src/content/ui/supportPrompt.ts` 已退出直接 runtime `<style>` 注入
- `src/content/ui/supportPrompt/SupportPromptToastController.ts` 首次展示已覆盖异步样式重放竞态

---

## 当前残留

### SupportPrompt

- 当前样式来源仍是 `clipper.tailwind.css`
- 当前挂载方式仍是 `panelStyleSheetManager -> shadowStyleBridge`
- 这说明 SupportPrompt 已退出“业务层直接注入样式”，但**还没有退出受控 bridge**

### Global tokens

- `src/styles/design-tokens.css` 仍作为 token 基座存在
- 它提供变量，不承担组件主视觉
- 它不算“迁移失败”，但也不能被写成 Tailwind 唯一入口

### 人工浏览器回归

以下仍未关闭：

- SupportPrompt toast 首次打开样式
- 首屏样式是否稳定重放
- i18n 文案切换后的布局与交互

---

## 完全迁移目标

Stage 5 的完成标准不是“可以接受 bridge 长期存在”，而是：

1. 全局 UI 的主视觉由静态 Tailwind 产物承担
2. SupportPrompt 不再保留业务模块自管 `<style>` 注入
3. 若 bridge 仍存在，也只能是统一受控桥，不允许新增分散入口
4. 人工浏览器回归完成后，才可把该阶段降级为已闭环

---

## 当前结论

**Stage 5 主线已切换成功，但尚未达到完全迁移完成态。SupportPrompt 已通过本轮代码收口，剩余阻塞是 bridge 保留事实与人工浏览器回归未完成。**
