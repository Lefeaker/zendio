# Options 样式验证自动化指南

> 目标：防止旧 Options Tailwind / `.aobx-*` 样式链路重新进入正式构建。

## 当前验证口径

Options 当前以 Stitch 为正式样式链路。验证重点不是继续维护 `.aobx-*` 约束，而是确认旧链路没有被恢复：

- 不存在 `src/options/styles/*`
- 不存在 Options 专用 `tailwind.config.cjs`
- `package.json` 不包含 `tailwind:build` / `tailwind:watch`
- `scripts/build.mjs` 不执行 Options Tailwind 构建，也不复制 `build/dist/options/styles`
- Stitch CSS 只输出 `build/dist/ui/stitch-runtime/styles/` 下的六个展平 pack；secondary variant 不单独输出

## 必跑检查

```bash
npm run report:options-legacy
node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css" "src/onboarding/**/*.css" "src/ui/**/*.css"
npm run audit:options-mainline:report
npm run audit:ui-architecture:report
npm run build:dev
```

构建产物检查：

```bash
test ! -d build/dist/options/styles
find build/dist/options -maxdepth 4 -type f | sort
find build/dist/ui/stitch-runtime/styles -maxdepth 1 -type f | sort
```

期望只看到：

```text
build/dist/options/index.html
build/dist/options/index.js
build/dist/options/index.js.map
build/dist/ui/stitch-runtime/styles/options.css
build/dist/ui/stitch-runtime/styles/onboarding.css
build/dist/ui/stitch-runtime/styles/clipper.css
build/dist/ui/stitch-runtime/styles/reader.css
build/dist/ui/stitch-runtime/styles/video.css
build/dist/ui/stitch-runtime/styles/prompt-task.css
```

## Pre-commit / CI

Options 相关代码提交前应通过当前仓库 pre-commit 链路：

```bash
node scripts/run-bounded-command.mjs --profile lint-staged-hook-v1
```

其中 `report:options-legacy` 必须继续保留，用于阻断旧 `.aob-*` / `.aobx-*` 样式入口回流。CI 或合并前验证应继续覆盖：

```bash
npm run verify:preflight
npm run visual:stitch
```

## 禁止恢复的路径

以下内容只允许出现在历史归档或迁移记录中，不应重新出现在生产入口：

- `src/options/styles/aob-options.css`
- `src/options/styles/tailwind.input.css`
- `src/options/styles/tailwind.css`
- `tailwind.config.cjs`
- `npm run tailwind:build`
- `src/options/bootstrap.ts`

如果确需研究旧实现，应从 `docs/archive`、`reference-fixtures` 或 Git 历史追溯，不要在正式源码树中恢复兼容副本。
