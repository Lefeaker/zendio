# GA4 Telemetry Reference

最后更新：2026-06-14

本文是 Zendio 当前 GA 产品遥测与错误遥测的文档真值。P06 起，事件表由
schema / proxy contract 驱动校验；提交前请先运行
`node tools/report-ga-proxy-contract.mjs`，再运行
`node tools/report-ga-docs-contract.mjs --check`。

- 事件目录真值：`src/shared/analytics/eventCatalog.ts`
- 运行时导出契约：`src/shared/types/analytics.ts`
- 参数清洗真值：`src/shared/analytics/analyticsSanitizers.ts`
- 错误匿名化真值：`src/shared/errors/analytics/dataSanitizer.ts`
- 集成分支校验基线：commit 级验证请查看当前 integration branch 的里程碑 handoff、`git log` / `git show` 与 `docs/source-of-truth-index.md`；不要在本文硬编码某个历史 GA 分支 HEAD。

## 当前传输与同意真值

- 扩展默认不发送遥测；是否可发送由用户 consent 和 build-time public analytics config 共同决定。
- 生产路径是 owner-controlled `proxy` transport。扩展只持有公开的 `measurementId`、`transportMode`、`proxyEndpoint`。
- `api_secret` 只能存在于服务端 proxy；扩展不得存储、生成、请求、提示填写或发送它。
- runtime `enabled` 是 `analytics || errorReporting` 的 live OR；但 consent scope 仍按事件类别区分，usage/product 事件需要 `analytics`，错误事件需要 `errorReporting`。
- 产品事件要求 `analytics` consent；错误事件要求 `errorReporting` consent。
- `analytics_client_id` 与 `analytics_session_id` 会在本地扩展存储中预先建立，用于稳定 consent 恢复后的 send contract；在对应事件类别 consent 和 public build config 允许发送之前，这两个标识不会离开本地。
- `clearAllData()` / analytics data clear 会移除 consent、config、client id、session id 与相关队列状态。清空 analytics 数据时，如果清空前已有 `analytics` consent，Options 会 best-effort 发送一次 `analytics_data_cleared` 完成事件；该事件使用清空前捕获的 consented public config，payload 只能包含 `outcome: completed`，不得包含 client id、session id、measurement id、参数明细、页面内容、路径或其他原始数据字段。
- `directDebug` 仅用于本地 debug proxy 验证，不是生产 release 默认路径；扩展仍只发往配置的 owner proxy endpoint，不能直连 Google debug endpoint 或携带 `api_secret`。
- `analytics:validate:prod` 是静态/public-config + owner env sanity check；它会校验 tracked transport/consent contract、负向 secret/Google endpoint 守卫和 owner env 公共配置形状，但仍不证明真实 GA4 property delivery 或 DebugView 可见性。
- `analytics:smoke:delivery` 是 opt-in owner-run proxy acceptance smoke；它默认在 public env 不完整时 skip，`--require-env` 才把缺失 public env 视为 failure；它只发送 allowlisted synthetic event，拒绝 direct Google Measurement Protocol hosts，也不证明真实 GA4 property delivery 或 DebugView 可见性。
- 成功的生产 `proxy` 发送默认不输出事件参数或成功日志；只有 `directDebug` 会输出 `[analytics-events] Event sent (debug):` summary，且 summary 只包含 `eventName`、`transportMode`、`responseStatus` 与 validation message 数量。
- 所有产品时长分析统一使用 `duration_bucket`。产品遥测不采集 `duration_ms`。

## 共享字段与隐私边界

共享 transport 会自动附加：

- `engagement_time_msec=1`
- `extension_version`
- `session_id`，如果当前会话已建立
- `debug_mode=true`，仅在 debug mode 打开时

产品与错误遥测都不得包含以下内容：

- 原始页面正文、用户剪藏内容、阅读高亮正文、视频片段正文
- Obsidian 文件路径、vault 名称、目录结构、导出后的 markdown 正文
- 完整 URL、查询参数、认证 token、cookie、密码、密钥，以及任何服务端 proxy
  `api_secret`
- 邮箱、IP、用户名、电话、信用卡号、SSN 等个人信息
- 原始 `duration_ms`

参数约束真值：

- 标识符类字段只允许受限字符集，见 `analyticsSanitizers.ts`
- `operation_id` 只接受 `op_<id>` 形式
- 枚举字段只允许目录中定义的值
- 错误上下文会经过 `sanitizeErrorForAnalytics`

## Bucket / Enum 真值

### `duration_bucket`

- `under_100ms`
- `100ms_to_499ms`
- `500ms_to_999ms`
- `1s_to_2s`
- `3s_to_9s`
- `10s_to_29s`
- `30s_to_119s`
- `2m_plus`

### `count_bucket`

- `zero`
- `one`
- `two_to_five`
- `six_to_ten`
- `eleven_to_twenty`
- `twenty_one_to_fifty`
- `fifty_one_plus`

### Other shared enums

- `storage_target`: `downloads` | `local_folder` | `rest_api` | `unknown`
- `content_type`: `article` | `selection` | `ai_chat` | `reader` | `video` | `other`
- `destination`: `downloads` | `local_folder` | `rest_api` | `clipboard` | `unknown`
- `source`: `menu` | `toolbar` | `shortcut` | `runtime-observability-harness` | `unknown`
- `platform`: `youtube` | `bilibili` | `chatgpt` | `claude` | `gemini` | `other` | `unknown`

## Active Event Table

说明：

- `Class` 与 `Runtime` 列直接来自当前 `ANALYTICS_EVENT_CATALOG`
- `Params` 列按 `AnalyticsEventParamMap` 与 sanitizer 允许值整理；带 `?` 的字段为可选
- 只有当前无 active emitter 的 catalog 行才保留 `future` / `contract-only` / `inventory-only` / docs-only 分类；表内 active emitter 行已经与当前 runtime reality 对齐

### Support / Usage / Error

集成分支 emitter 入口：

- `src/content/ui/supportPrompt.ts`
- `src/content/ui/supportPromptToastLifecycle.ts`
- `src/shared/i18n/overflowLogger.ts`
- `src/options/app/usage-dashboard/usageDashboardState.ts`
- `src/dev/runtimeObservabilityHarness.ts`
- `src/shared/errors/analytics/googleAnalyticsReporter.ts`

<!-- GA_SCHEMA_TABLE_START:support_usage_error -->

| Event                                 | Params                                                                                                                                                                 | Class      | Runtime |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| `support_link_clicked`                | `target`                                                                                                                                                               | `emitted`  | `true`  |
| `support_like_clicked`                | `variant`                                                                                                                                                              | `emitted`  | `true`  |
| `support_dislike_clicked`             | none                                                                                                                                                                   | `emitted`  | `true`  |
| `support_review_link_clicked`         | `variant?`                                                                                                                                                             | `emitted`  | `true`  |
| `support_review_acknowledged_clicked` | `variant?`                                                                                                                                                             | `emitted`  | `true`  |
| `support_dislike_reddit_clicked`      | none                                                                                                                                                                   | `emitted`  | `true`  |
| `support_github_feedback_clicked`     | none                                                                                                                                                                   | `emitted`  | `true`  |
| `support_like_toast_shown`            | `variant`                                                                                                                                                              | `emitted`  | `true`  |
| `support_dislike_toast_shown`         | none                                                                                                                                                                   | `emitted`  | `true`  |
| `i18n_text_overflow`                  | `key`, `language`, `length`, `used_short`, `component?`, `priority?`, `limit?`                                                                                         | `emitted`  | `true`  |
| `clear_stats`                         | `timestamp`                                                                                                                                                            | `emitted`  | `true`  |
| `usage_dashboard_increment`           | `category`, `increment`, `total_after`                                                                                                                                 | `emitted`  | `true`  |
| `runtime_harness_open`                | `source`                                                                                                                                                               | `dev-only` | `true`  |
| `extension_error`                     | `error_code`, `error_domain`, `error_severity`, `error_recoverable`, `error_category?`, `extension_version?`, `browser_name?`, `browser_version?`, `failure_category?` | `error`    | `false` |

<!-- GA_SCHEMA_TABLE_END:support_usage_error -->

### Onboarding / Privacy / Options

集成分支 emitter 入口：

- `src/onboarding/bootstrap.ts`
- `src/options/app/bootstrap.ts`
- `src/options/app/productionStitchShellActionRuntime.ts`
- `src/options/app/productionStitchPersistence.ts`

<!-- GA_SCHEMA_TABLE_START:onboarding_privacy_options -->

| Event                          | Params                                 | Class     | Runtime |
| ------------------------------ | -------------------------------------- | --------- | ------- |
| `onboarding_started`           | `source`                               | `emitted` | `true`  |
| `onboarding_step_completed`    | `step`, `duration_bucket`              | `emitted` | `true`  |
| `onboarding_skipped`           | `step`                                 | `emitted` | `true`  |
| `onboarding_support_action`    | `action`                               | `emitted` | `true`  |
| `onboarding_completed`         | `duration_bucket`                      | `emitted` | `true`  |
| `privacy_consent_changed`      | `field`, `enabled`                     | `emitted` | `true`  |
| `analytics_data_cleared`       | `outcome`                              | `emitted` | `true`  |
| `options_opened`               | `source`                               | `emitted` | `true`  |
| `options_section_viewed`       | `section`                              | `emitted` | `true`  |
| `options_action_completed`     | `action`, `outcome`, `section?`        | `emitted` | `true`  |
| `options_theme_changed`        | `theme`                                | `emitted` | `true`  |
| `options_language_changed`     | `language`                             | `emitted` | `true`  |
| `config_export_completed`      | `outcome`                              | `emitted` | `true`  |
| `config_import_completed`      | `outcome`, `analytics_payload_present` | `emitted` | `true`  |
| `experimental_feature_toggled` | `feature_key`, `enabled`               | `emitted` | `true`  |

<!-- GA_SCHEMA_TABLE_END:onboarding_privacy_options -->

### Clip / Background / Connection / Storage

集成分支 emitter 入口：

- `src/content/runtime/clipFlow.ts`
- `src/background/application/clipProcessor.ts`
- `src/options/services/connectionTester.ts`
- `src/background/pipelines/connectionTest.ts`
- `src/background/services/obsidianWriter.ts`

<!-- GA_SCHEMA_TABLE_START:clip_background_connection_storage -->

| Event                             | Params                                                                        | Class     | Runtime |
| --------------------------------- | ----------------------------------------------------------------------------- | --------- | ------- |
| `clip_started`                    | `operation_id`, `source`, `content_type`                                      | `emitted` | `true`  |
| `clip_prompt_opened`              | `operation_id`, `content_type`                                                | `emitted` | `true`  |
| `clip_prompt_submitted`           | `operation_id`, `content_type`                                                | `emitted` | `true`  |
| `clip_prompt_cancelled`           | `operation_id`, `content_type`                                                | `emitted` | `true`  |
| `extraction_completed`            | `operation_id`, `content_type`, `duration_bucket`, `attachment_count_bucket?` | `emitted` | `true`  |
| `background_stage_completed`      | `operation_id`, `stage`, `duration_bucket`                                    | `emitted` | `true`  |
| `clip_save_completed`             | `operation_id`, `storage_target`, `duration_bucket`                           | `emitted` | `true`  |
| `clip_save_failed`                | `operation_id`, `storage_target`, `failure_category`                          | `emitted` | `true`  |
| `ai_chat_detected`                | `platform`, `message_count_bucket`                                            | `emitted` | `true`  |
| `ai_chat_exported`                | `platform`, `message_count_bucket`, `duration_bucket`                         | `emitted` | `true`  |
| `connection_test_completed`       | `storage_target`, `outcome`, `duration_bucket`, `failure_category?`           | `emitted` | `true`  |
| `local_vault_permission_prompted` | `source`                                                                      | `emitted` | `true`  |
| `local_vault_permission_resolved` | `outcome`                                                                     | `emitted` | `true`  |
| `vault_write_completed`           | `storage_target`, `duration_bucket`                                           | `emitted` | `true`  |
| `vault_write_failed`              | `storage_target`, `failure_category`                                          | `emitted` | `true`  |

<!-- GA_SCHEMA_TABLE_END:clip_background_connection_storage -->

### Reader / Video

集成分支 emitter 入口：

- `src/content/reader/session.ts`
- `src/content/reader/sessionOperations.ts`
- `src/content/video/sessionOperations.ts`

<!-- GA_SCHEMA_TABLE_START:reader_video -->

| Event                      | Params                                              | Class     | Runtime |
| -------------------------- | --------------------------------------------------- | --------- | ------- |
| `reader_session_started`   | `source`                                            | `emitted` | `true`  |
| `reader_highlight_added`   | `selection_length_bucket`, `highlight_count_bucket` | `emitted` | `true`  |
| `reader_exported`          | `destination`, `duration_bucket`                    | `emitted` | `true`  |
| `reader_export_failed`     | `destination`, `failure_category`                   | `emitted` | `true`  |
| `reader_session_cancelled` | `duration_bucket`                                   | `emitted` | `true`  |
| `video_session_started`    | `platform`, `source`                                | `emitted` | `true`  |
| `video_timestamp_added`    | `capture_count_bucket`                              | `emitted` | `true`  |
| `video_fragment_added`     | `capture_count_bucket`                              | `emitted` | `true`  |
| `video_capture_removed`    | `capture_count_bucket`                              | `emitted` | `true`  |
| `video_exported`           | `platform`, `destination`, `duration_bucket`        | `emitted` | `true`  |
| `video_export_failed`      | `platform`, `destination`, `failure_category`       | `emitted` | `true`  |
| `video_session_cancelled`  | `platform`, `duration_bucket`                       | `emitted` | `true`  |

<!-- GA_SCHEMA_TABLE_END:reader_video -->

`video_export_failed.failure_category` 优先使用后台剪藏写入链路已经计算出的结构化失败分类
（例如 `write`、`connection`、`classification`）。如果 runtime response 没有可验证分类，内容侧只使用窄范围本地兜底：
无效导出响应归为 `validation`，超时 / abort 归为 `timeout`，扩展消息传输失败归为 `connection`，其余保留 `unknown`。
该字段不得从用户正文、标题、完整 URL、文件路径、时间戳备注、选中文本、截图 bytes 或 secret 中派生。

## Catalog-only Rows

这些名字仍然在当前 telemetry contract 中存在，但不能当作“当前生产
dashboard 的主统计事件”。

<!-- GA_SCHEMA_TABLE_START:catalog_only -->

| Event                       | Params                      | Class           | Runtime | Current branch truth                                           |
| --------------------------- | --------------------------- | --------------- | ------- | -------------------------------------------------------------- |
| `video_started`             | `source`                    | `contract-only` | `true`  | 保留 contract / compatibility row；当前分支没有 active emitter |
| `extension_installed`       | `source`, `browser_family?` | `future`        | `true`  | catalog 预留行；当前分支没有 active emitter                    |
| `video_screenshot_captured` | `screenshot_count_bucket`   | `future`        | `true`  | catalog 行仍保留；当前分支没有 active emitter                  |

<!-- GA_SCHEMA_TABLE_END:catalog_only -->

`extension_usage` 与 `extension_performance` 只是历史 inventory 名称，不是当前
schema/proxy contract 事件，不能出现在 active 文档、setup 指南或 dashboard。
另有一条 retired docs-only QR dislike row 被保留在 source 中用于历史分类，不应
出现在任何 active 文档、setup 指南或 dashboard 中。

## Dashboard / QA 使用规则

- 只对 `Runtime=true` 且有当前 emitter 的事件建立正式 dashboard。
- `extension_error` 虽然 `Runtime=false`，仍是正式错误遥测事件；它通过错误 reporter 走 shared transport，不通过 runtime message path。
- `dev-only` 事件只用于本地 harness / debug proxy / owner DebugView 验证，不进入生产 KPI。
- `contract-only`、`inventory-only`、docs-only 行不得作为 owner dashboard 的主要维度来源。
- `enabled` 必须按 live OR 语义理解，不能把它当作“当前所有事件都可发送”的单一代理指标；是否真正可发仍取决于对应事件的 consent scope。
- 任何需要精确时长的分析必须走 proxy / server logs；产品遥测本身只提供 bucket。

## 维护规则

- 新增、删除或重命名事件时，必须先更新 `eventCatalog.ts`，再更新本文档。
- 任何新增字段都必须先过 sanitizer，再进入 dashboard 文档。
- 如果 catalog classification 与 runtime reality 有意不完全一致，必须在本文档显式说明，不允许让下游 owner 从旧文档自行猜测。
