# 概述

- 请简要说明本次改动的动机、范围与影响。

# 验证

- [ ] `npm run quality`
- [ ] `npm run verify:preflight`
- [ ] 相关单元 / e2e / visual / i18n 测试已按改动范围执行
- [ ] 其他：`__________________________________________________`

# Options 模块 Checklist（涉及 Options 开发时必须勾选）

- [ ] 涉及 Options/Stitch/runtime UI 时已运行 `npm run verify:stitch-secondary`
- [ ] 涉及 build / manifest / release chain 时已运行 `npm run build` 与 `npm run build:firefox`
- [ ] 已更新或验证无需更新 `src/options/README.md`、`src/options/components/README.md` 与相关 source-of-truth 文档
- [ ] 未恢复 Options Tailwind、Clipper/Video Tailwind bridge、DaisyUI 迁移流程或旧 preview runtime
- [ ] Tailwind / DaisyUI 仅作为历史迁移材料出现；若要恢复为生产路径，必须同步更新 source-of-truth 文档并说明原因

# 备注

- 额外说明、截图或链接（可选）。
