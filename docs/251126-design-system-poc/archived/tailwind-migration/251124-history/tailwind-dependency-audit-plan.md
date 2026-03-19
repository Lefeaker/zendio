# Tailwind 依赖拆解计划（跨 Options 之外模块）

## 背景
Options 与剪藏（Clipper）已完成 Stage 1~4，Tailwind 构建脚本与日志机制运行稳定。当前仓库内仍存在大量非 Options CSS 入口（见 `rg --files -g"*.css"` 输出中的 `src/styles/components.css`、`src/styles/clipper/*.css`、`src/styles/firefox.css` 等），并且内容脚本通过不同注入路径（`InlineStyleManager`、`SupportPrompt` runtime toast、Reader/Video 面板 iframe 等）消费这些样式。为避免直接迁移时破坏依赖，需要先完成一次系统性拆解。

## 目标
1. **列出 Options/Clipper 之外所有 CSS 入口与产物**，包括构建产出、运行时动态生成样式。
2. **梳理模块与样式的依赖关系**，明确每个模块使用的 token、构建脚本、注入方式及浏览器渠道差异。
3. **制定 Tailwind 接入顺序与约束**，在迁移前提供可执行的分阶段计划，并为后续 Stage 指南提供输入。

## 范围
- `src/styles/` 下的全局样式（`components.css`、`design-tokens.css`、`firefox.css`）。
- `src/styles/clipper/` 中仍保留的模块化 CSS（如 `comment-form.css`、`reader-panel.css`、`video-panel.css` 等）。
- 内容脚本 & Reader/Video/SupportPrompt/Highlight 模块内的内联样式或 `classList` 依赖。
- `scripts/build.mjs`、`scripts/package*.mjs` 等会复制 CSS 的构建脚本。

## 工作流要求

### 1. CSS 入口清单
1. 运行 `rg --files -g"*.css" | sort`，排除 `src/options/styles/`、`src/styles/clipper/clipper.tailwind.css`（已迁移）后的路径写入表格。
2. 对每个入口记录：
   - **文件路径**（如 `src/styles/components.css`）。
   - **消费端**（Options、Content Script、Reader iframe、Video 面板、第三方整合等）。
   - **引入方式**：静态 `<link>`、`InlineStyleManager` 注入、`import` 进 TS、`chrome.scripting.insertCSS` 等。
   - **依赖 token**：是否使用 `design-tokens.css`、自定义变量、硬编码颜色。
   - **构建/打包步骤**：是否由 `scripts/build.mjs`、`scripts/package*.mjs` 复制。
3. 输出 `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-dependency-matrix.md`（由开发完成），表格至少包含上述列。

### 2. 运行时注入点梳理
1. 搜索 `InlineStyleManager`、`insertCSS`、`style.textContent` 等关键词（`rg -n "InlineStyleManager" -n "insertCSS" src/content`）。
2. 对每个注入点说明：
   - 绑定的 DOM 范围（剪藏对话框、SupportPrompt toast、Reader Panel iframe 等）。
   - 是否已经使用 Tailwind 产物（例如剪藏已加载 `clipper.tailwind.css`，但 `SupportPrompt` 仍保留旧 `toast` 类）。
   - 在 Tailwind 迁移后是否可替换为 Utility 类或 `@apply`。
3. 以列表形式写入本文件“运行时注入清单”章节（由执行人补充）。

### 3. Token & Utility 复用检查
1. 对 `src/styles/design-tokens.css` 中的变量建立映射，确保 Tailwind `theme.extend` 已覆盖（参考 `tailwind.config.cjs`、`tailwind.config.clipper.cjs`）。
2. 若发现某模块依赖的 token 未在 Tailwind 配置中暴露，需登记：
   - 变量名及用途。
   - 期望的 Tailwind Utility 或 `@apply` 别名。
   - 影响模块。
3. 输出 `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-token-gap.md`（新文档）。

### 4. 构建脚本依赖
1. 检查 `scripts/build.mjs`、`scripts/package.mjs`、`scripts/package-trial.mjs` 等脚本，列出所有 `cp`/`rm`/`mkdir` 涉及的 CSS 目录。
2. 评估 Tailwind 迁移后这些脚本是否需要新增构建步骤或忽略逻辑（例如 Reader/Video 独立 Tailwind 产物）。
3. 在 `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-build-integration-notes.md` 中记录差异。

### 5. 迁移阶段建议

## 运行时注入清单

基于对项目代码的梳理，以下为所有 CSS 运行时注入点的完整清单：

### 1. Clipper Dialog（剪藏对话框）

- **模块**: `src/content/clipper/components/dialog.ts`
- **注入方式**: `InlineStyleManager` (L188)
- **DOM 范围**: 主文档 `<body>` 内的 `#obsidian-clipper-dialog`
- **当前 CSS 来源**: `clipper.tailwind.css`（Stage 3 已迁移）
- **Tailwind 兼容性**: ✅ 已完全使用 Tailwind utilities
- **相关 CSS 文件**: 
  - `src/styles/clipper/clipper.tailwind.css`（Tailwind 产物）
  - `src/styles/clipper/comment-form.css`（部分依赖，需评估是否可合并）
  - `src/styles/clipper/dialog.css`（传统样式，待审计）

### 2. Reader Panel（阅读模式面板）

- **模块**: `src/content/reader/session.ts`
- **注入方式**: `InlineStyleManager` (L119)
- **DOM 范围**: Reader iframe 内的 `#aiob-reader-root` 及其子元素
- **当前 CSS 来源**: Tailwind utilities（内联在 TS 代码中）
- **Tailwind 兼容性**: ✅ 已完全迁移，`reader-panel.css` 已废弃（仅保留注释代码作参考）
- **相关 CSS 文件**:
  - `src/styles/clipper/reader-panel.css`（已废弃，可删除）

### 3. Video Panel（视频剪藏面板）

- **模块**: `src/content/video/session.ts`
- **注入方式**: `InlineStyleManager` (L97)
- **DOM 范围**: Video iframe 内的面板容器
- **当前 CSS 来源**: `video-panel.css` + `video-prompt.css`（传统 CSS）
- **Tailwind 兼容性**: 🔴 需迁移
- **相关 CSS 文件**:
  - `src/styles/clipper/video-panel.css`（依赖 `design-tokens.css` 变量）
  - `src/styles/clipper/video-prompt.css`（依赖 `design-tokens.css` 变量）
- **迁移建议**: Stage 6 优先级，创建 `tailwind.config.video.cjs`

### 4. SupportPrompt（支持提示）

- **模块**: `src/content/ui/supportPrompt.ts`
- **注入方式**: `InlineStyleManager` (L229)
- **DOM 范围**: 主文档 `<body>` 内的 `#aiob-support-prompt` 和 `#aiob-support-toast`
- **当前 CSS 来源**: `support-prompt.css`（部分迁移）
- **Tailwind 兼容性**: 🟡 Toast 容器部分 Tailwind 化（基础样式使用 Tailwind classes），但子元素仍依赖传统 CSS；Prompt 完全未迁移
- **相关 CSS 文件**:
  - `src/styles/clipper/support-prompt.css`（L1-176: Prompt 样式；L187-246: Toast 子元素样式）
- **迁移建议**: Stage 5 优先完成 Prompt 完整迁移 + Toast 子元素 Tailwind 化

### 5. 其他潜在注入点（未发现实际使用）

- **`chrome.scripting.insertCSS`**: 在 `src/content/` 中未发现使用
- **静态 `<link>` 标签**: Options 页面使用，但不在本次范围内
- **`style.textContent` 直接赋值**: 未发现大规模使用（仅零星内联样式）

### 注入方式总结

| 方式 | 使用模块 | 优势 | Tailwind 适配 |
|-----|---------|------|--------------|
| `InlineStyleManager` | Dialog, Reader, Video, SupportPrompt | 跨 iframe 支持，样式隔离 | ✅ 直接传入 Tailwind 产物 |
| 内联 Tailwind classes | Reader（已迁移），Toast（容器部分迁移） | 无需额外 CSS 文件，性能优 | ✅ 原生支持 |
| 传统 CSS 文件 | Video, Prompt, Toast 子元素 | 兼容旧代码 | 🔴 需迁移或通过 `@apply` 过渡 |

### 迁移优先级（基于注入点）

1. **P0 - SupportPrompt Prompt 部分**（Stage 5）
   - 影响: 用户首次使用后的支持提示
   - 工作量: 低（仅需迁移 ~150 行 CSS）
   - 依赖: 需先完成 `components.css` Token 映射

2. **P1 - Video Panel**（Stage 6）
   - 影响: 视频剪藏功能
   - 工作量: 中（约 350 行 CSS + 新建 Tailwind 配置）
   - 依赖: 需 Token 统一方案确定

3. **P2 - Comment Form / Dialog 整合**（Stage 7）
   - 影响: Clipper 评论与对话框样式
   - 工作量: 中（评估是否可合并到现有 `clipper.tailwind.css`）
   - 依赖: 需审计 `dialog.css` 使用情况

### 5. 迁移阶段建议
1. 根据依赖矩阵与注入清单，建议新的 Stage 切分（例如 “Stage 5：Reader Panel Tailwind 化”，“Stage 6：SupportPrompt/Toast 重构”）。
2. 每个 Stage 必须包含：
   - 覆盖范围（模块/文件列表）。
   - 必须完成的验证命令（lint/test/e2e）。
   - 需要更新的文档（README、agent、PR 模板等）。
3. 将建议写入 `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-migration-guide.md` 的后续章节，并链接对应 Stage 文档（由执行人提交）。

## 验收标准
- 本文件中的每个章节都由执行人补充完成（至少“运行时注入清单”需给出条目）。
- `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-dependency-matrix.md`、`AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-token-gap.md`、`AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-build-integration-notes.md` 均创建并填入首轮数据。
- `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-migration-guide.md` 更新后，新增 Stage 与现有 Stage 形成连续流程，且 `docs/options-doc-refresh-log.md` 记录该计划的创建。

## 交付物
1. `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-dependency-matrix.md`（表格）。
2. `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-token-gap.md`（Token/Utility 缺口清单）。
3. `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-build-integration-notes.md`（构建脚本差异说明）。
4. 更新后的 `AllinOB/docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-migration-guide.md`（新增 Stage 章节）。
5. `docs/options-doc-refresh-log.md` 中新增日志条目，说明依赖拆解计划完成时间。

完成以上工作后，方可开始 Options 之外模块的 Tailwind 迁移开发。
