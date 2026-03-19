# Tailwind Browser Sample Log (2026-03-13)

> 目的：补一轮浏览器级样本验证，记录当前 Tailwind 主线在真实浏览器引擎中的首开样式结果  
> 注意：本记录**不能**替代完整人工浏览器回归；相关待办仍保持未关闭

---

## 本轮样本范围

- SupportPrompt toast
- Video prompt
- Reader panel
- Options preview

执行方式：

- Chromium 引擎样本回放（Playwright）
- 本地 harness 页面：`dist/tailwind-regression-harness.html`
- Options preview 页面：`src/options/aob-option-preview.html`

截图产物：

- `tmp/manual-browser-regression/support-toast-like.png`
- `tmp/manual-browser-regression/reader-panel.png`
- `tmp/manual-browser-regression/video-prompt.png`
- `tmp/manual-browser-regression/options-preview.png`

---

## 结果摘要

### SupportPrompt toast

- 结果：通过
- 观察：
  - ShadowRoot 首次挂载成功
  - `adoptedStyleSheets` 数量为 `1`
  - 未落入 fallback `<style>`
  - 首屏文本与容器可见

### Reader panel

- 结果：通过
- 观察：
  - ShadowRoot 首次挂载成功
  - `adoptedStyleSheets` 数量为 `1`
  - 未落入 fallback `<style>`
  - 首屏计数与提示文本正常

### Video prompt

- 结果：通过
- 观察：
  - ShadowRoot 首次挂载成功
  - `adoptedStyleSheets` 数量为 `2`
  - 未落入 fallback `<style>`
  - 首屏提示文案与关闭按钮正常

### Options preview

- 结果：通过
- 观察：
  - `body` margin 为 `0px`
  - `body` 最小高度正常生效
  - `h1` 顶部 margin 为 `0px`
  - `h1` 字重为 `600`
  - `aobx-shell` / `aobx-sidebar` 正常存在

---

## 当前判断

- Chromium 路径下，当前 bridge 已能稳定走 `adoptedStyleSheets`
- 本轮样本没有发现“第二次才有样式”的首开问题
- `Options preview` 在移除额外 reset 后未出现基础排版回退

---

## 仍未关闭的事项

以下事项仍需继续做人工浏览器回归，因此不能据此关闭待办：

- SupportPrompt toast 的真实扩展场景首开样式
- Video prompt 的跨站点真实页面样式
- Reader panel 的站点矩阵与交互回归
- Options preview 的人工视觉比对与深浅色检查

---

## 结论

**本轮浏览器样本验证通过，足以证明当前 Chromium 主路径没有立即退回到 fallback `<style>`。但人工浏览器回归仍是活跃未完成项，不能提前关闭。**
