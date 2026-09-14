# Reader Panel 样式边界真值说明

更新时间：2026-09-14
适用范围：`src/content/reader/**`、`src/styles/clipper/highlight-themes.css`

## 当前真值

- 运行时主路径已经不是 legacy `ReaderPanel`。
  - 当前生产主路径由 feature-local `ReaderDialogPanel` 注入
    `src/ui/stitch-runtime/*` / `src/ui/stitch-surfaces/*` neutral renderer，并加载 generated
    Reader runtime CSS pack。
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

## 首次使用提示

阅读与视频面板共用一张内嵌提示卡，说明左侧边缘可调宽度、顶部边缘可调高度，以及左上角图标会在新标签页打开设置。提示不抢焦点、不自动展开折叠面板，也不影响笔记编辑。

两个模式分别在当前浏览器 profile 的 `storage.local` 中记录确认状态（`aiob.firstUse.readerPanel.v1` / `aiob.firstUse.videoPanel.v1`）。用户点击确认按钮后才写入 `true`，之后关闭、重开或刷新都不再提示；未确认就关闭面板仍保留提示机会。读取失败时保持隐藏，写入失败时本次关闭仍生效、下次可能再次提示，不阻断会话。该状态独立于 Options、草稿与面板尺寸；更换页面不会重置，清除扩展数据后可重新显示。

展示由 neutral surface builder 与共享 session CSS 负责；feature controller 绑定一条本地点击监听和一次存储读取，销毁时清理，增量更新仅替换文案并保留确认状态。

## 已验证结果

- `node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/content/reader/highlightManager.test.ts tests/unit/content/video/FragmentHighlighter.test.ts tests/unit/content/reader/ReaderSession.test.ts`
- `npm run typecheck:app`
- `npm run typecheck:strict -- --pretty false`
- `npm run build:dev`
- `node scripts/run-browser-test-shards.mjs e2e`（canonical Reader/YAML/smoke owner）

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
