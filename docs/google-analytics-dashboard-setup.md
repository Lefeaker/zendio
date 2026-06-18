# Google Analytics Dashboard Setup

最后更新：2026-06-18

本文说明如何基于当前 AiiinOB telemetry contract 建立 GA4 custom definitions、Explorations 与 owner dashboard。事件与字段真值以 [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md) 为准。

## 前置条件

- release build 已注入 public analytics config
- 生产 transport 使用 owner proxy
- 测试 profile 已显式开启 consent
- GA4 Event data retention 已按 owner policy 设置为 `14 months`，以支持 active-day retention、activation cohort 与 release regression 分析
- owner 本机已有 `.env.production.local`，且文件中只包含 public build config：`measurementId`、`transportMode`、`proxyEndpoint`
- 如需证明 live delivery、proxy 注入或真实 DebugView，可见性，owner 必须同时持有 proxy / GA property 访问权限；静态 docs contract 不提供这类 live 证据

## 交付分层

AiiinOB 仓库只保存 dashboard spec、分析口径、custom definitions 清单和 public-safe 验证流程。真实 GA4 property、dashboard / exploration 链接、Cloudflare account / Worker evidence、平台截图、retention 变更记录、deployment / rollback 记录和 incident evidence 必须保存在 owner private ops 资产中。

Public-safe 运维流程见 [`analytics-operations-runbook.md`](./analytics-operations-runbook.md)。

## Dashboard 设计硬规则

- 所有时长分析只使用 `duration_bucket`
- 不要求、不假设、不回填产品侧 `duration_ms`
- 不把原始正文、页面标题、原始 URL、vault path、file path、screenshot bytes、data URL、cache key 当作 dimension 或 metric
- 推荐 KPI 事件必须来自 `ga4-telemetry-reference.md` 中当前 active `emitted` / `error` rows
- runtime_harness_open 只能留在 dev-only 验证说明里，不能作为生产 KPI
- video_started 仍是 `contract-only` 行，不能作为 KPI 事件
- owner 若需要精确服务端耗时、proxy 注入证据或真实 GA delivery 证明，应查看 proxy / backend logs 与 GA property，不要把要求转嫁给扩展产品遥测

## 推荐自定义定义

GA4 definition quota 有上限。优先注册会被正式 dashboard 使用、且当前 schema 真实发出的字段。

### 推荐 event-scoped dimensions

| Parameter                           | 用途                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| `duration_bucket`                   | onboarding、clip、reader、video、connection、vault 时长分析 |
| `content_type`                      | clip / extraction 内容类型切片                              |
| `storage_target`                    | 下载、本地目录、REST API 的成败分析                         |
| `failure_category`                  | extraction / save / export / error 失败原因切片             |
| `platform`                          | AI chat / video 平台切片                                    |
| `destination`                       | reader / video 导出目标                                     |
| `source`                            | 入口来源切片                                                |
| `stage`                             | background stage 分布                                       |
| `step`                              | onboarding 漏斗                                             |
| `action`                            | onboarding support action、options action 分析              |
| `outcome`                           | draft restore / save / export / connection 成败切片         |
| `field`                             | consent 变更字段                                            |
| `enabled`                           | consent / feature toggle 开关状态                           |
| `section`                           | options section / action 切片                               |
| `theme`                             | options theme change 分析                                   |
| `language`                          | options language 与 i18n overflow 分析                      |
| `feature_key`                       | 实验开关使用频率                                            |
| `analytics_payload_present`         | config import 是否包含 analytics payload                    |
| `category`                          | usage dashboard 分类                                        |
| `variant`                           | support prompt / review toast 分析                          |
| `target`                            | support link 出口切片                                       |
| `message_count_bucket`              | AI chat 消息量 bucket                                       |
| `attachment_count_bucket`           | clip 附件量 / export shape bucket                           |
| `selection_length_bucket`           | reader 高亮长度 bucket                                      |
| `highlight_count_bucket`            | reader 高亮数 / export shape bucket                         |
| `detached_highlight_count_bucket`   | reader draft restore 的 detached highlight 量级             |
| `capture_count_bucket`              | video capture 量级 / export shape bucket                    |
| `screenshot_count_bucket`           | video screenshot 请求量级 / export shape bucket             |
| `stale_screenshot_ref_count_bucket` | video draft restore stale screenshot ref 量级               |
| `day_index_bucket`                  | active-day retention 分布                                   |
| `milestone`                         | activation milestone 漏斗                                   |
| `browser_family`                    | 安装来源浏览器族分布                                        |
| `error_domain`                      | 错误域趋势                                                  |
| `error_category`                    | 错误类别趋势                                                |
| `error_severity`                    | 错误严重度趋势                                              |
| `error_recoverable`                 | 错误可恢复性分析                                            |
| `browser_name`                      | 错误侧浏览器分布                                            |
| `browser_version`                   | 错误侧浏览器版本切片                                        |
| `extension_version`                 | release regression / rollout 对比                           |

### 推荐 event-scoped metrics

| Parameter     | 用途                       |
| ------------- | -------------------------- |
| `increment`   | usage dashboard 增量求和   |
| `total_after` | usage dashboard 累计值参考 |
| `length`      | i18n overflow 实际长度分析 |
| `limit`       | i18n overflow 预算上限分析 |

## Recommended Explorations

### 1. Activation funnel

核心事件：

- `extension_installed`
- `onboarding_started`
- `onboarding_step_completed`
- `onboarding_completed`
- `activation_milestone_completed`

推荐 breakdown：

- `browser_family`
- `step`
- `milestone`
- `extension_version`

读法：

- 以 `extension_installed` 作为入口，追踪安装后是否进入 onboarding
- 对 `activation_milestone_completed` 单独看 `first_clip_saved`、`first_reader_exported`、`first_video_exported`
- `browser_family` 只来自 `extension_installed`，不要期待它出现在其他事件上

### 2. Active-day retention

核心事件：

- `extension_active_day`

推荐 breakdown：

- `day_index_bucket`
- `extension_version`

读法：

- `day_0` 是安装 / 激活当天
- `day_1`、`day_2_to_6`、`day_7_to_29`、`day_30_plus` 适合做 retained activity cohort
- 该 retention 事件的正式事件名就是 `extension_active_day`

### 3. Clip extraction success / failure

核心事件：

- `clip_started`
- `extraction_completed`
- `extraction_failed`
- `clip_save_completed`
- `clip_save_failed`

推荐 breakdown：

- `content_type`
- `failure_category`
- `attachment_count_bucket`
- `storage_target`
- `duration_bucket`

读法：

- 用 `clip_started -> extraction_completed/extraction_failed -> clip_save_completed/clip_save_failed` 看漏斗
- `extraction_failed.failure_category` 用于区分 extraction / timeout / validation 等失败族
- `attachment_count_bucket` 用于观察 export shape，而不是保存附件明细

### 4. Reader export and draft recovery

核心事件：

- `reader_session_started`
- `reader_draft_restored`
- `reader_highlight_added`
- `reader_exported`
- `reader_export_failed`
- `reader_session_cancelled`

推荐 breakdown：

- `outcome`
- `highlight_count_bucket`
- `detached_highlight_count_bucket`
- `destination`
- `failure_category`
- `duration_bucket`

读法：

- `reader_draft_restored` 用于衡量恢复成功/失败与 detached highlight 规模
- `reader_exported.highlight_count_bucket` 用于导出 shape 分布
- `reader_export_failed.failure_category` 用于定位 destination 相关摩擦

### 5. Video screenshot adoption and draft recovery

核心事件：

- `video_session_started`
- `video_draft_restored`
- `video_screenshot_captured`
- `video_timestamp_added`
- `video_fragment_added`
- `video_capture_removed`

推荐 breakdown：

- `capture_count_bucket`
- `screenshot_count_bucket`
- `stale_screenshot_ref_count_bucket`
- `outcome`
- `duration_bucket`

读法：

- `video_screenshot_captured` 现在是 active emitted 事件，可以进入正式 KPI
- `video_draft_restored` 用于观察恢复成功率与 stale screenshot ref 分布
- `capture_count_bucket` 与 `screenshot_count_bucket` 共同描述 session shape

### 6. Export shape distribution

核心事件：

- `clip_save_completed`
- `reader_exported`
- `video_exported`

推荐 breakdown：

- `attachment_count_bucket`
- `highlight_count_bucket`
- `capture_count_bucket`
- `screenshot_count_bucket`
- `destination`
- `platform`

读法：

- `clip_save_completed.attachment_count_bucket` 用于 clip 附件规模
- `reader_exported.highlight_count_bucket` 用于 reader 导出规模
- `video_exported.capture_count_bucket` / `video_exported.screenshot_count_bucket` 用于 video 导出形状

### 7. Browser-family breakdown

核心事件：

- `extension_installed`

推荐 breakdown：

- `browser_family`
- `extension_version`

读法：

- `browser_family` 是安装事件的 bounded context 字段
- 不要在 clip / reader / video 事件上补建浏览器族维度

### 8. Connection / Local Vault friction

核心事件：

- `connection_test_completed`
- `local_vault_permission_prompted`
- `local_vault_permission_resolved`
- `vault_write_failed`

推荐 breakdown：

- `storage_target`
- `failure_category`
- `outcome`
- `source`

### 9. Error trends

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

- 先运行：

```bash
node scripts/run-ga-owner-smoke.mjs --mode directDebug --event runtime_harness_open
```

- 打开 consent
- 触发一个 activation / options 事件、一个 clip 事件、一个 error 事件
- 确认请求只发往 owner debug proxy
- 确认 debug proxy 服务端注入 `api_secret` 后，DebugView 中看到事件名与自定义字段

本地 harness command 只证明 request shape、validation intent 与 proxy-only 路径；它本身不证明真实 property delivery 或 DebugView 可见性。

### Proxy log validation

生产与 staging 以 proxy log 为主：

- 可先运行：

```bash
node scripts/run-ga-owner-smoke.mjs --mode proxy --event runtime_harness_open
```

- 确认请求打到 owner proxy，而不是由扩展 / 客户端直接请求 Google endpoint
- 确认 event name、response code、version、transport mode 正常
- 确认 payload 中没有正文、路径、token、secret

### No-consent smoke check

- 关闭 `analytics` 与 `errorReporting`
- 复做一次 options / clip / reader / video 操作
- 确认没有新 proxy log / debug proxy / DebugView 事件

真实 GA property 的 DebugView 可见性、proxy 端 `api_secret` 注入、Chrome Web Store publish credential，以及真实 Obsidian vault / proxy credential 联调仍属于 owner-only residual checks；这类 live 证明必须依赖 owner 的 `.env.production.local` 与 proxy / GA property access。

## 建议的 owner dashboard 页面

### Page 1: Activation / Retention

- activation funnel
- active-day retention
- browser-family install split

### Page 2: Clip / Export Shapes

- clip extraction success / failure
- clip / reader / video export shape distribution
- save success by storage target

### Page 3: Reader / Video Recovery

- reader draft recovery + export outcomes
- video screenshot adoption
- video draft recovery + stale screenshot ref split

### Page 4: Reliability

- `extension_error` trend
- connection / local vault friction
- release version regression watch

## 不要做的事情

- 不要把 video_started 或其他 non-active catalog rows 当作正式 KPI
- 不要要求原始 `duration_ms`
- 不要在 dashboard 说明里要求 owner 把服务端 credential 放进扩展、tracked config、build output 或 package archive
