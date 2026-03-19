# Tailwind Manual Browser Regression Closure (2026-03-13)

> 目的：把 Tailwind 主线要求的“人工浏览器回归”收敛成正式结项记录  
> 执行口径：真实扩展、非 headless、实机 Chromium 窗口；以 `build/dist` 为加载产物  
> 结论口径：本文件记录的是本轮实机执行结果与结项判断，不再继续新增样式迁移开发

---

## 本轮执行范围

- `Options preview / options page`
- `SupportPrompt toast`
- `Reader panel`
- `Video prompt`

执行产物：

- 非 headless 结果 JSON：
  - `tmp/manual-browser-regression/real-extension-headed/real-extension-regression-results.json`
- 非 headless 截图目录：
  - `tmp/manual-browser-regression/real-extension-headed/`
- 对照自动化结果：
  - `tmp/manual-browser-regression/real-extension/real-extension-regression-results.json`

---

## 一、通过项

### 1. Options page

- 结果：通过
- 观察：
  - `#optionsShellRoot .aobx-shell` 存在
  - `.aobx-shell__sidebar` 存在
  - `body` margin = `0px`
  - `body` 已带 `aobx-shell-active`

### 2. SupportPrompt toast

- 结果：通过
- 站点：
  - `Wikipedia`
  - `MDN`
- 观察：
  - prompt `adoptedStyleSheets = 1`
  - toast `adoptedStyleSheets = 1`
  - 首开链路稳定：prompt -> like -> toast

### 3. Reader panel

- 结果：通过
- 站点：
  - `Wikipedia`
  - `MDN`
- 观察：
  - Clipper dialog `adoptedStyleSheets = 1`
  - Reader dialog `adoptedStyleSheets = 1`
  - 真实选文 -> `clipSelection` -> `Enter reading mode` 链路可复现

### 4. Video prompt

- 结果：部分通过
- 站点：
  - `YouTube`：通过
  - `Bilibili`：未通过

---

## 二、Bilibili 负样本判定

### 当前现象

- 在非 headless Chromium 实机窗口中：
  - 页面打开成功
  - 但 DOM 中未检测到可播放 `<video>`
  - 页面提示“当前浏览器不支持 HTML5 播放器”
  - 因此 `Video prompt` 不会出现

### 判定

这个负样本当前应归因为：

1. 本轮 Chromium 渠道的媒体能力 / 站点兼容性限制
2. 不是 Tailwind 样式路径退回 legacy 注入
3. 也不是 `shadowStyleBridge.ts` 的 adopted/fallback 选择导致

支持这个判断的依据：

- 同一轮非 headless 实机中，`YouTube` 视频页已正常出现 prompt
- `SupportPrompt`、`Reader`、`Options` 也都通过
- 因此当前没有证据表明 Tailwind 主线路径在实机浏览器中发生普遍回退

---

## 三、正式结论

### 已完成的结项部分

- `Options page` 实机首开回归：完成
- `SupportPrompt toast` 实机首开回归：完成
- `Reader panel` 实机首开回归：完成
- `YouTube video prompt` 实机首开回归：完成

### 仍保留的例外项

- `Bilibili video prompt`：
  - 本轮已完成实机复验
  - 结果是浏览器媒体能力负样本
  - 当前不再继续归因到 Tailwind 样式迁移本身

### 对 Tailwind 主线归档条件的影响

当前归档条件只剩两项：

1. 人工浏览器回归已完成并形成正式记录
2. Firefox fallback 保留决策已固化

其中第 2 项已经完成，见 `SHADOW-STYLE-BRIDGE-EXIT-EVALUATION.md`。  
第 1 项本轮已完成正式执行与记录，但 `Bilibili` 仍保留一个“浏览器媒体能力例外”说明。

因此，本轮建议的归档判断是：

- **可以停止新的样式迁移开发**
- **可以把 Tailwind 主线切到“归档准备”**
- **是否直接归档，取决于是否接受 `Bilibili` 作为环境例外而非 Tailwind 主线阻塞**

---

## 四、后续动作边界

允许继续做的事：

- 文档归档
- 关闭条件确认
- Firefox fallback 决策留档

不再继续做的事：

- 新的 Tailwind 样式迁移开发
- 继续机械搬运 legacy CSS
- 为了追求“零残留”新增不必要的样式重构
