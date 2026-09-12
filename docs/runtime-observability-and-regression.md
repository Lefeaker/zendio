# 运行时观测与手动回归基线

日期：2026-08-28

## 1. 运行时观测

- Analytics consent/config 唯一归一化入口：
  `src/shared/analytics/analyticsRuntimeConfig.ts#normalizeStoredAnalyticsConfig`；reporter
  adapter 不得再实现第二套 consent/debug/transport normalize
- Options 隐私设置主链：`src/options/stitch/schema/settings/overview.ts` ->
  `src/options/app/actions/privacyConsentAction.ts` ->
  `src/infrastructure/repositories/OptionsMutationClient.ts` -> background
  `src/background/services/optionsMutationCoordinator.ts`
- `ChromeOptionsRepository` 只拥有 raw read/observe 与 coordinator-internal raw IO；
  onboarding 使用同一 schema-derived contract 和 typed mutation client：
  `src/onboarding/bootstrap.ts`
- transfer payload 已覆盖 consent/debugMode：`src/options/services/analyticsTransfer.ts`
- session draft durable writes 由 background `sessionDraftMutationQueue` / `sessionDraftStore`
  及其 receipt/liveness/lease owners 串行化；截图 bytes 由 background
  `videoScreenshotCacheService` + IndexedDB store 持有
- 真实浏览器联调 harness：`tmp/runtime-observability-harness.ts`

建议联调命令：

```bash
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/shared/errors/analytics/index.test.ts tests/unit/shared/errors/globalErrorBoundary.test.ts tests/unit/background/analyticsEvents.test.ts tests/unit/shared/errors/analyticsConfig.test.ts tests/unit/options/productionStitchShell.actions.test.ts
npm run build:dev
```

当前 GA / video 定向验证命令：

```bash
npm run analytics:validate:prod
node scripts/run-ga-owner-smoke.mjs --mode proxy --event runtime_harness_open
node scripts/run-ga-owner-smoke.mjs --mode directDebug --event runtime_harness_open
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/scripts/runGaOwnerSmoke.test.ts
node tools/report-ga-proxy-contract.mjs
node tools/report-ga-docs-contract.mjs --check
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/background/analyticsEvents.test.ts tests/unit/shared/errors/analytics/index.test.ts tests/unit/shared/errors/analyticsConfig.test.ts
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/content/video/videoScreenshotPreparationQueue.test.ts tests/unit/content/video/VideoSession.test.ts
node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:video
```

## 2. 浏览器手动回归口径

### 会话重载与收尾恢复

启用自动划选（direct 或带有效按键的 modifier）时，后台通过平台 scripting service 注册现有 `content/index.js`，由浏览器在 HTTP/HTTPS 文档的 `document_end` 执行。注册保留到后续浏览器会话，避免每次重启重新等待后台唤醒；禁用划选时仅撤销本功能的注册。注册更新与配置读取均防止旧结果覆盖新设置，相同配置不会重复卸载/注册。已有页面的显式注入和平台兼容回退保留，慢图片或其他未完成资源不能阻塞正文上的划选和阅读操作。`sessionLifecycleRecovery.browser.test.ts` 的 held-image 场景同时验证真实鼠标划选、阅读面板和取消操作在 `window.load` 之前完成。

Reader / Video 共用 `sessionEndingCoordinator` 关闭新编辑入口、等待已接收的编辑落盘，并串行执行完成或取消。终止过程由 `sessionDraftTerminalState` 保留原始 finalize/remove 请求身份；响应丢失后重试延续同一操作。导出成功与草稿清理是两个阶段，同一挂载会话的收尾重试不会再次导出。不能把这种保证扩展为浏览器崩溃跨进程的导出 exactly-once 保证。

后台仍是唯一持久写入者。客户端只保存单调递增的版本观察，并在构造用户保存请求前等待已发出的租约操作。租约续期和释放的迟到响应不得覆盖新状态；终态和失效扩展上下文都停止续期。

支持 `sender.documentId` 的浏览器把受信页面身份绑定到不透明 lease token（`doc1:` 前缀），存储 schema 与 owner 字段保持兼容。未过期租约只有在原页面已确定消失时才能提前接管；普通 `active=false` 回复可能处于租约刚获批、尚未挂载的窗口，不能证明旧 owner 已退出。超时和不确定的消息通道关闭同样不能提前接管。无页面身份的旧租约保留过期判断；schema-v1 草稿通过既有 nonce owner-probe 协议确认现代页面内无旧 writer，未知回复保持保守。兼容的 receipt 标签 `expired_owner_inactive` 同时表示租约过期或已确认原页面消失。

`contentRuntimeConnection` 在用户交互或失联错误时停止旧上下文的会话服务。旧面板保留可复制的文本并提供刷新页面的按钮；恢复提示由面板自身渲染流程维持，不增加 DOM 轮询或观察器。扩展重载后，旧 DOM 标记不能让新运行环境误报 ready。刷新恢复的是已落盘草稿，尚未保存的输入应在刷新前复制保留。

针对性回归包含 `tests/e2e/sessionLifecycleRecovery.browser.test.ts`：正式 content loader、后台存储与 Downloads 出口，覆盖实际扩展重载/页面刷新、原草稿继续编辑、续期回包延迟及删除提交后回包丢失。浏览器测试使用独立 Profile；开发版扩展重载前须开启该 Profile 的 Developer mode。`sessionDraftConcurrency.browser.test.ts` 继续验证活跃 owner 不被抢占与精确清理。

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
- 视频 draft durable state 只保存 `screenshotRequested` intent 与 metadata-only
  `screenshotRef`；runtime screenshot bytes 维持在 background-owned IndexedDB `Blob` 路径，
  cache/message/export 边界才使用 JSON-safe serialized binary payload。missing/stale/corrupt
  ref 会清理并回落到现有低并发 preparation owner，不会恢复 base64 draft 持久化。

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
- `node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/shared/errors/analytics/index.test.ts tests/unit/shared/errors/globalErrorBoundary.test.ts tests/unit/background/analyticsEvents.test.ts tests/unit/shared/errors/analyticsConfig.test.ts tests/unit/options/productionStitchShell.actions.test.ts`

## 6. 已知非阻塞警告

- 若在纯 JSDOM / 非扩展上下文执行 content 面板测试，样式资源会报告 URL 解析警告；当前不会阻断测试通过。
- content-scripts repository e2e 中 `aiob-shortcut-usage-count` 的 mock storage 警告已被错误链路正确吸收，不影响通过判定。

### Options capture controls and local-only vaults (v0.3.0)

Selection triggering and reading export scope use the same segmented control as the interface theme. The values remain `disabled` / `direct` / `modifier` and `full` / `highlights`; modifier-key controls appear only in modifier mode. Selecting a segment updates its pressed state immediately and persists through the existing Options mutation path.

Explicitly empty `rest.httpsUrl` and `rest.httpUrl` represent disabled REST channels and must survive canonical validation and reload when a default vault uses a local folder. Nonempty malformed addresses remain invalid. A valid local folder does not require REST addresses or an API key; unconfigured channels have neutral indicators, while configured failures retain their error diagnostics. `tests/e2e/optionsCaptureControls.browser.test.ts` covers native local-folder handle persistence, successful local-only connection testing, segmented choice persistence, v0.3.0 release notes, and light/dark layout on desktop and narrow screens.

### Capsule transitions, focus frames and runtime settings links

Trigger mode switches retain the mounted capsule and modifier controls. Changes update the existing segmented-control presentation, selected key and conditional visibility through the same state owner, so CSS transitions survive immediate edits and save acknowledgements. Theme, trigger, modifier-key, export-scope and highlight-color capsules share the compact size and presentation update helper. The hidden modifier region stays out of visual and keyboard interaction through `display: none`; key conflict text still uses the current locale.

Automatically focused resource dialog containers do not draw a browser-default outline. Clipper comment fields keep a quiet one-pixel border and no extra focus glow; inner buttons and links retain keyboard access. Existing Clipper, Reader and Video header icons keep their images and geometry while becoming settings links. Production hrefs resolve through RuntimeService and clicks reuse the existing `openOptionsPage` background message, which creates a new tab without making the Options page web-accessible. Session clones route these clicks through their existing event owners, before collapsed-panel expansion; no extra persistent listener is added.

`tests/e2e/optionsCaptureControls.browser.test.ts` verifies connected nodes, real CSS transitions, compact sizing, conditional key choices, neutral resource focus and the current changelog summary. `tests/e2e/runtimeSurfaceNavigation.browser.test.ts` verifies comment focus appearance and new Options tabs with a mounted settings shell, unchanged notes, and collapsed Reader behavior.
