# 概述
- 请简要说明本次改动的动机、范围与影响。

# 验证
- [ ] `npm run lint`
- [ ] `npm run lint:warnings-guard`（PR 描述需引用 `tmp/lint-warnings.latest.json` 中的 `totalWarnings`/主要规则差异）
- [ ] `npm run test:unit` / 相关测试
- [ ] 其他：`__________________________________________________`

# Options 模块 Checklist（涉及 Options 开发时必须勾选）
- [ ] 已运行 `npm run lint:options-css`
- [ ] 已运行 `npm run report:options-legacy`
- [ ] 已完成 `docs/options-pre-251120-checklist.md`，并在 PR 描述中附 `tmp/tailwind-baseline/*.log`（eslint/stylelint/options-legacy/vitest）
- [ ] 已更新或验证无需更新 `src/options/README.md` / 相关指南，并在需要时同步 `docs/options-doc-refresh-log.md`
- [ ] PR 描述中写明 Tailwind 迁移或暗色模式等依赖是否受影响

# 备注
- 额外说明、截图或链接（可选）。
