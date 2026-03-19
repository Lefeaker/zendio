# Stage 1：Tailwind Utility Layer（Options）

## 目标
- 复刻 `.aobx-*` token/utility，确保 Tailwind 能直接复用设计变量。
- 演示如何在 `@layer components` 中定义 `.aobx-card` 等组件，生成 Demo 截图供 Reviewer 审核。

## 任务清单
1. **Token 映射**
   - 对照 `src/options/styles/design-tokens.css`，确认 `tailwind.config.cjs` 的 `theme.extend` 已包含 `fontFamily.ui`、`colors.accent/surface/text`、`spacing 1-6`、`borderRadius lg/md/sm` 等条目。
   - 若缺失 Token（例如 `--aobx-space-8`、`--aobx-status-*`），在 Tailwind 主题中补齐，并注明来源行号。
2. **输入文件**
   - 在 `src/options/styles/tailwind.input.css` 中添加：
     ```css
     @layer components {
       .aobx-card {
         @apply rounded-lg border border-[color:var(--aobx-border)] bg-[color:var(--aobx-surface-0)] p-4;
       }
       .aobx-btn--primary {
         @apply rounded-md bg-[color:var(--aobx-accent)] px-3 py-2 font-semibold text-white;
       }
     }
     ```
   - 可逐步添加更多 `.aobx-*` 组件，但所有颜色/尺寸必须使用 `var(--aobx-*)`。
3. **Demo 页面**
   - 在 `tmp/tailwind-stage1-demo.html` 中引用 `design-tokens.css`、`aob-options.css`、`tailwind.css`，展示至少 2 个组件（卡片、按钮）。
   - 截图保存到 PR 附件或 `docs/251126-design-system-poc/tailwind-css-migration/251122tailwind_css_migration/assets/`。
4. **构建验证**
   - 执行 `npm run tailwind:build`，检查输出未报错并生成 `src/options/styles/tailwind.css`。
   - 如需 diff，可运行 `git status src/options/styles/tailwind.css` 并在 PR 中说明该文件仅为验证产物。
5. **文档更新**
   - 在 `docs/options-doc-refresh-log.md` 中记录执行日期、命令日志（`tmp/tailwind-baseline/tailwind-stage1.log` 等）。
   - 在本文件或 `tailwind-migration-guide.md` 的 Stage1 section 写明完成状态与 Demo 链接。


## 验收
- Reviewer 需要看到 Demo 截图、`tailwind.config.cjs` diff、`tailwind.css` 产物（无需提交，可截图）。
- `npm run lint`、`npm run tailwind:build` 均通过。

## 状态
- [x] 已完成 (2025-11-22)
- Demo: `tmp/tailwind-stage1-demo.html`

