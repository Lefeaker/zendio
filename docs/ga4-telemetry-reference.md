# GA4 Telemetry Reference

最后更新：2026-06-11

本文是 Zendio 当前 GA 产品遥测与错误遥测的文档真值。

- 事件目录真值：`src/shared/analytics/eventCatalog.ts`
- 运行时导出契约：`src/shared/types/analytics.ts`
- 参数清洗真值：`src/shared/analytics/analyticsSanitizers.ts`
- 错误匿名化真值：`src/shared/errors/analytics/dataSanitizer.ts`
- 集成分支校验基线：以 `codex/aiiinob-ga-production-telemetry-2026-06-04-integration` 作为当前分支真值；commit 级验证请查看本次 P13 final audit 与该分支的 `git log` / `git show`，不要在本文硬编码当前 HEAD。

## 当前传输与同意真值

- 扩展默认不发送遥测；是否可发送由用户 consent 和 build-time public analytics config 共同决定。
- 生产路径是 owner-controlled `proxy` transport。扩展只持有公开的 `measurementId`、`transportMode`、`proxyEndpoint`。
- `api_secret` 只能存在于服务端 proxy；扩展不得存储、生成、请求、提示填写或发送它。
- 产品事件要求 `analytics` consent；错误事件要求 `errorReporting` consent。
- `directDebug` 仅用于本地 debug proxy 验证，不是生产 release 默认路径；扩展仍只发往配置的 owner proxy endpoint，不能直连 Google debug endpoint 或携带 `api_secret`。
- `analytics:validate:prod` 是静态/public-config + owner env sanity check；它不证明真实 GA4 property delivery 或 DebugView 可见性。
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
- 完整 URL、查询参数、认证 token、cookie、密码、密钥、`api_secret`
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
- 当前 catalog 中大量新事件仍标记为 `future`，但本集成分支已经有对应 emitter；不要把这些行当作“未使用占位”

### Support / Usage / Error

集成分支 emitter 入口：

- `src/content/ui/supportPrompt.ts`
- `src/content/ui/supportPromptToastLifecycle.ts`
- `src/shared/i18n/overflowLogger.ts`
- `src/options/app/usage-dashboard/usageDashboardState.ts`
- `src/dev/runtimeObservabilityHarness.ts`
- `src/shared/errors/analytics/googleAnalyticsReporter.ts`

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

### Onboarding / Privacy / Options

集成分支 emitter 入口：

- `src/onboarding/bootstrap.ts`
- `src/options/app/bootstrap.ts`
- `src/options/app/productionStitchShellActionRuntime.ts`
- `src/options/app/productionStitchPersistence.ts`

| Event                          | Params                                 | Class    | Runtime |
| ------------------------------ | -------------------------------------- | -------- | ------- |
| `onboarding_started`           | `source`                               | `future` | `true`  |
| `onboarding_step_completed`    | `step`, `duration_bucket`              | `future` | `true`  |
| `onboarding_skipped`           | `step`                                 | `future` | `true`  |
| `onboarding_support_action`    | `action`                               | `future` | `true`  |
| `onboarding_completed`         | `duration_bucket`                      | `future` | `true`  |
| `privacy_consent_changed`      | `field`, `enabled`                     | `future` | `true`  |
| `analytics_data_cleared`       | `outcome`                              | `future` | `true`  |
| `options_opened`               | `source`                               | `future` | `true`  |
| `options_section_viewed`       | `section`                              | `future` | `true`  |
| `options_action_completed`     | `action`, `outcome`, `section?`        | `future` | `true`  |
| `options_theme_changed`        | `theme`                                | `future` | `true`  |
| `options_language_changed`     | `language`                             | `future` | `true`  |
| `config_export_completed`      | `outcome`                              | `future` | `true`  |
| `config_import_completed`      | `outcome`, `analytics_payload_present` | `future` | `true`  |
| `experimental_feature_toggled` | `feature_key`, `enabled`               | `future` | `true`  |

### Clip / Background / Connection / Storage

集成分支 emitter 入口：

- `src/content/runtime/clipFlow.ts`
- `src/background/application/clipProcessor.ts`
- `src/options/services/connectionTester.ts`
- `src/background/pipelines/connectionTest.ts`
- `src/background/services/obsidianWriter.ts`

| Event                             | Params                                                                        | Class    | Runtime |
| --------------------------------- | ----------------------------------------------------------------------------- | -------- | ------- |
| `clip_started`                    | `operation_id`, `source`, `content_type`                                      | `future` | `true`  |
| `clip_prompt_opened`              | `operation_id`, `content_type`                                                | `future` | `true`  |
| `clip_prompt_submitted`           | `operation_id`, `content_type`                                                | `future` | `true`  |
| `clip_prompt_cancelled`           | `operation_id`, `content_type`                                                | `future` | `true`  |
| `extraction_completed`            | `operation_id`, `content_type`, `duration_bucket`, `attachment_count_bucket?` | `future` | `true`  |
| `background_stage_completed`      | `operation_id`, `stage`, `duration_bucket`                                    | `future` | `true`  |
| `clip_save_completed`             | `operation_id`, `storage_target`, `duration_bucket`                           | `future` | `true`  |
| `clip_save_failed`                | `operation_id`, `storage_target`, `failure_category`                          | `future` | `true`  |
| `ai_chat_detected`                | `platform`, `message_count_bucket`                                            | `future` | `true`  |
| `ai_chat_exported`                | `platform`, `message_count_bucket`, `duration_bucket`                         | `future` | `true`  |
| `connection_test_completed`       | `storage_target`, `outcome`, `duration_bucket`, `failure_category?`           | `future` | `true`  |
| `local_vault_permission_prompted` | `source`                                                                      | `future` | `true`  |
| `local_vault_permission_resolved` | `outcome`                                                                     | `future` | `true`  |
| `vault_write_completed`           | `storage_target`, `duration_bucket`                                           | `future` | `true`  |
| `vault_write_failed`              | `storage_target`, `failure_category`                                          | `future` | `true`  |

### Reader / Video

集成分支 emitter 入口：

- `src/content/reader/session.ts`
- `src/content/reader/sessionOperations.ts`
- `src/content/video/sessionOperations.ts`

| Event                       | Params                                              | Class    | Runtime |
| --------------------------- | --------------------------------------------------- | -------- | ------- |
| `reader_session_started`    | `source`                                            | `future` | `true`  |
| `reader_highlight_added`    | `selection_length_bucket`, `highlight_count_bucket` | `future` | `true`  |
| `reader_exported`           | `destination`, `duration_bucket`                    | `future` | `true`  |
| `reader_export_failed`      | `destination`, `failure_category`                   | `future` | `true`  |
| `reader_session_cancelled`  | `duration_bucket`                                   | `future` | `true`  |
| `video_session_started`     | `platform`, `source`                                | `future` | `true`  |
| `video_timestamp_added`     | `capture_count_bucket`                              | `future` | `true`  |
| `video_fragment_added`      | `capture_count_bucket`                              | `future` | `true`  |
| `video_screenshot_captured` | `screenshot_count_bucket`                           | `future` | `true`  |
| `video_capture_removed`     | `capture_count_bucket`                              | `future` | `true`  |
| `video_exported`            | `platform`, `destination`, `duration_bucket`        | `future` | `true`  |
| `video_export_failed`       | `platform`, `destination`, `failure_category`       | `future` | `true`  |
| `video_session_cancelled`   | `platform`, `duration_bucket`                       | `future` | `true`  |

## Catalog-only Rows

这些名字仍然在当前 telemetry source 中存在，但不能当作“当前生产 dashboard 的主统计事件”。

| Event                   | Params                      | Class            | Runtime | Current branch truth                                           |
| ----------------------- | --------------------------- | ---------------- | ------- | -------------------------------------------------------------- |
| `video_started`         | `source`                    | `contract-only`  | `true`  | 保留 contract / compatibility row；当前分支没有 active emitter |
| `extension_installed`   | `source`, `browser_family?` | `future`         | `true`  | catalog 预留行；当前分支没有 active emitter                    |
| `extension_usage`       | n/a                         | `inventory-only` | n/a     | 仅 inventory name；无 active catalog definition                |
| `extension_performance` | n/a                         | `inventory-only` | n/a     | 仅 inventory name；无 active catalog definition                |

另有一条 retired docs-only QR dislike row 被保留在 source 中用于历史分类，不应出现在任何 active 文档、setup 指南或 dashboard 中。

## Dashboard / QA 使用规则

- 只对 `Runtime=true` 且有当前 emitter 的事件建立正式 dashboard。
- `extension_error` 虽然 `Runtime=false`，仍是正式错误遥测事件；它通过错误 reporter 走 shared transport，不通过 runtime message path。
- `dev-only` 事件只用于本地 harness / debug proxy / owner DebugView 验证，不进入生产 KPI。
- `contract-only`、`inventory-only`、docs-only 行不得作为 owner dashboard 的主要维度来源。
- 任何需要精确时长的分析必须走 proxy / server logs；产品遥测本身只提供 bucket。

## 维护规则

- 新增、删除或重命名事件时，必须先更新 `eventCatalog.ts`，再更新本文档。
- 任何新增字段都必须先过 sanitizer，再进入 dashboard 文档。
- 如果 catalog classification 与 runtime reality 有意不完全一致，必须在本文档显式说明，不允许让下游 owner 从旧文档自行猜测。
