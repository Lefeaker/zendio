# Stage 3：剪藏 Tailwind Rollout

## 目标
- 为 Content Script/剪藏界面构建独立的 Tailwind 产物（`clipper.tailwind.css`），避免与 Options 互相污染。
- 在 SupportPrompt、Clipper Dialog、Reader Panel 等模块验证 Tailwind utility。

## 任务
1. **配置**
   - 复制 `tailwind.config.cjs` 为 `tailwind.config.clipper.cjs`，修改 `content` 为 `src/content/**/*.{ts,tsx,js,jsx,html}` 与 `src/styles/clipper/**/*.css`。
   - 创建 `src/styles/clipper/tailwind.input.css`，引入 `@tailwind base/components/utilities` 并逐步添加剪藏专用 `@layer components`。
2. **构建脚本**
   - 在 `package.json` scripts 添加：
     ```json
     "tailwind:build:clipper": "tailwindcss -c tailwind.config.clipper.cjs -i src/styles/clipper/tailwind.input.css -o src/styles/clipper/clipper.tailwind.css --minify"
     ```
   - 在 `scripts/build.mjs` 中，Dev 模式执行 `tailwind:build:clipper`，Prod 阶段待 Stage 4 接入。
3. **模块试点**
   - SupportPrompt：将 toast 的背景/动画 class 替换为 Tailwind utility，保证 `InlineStyleManager` 同时加载 `support-prompt.css` 与 `clipper.tailwind.css`。
   - Clipper Dialog：按钮、输入、小提示改用 Tailwind（`flex gap-3`, `rounded-md`, `text-sm` 等）。
   - Reader Panel/Video Panel：使用 Tailwind grid/spacing 重构布局，保留 `.clipper-reader__*` hook。
4. **兼容策略**
   - 在 DOM 中保留旧类，Tailwind utility 追加在 classList 后方；如果 Tailwind 构建失败，旧 CSS 仍能生效。
   - 记录需要 `@apply` 的复杂样式，并在 `support-prompt.css` / `reader-panel.css` 中保留 fallback。
5. **记录**
   - 每次试点完成后，在 `docs/clipper-tailwind-migration-plan.md` 的任务列表中标记完成。
   - 在本文件追加 Release 小节，描述覆盖模块、测试范围、日志位置。

## 验收
- `npm run tailwind:build:clipper` 成功，产物输出至 `src/styles/clipper/clipper.tailwind.css`（或忽略目录）。
- Content Script E2E（如 `tests/e2e/clipperFlow.test.ts`）通过。
- Reviewer 确认 `docs/options-doc-refresh-log.md` 已登记，且 PR 描述包含剪藏 Tailwind 影响说明。

## Release

### 覆盖模块
- **SupportPrompt**: Toast 通知样式已迁移。
- **Clipper Dialog**: 剪藏对话框布局、按钮、输入框已迁移。
- **Reader Panel**: 阅读模式面板布局、高亮列表、编辑操作已迁移。

### 测试范围
- **Build**: `npm run tailwind:build:clipper` 验证通过。
- **E2E**: `tests/e2e/clipperFlow.test.ts` 验证通过，覆盖了剪藏、阅读模式、高亮操作等核心流程。

### 日志位置
- 详细变更日志见 `docs/options-doc-refresh-log.md` (Stage 3 Section)。
- 迁移计划状态见 `docs/clipper-tailwind-migration-plan.md`。

## Release (Verified)

### 覆盖模块
- **SupportPrompt**: Toast 通知样式已迁移。
- **Clipper Dialog**: 剪藏对话框布局、按钮、输入框已迁移。
- **Reader Panel**: 阅读模式面板布局、高亮列表、编辑操作已迁移。

### 测试范围
- **Build**: `npm run build:fast` (Production Mode) 验证通过，成功生成 `clipper.tailwind.css`。
- **E2E**: `tests/e2e/clipperFlow.test.ts` 验证通过，覆盖了剪藏、阅读模式、高亮操作等核心流程。

### 日志位置
- 详细变更日志与命令输出见 `docs/options-doc-refresh-log.md` (Stage 3 Section)。
- 迁移计划状态见 `docs/clipper-tailwind-migration-plan.md`。

- **Video Panel**: 视频模式面板布局、捕获列表、编辑器已迁移。

## Verification Evidence
- **Build Integration**: Verified `npm run build:fast` executes `tailwind:build:clipper`.
- **E2E Tests**: Verified `clipperFlow.test.ts` and `optionsVaultRouterAutoSave.test.ts` pass.
- **Logs**: See `docs/options-doc-refresh-log.md`.

## Verification Status
- **Clipper E2E**: `tests/e2e/clipperFlow.test.ts` ✅ PASSED.
- **Build**: `npm run build:fast` ✅ PASSED.
- **Known Issue**: `optionsNavigationLazyLoad.test.ts` fails in full suite (unrelated to Clipper).

## Verification Status
- **Full E2E Suite**: `npm run test:e2e` ✅ PASSED (15/15 files).
- **Clipper E2E**: `tests/e2e/clipperFlow.test.ts` ✅ PASSED.
- **Build**: `npm run build:fast` ✅ PASSED.
- **Note**: `optionsNavigationLazyLoad.test.ts` fixed by mocking `UsageSection` to isolate navigation logic from environment-dependent SVG rendering.

## Verification Status
- **Full E2E Suite**: `npm run test:e2e` ✅ PASSED (15/15 files).
- **Clipper E2E**: `tests/e2e/clipperFlow.test.ts` ✅ PASSED.
- **Tongyi E2E**: `tests/e2e/tongyiAiChatFlow.test.ts` ✅ PASSED (Fixed EPIPE flakiness).
- **Build**: `npm run build:fast` ✅ PASSED.

## Verification Status
- **Full E2E Suite**: `npm run test:e2e` ✅ PASSED (15/15 files).
- **Clipper E2E**: `tests/e2e/clipperFlow.test.ts` ✅ PASSED.
- **Tongyi E2E**: `tests/e2e/tongyiAiChatFlow.test.ts` ✅ PASSED (Fixed EPIPE by removing excessive logging).
- **Build**: `npm run build:fast` ✅ PASSED.
