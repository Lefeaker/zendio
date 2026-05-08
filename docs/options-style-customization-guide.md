# Options 样式自定义指南

## 当前真值

Options 页面当前只使用 Stitch 样式链路：

- 页面入口：`src/options/index.ts -> src/options/app/bootstrap.ts`
- 生产 shell：`src/options/app/productionStitchShell.ts`
- 样式入口：`src/options/stitch/styles/stitch.css`
- 次级主题变体：`src/options/stitch/styles/variants/stitch-secondary.css`
- token 真值源：`src/styles/design-tokens.css`

旧 Options Tailwind / `.aobx-*` 样式链路已经退出正式构建：

- `src/options/styles/*` 已删除
- `src/options/bootstrap.ts` 已删除
- `tailwind.config.cjs` 已删除
- `npm run tailwind:build` / `npm run tailwind:watch` 已删除
- `build/dist/options/styles/*` 不应再出现

## 推荐修改位置

### 1. 调整设计令牌

优先修改 `src/styles/design-tokens.css`。适用于跨 Options、content runtime 与共享 UI 的颜色、间距、字体、圆角等基础 token。

修改后运行：

```bash
npm run build:dev
npm run audit:options-mainline:report
npm run lint:options-css
```

### 2. 调整 Options Stitch 样式

仅当 token 无法表达局部布局或组件状态时，修改：

```text
src/options/stitch/styles/stitch.css
src/options/stitch/styles/variants/stitch-secondary.css
```

不要新增 `src/options/styles/*`、`aob-options.css`、Options 专用 Tailwind 配置或新的平行样式入口。

### 3. 调整 Options 结构或组件

Options 页面结构应沿当前 Stitch 主链修改：

```text
src/options/app/*
src/options/components/*
src/options/stitch/*
```

如果改动影响 runtime preview、secondary theme 或视觉布局，需要同步运行对应视觉检查。

## 验证清单

Options 样式相关改动至少运行：

```bash
npm run typecheck:app
npm run lint -- --quiet
npm run build:dev
npm run audit:options-mainline:report
npm run report:options-legacy
npm run lint:options-css
```

涉及 Stitch 视觉或 preview 时追加：

```bash
npm run verify:stitch-secondary
npm run visual:stitch
```

构建后应确认 Options 产物只有 Stitch 样式：

```bash
test ! -d build/dist/options/styles
find build/dist/options -maxdepth 4 -type f | sort
```

期望输出中应包含：

```text
build/dist/options/stitch/styles/stitch.css
build/dist/options/stitch/styles/variants/stitch-secondary.css
```

不应包含：

```text
build/dist/options/styles/tailwind.css
build/dist/options/styles/aob-options.css
```
