# AiiinOB Tailwind CSS 引入指南

本指南旨在指导如何在 `AiiinOB` 项目中引入 Tailwind CSS，同时保留现有的设计系统（Design Tokens）和构建流程。

## 1. 依赖与配置概览

项目已在根目录安装 `tailwindcss`、`postcss`、`autoprefixer`，对应配置为：

- `tailwind.config.cjs`：Options 专用配置，`content` 指向 `src/options/**/*` 与 `src/shared/**/*`，并将 `design-tokens.css` 中的 Token 映射到 Tailwind theme。
- `postcss.config.cjs`：统一声明 `{ tailwindcss: {}, autoprefixer: {} }`，供 esbuild/Vite/CLI 共用。
- `src/options/styles/tailwind.input.css`：Tailwind 入口（仅包含 `@tailwind base/components/utilities`）。

若需重新安装依赖，可执行：

```bash
npm install -D tailwindcss postcss autoprefixer
```

## 2. Tailwind 配置示例

`tailwind.config.cjs` 已由 `4-tailwind-config-prep-guide.md` 建立，结构如下：

```javascript
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
        sm: 'var(--aobx-radius-sm)',
        xs: 'var(--aobx-radius-sm)'
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

剪藏/内容脚本若需要单独构建，请参考 `docs/clipper-tailwind-migration-plan.md` 新增 `tailwind.config.clipper.cjs`。

## 3. 分阶段迁移与审核节点

Tailwind 迁移被拆分为四个阶段，每一阶段都配套独立指南与验收节点，位于 `docs/251126-design-system-poc/tailwind-css-migration/251122tailwind_css_migration/`：

| 阶段 | 指南 | 核心目标 | 审核节点 |
| --- | --- | --- | --- |
| Stage 1：Utility Layer | `archived/tailwind-migration/251122-completed/tailwind-stage1-utility-layer.md` | 在 Tailwind 中复刻 `.aobx-*` 的 token/utility，完成 `@apply` 骨架并提供 Demo。 | 提交 Stage 1 审核文档，附 `npm run tailwind:build` 产物 & Demo 截图。 |
| Stage 2：Options DOM 迁移 | `archived/tailwind-migration/251122-completed/tailwind-stage2-options-dom-migration.md` | 逐模块替换 Options DOM 中的局部样式，改用 Tailwind utility，并保持 `.aobx-*` 接口。 | 每完成一批 Section，更新 Stage 2 文档与 `options-doc-refresh-log.md`，由 Reviewer 验收。 |
| Stage 3：Clipper Rollout | `archived/tailwind-migration/251122-completed/tailwind-stage3-clipper-tailwind-rollout.md` | 根据 `docs/clipper-tailwind-migration-plan.md` 构建剪藏专用 Tailwind，并在 Content Script 中试点。 | Clipper PR 必须附 Stage 3 文档 checklist 与可复现步骤。 |
| Stage 4：Validation & Cleanup | `archived/tailwind-migration/251122-completed/tailwind-stage4-validation-and-cleanup.md` | 将 Tailwind 构建接入正式 build，删除冗余 CSS，复跑 lint/test 基线。 | ✅ **Completed** (2025-11-23) |
| **Stage 5：Global Components & SupportPrompt** | `../../archived/tailwind-migration/251126-closure/tailwind-stage5-global-components.md` | 统一 Token 命名（`--aobx-*`），迁移 `components.css` 为 Tailwind `@layer components`，完成 SupportPrompt Prompt/Toast 全量迁移。 | 提交 Token 命名方案、全局 Tailwind 配置、components 迁移前后对比。 |
| **Stage 6：Video Module Tailwind** | `../../archived/tailwind-migration/251126-closure/tailwind-stage6-video-module.md` | 新建 `tailwind.config.video.cjs`，迁移 `video-panel.css` 和 `video-prompt.css`，更新 Video 模块注入逻辑。 | Video 功能端到端测试通过，附构建产物体积报告。 |
| **Stage 7：Clipper Refinement** | `../../archived/tailwind-migration/251126-closure/tailwind-stage7-clipper-refinement.md` | 评估 `comment-form.css` 和 `dialog.css` 是否可合并到 `clipper.tailwind.css`，统一 Clipper 样式构建流程。 | Clipper 所有子模块共享单一 Tailwind 配置，减少冗余产物。 |

只有前一阶段通过审核，才能进入下一阶段。每个阶段的指南都包含「任务列表」「日志要求」「验收标准」，请严格对照执行。

## 4. 构建命令与产物

- Options Tailwind 产物通过 `npm run tailwind:build` 生成 `src/options/styles/tailwind.css`。
- `npm run tailwind:watch` 适合在 Watch 模式下调试 `@apply` 或 Utility。
- **已集成**：`scripts/build.mjs` 已自动串联 Tailwind 构建，生产构建会自动生成并包含 `tailwind.css`。

## 5. HTML 引用方式

过渡阶段无需在 `src/options/index.html` 中直接引入 `tailwind.css`。等 `.aobx-*` 与 Tailwind utility 并存时（Stage 2 后期），可按以下顺序添加：

```html
<link rel="stylesheet" href="../styles/design-tokens.css">
<link rel="stylesheet" href="./styles/aob-options.css">
<link rel="stylesheet" href="./styles/tailwind.css">
```

确保 `design-tokens.css` 先加载，以便 Tailwind utility 能读取 `var(--aobx-*)`。

## 6. 剪藏（Clipper）迁移

Options 与剪藏（Content Script）分阶段迁移。剪藏方案详见 `docs/clipper-tailwind-migration-plan.md` 及 Stage 3 文档，核心要点：

1. 新建 `tailwind.config.clipper.cjs`，`content` 限制在 `src/content/**/*` 与 `src/styles/clipper/**/*.css`。
2. Tailwind 产物命名为 `clipper.tailwind.css`，通过 `InlineStyleManager` 注入，不与 Options 共享。
3. SupportPrompt 等运行时样式保留旧类名，逐步以 `@apply` 替换。

## 7. 开发建议

### 渐进式迁移
你不需要一次性重写所有样式。
1.  **新功能**：直接使用 Tailwind 类名。例如：`<div class="bg-bg-elev-1 p-xl rounded-lg">...</div>`。
2.  **旧组件**：保留 `components.css`，在修改旧组件时顺手替换为 Tailwind 类名。

### 常用映射速查
基于你的 Design Tokens，Tailwind 类名映射如下：

*   `var(--bg-elev-1)` -> `bg-bg-elev-1`
*   `var(--text)` -> `text-text`
*   `var(--space-md)` -> `p-md`, `m-md`, `gap-md`
*   `var(--radius-lg)` -> `rounded-lg`

这样，你既享受了 Tailwind 的原子化优势，又保持了设计系统的一致性。
