# Tailwind 配置准备指南（Options 模块）

> 目标：在正式引入 Tailwind CSS 之前完成配置与结构铺垫，确保迁移时无需大规模重构构建脚本。

## 1. 规划内容
- Tailwind 配置文件：`tailwind.config.cjs`
- PostCSS：`postcss.config.cjs`（含 `tailwindcss`、`autoprefixer`）
- CSS 入口：`src/options/styles/tailwind.input.css`（包含 `@tailwind base/components/utilities`）
- Token 对应：`src/options/styles/design-tokens.css`
- 构建脚本：`package.json` 中的 `tailwind:build` / `tailwind:watch`

## 2. 操作步骤
1. **配置骨架**
   - `tailwind.config.cjs`（已存在）已经限定内容在 Options 目录与共享模块中，并把设计 Token 映射到 Tailwind：
     ```ts
     const path = require('node:path');

     module.exports = {
       content: [
         path.join(__dirname, 'src/options/**/*.{ts,tsx,js,jsx,html}'),
         path.join(__dirname, 'src/options/**/*.css'),
         path.join(__dirname, 'src/shared/**/*.{ts,tsx,js,jsx}')
       ],
       theme: {
         extend: {
           fontFamily: { ui: 'var(--aobx-font-ui)' },
           colors: {
             accent: 'var(--aobx-accent)',
             'accent-soft': 'var(--aobx-accent-soft)',
             surface: 'var(--aobx-surface-0)',
             text: 'var(--aobx-text)'
           },
           borderRadius: {
             lg: 'var(--aobx-radius-lg)',
             md: 'var(--aobx-radius-md)',
             sm: 'var(--aobx-radius-sm)'
           },
           spacing: {
             1: 'var(--aobx-space-1)',
             2: 'var(--aobx-space-2)',
             3: 'var(--aobx-space-3)',
             4: 'var(--aobx-space-4)',
             5: 'var(--aobx-space-5)',
             6: 'var(--aobx-space-6)'
           }
         }
       },
       plugins: []
     };
     ```
   - 若后续需要剪藏专用配置，请依照 `docs/clipper-tailwind-migration-plan.md` 新建 `tailwind.config.clipper.cjs` 与 `src/styles/clipper/tailwind.input.css`。
2. **串接构建工具**
   - `postcss.config.cjs` 已启用 `{ tailwindcss: {}, autoprefixer: {} }`，任何 bundler（esbuild/Vite）都应指向该文件，避免多份配置。
   - `package.json` 中提供 `tailwind:build` / `tailwind:watch`：
     ```bash
     npm run tailwind:build   # tailwindcss -c tailwind.config.cjs -i src/options/styles/tailwind.input.css -o src/options/styles/tailwind.css --minify
     npm run tailwind:watch   # watch 模式，供本地开发使用
     ```
   - 当前未强制在 `scripts/build.mjs` 中自动执行 Tailwind；在 Options DOM 真正引用 Tailwind utility 前，可先手动运行 `tailwind:build` 并检查产物。
3. **保留 `.aobx-*` 接口**
   - `src/options/styles/tailwind.input.css` 仅包含 `@tailwind base/components/utilities`；真正的 DOM 类仍是 `.aobx-*`，确保旧版 CSS 与 Tailwind utility 共存。
   - 迁移过程中，可在 `aob-options.css` 里使用 `@layer components { .aobx-card { @apply ... } }` 映射到 Tailwind utility，但严禁删除 `.aobx-*` 前缀或直接把 DOM 改成 `class="rounded-lg shadow"`。
4. **Demo 验证**
   - 运行 `npm run tailwind:build`，确认会生成 `src/options/styles/tailwind.css`（不应提交到仓库，可加入 `.gitignore` 或在 PR 前清理）。
   - 若需要 dry-run，可改用 `npx tailwindcss -c tailwind.config.cjs -i src/options/styles/tailwind.input.css -o tmp/tailwind-dry-run.css` 并在本地校验 `.aobx-*` 映射效果；验证通过后删除临时文件。

## 3. 文档与记录
- 在本目录指南执行完毕后，更新 `docs/tailwind-migration-guide.md` 的「准备阶段」章节，记录配置文件位置、指令与剪藏子计划。
- 在 `docs/options-doc-refresh-log.md` 添加记录，注明“Tailwind 配置骨架已建立”。

## 4. 验收标准
- 仓库存在可用的 `tailwind.config.*`；
- `package.json`/PostCSS/Vite 均能识别 Tailwind；
- `.aobx-*` Utility 仍为 Options DOM 的唯一依赖，后续迁移可逐步移植。
