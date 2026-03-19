# Options 文档同步指南（Tailwind 迁移前）

> 目标：确保 Options 相关文档（README、agent、PR 模板等）已经将“使用 `.aobx-*` + Tailwind 迁移计划”作为唯一信息源，避免开发阶段引用旧资料。

## 1. 涉及文件
- `src/options/README.md`、`src/options/components/README.md`（快速上手、组件/Utility 列表）
- `AiiinOB/agent.md`（协作提示）
- `.github/PULL_REQUEST_TEMPLATE.md` 或等效文件
- `docs/options-doc-refresh-log.md`、`docs/options-pre-251120-checklist-report-*.md`

## 2. 操作步骤
1. **审查内容**
   - 对照 `docs/options-style-refinement-plan.md`、`tailwind-migration-guide.md`、`docs/options-pre-251120-checklist.md`，确认 README/agent 中引用的命令与入口是否最新。
   - 在 agent.md 与 README 中明确“Tailwind 任务前需完成 `docs/options-pre-251120-checklist.md` 并阅读 `docs/251126-design-system-poc/tailwind-css-migration/251120/1-4`”。
2. **同步修改**
   - README & components README：加入“Tailwind 迁移进行中”提示、执行命令列表、常见问题链接，确保 `.aobx-*` 约束与通用 Utility 描述一致。
   - Agent：强调变更 Options/Clipper 样式需先跑 `npm run lint:options-css`、`npm run report:options-legacy` 并附 `tmp/tailwind-baseline/` 日志。
   - PR 模板：新增复选框（如“已完成 options-pre-251120-checklist”、“已遵循 docs/251120 指南”），供 Reviewer 快速确认。
3. **记录刷新日志**
   - 在 `docs/options-doc-refresh-log.md` 中追加条目，描述更新范围、责任人、日期，并链接 `docs/options-pre-251120-checklist-report-*.md`。

## 3. 验收标准
- README 与 agent 的“样式规范/流程”章节引用的是最新命令与 guide；
- PR 模板出现新的 Checklist 项，Reviewer 可据此确认前置工作；
- `options-doc-refresh-log.md` 有对应记录。
