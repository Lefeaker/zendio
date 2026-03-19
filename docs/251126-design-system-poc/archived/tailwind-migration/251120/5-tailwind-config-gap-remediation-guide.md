# Tailwind 配置 Gap 修复指南（251120 后续）

> 目的：补齐 251120 任务执行后的遗留项，确保 Tailwind 配置骨架与 Options 基线验证真正落地，避免 stylelint/Lint 基线被生成文件污染。

## 1. 背景
- 当前仓库中存在 `src/options/styles/tailwind.css`（`npm run tailwind:build` 的产物），该文件被纳入版本控制并被 stylelint 扫描，导致 `npm run lint:options-css` 恒定失败（规则：Options CSS 禁止使用 `.aob-*` 之外的类）。
- `docs/251126-design-system-poc/tailwind-css-migration/251120/4-tailwind-config-prep-guide.md` 明确要求 Tailwind 产物只做本地验证而不要留在仓库，并在必要时加入 `.gitignore` 或 PR 前清理；因此需尽快移除该文件并重新建立基线日志。

## 2. 待完成工作
1. **移除 Tailwind 产物并更新忽略规则**
   - 删除 `src/options/styles/tailwind.css`，确保工作区不再包含该文件。
   - 在 `.gitignore` 中新增 `src/options/styles/tailwind.css`（或使用更通用的 `src/options/styles/*.tailwind.css` 规则），防止未来再次被提交。
   - 如果需要在仓库内保留 Tailwind 生成物供演示，请将输出路径改为 `tmp/` 或其它被忽略的目录，并同步更新 `package.json` 的 `tailwind:build` / `tailwind:watch`。

2. **恢复 stylelint 与 Options 基线**
   - 在仓库根目录依次执行：
     ```bash
     npm run lint --max-warnings=0
     npm run lint:options-css | tee tmp/tailwind-baseline/stylelint.log
     npm run report:options-legacy -- --json > tmp/tailwind-baseline/options-legacy.json
     npm run test:unit | tee tmp/tailwind-baseline/vitest.log
     ```
   - 确认 `npm run lint:options-css` 输出中不再含有 `.aob-*` 前缀相关告警。
   - 若 `tailwind.css` 被迁移到新的输出目录，确保上述命令不会扫描到新目录（必要时在 `.stylelintrc.cjs` 中增加 `ignoreFiles`）。

3. **更新文档与记录**
   - 在 `docs/options-doc-refresh-log.md` 中追加条目，说明：
     - 执行日期、责任人、commit hash；
     - 四个基线命令状态；
     - `tmp/tailwind-baseline/` 下日志的保存路径；
     - 已将 `tailwind.css` 标记为忽略文件，并重新确认 `docs/251126-design-system-poc/tailwind-css-migration/251120/4-...` 的指引。
   - 如 `package.json`、`.gitignore`、`docs/251126-design-system-poc/tailwind-css-migration/251120/4-tailwind-config-prep-guide.md` 做了文字调整，请在 PR 描述中点名影响范围。

## 3. 验收标准
- `git status` 不再显示 `src/options/styles/tailwind.css` 或类似 Tailwind 产物的变更；
- `.gitignore`（或等效配置）阻止 Tailwind 输出进入版本控制；
- `npm run lint:options-css`、`npm run report:options-legacy -- --json`、`npm run test:unit` 全部通过，并保留新的基线日志；
- `docs/options-doc-refresh-log.md` 记录了上述操作，Reviewer 可以据此确认 gap 已完成。
