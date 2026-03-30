# Reader Panel 样式边界真值说明

更新时间：2026-03-21
适用范围：`src/content/reader/**`、`src/styles/clipper/highlight-themes.css`

## 当前真值

- 运行时主路径已经不是 legacy `ReaderPanel`。
  - 当前生产主路径通过 `ReaderDialogPanel` / `ReaderDialog` 提供阅读模式 UI。
- legacy `ReaderPanel` / `VideoPanel` fallback 实现已从生产代码与测试主路径退役并删除。
- `reader-panel.css` 已不存在。
  - 任何继续引用 `src/styles/clipper/reader-panel.css` 的方案都已过期。
- 阅读高亮主题状态已不再挂在 `:root[data-aiob-reader-highlight]`。
  - 当前宿主为 `document.body.dataset.aiobReaderHighlight*`
  - `src/styles/clipper/highlight-themes.css` 也已从 `:root[...]` 改为 `body[...]`

## 代码边界

- 阅读模式主视图：
  - `src/content/reader/ui/ReaderDialogPanel.ts`
  - `src/content/reader/presentation/readerPanelView.ts`
- 高亮主题状态：
  - `src/content/shared/highlightThemeState.ts`
  - `src/content/reader/services/highlightManager.ts`
  - `src/content/video/fragmentHighlighter.ts`
  - `src/styles/clipper/highlight-themes.css`

## 已验证结果

- `npx vitest run tests/unit/content/reader/highlightManager.test.ts tests/unit/content/video/FragmentHighlighter.test.ts tests/unit/content/reader/ReaderSession.test.ts`
- `npm run typecheck:app`
- `npm run typecheck:strict -- --pretty false`
- `npm run build:dev`

浏览器抽查：

- `http://localhost:4180/content-orchestrator-harness.html`
  - 调用 `window.harness.startReaderSession()` 后：
    - `document.body.dataset.aiobReaderHighlight === "gradient"`
    - `document.documentElement.dataset.aiobReaderHighlight === undefined`
  - 证明高亮主题宿主已从 `documentElement` 切到 `body`

截图：

- `tmp/content-orchestrator-i18n-style-validation-20260321.png`

## 当前仍未完成的部分

- 无与 Reader legacy panel 直接相关的主线残留；后续只保留增量样式演进与视觉回归优化。

## 禁止回流

以下做法视为回流：

- 重新把高亮主题状态写回 `document.documentElement.dataset.*`
- 新增对不存在的 `reader-panel.css` 的依赖
- 在新的 Reader 主路径里重新引回已删除的 legacy `ReaderPanel`
