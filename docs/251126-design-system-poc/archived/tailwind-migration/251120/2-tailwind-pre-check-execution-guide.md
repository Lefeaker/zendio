# Tailwind 迁移前检查执行指南

> 目标：在正式引入 Tailwind CSS 前，逐条确认 `docs/tailwind-pre-migration-check.md` 的检查项，确保 Options 模块的样式资产处于可迁移状态。

## 1. 准备资料
- 阅读 `docs/tailwind-pre-migration-check.md`，熟悉四大板块（动态类清点、预览一致性、样式依赖、脚本能力）。
- 同步参考 `docs/options-style-refinement-guide.md`、`docs/options-style-refinement-followup-guide.md`，了解近期清理成果。

## 2. 执行步骤
1. **动态类/内联样式排查**
   - 运行 `rg -n "classList.add" src/options/components`，确认 Section/Layout/FormSection 中是否仍有运行时拼接的 `.aobx-*`；必要时列在检查表中。
   - 对预览与测试（`src/options/aob-option-preview.html`、`src/options/obsidian-hybrid-preview.html`、`tests/unit/options/**/*`、`tests/visual/*`）做同样检查，确保预览、单测与实际 DOM 命名保持一致。
   - 若发现 `.card`、`.hint` 等非 `.aobx-*` 的新类名，需记录来源（例如 `src/styles/components.css`、`src/styles/clipper/*.css`）并确认是否需要在 Tailwind 中保留。
2. **预览一致性**
   - 打开 `src/options/aob-option-preview.html` 与实际 Options 页面，对照 `aob-options.css` 的全局变量和 Utility 引用，确保没有仅在预览中存在的样式。
3. **样式依赖盘点**
   - 使用 `rg "@import" src/options/styles`、`rg "@import" src/styles/components.css`、`rg "@import" src/styles/clipper -g"*.css"` 检查所有样式入口；若有新文件（如内容脚本/Clipper 样式）需要 Tailwind 覆盖，请记录。
   - 运行 `rg "var(--aobx" -n src/options/styles src/styles/components.css`，确认 Options 与全局组件都从 `design-tokens.css` 取值；若缺口需要补充 Token。
   - cross-check `src/options/README.md` 与 `src/options/components/README.md` 的「常用 Utility」表格，核对是否需要新增条目并同步到 Tailwind config。
4. **脚本/工具链能力确认**
   - 检查 `package.json` 中是否存在 Tailwind 所需的构建脚本占位（如 `tailwind:build`、`tailwind:watch`）；若无，提前记录需要新增。
   - 确认 `postcss.config` / 构建脚本（`scripts/build.mjs`、`scripts/package*.mjs`）在复制 `src/styles/clipper`、`src/styles/components.css` 时不会与 Tailwind 输出冲突，并在检查表注明需要的修改。

## 3. 产出物
- 更新 `docs/tailwind-pre-migration-check.md`：逐条勾选，并在「备注」中填入执行者、日期、发现的问题。
- 若存在无法立即解决的项，在 `docs/options-doc-refresh-log.md` 中登记，确保迁移期间可追溯。

## 4. 验收
- 所有 Checklist 均打勾并附日期；
- 相关日志/README 已更新；
- 若有遗留问题，提供后续计划链接（如新的 guide 文档）。
