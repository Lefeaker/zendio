# Tailwind Real Extension Regression (2026-03-13)

> 目的：把 Tailwind 主线的浏览器级验证收敛成正式执行单，区分 `Chromium 样本回放`、`真实扩展首开`、`跨站点样本`  
> 判定口径：以当前源码重新构建后的 `build/dist` 为准；`dist/` 中旧产物不作为本轮真实扩展验证真值  
> 注意：本文件记录的是自动化浏览器 / 真实扩展样本结果，**不能替代人工浏览器回归结项**

---

## 本轮执行资产

- 构建命令：`npm run build:fast`
- 自动化结果 JSON：
  - `tmp/manual-browser-regression/real-extension/real-extension-regression-results.json`
  - `tmp/manual-browser-regression/real-extension-headed/real-extension-regression-results.json`
- 截图目录：
  - `tmp/manual-browser-regression/real-extension/`
  - `tmp/manual-browser-regression/real-extension-headed/`
- Chromium 样本回放记录：`TAILWIND-BROWSER-SAMPLE-LOG-2026-03-13.md`
- 非 headless 实机结项记录：`TAILWIND-MANUAL-BROWSER-REGRESSION-CLOSURE-2026-03-13.md`

---

## 一、Chromium 样本回放

本项沿用前一轮样本回放结果，作为“静态 harness / 样本页面”证据：

- `SupportPrompt toast`：通过，`adoptedStyleSheets = 1`
- `Reader panel`：通过，`adoptedStyleSheets = 1`
- `Video prompt`：通过，`adoptedStyleSheets = 2`
- `Options preview`：通过，基础排版与 shell 容器正常

结论：

- Chromium 样本回放已经证明当前 Shadow bridge 主路径没有立即退回到 fallback `<style>`
- 但它不覆盖扩展注入时序、真实站点 DOM、扩展页首开

---

## 二、真实扩展首开

### 2.1 Options page

- 入口：`chrome-extension://<id>/options/index.html`
- 结果：通过
- 观察：
  - `#optionsShellRoot .aobx-shell` 已挂载
  - `.aobx-shell__sidebar` 存在
  - `body` margin = `0px`
  - `body` 已带 `aobx-shell-active`
- 截图：`tmp/manual-browser-regression/real-extension/options-first-open.png`

### 2.2 SupportPrompt toast

- 站点：Wikipedia
- 触发链路：真实扩展注入 `content/index.js` -> `SHOW_SUPPORT_PROMPT` -> 点赞 -> toast
- 结果：通过
- 观察：
  - prompt 首次挂载 `adoptedStyleSheets = 1`
  - toast 首次挂载 `adoptedStyleSheets = 1`
  - toast 文案为 `Thanks for the encouragement!Write a review`
- 截图：`tmp/manual-browser-regression/real-extension/support-prompt-wikipedia.png`

### 2.3 Reader panel

- 站点：Wikipedia
- 触发链路：真实扩展注入 -> 选中文段 -> `clipSelection` -> Clipper -> `Enter reading mode`
- 结果：通过
- 观察：
  - Clipper dialog `adoptedStyleSheets = 1`
  - Reader dialog `adoptedStyleSheets = 1`
  - 首次进入后已带 1 条高亮记录
- 截图：`tmp/manual-browser-regression/real-extension/reader-wikipedia.png`

### 2.4 Video prompt

- 站点：YouTube
- 触发链路：真实扩展注入 -> 首次评估视频页 -> 浮动 prompt 首开
- 结果：通过
- 观察：
  - prompt host 存在
  - `adoptedStyleSheets = 2`
  - 首屏文案为 `Video mode available · ALT+V✕`
  - 页面内检测到 `1` 个 `<video>`
- 截图：`tmp/manual-browser-regression/real-extension/video-youtube.png`

---

## 三、跨站点样本

### 3.1 SupportPrompt toast

- 站点：MDN
- 结果：通过
- 观察：
  - prompt `adoptedStyleSheets = 1`
  - toast `adoptedStyleSheets = 1`
  - 首开结果与 Wikipedia 一致
- 截图：`tmp/manual-browser-regression/real-extension/support-prompt-mdn.png`

### 3.2 Reader panel

- 站点：MDN
- 结果：通过
- 观察：
  - Clipper dialog `adoptedStyleSheets = 1`
  - Reader dialog `adoptedStyleSheets = 1`
  - 真实选文链路可复现，Reader 首次挂载正常
- 截图：`tmp/manual-browser-regression/real-extension/reader-mdn.png`

### 3.3 Video prompt

- 站点：Bilibili
- 结果：未通过，但属于样本环境负例，不等于主线回退
- 观察：
  - 当前 headless Chromium 样本未检测到可播放 `<video>`
  - prompt host 未出现
  - 页面文案显示浏览器不支持 HTML5 播放器
- 判定：
  - 该负样本说明跨站点视频回归仍未闭环
  - 不能据此判定 YouTube 主线已回退到 legacy 注入
  - 后续仍需人工浏览器实机补 Bilibili 样本
- 截图：`tmp/manual-browser-regression/real-extension/video-bilibili.png`

---

## 当前判断

### 已拿到的正向证据

- `build/dist` 载入的真实扩展首开，已经能跑通：
  - `Options page`
  - `SupportPrompt toast`
  - `Reader panel`
  - `YouTube video prompt`
- Article 场景跨站点样本已覆盖：
  - `Wikipedia`
  - `MDN`

### 当前未关闭项

- `Bilibili` 视频场景已补实机复验，但仍保留浏览器媒体能力例外说明
- 是否可直接归档，取决于是否接受该例外不再视为 Tailwind 主线阻塞

### 本轮结论

**Tailwind 主线已经从“继续搬 CSS”切到“验证与归档”阶段。当前真实阻塞不再是主视觉迁移，而是跨站点证据、Firefox fallback 策略，以及人工浏览器回归结项。**
