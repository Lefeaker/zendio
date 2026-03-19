# 剪藏样式 Tailwind 迁移计划（草案）

> 目的：记录 `src/styles/clipper/**/*` 与 `src/content/ui/supportPrompt.ts` 在 Tailwind 迁移阶段的处理方式，确保 Options 侧迁移不会阻塞剪藏模块。

## 1. 适用范围

- Content Script UI：`src/styles/clipper/dialog.css`、`reader-panel.css`、`video-prompt.css`、`support-prompt.css` 等文件。
- 支持提示组件：`src/content/ui/supportPrompt.ts`，依赖 `InlineStyleManager` 注入 CSS，并在运行时追加 `aiob-support-toast--visible` 类。
- Firefox 修复：`src/styles/firefox.css` 继续作为传统 CSS 保留，不在本阶段纳入 Tailwind。

## 2. 迁移策略

1. **独立构建入口**  
   - 新增 `src/styles/clipper/tailwind.input.css` 与 `tailwind.config.clipper.cjs`（待实现），`content` 范围仅包含 `src/content/**/*`、`src/styles/clipper/**/*.css`。  
   - 生成文件命名 `clipper.tailwind.css`，由内容脚本在打包阶段注入，避免与 Options Shell 的 `tailwind.css` 混用。

2. **运行时类名复用**  
   - 支持提示 `aiob-support-toast--visible`/`.aiob-support-toast__*` 等类名继续保留，Tailwind 仅补充 `opacity/translate` 等 utility，动画仍由自定义 keyframes 控制。  
   - 若 Tailwind utility 无法覆盖（例如 `clipper.dialog` 的复杂布局），保持原 CSS 并在 `tailwind.config.clipper.cjs` 中通过 `safelist` 保障类名。

3. **构建流程**  
   - 在 `scripts/build.mjs` 中新增 `buildClipperTailwind()`（待办），执行 `npm run tailwind:build:clipper`，再将输出写入 `build/dist/styles/clipper/clipper.tailwind.css`。  
   - Firefox/支持提示依旧使用传统 CSS；Tailwind 结果作为“增量 utility”，逐渐替换现有规则。

## 3. 后续步骤

| 任务 | 说明 | 责任人 |
| --- | --- | --- |
| 创建 clipper Tailwind 配置 | 参考 Options 的 `tailwind.config.cjs`，将 `content` 定位到 `src/content/**/*`。 | ✅ Completed |
| 更新构建脚本 | 在 `npm run build` 流程中串联 clipper Tailwind 构建，并确保 `InlineStyleManager` 能加载新产物。 | ✅ Completed |
| SupportPrompt 样式拆分 | 将 `support-prompt.css` 中的 Toast 布局迁移到 Tailwind Utility，保留动画为传统 CSS。 | ✅ Completed |
| Clipper Dialog 迁移 | 将 `dialog.css` 中的布局和按钮迁移到 Tailwind Utility。 | ✅ Completed |
| Reader Panel 迁移 | 将 `reader-panel.css` 中的布局和组件迁移到 Tailwind Utility。 | ✅ Completed |

> 本计划提交后，Options 侧的 Tailwind 预检可视为完成，剪藏模块迁移将在单独的任务/PR 中推进。

> [!NOTE] Verification Logs
> Detailed verification logs for Stage 3 (Build & E2E) can be found in `docs/options-doc-refresh-log.md` under "Stage 3 Verification Logs (2025-11-23)".
