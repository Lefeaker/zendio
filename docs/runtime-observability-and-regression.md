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

内容入口 loader 必须使用扩展的 `runtime.getURL('content/runtime.js')` 构造绝对模块 URL。Firefox 会将经典 content script 中的 `import('./runtime.js')` 解析到当前网页 origin，导致后台已注册脚本、权限也已授予，页面 runtime 仍无法启动。保留同一初始化 Promise 和失败时的清理，不能用测试页手工注入绕过此生产入口；`contentRuntimeLoader.test.ts` 同时检查两种浏览器 API、重复初始化与失败重试。

Reader / Video 共用 `sessionEndingCoordinator` 关闭新编辑入口、等待已接收的编辑落盘，并串行执行完成或取消。终止过程由 `sessionDraftTerminalState` 保留原始 finalize/remove 请求身份；响应丢失后重试延续同一操作。导出成功与草稿清理是两个阶段，同一挂载会话的收尾重试不会再次导出。不能把这种保证扩展为浏览器崩溃跨进程的导出 exactly-once 保证。

Reader 的 `CLIP_RESULT` 与 Video repository 出口共同使用保存结果契约：保留兼容字段 `success`，并区分 `outcome=saved|failed|unknown`。只有写入前已确定失败才返回 `failed`；附件或正文写入过程中出现 HTTP 500、消息断开、无法确认的异常均为 `unknown`，不能据此认定文件不存在。失败字段只有受限的 category、code、stage 与本地化 descriptor；不传原始异常、响应正文、堆栈或错误上下文。旧成功 ACK 仍可识别，旧的单独 `success:false` 和无效/缺失回复按未知处理。内容端等待消息回复最多 150 秒，这个等待超时本身不能跨失联消息通道取消写入，也不自动重试；迟到结果不能修改当前会话。REST 请求自身的取消边界见下文。

后台 REST 保存从 processor 入口开始共用 120 秒绝对截止时间，前置分类/路由耗时也计入；顺序附件、最终 Markdown 和协议候选只获得剩余时间。独立 REST 写入同样最多 120 秒，并可接受更早截止时间或进程内 AbortSignal。原 fetch owner 会中止网络请求，错误响应体读取也在期限内；等待同时有界，即便 transport 忽略 abort、迟到返回，也不会继续下一附件或协议候选。成功 PUT 的响应头仍是既有确认边界，未使用的响应体会取消读取，不等待它结束，也不撤销已确认结果。

分类 fetch 与响应 JSON/错误体使用同一配置时限（正常配置 15 秒，缺失/无效配置回落 2 秒），并服从保存操作更早的截止时间。每个请求独立持有 controller；超时仍返回 timeout fallback，显式取消按 transport error 处理。错误上报沿用 best-effort owner，不能拖住保存结果。取消不证明远端没有写入，原 unknown、已确认附件进度、持久草稿和新编辑保护保持有效，不做自动重试或补偿删除。

`networkDeadlines.http.test.ts` 通过真实 loopback 检查挂起响应体在截止后断开，以及成功 PUT 确认后释放未使用的响应体。`clipSaveDeadlines.browser.test.ts` 由 CI Browser state flow 收集，验证已安装扩展的真实 PUT、断开、unknown、重载草稿和新编辑保留。浏览器用测试内捕获的生产截止回调注入超时，不增加测试时限；120 秒准确边界由 fake-clock unit 另行验证，不将该浏览器用例称为真实等待 120 秒的测试。

Reader / Video 在发送前通过现有 draft controller 持久化 `exportAttempt`。保存记录包含操作身份、完整 live 内容与保存选择的摘要，以及当时的目标预览；摘要不应用草稿的条目保留上限，真实草稿仍遵守原保留策略。这一步失败时不发送写入。确认保存后先持久化 saved 标记，再进入原 finalize/remove；标记保存失败不会清理草稿。未知结果保留编辑能力，普通“完成”不会再次写入。用户先核对目标，再明确选择重新保存（当前内容、新操作身份）或确认原文件已保存（仅完成清理）。原保存之后有新编辑或目标变化时，确认旧文件不会清除新内容。重载恢复未知标记，继续采用相同规则；旧版本已打开的 content context 需刷新后才有新恢复界面。

文件提交后的学习记录、使用统计、通知与错误上报都不参与保存 ACK。原 learning/usage FIFO owner 与 consent 检查保持不变；使用统计只服务概览、历史与重置，不是授权或配额提交。每项附带任务最多等待 2 秒并观察迟到的 rejection，通知不排在 reporter 后面。GA 与 Sentry 的原 fetch owner 同时用 AbortController 结束超时请求；对其他不可取消 API，等待上限不表示底层操作已取消。浏览器可能在 ACK 后结束 best-effort 工作，不承诺附带记录的崩溃后交付。上述机制不提供第三方存储的 exactly-once 或多文件原子性。

Chrome / Firefox Downloads 由平台 adapter 唯一负责新文件的完成观察，读取 `downloads.search` 并监听 `onChanged`，返回已完成文件的 ID 与实际文件名；应用层复用该结果，不再为同一新文件二次订阅。附件逐个完成后才生成 Markdown，主文件完成后才发送成功、记录首次保存与课程进度。浏览器对附件自动改名时，Markdown 使用最终相对文件名；本机绝对路径只用于本地结果与定位，不进入遥测。Blob URL 由 adapter 保留至终态并释放，单次等待上限为 120 秒；超时只取消本次创建的 ID，并保留内容。取消失败或恰好完成的竞争仍视为结果未知，用户重试前可以检查 Downloads。既存学习 pending 收据在后台重启后继续按相同完成判定恢复，其独立查询保留。预览服务返回显式模拟结果，不伪造下载 ID、文件名或保存成功确认。

`clipSaveAcknowledgement.test.ts` 覆盖 processor/pipeline 写入结果已确定但 notification、usage 或 reporter 挂起时仍返回 ACK；`readerSaveBoundary.test.ts` 覆盖 Reader → 生产后台 pipeline → writer 不确定结果 → 草稿保留 → 明确重新保存及 cleanup-only 重试；`exportTitleRoutes.browser.test.ts` 的保存失败场景通过真实 loopback REST 500/200 与原生 Downloads 检查实际 Markdown、附件和同名文件引用。

Reader 初始化与编辑共用现有 mutation runner：本次划选先更新列表、计数和页面标记，再等待草稿认领与保存目标。恢复期间锁定编辑但保留取消入口；恢复的高亮合并到本次划选，不能覆盖新选中的文字。取消先关闭操作入口并等待正在进行的初始化，迟到的草稿只用于完成终态清理，不再恢复页面标记。面板和页面高亮在同一次同步清理中移除，不能在草稿仍可能恢复时先关闭面板。浏览器回归通过延迟真实 `selectAndClaim` 回复验证首条高亮已显示、取消无残留且刷新不复活；GA 事件回执不参与会话等待。

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

附件部分成功沿用上述结果契约：后台只在原 writer 确认完成后追加小型确认记录，失败结果通过同一消息返回，Reader / Video 再由现有 draft controller 持久化 `exportAttempt.attachmentProgress`。记录上限与既有输入附件上限相同（50）；不保存截图 bytes，不增加逐附件草稿写入或后台任务队列。每次显式导出或继续仅对冻结输入和解析后的目标计划计算一次摘要，包含附件内容、顺序、输出路径、Markdown 引用、storageTarget 和目标身份；进度事件不重复序列化或 hash 全量内容。

用户核对目标后可明确继续同一导出，复用本次最终 payload 与 operationId，跳过已确认的附件。Downloads 在续写任何文件前逐一复核已确认 ID 仍为 complete、exists=true 且实际文件名未变；Markdown 复用该实际文件名，保留浏览器自动重命名。REST / 本地目录的确认仅证明此前写入完成，不能证明外部文件此刻仍有相同 bytes；Downloads 的存在检查同样不验证用户后来修改的内容。未确认的当前附件或正文可能已存在，因此继续仍要求用户检查，不提供多文件 exactly-once。

Reader / Video 首次导出将既有 `exportAttempt.startedAt` 作为可选 `exportStartedAt` 随 operationId 写入冻结 payload，Video 经原 repository 消息 adapter 传入 ClipMeta。pathResolver 用该时间展开日期与时分秒 token，显式续存保持原路径，新选择再次保存则创建新的操作身份和时间。每次实际发送仍获得本次网络请求预算，不能把冻结的文件命名时间当成网络截止时间。缺少时间字段的旧消息仍以当前 dispatch 时间解析，不迁移旧部分进度；存在但无效的时间字段在 ClipMeta 边界拒绝。草稿保留额度和清理语义未变。

原内容、目标或解析计划改变、确认的下载已不存在时拒绝续存并保留进度与内容。冻结最终 payload 仅在当前会话内持有，保存已确认、用户选择新导出或计划被拒绝后释放；重载不持久复制完整 payload，缺少该快照时仅恢复历史进度并要求明确新导出。普通“完成”、恢复草稿和迟到 ACK 都不会自动续写，旧确认不能清除新的编辑。

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

## Optional feedback and initialization

Support prompts are optional delivery messages. The background pipeline treats the
platform's typed `NO_RECEIVER` and `TAB_NOT_FOUND` outcomes as normal lifecycle
conditions, while unexpected transport errors still reach the error handler. A
visible save result and an actual Markdown write should be verified separately
from extension error-list noise.

The YAML override cache can be imported before the composition root registers the
Options repository. That state is temporary: the next consumer access binds the
registered repository and hydrates the cache once. A broken registered repository
still produces a diagnostic. The cache does not register fallback repositories or
start a polling loop.
