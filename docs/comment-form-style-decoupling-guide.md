# Comment Form 退役与现行 Clipper 真值

更新时间：2026-08-27
适用范围：Clipper 对话框的 comment 输入、样式与交互 owner

## 当前真值

- 旧 comment-form facade、class map 与 presenter element helper 已在 U02C3 一并退役。
- 当前 Clipper 对话框由 `src/content/clipper/components/dialog.ts` 及其 controller/adapter
  闭包编排，并通过 `src/content/stitch/runtimeSurfaceRenderer.ts` 渲染 neutral runtime surface。
- comment 输入、按钮、dialog 语义与样式来自 Stitch runtime/surface contract、
  `src/ui/stitch-surfaces/surfaces/clipper.ts` 和 `src/styles/design-tokens.css`。
- 不存在 `comment-form.css`、旧 class-map fallback 或 compatibility re-export。

## 代码边界

- 业务状态与生命周期：`src/content/clipper/components/clipperDialogController.ts`
- DOM/runtime 适配：`src/content/clipper/components/clipperDialogSurfaceAdapter.ts`
- neutral surface schema：`src/ui/stitch-surfaces/surfaces/clipper.ts`
- runtime 渲染：`src/content/stitch/runtimeSurfaceRenderer.ts`

后续调整必须落在上述现行 owner 中，不得恢复已删除的 comment-form 或 presenter facade。

## 已验证结果

- `node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/content/clipperDialog.test.ts`
- `npm run typecheck:app`
- `npm run lint -- --quiet`
- `npm run build:dev`

浏览器抽查：

- `http://localhost:4180/content-orchestrator-harness.html`
  - 通过 `window.harness.openClipperDialog()` 拉起剪藏对话框
  - comment 输入由 neutral runtime surface 渲染
  - dialog 使用现行 Stitch token / shared class contract，无旧 comment-form 样式 owner

截图：

- `tmp/content-orchestrator-i18n-style-validation-20260321.png`

## 禁止回流

以下做法视为回流：

- 恢复旧 comment-form、presenter element helper 或 compatibility re-export
- 重新引入 `style.cssText`、动态 `<style>` 或原始颜色字面量
- 新增不受 Stitch runtime/surface contract 管理的 `comment-form.css`

## 后续建议

- 新交互优先扩展 neutral runtime/surface schema，并同步现有生产与浏览器测试。
- 不为已退役 facade 创建 successor、别名或测试专用副本。
