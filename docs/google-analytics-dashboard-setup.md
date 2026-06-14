# Google Analytics Dashboard Setup

最后更新：2026-06-14

本文说明如何基于当前 AiiinOB telemetry contract 建立 GA4 自定义定义、Exploration 与 owner dashboard。

## 前置条件

- release build 已注入 public analytics config
- 生产 transport 使用 owner proxy
- 测试 profile 已显式开启 consent
- 事件与字段真值以 [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md) 为准

## Dashboard 设计硬规则

- 所有时长分析只使用 `duration_bucket`
- 不要求、不假设、不回填产品侧 `duration_ms`
- 不把原始正文、原始 URL、vault path、file path、screenshot bytes 作为 dimension
  或 metric
- `dev-only`、contract-only、inventory-only、docs-only 行不进入生产 KPI
- 推荐事件必须来自 `ga4-telemetry-reference.md` 中当前 active emitted / error
  rows；`runtime_harness_open`、`video_started`、`video_screenshot_captured` 只能留在
  dev-only / contract-only / future 说明里，不能作为 KPI 事件
- owner 若需要精确服务端耗时，应查看 proxy / backend logs，不要把要求转嫁给扩展产品遥测

## 推荐自定义定义

GA4 definition quota 有上限。先注册会被正式 dashboard 使用的字段。

### 推荐 event-scoped dimensions

| Parameter                   | 用途                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `duration_bucket`           | onboarding、clip、reader、video、connection、vault 时长分析 |
| `content_type`              | clip / extraction 内容类型切片                              |
| `storage_target`            | 下载、本地目录、REST API 的成败分析                         |
| `failure_category`          | 失败原因切片                                                |
| `platform`                  | AI chat / video 平台切片                                    |
| `destination`               | reader / video 导出目标                                     |
| `source`                    | 入口来源切片                                                |
| `step`                      | onboarding 漏斗                                             |
| `action`                    | onboarding support action、options action 分析              |
| `outcome`                   | save / export / connection / cleanup 成败切片               |
| `field`                     | consent 变更字段                                            |
| `enabled`                   | consent / feature toggle 开关状态                           |
| `section`                   | options section / action 切片                               |
| `theme`                     | options theme change 分析                                   |
| `language`                  | options language 与 i18n overflow 分析                      |
| `feature_key`               | 实验开关使用频率                                            |
| `analytics_payload_present` | config import 是否包含 analytics payload                    |
| `category`                  | usage dashboard 分类                                        |
| `variant`                   | support prompt / review toast 分析                          |
| `target`                    | support link 出口切片                                       |
| `message_count_bucket`      | AI chat 消息量 bucket                                       |
| `attachment_count_bucket`   | clip 附件量 bucket                                          |
| `capture_count_bucket`      | video capture 量级                                          |
| `selection_length_bucket`   | reader 高亮长度 bucket                                      |
| `highlight_count_bucket`    | reader 高亮数 bucket                                        |
| `error_domain`              | 错误域趋势                                                  |
| `error_category`            | 错误类别趋势                                                |
| `error_severity`            | 错误严重度趋势                                              |
| `error_recoverable`         | 错误可恢复性分析                                            |
| `browser_name`              | 浏览器分布                                                  |
| `browser_version`           | 主版本切片                                                  |
| `extension_version`         | release regression / rollout 对比                           |

### 推荐 event-scoped metrics

| Parameter     | 用途                       |
| ------------- | -------------------------- |
| `increment`   | usage dashboard 增量求和   |
| `total_after` | usage dashboard 累计值参考 |
| `length`      | i18n overflow 实际长度分析 |
| `limit`       | i18n overflow 预算上限分析 |

## Recommended Explorations

### 1. Onboarding funnel

事件集：

- `onboarding_started`
- `onboarding_step_completed`
- `onboarding_skipped`
- `onboarding_completed`

推荐 breakdown：

- `step`
- `duration_bucket`
- `extension_version`

读法：

- 用 `onboarding_started` 作为 funnel 起点
- 比较 `welcome` -> `vault` -> `privacy` -> `shortcut` -> `finish`
- 对 `onboarding_skipped` 单独做 drop-off 视图

### 2. First successful save funnel

主漏斗事件：

- `clip_started`
- `extraction_completed`
- `clip_save_completed`

推荐 breakdown：

- `content_type`
- `storage_target`
- `duration_bucket`

补充失败视图：

- `clip_save_failed`
- `failure_category`

### 3. Feature frequency by content type

推荐事件：

- `clip_started`
- `clip_prompt_opened`
- `clip_prompt_submitted`
- `clip_prompt_cancelled`
- `ai_chat_detected`
- `ai_chat_exported`

推荐 breakdown：

- `content_type`
- `platform`
- `source`

### 4. Save outcome by storage target

推荐事件：

- `clip_save_completed`
- `clip_save_failed`
- `vault_write_completed`
- `vault_write_failed`
- `connection_test_completed`

推荐 breakdown：

- `storage_target`
- `failure_category`
- `duration_bucket`

### 5. Duration bucket exploration

推荐事件：

- `onboarding_step_completed`
- `onboarding_completed`
- `extraction_completed`
- `background_stage_completed`
- `clip_save_completed`
- `connection_test_completed`
- `vault_write_completed`
- `reader_exported`
- `reader_session_cancelled`
- `video_exported`
- `video_session_cancelled`

推荐 breakdown：

- `duration_bucket`
- `content_type`
- `storage_target`
- `platform`

严格说明：

- 这里的所有时长图都以 `duration_bucket` 为准
- 不要建立依赖原始 `duration_ms` 的生产报表

### 6. Reader / Video usage

Reader 事件：

- `reader_session_started`
- `reader_highlight_added`
- `reader_exported`
- `reader_export_failed`
- `reader_session_cancelled`

Video 事件：

- `video_session_started`
- `video_timestamp_added`
- `video_fragment_added`
- `video_capture_removed`
- `video_exported`
- `video_export_failed`
- `video_session_cancelled`

推荐 breakdown：

- `destination`
- `platform`
- `capture_count_bucket`
- `selection_length_bucket`
- `highlight_count_bucket`
- `duration_bucket`

当前不进入生产 KPI 的 video contract rows 仍包括 `video_started` 与
`video_screenshot_captured`。它们在 schema / proxy contract 中仍保留为
contract-only / future catalog rows；最终 active status 由 P09 收口之前不得放进
正式 dashboard。

### 7. Connection / Local Vault friction

推荐事件：

- `connection_test_completed`
- `local_vault_permission_prompted`
- `local_vault_permission_resolved`
- `vault_write_failed`

推荐 breakdown：

- `storage_target`
- `failure_category`
- `outcome`
- `source`

推荐问题：

- 哪个 target 的测试失败最多
- local folder permission prompt 的完成率如何
- 哪些失败主要来自 permission / connection / write

### 8. Error trends

核心事件：

- `extension_error`

推荐 breakdown：

- `error_domain`
- `error_category`
- `error_severity`
- `error_recoverable`
- `browser_name`
- `browser_version`
- `extension_version`

建议固定图表：

- 按日 error count
- 按版本 error count
- 按 domain / severity 堆叠图
- recoverable vs non-recoverable 比例

## Validation

### DebugView validation

仅本地使用 `directDebug`，并配置 owner debug proxy endpoint：

- 打开 consent
- 触发一个 options 事件、一个 clip 事件、一个错误事件
- 确认请求只发往 owner debug proxy
- 确认 debug proxy 服务端注入 `api_secret` 后，DebugView 中看到事件名与自定义字段

### Proxy log validation

生产与 staging 以 proxy log 为主：

- 确认请求打到 owner proxy，而不是由扩展 / 客户端直接请求 Google endpoint
- 确认 event name、response code、version、transport mode 正常
- 确认 payload 中没有正文、路径、token、secret

### No-consent smoke check

- 关闭 `analytics` 与 `errorReporting`
- 复做一次 options / clip / reader / video 操作
- 确认没有新 proxy log / debug proxy / DebugView 事件

真实 GA4 property 的 DebugView 可见性、proxy 端 `api_secret` 注入、Chrome Web Store publish credential，以及真实 Obsidian vault / proxy credential 联调仍属于 owner-only residual checks；执行边界见 [`analytics-configuration-guide.md`](./analytics-configuration-guide.md)。

## 建议的 owner dashboard 页面

### Page 1: Activation / Setup

- onboarding funnel
- options opened / section viewed
- consent change trend

### Page 2: Save / Export

- first successful save funnel
- save success by storage target
- save failure by failure category
- AI chat export trend

### Page 3: Reader / Video

- reader sessions and exports
- video sessions and exports
- duration bucket distributions

### Page 4: Reliability

- `extension_error` trend
- browser / version breakdown
- connection / local vault friction

## 不要做的事情

- 不要把 catalog-only / historical rows当作正式 KPI
- 不要要求原始 `duration_ms`
- 不要在 dashboard 说明里要求 owner 把服务端 credential 放进扩展
