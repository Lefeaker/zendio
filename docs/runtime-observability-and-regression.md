# 运行时观测与手动回归基线

日期：2026-06-14

## 1. 运行时观测

- Analytics / consent / debug mode 统一入口：`src/shared/errors/analytics/*`
- Options 隐私设置主链：`src/options/stitch/schema/settings/overview.ts` -> `src/ui/domains/privacy/PrivacySettingsView.ts` -> `src/options/app/productionStitchPersistence.ts`
- transfer payload 已覆盖 consent/debugMode：`src/options/services/analyticsTransfer.ts`
- 真实浏览器联调 harness：`tmp/runtime-observability-harness.ts`

建议联调命令：

```bash
npx vitest run tests/unit/shared/errors/analytics/index.test.ts tests/unit/shared/errors/globalErrorBoundary.test.ts tests/unit/background/analyticsEvents.test.ts tests/unit/shared/errors/analyticsConfig.test.ts tests/unit/options/productionStitchShell.actions.test.ts
npm run build:dev
```

当前 GA / video 定向验证命令：

```bash
npm run analytics:validate:prod
node scripts/run-ga-owner-smoke.mjs --mode proxy --event runtime_harness_open
node scripts/run-ga-owner-smoke.mjs --mode directDebug --event runtime_harness_open
npx vitest run --config vitest.unit.config.ts tests/unit/scripts/runGaOwnerSmoke.test.ts
node tools/report-ga-proxy-contract.mjs
node tools/report-ga-docs-contract.mjs --check
npx vitest run tests/unit/background/analyticsEvents.test.ts tests/unit/shared/errors/analytics/index.test.ts tests/unit/shared/errors/analyticsConfig.test.ts
npx vitest run tests/unit/content/video/videoScreenshotPreparationQueue.test.ts tests/unit/content/video/VideoSession.test.ts
node scripts/run-playwright.mjs test tests/e2e/videoPanelFlow.test.ts tests/e2e/videoListenerScope.browser.test.ts --project=chromium-desktop
```

## 2. 浏览器手动回归口径

建议至少覆盖：

- Options production Stitch shell 与导航面板
- Options 概览页的 `Privacy & Data` consent 卡片
- onboarding 页面与 chunk 加载
- Support Prompt / Reader / Video 核心弹层
- YAML 配置交互

## 3. 既有浏览器验证记录

验证方式：Chrome DevTools MCP + 本地静态服务器

- 页面：`http://localhost:4173/onboarding/index.html`
- 结果：
  - 页面主体结构、文案、按钮和图片加载正常
  - ESM chunk 可在 `http://` 场景下加载
  - Chrome DevTools MCP 下 console 无运行时错误
  - 直接 `file://` 打开会被模块脚本 CORS 拒绝，不作为正式验证口径

- 页面：`http://localhost:4173/options/index.html`
- 结果：
  - `Options` production Stitch shell 可加载，导航与内容区已包含 `deepResearch` / `classifier`
  - 主题切换可把 `data-theme` 切到 `light`，提示文本同步变为 `Light Mode`
  - `Deep Research` 纯净模式 checkbox 可切换
  - `Classifier` 勾选后会展开 provider / endpoint / model / apiKey / taxonomy 配置区
  - `Templates` 的阅读模式路径 select 切到 `Same as article path` 后，自定义输入框会进入 disabled 状态
  - `YAML` 自定义字段的 type select 可从 `array` 切到 `text`
  - 所有 `options` ESM chunks 均从 `http://localhost:4173/chunks/*` 成功加载
  - 预览环境存在已知警告：`chrome.storage.local is unavailable`、`I18N_LANGUAGE_LOAD_FAILED`，以及仅 `favicon.ico` 为 `404`；这些是 localhost 非扩展上下文限制，不影响本轮组件/section/状态链验证

- 页面：`http://localhost:4173/content-orchestrator-harness.html`
- 结果：
  - `ClipperDialog` 可真实弹出，a11y snapshot 可见 `Clip Selection`、textarea 和 action buttons
  - `ReaderSession` 可真实挂载，页面进入 `aiobReaderActive=true`，并渲染高亮与 reader panel controls
  - `VideoSession` 可真实挂载并添加 1 条 timestamp capture，a11y snapshot 可见 `Video capture mode`、`00:42`、`Finish & export`
  - 控制台仅保留 1 条资源 `404`，不影响本轮 orchestrator 验证

- 页面：`http://localhost:4173/runtime-observability-harness.html`
- 结果：
  - 点击 `Enable Reporting` 后，状态切到 `reporters=ga,sentry debugMode=true`
  - 触发 `error` 与 `unhandledrejection` 后，页面会捕获到 Sentry envelope 和 owner debug proxy 请求
  - 触发 `Send Usage Event` 后，页面会新增一条 owner debug proxy request
  - 控制台可见 `Google Analytics reporter initialized`、`Sentry reporter initialized`、`[analytics-events] Event sent (debug):` summary，且不再出现 platformServices 缺失警告
  - `directDebug` summary log 不输出 event params；生产 `proxy` 成功路径也没有对应的成功日志

截图：

`tmp/onboarding-http-validation.png`
`tmp/options-p0-validation.png`
`tmp/content-orchestrator-harness-validation.png`
`tmp/runtime-observability-p2-5-validation.png`

## 4. 自动化验证结果

当前 GA / video 观测真值：

- `analytics:validate:prod` 只验证 public-config wiring 与 owner env sanity，不证明真实 GA property delivery、DebugView 可见性或服务端 `api_secret` 注入。
- `run-ga-owner-smoke.mjs` 只证明本地 proxy request shape、public env guard 与
  redacted CLI summary，不证明真实 GA property delivery、DebugView 可见性或
  服务端 `api_secret` 注入。
- `report-ga-docs-contract` 会把 `ga4-telemetry-reference.md` 与
  `google-analytics-dashboard-setup.md` 绑定到当前 schema / proxy contract，但它不替代
  owner proxy / DebugView smoke checks。
- runtime config 的 `enabled` 是 `analytics || errorReporting`；usage/product 事件需要 `analytics` consent，`extension_error` 需要 `errorReporting` consent。
- 视频截图的 durable state 只保存 `screenshotRequested` intent；runtime screenshot bytes 维持在 `Blob` / binary 路径，导出边界再序列化为兼容 payload。

## 5. Owner Smoke Evidence Template

将 owner smoke evidence 记录在 ignored path（例如 workspace `.tmp/`）时，至少保留：

- build/package hash 或安装包文件名
- smoke command 与 mode：
  - `node scripts/run-ga-owner-smoke.mjs --mode proxy --event runtime_harness_open`
  - `node scripts/run-ga-owner-smoke.mjs --mode directDebug --event runtime_harness_open`
- proxy request ids / server log references
- observed event names
- consent matrix：
  - consent off: no proxy request
  - analytics on only: usage/product events only
  - analytics + errorReporting on: controlled `extension_error` allowed
- owner DebugView screenshot/reference，或显式标记 skipped
- server-side `api_secret` injection proof，或显式标记 skipped
- any skipped owner-only checks with reason

本模板必须显式声明：本地 smoke command 不证明真实 GA property delivery、
DebugView 可见性或 server-side `api_secret` 注入；这些结论只能来自 owner 提供的
proxy/backend evidence。

历史已通过：

- `npm run typecheck:app`
- `npm run typecheck:tests`
- `npm run typecheck:strict -- --pretty false`
- `npm run lint -- --quiet`
- `npm run audit:components:report`
- `npm run audit:platform-services:report`
- `npm run audit:imports:report`
- `npm run audit:performance:report`
- `npm run build:dev`
- `npm run audit:build:report`
- `npm run test:unit`
- `npm run test:e2e`
- `npx vitest run tests/unit/shared/errors/analytics/index.test.ts tests/unit/shared/errors/globalErrorBoundary.test.ts tests/unit/background/analyticsEvents.test.ts tests/unit/shared/errors/analyticsConfig.test.ts tests/unit/options/productionStitchShell.actions.test.ts`

## 6. 已知非阻塞警告

- 若在纯 JSDOM / 非扩展上下文执行 content 面板测试，样式资源会报告 URL 解析警告；当前不会阻断测试通过。
- content-scripts repository e2e 中 `aiob-shortcut-usage-count` 的 mock storage 警告已被错误链路正确吸收，不影响通过判定。
