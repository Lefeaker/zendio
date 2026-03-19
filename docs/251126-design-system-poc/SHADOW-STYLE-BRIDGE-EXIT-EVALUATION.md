# Shadow Style Bridge 最终退出评估

> 更新日期：2026-03-13  
> 目标：明确 `src/content/shared/shadowStyleBridge.ts` 的 fallback `<style>` 何时必须保留、何时可以退出

---

## 结论摘要

当前不能直接把 `shadowStyleBridge.ts` 改成 adoptedStyleSheets-only。

原因不是 Chromium 不支持，而是：

1. 当前仓库仍保留 Firefox 扩展目标
2. Firefox WebExtension content script 场景对 `adoptedStyleSheets` 仍存在 Xray wrapper / constructable stylesheet 兼容限制
3. 当前 `Clipper` / `Reader` / `Video` / `SupportPrompt` 都共享同一 bridge 主链路

因此，**主线结论是：Chromium 路径已可以走 adopted-first；但跨浏览器主线暂时仍必须保留受控 fallback `<style>`。**

这里的“不能删 fallback”判断，**明确基于 Firefox WebExtension content script 主线**，不是基于“泛浏览器都不支持 adoptedStyleSheets”的旧说法。

---

## 运行环境分层

### A. 仍必须依赖 fallback `<style>` 的运行环境

1. Firefox WebExtension content scripts
   - 原因：`adoptedStyleSheets` 在扩展 content script + ShadowRoot 场景下仍受 Xray wrapper / constructable stylesheet 限制
   - 当前影响：由于本仓库仍保留 Firefox 目标，bridge 不能在主线删掉 fallback
2. 任意不支持以下能力的运行环境
   - `Document.prototype.adoptedStyleSheets`
   - `ShadowRoot.prototype.adoptedStyleSheets`
   - `CSSStyleSheet.prototype.replaceSync`

### B. 已能稳定走 adoptedStyleSheets 的运行环境

1. Chromium 浏览器样本环境
   - 本轮浏览器样本中：
     - SupportPrompt toast `adoptedStyleSheets = 1`
     - Reader panel `adoptedStyleSheets = 1`
     - Video prompt `adoptedStyleSheets = 2`
   - 当前未观测到 fallback `<style>` 被使用

---

## 入口级判断

### 已可视为 adoptedStyleSheets-first 的入口

以下入口在当前 Chromium 路径下已证明可走 adopted-first：

- `src/content/shared/panels/styleSheetManager.ts`
  - 消费端：SupportPrompt toast / Reader panel / Video prompt / Video panel
- `src/content/clipper/shared/styleSheetManager.ts`
  - 消费端：Clipper dialog
- `src/content/video/fragmentHighlighter.ts`
  - 消费端：ShadowRoot 内 fragment highlight

说明：

- 这里的“可走”是指 Chromium 路径已可不落入 fallback
- 不等于当前跨浏览器主线可以直接删掉 fallback

### 当前主线仍必须保留 bridge fallback 的入口

以下入口在当前仓库主线中仍必须经由 `shadowStyleBridge.ts` 保留 fallback：

- `src/content/clipper/shared/styleSheetManager.ts`
- `src/content/shared/panels/styleSheetManager.ts`
- `src/content/video/fragmentHighlighter.ts`

原因一致：

- 它们面向同一套跨浏览器 content UI 主链路
- 只要 Firefox 目标还在，统一 bridge 内部 fallback 就不能直接清零
- 这个约束来自 Firefox WebExtension content script 主线，而不是 Chromium / 通用浏览器支持缺口

### 已不再需要业务层 fallback 的入口

以下入口已经完成本轮收口，不应再恢复手写 fallback：

- `src/content/clipper/components/dialog.ts`
- `src/content/reader/ui/panel.ts`
- `src/content/video/ui/panel.ts`
- `src/content/ui/supportPrompt/SupportPromptToastController.ts`
- `src/content/video/prompt.ts`

这些模块应继续只依赖统一 bridge，而不是自行创建 `<style>` 节点。

---

## 推荐退出路径

### 当前阶段

- 保留 `shadowStyleBridge.ts` 内部 fallback
- 禁止任何业务模块新增直接 `<style>` 注入
- 把 adoptedStyleSheets 作为默认主路径继续验证

### 可进入下一阶段的条件

以下任一条件成立时，才适合评估删除 fallback：

1. Firefox 扩展目标被正式移除
2. Firefox WebExtension content script 的 adoptedStyleSheets / Xray 限制被官方修复并完成实测
3. 构建链路分叉为 Chromium-only 与 Firefox-specific，两条路径分别消费不同 bridge 策略

---

## 参考依据

### Firefox WebExtension 兼容性依据

1. Mozilla Bug `1928865`
   - 链接：<https://bugzilla.mozilla.org/show_bug.cgi?id=1928865>
   - 说明：该问题仍指向 WebExtension content script / Xray wrapper 相关限制，意味着 content script 侧不能把 constructable stylesheet / adoptedStyleSheets 当成已完全可靠的主线能力
2. Mozilla Bug `1751346`
   - 链接：<https://bugzilla.mozilla.org/show_bug.cgi?id=1751346>
   - 说明：该问题同样聚焦 Firefox 扩展内容脚本与 Xray wrapper 下的 constructable stylesheet 行为缺口

### 本仓库内的实测依据

- Chromium 样本回放：`archived/tailwind-migration/251126-closure/TAILWIND-BROWSER-SAMPLE-LOG-2026-03-13.md`
- 真实扩展首开与跨站点样本：`archived/tailwind-migration/251126-closure/TAILWIND-REAL-EXTENSION-REGRESSION-2026-03-13.md`

因此，本文件的最终口径固定为：

- Chromium 路径已经证明 adoptedStyleSheets-first 可行
- 但 Firefox WebExtension content script 主线仍不足以支持直接删除 fallback
- `shadowStyleBridge.ts` 当前不能删 fallback

---

## 对 `aob-options.css` 的关联判断

这份评估也反向说明：

- `Options` 的 `box-sizing` 已由 Tailwind preflight 覆盖
- preview `color-scheme` 与 reduced-motion 约束已迁入共享 `global.tailwind.css` 输入层
- 因此 `aob-options.css` 的退出与 shadow bridge 无关，且已不再构成当前主线路径残留

---

## 当前结论

**当前没有任何跨浏览器主线入口可以直接改成 adoptedStyleSheets-only。Chromium 路径已经证明可以 adopted-first，但只要 Firefox 目标仍在，统一 bridge 内部 fallback 就必须继续保留。**
