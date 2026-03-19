# Options 样式基线校验指南（Tailwind 前）

> 目标：在开始 Tailwind 迁移之前，建立可对比的构建/Lint/Test 基线，确保后续变更有明确的回归检测手段。

## 1. 执行顺序与命令
在仓库根目录按顺序运行以下脚本，建议使用 `tmp/tailwind-baseline/` 作为输出目录，方便 Tailwind 迁移后做对比：

1. **依赖安装（首次执行）**
   ```bash
   npm install
   ```
2. **ESLint 基线**
   ```bash
   npm run lint | tee tmp/tailwind-baseline/eslint.log
   ```
   - `package.json` 中的 `lint` 会扫描 `src`、`tests` 下的 `.ts/.tsx/.js`。
   - 若命令返回 warning，需在日志中标注并创建 issue。
3. **Options CSS Stylelint**
   ```bash
   npm run lint:options-css | tee tmp/tailwind-baseline/stylelint.log
   ```
   - 对 `src/options/**/*.css` 套用 `.stylelintrc` 与 `stylelint` 规则。
4. **Legacy 类扫描**
   ```bash
   npm run report:options-legacy -- --json > tmp/tailwind-baseline/options-legacy.json
   ```
   - 脚本 `tools/options-css-legacy-report.mjs` 会遍历 `src/options`，忽略 preview HTML。
   - 若 stdout 仍打印 `.aob-*` 列表，视为阻断项，需在日志写明。
5. **Unit Test 基线**
   ```bash
   npm run test:unit | tee tmp/tailwind-baseline/vitest.log
   ```
   - `vitest.unit.config.ts` 会跑 Options 相关逻辑（YamlTable、Privacy、Reading section 等），必须全部通过。

## 2. 执行要求
- 在 `main` 最新提交或迁移分支（已 rebase）的 HEAD 上执行，并在日志中记录 commit hash。
- 所有命令 exit code 必须为 0；若出现 warning/flake，可参照 `docs/options-style-validation-guide.md` 模板创建 issue 并附链接。
- 使用 `tee` 或 `script` 保留输出；CI 场景需上传日志到 artifacts。

## 3. 结果存档
1. 将四个 log + `options-legacy.json` 保存在 `tmp/tailwind-baseline/`；若在 CI 执行，可将该目录打包上传。
2. 在 `docs/options-doc-refresh-log.md` 新增记录，说明：
   - 执行日期/责任人/commit hash
   - 各脚本状态（成功/存在 warning）
   - 日志保存路径或附件链接
   - 若 `options-legacy.json` 中仍存在 `.aob-*`，列出 token 与后续 owner
3. 如果发现问题，需在同目录或 `docs/options-style-validation-guide.md` 里追加 issue note，确保迁移前已排期。

## 4. 验收标准
- `lint`、`lint:options-css`、`report:options-legacy --json`、`test:unit` 全部成功且无未解释 warning。
- `tmp/tailwind-baseline/` 的输出可作为迁移后的回归对比；README/agent 中应指向本指南以便新人复现。
- `docs/options-doc-refresh-log.md` 有“Tailwind 迁移前样式基线校验完成”的记录，并注明日志存放位置。
