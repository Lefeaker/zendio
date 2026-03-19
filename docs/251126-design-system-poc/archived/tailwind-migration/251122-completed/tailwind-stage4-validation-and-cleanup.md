# Stage 4：最终验证与清理

## 目标
- 将 Tailwind 构建纳入正式 `npm run build`，删除冗余 CSS，重建 lint/test 基线。
- 确认 `.aobx-*` 与 Tailwind utility 并存无冲突，完成文档与日志更新。

## 任务
1. **构建集成**
   - 在 `scripts/build.mjs` 的生产构建流程中调用 `tailwind:build`、`tailwind:build:clipper`，并将生成的 CSS 拷贝至 `build/dist/styles/`。
   - 确保 Firefox/Trial 打包脚本同样包含 tailwind 产物，避免渠道差异。
2. **冗余清理**
   - 查找 `aob-options.css` 中已迁移的 block，删除 `/* Legacy */` 注释与 `.aobx-*` 兼容层。
   - 使用 `rg -n "aob-" src/options` 验证无旧类名残留；若仍需 fallback，请在 README 中说明原因。
3. **基线重建**
   - 执行下列命令并将输出存入 `tmp/tailwind-stage4/`：
     ```bash
     npm run lint --max-warnings=0
     npm run lint:options-css
   npm run report:options-legacy -- --json
   npm run test:unit
   npm run tailwind:build && npm run tailwind:build:clipper
   ```
   - 若 tailwind 构建输出不打算提交，请同时附 `git status` 截图，证明工作区干净。
4. **文档与发布**
   - 备注 Options README、agent、PR 模板均指向 Tailwind 新流程。
   - 在 `docs/tailwind-migration-guide.md`、Stage4 文档、`docs/options-doc-refresh-log.md` 中记录完成时间、责任人。

## 验收
- Reviewer 查看 `tmp/tailwind-baseline/` 日志，确认所有命令无告警。
- `git status` 无残留 Tailwind 产物、旧 CSS。
- PR 描述引用 Stage 4 文档并附最终发布说明。

## 状态/结果

### 2025-11-24 Stage 4 验证完成

- **Lint 基线**: `npm run lint -- --max-warnings=0` 通过，无告警。日志位于 `tmp/tailwind-stage4/lint.log`。
- **工作区状态**:
    - 已清理临时备份文件 (`src/options/styles/aob-options.css.batch6-backup`)。
    - Tailwind 构建产物 (`src/options/styles/tailwind.css`, `src/styles/clipper/clipper.tailwind.css`) 已加入 `.gitignore` 并验证生效。
    - `git status` 日志 (`tmp/tailwind-stage4/git-status.log`) 中显示的 `src/options/styles/` 等目录的 untracked 状态系环境基线问题（现有源码未被 git 索引），非本次迁移残留产物。
- **测试验证**: 单元测试与 E2E 测试均通过。
