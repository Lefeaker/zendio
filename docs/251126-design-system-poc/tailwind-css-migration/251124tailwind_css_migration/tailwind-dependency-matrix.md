# Tailwind 依赖矩阵

> **更新日期**：2026-03-13  
> **目标口径**：记录当前真实依赖关系，并明确哪些仍是待退出主路径的残留

---

## 主样式产物

| 文件 | 主要消费端 | 当前判断 |
| --- | --- | --- |
| `src/options/styles/tailwind.css` | Options | 主视觉入口 |
| `src/styles/global.tailwind.css` | Onboarding / 全局页面 | 主视觉入口 |
| `src/styles/clipper/clipper.tailwind.css` | Clipper / Reader / SupportPrompt | content 主样式产物 |
| `src/styles/clipper/video.tailwind.css` | Video | content 主样式产物 |

---

## 受控保留层

| 文件 | 当前职责 | 当前判断 |
| --- | --- | --- |
| `src/styles/design-tokens.css` | 全局 token 供值 | 保留变量层 |
| `src/options/styles/design-tokens.css` | Options token 供值 | 保留变量层 |
| `src/options/styles/aob-options.css` | 结构 hook / reduced-motion / 少量兼容约束 | 继续压缩中 |
| `src/styles/clipper/highlight-themes.css` | Reader / Video 主题层 | 独立主题层 |

---

## 统一 bridge 入口

| 文件 | 当前职责 | 当前判断 |
| --- | --- | --- |
| `src/content/shared/shadowStyleBridge.ts` | 统一托管 adoptedStyleSheets / fallback `<style>` | 受控桥，仍未退出主路径 |
| `src/content/clipper/shared/styleSheetManager.ts` | Clipper bridge | 已收束到统一桥 |
| `src/content/shared/panels/styleSheetManager.ts` | Reader / Video / SupportPrompt 共享 bridge | 已收束到统一桥 |
| `src/content/video/fragmentHighlighter.ts` | ShadowRoot 高亮样式桥 | 已收束到统一桥 |

---

## 已退出的分散注入入口

- `src/onboarding/index.html` 大块 inline `<style>` 已删除
- `src/onboarding/bootstrap.ts` 动态 `<style>` 已删除
- `src/content/ui/supportPrompt.ts` 已退出直接业务样式注入
- `src/content/video/session.ts` 已退出直接业务样式注入
- `src/content/reader/session.ts` 已退出 `InlineStyleManager`
- `src/content/reader/ui/panel.ts` 已退出业务层 fallback style element
- `src/content/video/ui/panel.ts` 已退出业务层 fallback style element

---

## 当前未完成项

- `Options` 仍未把 `aob-options.css` 压到最终最小集
- `shadowStyleBridge.ts` 内部 fallback `<style>` 仍在统一桥内存在
- SupportPrompt toast / Video prompt / Reader panel / Options preview 仍需人工浏览器回归

---

## 当前结论

**依赖矩阵已经从“谁可以长期混用”改成“谁还没退出主路径”。当前最大残留是 `Options` 结构层继续压缩，以及统一 bridge 内部 fallback 仍未完全退出。**
