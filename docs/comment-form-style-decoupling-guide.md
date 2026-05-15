# Comment Form 样式边界真值说明

更新时间：2026-03-21
适用范围：`src/content/clipper/components/commentForm.ts`

## 当前真值

- `commentForm.ts` 已不再包含 `cssText`、内联 `<style>`、或原始十六进制颜色值。
- 视觉合同已从组件实现中抽出到：
  - `src/content/clipper/components/commentFormStyles.ts`
- 当前路线不是恢复 `comment-form.css`。
  - 该文件已不再存在，也不是现仓库的推荐方案。
  - 现行方案是：组件只负责结构与 i18n 绑定，样式合同以共享 class map 形式维护，并复用 Stitch runtime CSS、`src/styles/design-tokens.css` 与现有 token/utility class contract。

## 代码边界

- 结构与文本绑定：
  - `src/content/clipper/components/commentForm.ts`
- 视觉 class 合同：
  - `src/content/clipper/components/commentFormStyles.ts`

这意味着后续若要调整 comment form 外观，应优先修改 `commentFormStyles.ts`，而不是把颜色、阴影、focus ring 重新写回 `commentForm.ts`。

## 已验证结果

- `npx vitest run tests/unit/content/commentForm.test.ts`
- `npm run typecheck:app`
- `npm run lint -- --quiet`
- `npm run build:dev`

浏览器抽查：

- `http://localhost:4180/content-orchestrator-harness.html`
  - 通过 `window.harness.openClipperDialog()` 拉起剪藏对话框
  - shadow root 内 `textarea#clipper-comment-input` class 为：
    - `clipper-comment-textarea textarea textarea-bordered mb-6 min-h-[120px] w-full resize-y text-sm leading-relaxed`
  - `clipper-comment-preview` 已只使用 token / shared class contract，无 `#xxxxxx` 原始颜色字面量

截图：

- `tmp/content-orchestrator-i18n-style-validation-20260321.png`

## 禁止回流

以下做法视为回流：

- 在 `commentForm.ts` 重新写入原始颜色值、阴影值、`focus:` 颜色字面量
- 重新引入 `style.cssText` 或动态 `<style>`
- 新增一个不受共享 class contract 管理的 `comment-form.css`

## 后续建议

- 如需继续降低耦合，可把更多 content-side 视觉合同统一抽到 shared style contract 文件。
- 但当前主线问题已经不是“缺少独立 CSS 文件”，而是“不要让视觉细节回流到组件实现”。这一点本轮已完成。
