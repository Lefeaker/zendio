# Stage 7：Clipper 收口

> **更新日期**：2026-03-13  
> **目标口径**：现状可以记录混用事实，但正式目标固定为完全退出主路径中的 legacy CSS / inline `<style>` / 业务层 runtime `<style>` 注入

---

## 当前定位

Stage 7 不是“Clipper 已完成，可接受 runtime fallback 长期保留”的阶段，而是**主对话框已 Shadow-only、bridge 已收束、最终 fallback 仍待退出**的阶段。

---

## 已完成

- `src/content/clipper/components/dialog.ts` 已要求 Shadow DOM，业务层非 Shadow fallback 已退出
- `src/content/clipper/shared/styleSheetManager.ts` 已不再暴露业务层直接 `<style>` 注入分支
- Clipper 主视觉已由 `clipper.tailwind.css` 承担

---

## 当前 bridge 清单

### 仍走统一 `shadowStyleBridge` 的入口

1. `src/content/clipper/shared/styleSheetManager.ts`
   - 用途：Clipper dialog 样式桥
   - 现状：`adoptedStyleSheets` 优先，降级时由 bridge 内部托管 fallback `<style>`
2. `src/content/shared/panels/styleSheetManager.ts`
   - 用途：Reader panel / Video prompt / Video panel / SupportPrompt toast 的共享桥
   - 现状：业务模块不再直接取 fallback style element，但 bridge 仍会在不支持 `adoptedStyleSheets` 时插入托管 `<style>`
3. `src/content/video/fragmentHighlighter.ts`
   - 用途：ShadowRoot 内高亮主题桥
   - 现状：完全复用统一 bridge，不再自造 `<style>`

### 已退出业务层 fallback 工厂的入口

- `src/content/reader/ui/panel.ts`
- `src/content/video/ui/panel.ts`

这两个 legacy panel 已改成 Shadow-only，不再自己 append fallback style element。

---

## 当前残留

- 统一 bridge 内部仍保留托管 fallback `<style>`
- `highlight-themes.css` 仍作为独立主题层存在
- Clipper 的人工浏览器回归尚未关闭

---

## 完全迁移目标

Stage 7 的最终标准固定为：

1. Clipper 主视觉只依赖 Tailwind 主产物
2. 业务模块不再直接创建 `<style>`
3. bridge 只保留单一受控形态，后续继续评估是否还能进一步退出内部 fallback
4. 人工浏览器回归完成后，才可从“进行中”改为“闭环”

---

## 当前结论

**Stage 7 已完成主对话框 Shadow-only 收口，但尚未达到完全迁移终态。当前剩余工作是继续压缩统一 bridge 内部 fallback，并完成 Clipper 人工浏览器回归。**
