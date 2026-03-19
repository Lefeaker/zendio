# Options 样式验证自动化指南

> 目标：通过自动化检查避免重新引入旧命名或破坏 `aobx-*` 约束。

## 1. 基线能力（当前已有）

- `npm run report:options-legacy`：位于 `tools/options-css-legacy-report.mjs`，扫描 `src/options` 中是否出现 `.aob-*`、`options-aob.css` 等遗留痕迹。当前构建流程已依赖该脚本。
- 手动检查：`rg -n "aob-" src/options`、`rg -n ".aob-" src/options/styles/aob-options.css`。通常在发现异常时辅助定位。

> 以上手段只能在开发者自觉执行时奏效，因此需要补充更严格的 lint/hook/CI 托底。

---

## 2. 增强方案

### 2.1 Stylelint / ESLint
- 在根目录新增 `.stylelintrc.cjs`（若已存在则扩充），设置 `selector-class-pattern: "^aobx-[a-z0-9-]+$"`。
- 对于内联 className，可在 ESLint (或 `eslint-plugin-regexp`) 中添加规则，禁止字符串中出现 `.aob-`。
- 如需允许少数例外（例如外部库样式），用 ignore 列表注明原因。

### 2.2 Pre-commit Hook
- 使用 `husky` + `lint-staged` 或 `lefthook`，在 `pre-commit` 时运行：
  ```bash
  npm run lint
  npm run lint:options-css   # stylelint
  npm run report:options-legacy
  ```
- 这样就算开发者忘记手动执行，也无法提交含旧类的代码。

### 2.3 CI 阶段
- 在 `/.github/workflows/ci.yml` 或 GitLab CI 中添加 `options-style-validation` job：
  ```yaml
  - name: Validate Options styles
    run: |
      npm run lint:options-css
      npm run report:options-legacy
      npm run test:unit
  ```
- job 必须在主分支合并前通过。

### 2.4 覆盖率巡检（可选）
- 在浏览器 DevTools → Coverage 中检查 `aob-options.css`，找出未命中的组件样式；可配合 `npm run build:dev` 后在 Options 页面执行。
- 可定期（如每月）导出截图或报告，避免长时间存留死代码。

---

## 3. 落地步骤（建议顺序）

1. **Stylelint 配置**  
   - 新增 `npm run lint:options-css`：`"stylelint src/options/**/*.css"`。  
   - `.stylelintrc` 中加入 `selector-class-pattern`、禁止 `options-aob.css`。
2. **ESLint 更新**  
   - 如果 `eslint.config.js` 支持规则扩展，可使用 `regexp/no-super-linear-backtracking` 等插件限制 class 字符串。  
   - 在 `lint-staged` 中加入 `eslint` 任务。
3. **Hook/CI 配置**  
   - 在 `package.json` 中配置 `lint-staged` 或 `lefthook.yml`，确保提交前运行上述脚本。  
   - 同步更新 CI workflow，新增校验 job。
4. **文档同步**  
   - `agent.md`、`src/options/README.md` 中写明：  
     > “提交 Options 相关代码前必须运行 `npm run lint`, `npm run lint:options-css`, `npm run report:options-legacy`。”

---

## 4. 验收标准

- `npm run lint:options-css` 能检测不符合命名规范的类，并在本地/CI 中阻断提交。  
- `npm run report:options-legacy` 已纳入 pre-commit 与 CI，并成为必过项。  
- README/agent.md 明确记录上述命令，开发者在 PR 模板中需勾选“已运行样式验证脚本”。  
- 可选：定期（如每季度）导出 Coverage 报告，确保 `aob-options.css` 没有长时间未命中的规则。

---

如需后续引入 Tailwind，可在 `lint:options-css` 中额外允许 Tailwind 指令（例如 `@tailwind`, `@apply`），但 `.aobx-*` 命名限制仍需保留，直至完全迁移完成。***
