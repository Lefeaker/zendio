# 统一执行手册最终验收报告

日期：2026-03-20
对应执行手册：`docs/archive/execution-baselines/组件统一、技术债与性能优化统一执行手册-2026-03-19.md`

> 备注（2026-03-29）：原执行手册现已降级为历史执行基线；当前工程真值入口以 `docs/README.md`、本文与 `docs/long-term-maintenance-backlog-2026-03-20.md` 为准。

## 1. 已关闭主项

### 组件统一

- `DaisyUIHelpers.ts` 已从正式代码和测试主路径移除，旧 helper 退役现在由 `audit:components:report` 直接守门。
- `Options` / `content` 的共享入口已收敛到 `DaisyButton`、`DaisyInput`、`DaisySelect`、`DaisyCheckbox`、`DaisyTextarea`、`ContentDaisyButton`、`ContentDaisyDialog`、`ContentLayout`、`ContentDialogFooter`。
- `M4.3` 交互约定已成为代码事实：
  - shared button 统一 destructive / loading 语义
  - input/select/checkbox 统一 error validation state 与 `aria-invalid`
  - `ContentDaisyDialog` 统一输出 `role="dialog"`、`aria-modal`、`aria-labelledby`、`data-element=header/body/footer`

### 结构与技术债

- `bootstrap.ts`、`reader/session.ts`、`video/session.ts`、`clipper/components/dialog.ts` 已拆到可维护粒度。
- `src/content/video/platforms/bilibiliPlatform.ts` 已把富文本解析拆到 `bilibiliRichText.ts`。
- `src/third_party/ai-chat-exporter/shared/markdown.ts` 已把语言标签与表格/列表规则拆到 `markdownLanguage.ts` / `markdownTableList.ts`。
- 当前两个剩余大文件已从 868 / 887 行降到 620 / 411 行，不再构成本轮主阻塞。
- legacy `src/content/reader/ui/panel.ts` 与 `src/content/video/ui/panel.ts` 已退役删除，Reader / Video 主路径现固定走 `ReaderDialogPanel` / `VideoDialogPanel`。

### 工程入口与历史噪音

- 新增正式入口：
  - `docs/README.md`
  - `docs/engineering-entrypoints.md`
  - `docs/archive/README.md`
  - `docs/reference-fixtures/README.md`
- 旧状态报告已移入 `docs/archive/status-2026-03-20/`。
- 页面/解析样本已移入 `docs/reference-fixtures/`。
- 失效脚本入口 `check:migration` / `check:unmigrated` / `fix:p2-2` / `verify:p2-2` 已删除。
- Firefox browser-interaction 脚本已改为自包含入口：缺少 Playwright Firefox 时会自动安装后再执行回归。

### 新站点与分包收口

- `Perplexity` 现已具备正式 AI chat 提取、路由与路径解析覆盖。
- AI chat parser 运行时已改为按平台懒加载；`aiChatExtractor` 主 chunk 已降到约 `8.1 KB`，各平台 parser 现以独立 chunk 形式产出。

## 2. 自动化验收结果

本轮已实际通过：

- `npm run typecheck:app`
- `npm run typecheck:tests`
- `npm run typecheck:strict -- --pretty false`
- `npm run lint -- --quiet`
- `npm run audit:components:report`
- `npm run audit:interaction-contract:report`
- `npm run audit:platform-services:report`
- `npm run audit:imports:report`
- `npm run audit:design-tokens:report`
- `npm run audit:design-system-doc:report`
- `npm run audit:repository-composition:report`
- `npm run audit:locales:report`
- `npm run audit:performance:report`
- `npm run audit:build:report`
- `npm run build:dev`
- `npm run build:firefox:dev`
- `npm run test:unit`
- `npx vitest run tests/firefox/firefox.test.ts tests/unit/platform/firefox/action.test.ts tests/unit/platform/firefox/contextMenus.test.ts tests/unit/platform/firefox/storage.test.ts tests/unit/platform/firefox/tabs.test.ts tests/unit/platform/firefox/utils.test.ts`
- `npm run test:e2e`
- `npm run test:e2e:browser`
- `npm run test:e2e:browser:firefox`
- `npm run test:i18n`
- `npm run test:coverage`

当前 coverage 总结：

- Statements: `85.25%`
- Branches: `75.02%`
- Functions: `80.13%`
- Lines: `85.25%`

## 3. MCP / 浏览器手测结果

本轮最终抽样复跑：

- `http://localhost:4173/options/index.html`
  - section 导航、theme switch、YAML / Templates / Deep Research / Classifier 可正常交互
- `http://localhost:4173/interaction-contract-harness.html`
  - danger/loading 按钮具备 `aria-busy` / `aria-disabled`
  - error input/select/checkbox 具备 `aria-invalid`
  - `ContentDaisyDialog` 具备 `role="dialog"`、`aria-modal`、`aria-labelledby` 与 `data-element=header/body/footer`
- `http://localhost:4180/content-orchestrator-harness.html`
  - `build/dist/content-orchestrator-harness.html` 与 `.js` 已真实产出，`curl -I` 返回 `200 OK`
  - MCP reload 后页面状态为 `Harness ready`，console 为空
  - `Open Clipper Dialog` 可拉起 `Clip Selection`；`window.harness.startReaderSession()` 与 `startVideoSession()` 可把状态推进到 `VideoSession mounted and one capture added`
- `http://localhost:4180/runtime-observability-harness.html`
  - `build/dist/runtime-observability-harness.html` 与 `.js` 已真实产出，`curl -I` 返回 `200 OK`
  - MCP reload 后页面状态为 `Harness ready`，console 为空
  - `enableReporting()`、`triggerErrorEvent()`、`triggerUnhandledRejection()`、`sendUsageEvent()` 后累计捕获 5 条请求，包含 GA4 debug collect 与 Sentry envelope

本轮新增截图：

- `tmp/interaction-contract-harness-validation.png`
- `tmp/content-orchestrator-harness-4180-validation.png`
- `tmp/runtime-observability-harness-4180-validation.png`

## 4. 剩余事项与降级口径

当前仍保留但已不再属于高优先级阻塞的事项，已全部转入长期维护：

- 基础依赖周期性更新

正式议题池见：`docs/long-term-maintenance-backlog-2026-03-20.md`

## 5. 结论

基于当前代码、自动化验证与 Chrome DevTools MCP 手测，并在最终收口阶段重新确认 strict typecheck 通过后，本轮执行手册的高优先级组件统一、技术债治理、性能优化、运行时闭环、兼容回归、工程入口清仓与长期维护基线已完成闭环。
