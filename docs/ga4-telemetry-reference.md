# GA4 事件采集参考

> 最后更新：2025-02-15  
> 维护人：AiiinOB 团队

本文汇总扩展当前会发送到 Google Analytics 4 (GA4) 的所有事件、字段、含义和触发条件，方便 QA、运营和数据分析使用。

## 1. 数据发送前置条件

- **用户同意**：需要在隐私/分析设置中同时勾选「使用数据分析」与「错误上报」后，AnalyticsConfig 才会启用上报；否则任何事件都会被跳过。参见 `src/shared/errors/analytics/analyticsConfig.ts:174`。
- **客户端信息**：后台会自动生成 `client_id`、`session_id` 并附带扩展版本、调试模式等信息，事件载荷中都会包含 `extension_version`、`session_id`（若可用）、`engagement_time_msec` 等公共字段。
- **调试模式**：在开发环境或手动开启 `debugMode` 时，事件会发往 `https://www.google-analytics.com/debug/mp/collect` 并在控制台输出调试信息。

## 2. 事件总览

| 事件名称 | 分类 | 触发入口 | 主要参数 |
| --- | --- | --- | --- |
| `extension_error` | 错误监控 | 所有调用 `handleError` 的模块 | 错误编码、域、严重度、可恢复性、上下文、浏览器信息等 |
| `usage_dashboard_increment` | 功能使用 | 选项页「使用统计看板」数据刷新且出现增量时 | 功能分类、增量值、更新后的累计值 |
| `support_like_clicked` 等 7 个事件 | 评价引导 | 支持弹窗的按钮点击或 Toast 展示 | `variant`（视上下文存在） |
| `i18n_text_overflow` | 多语言适配 | `logTextOverflowEvent` 判定文本溢出时 | 文案键名、语言、组件、预算信息、页面路径 |

以下章节对每类事件详述。

## 3. 错误监控事件 `extension_error`

- **触发条件**  
  - 任意模块调用 `handleError`，且用户已同意收集错误。  
  - 错误会经过 `sanitizeErrorForAnalytics` 清洗敏感信息后，由 `GoogleAnalyticsReporter.report` 发送。
- **公共参数**（均在 `params` 内）：  
  - `error_code`：统一错误码（如 `EXTRACTION_CONTENT_NO_MARKDOWN`）。  
  - `error_domain`：错误域（`extraction` / `rest` / `content` 等）。  
  - `error_category`：按错误码解析得到的大类，例如 `transport`。  
  - `error_severity` / `error_severity_level`：严重度枚举及级别数值。  
  - `error_recoverable`：是否可恢复。  
  - `error_description`：来自标准化错误描述表的简要说明。  
  - `timestamp`：上报时间戳（毫秒）。  
  - `extension_version`：`manifest.json` 中的版本号。  
  - `browser_name` / `browser_version`：运行时浏览器类别及主版本。  
  - `session_id`：本次扩展会话 ID。
- **可选上下文字段**  
  - `extractor`、`type`、`method`、`component`、`feature`、`action` 等内部调试信息。  
  - `retryCount`、`duration`、`statusCode`、`itemCount` 等运行指标。  
  - `domain`、`protocol`：从出错 URL 中提取的域名及协议。  
  - `stackTrace`：裁剪后的堆栈（仅函数名 + 行号）。  
  - 所有上下文键都会在 `dataSanitizer` 中过滤敏感内容。
- **代码来源**  
  - `src/shared/errors/analytics/googleAnalyticsReporter.ts:66`  
  - `src/shared/errors/analytics/dataSanitizer.ts`

## 4. 使用统计增量 `usage_dashboard_increment`

- **触发条件**  
  - 选项页加载或监听到 `USAGE_STATS_STORAGE_KEY` 变化时，`initializeUsageDashboard` 会刷新数据。  
  - 若任意类别的累计次数较上一次上报有正向增量，则通过后台消息发送事件。
- **参数**  
  - `category`：枚举值，`ai_chat` / `fragment` / `article`。  
  - `increment`：本次新增次数。  
  - `total_after`：增量应用后的累计次数。  
  - 后台会追加 `extension_version`、`session_id`、`engagement_time_msec=1` 以及 `debug_mode`（若开启）。
- **去重规则**  
  - `UsageDashboard` 会缓存上一份快照，只有增量为正时才发事件，避免把累计值重复计入 GA4。  
  - 看板卸载时会清空快照，防止页面重载时产生伪增量。
- **代码来源**  
  - `src/options/components/usageDashboard.ts:195`  
  - `src/background/services/analyticsEvents.ts:46`

## 5. 支持弹窗交互事件

这类事件均来自内容脚本 `SupportPrompt`，通过运行时消息发送。

| 事件名 | 触发场景 | 额外参数 |
| --- | --- | --- |
| `support_like_clicked` | 用户点击「喜欢」按钮 | `variant`：`first` / `returning` / `acknowledged` |
| `support_dislike_clicked` | 用户点击「不喜欢」按钮 | 无 |
| `support_like_toast_shown` | 「喜欢」Toast 展示 | `variant` 同上 |
| `support_dislike_toast_shown` | 「不喜欢」Toast 展示 | 无 |
| `support_dislike_reddit_clicked` | Toast 中点击 Reddit 链接 | 无 |
| `support_dislike_qr_clicked` | Toast 中点击「二维码」按钮 | 无 |
| `support_review_link_clicked` | Toast 中点击商店评价链接 | `variant`：触发时的 Toast 状态 |
| `support_review_acknowledged_clicked` | 用户确认已评价 | `variant` 同上 |

- **后端附加字段**：同样由 `trackUsageEvent` 管道追加 `extension_version`、`session_id`、`engagement_time_msec`，有调试模式时还会包含 `debug_mode=true`。
- **代码来源**  
  - `src/content/ui/supportPrompt.ts:501` 起  
  - `src/background/listeners/runtimeMessages.ts:69`

## 6. 多语言文本溢出事件 `i18n_text_overflow`

- **触发条件**  
  - `logTextOverflowEvent` 检测到适配后文本仍然超出预算，且同一元素 + 语言组合尚未上报过（WeakMap 去重）。  
  - 该函数通常由布局/文案预算调试逻辑调用。
- **参数**  
  - `key`：i18n 键名（或 `data-buget-key` 标识）。  
  - `language`：当前语言代码。  
  - `component` / `priority`：若元素声明了 `data-component` / `data-priority`，会带上。  
  - `length` / `limit`：文本实际长度与预算上限。  
  - `used_short`：是否采用了短文案。  
  - `page`：窗口 `location.pathname`。  
  - 同样包含公共字段 `extension_version`、`session_id` 等。
- **代码来源**  
  - `src/shared/i18n/overflowLogger.ts`

## 7. BigQuery / 报表使用建议

- 在 GA4 的 **配置 → 自定义定义** 中注册上述参数，方便在探索报表中使用。  
- 若需要跨事件做聚合，可以启用 BigQuery 导出：  
  - `usage_dashboard_increment` 的 `increment` 字段求和即可得到全量使用次数。  
  - `extension_error` 可按 `error_domain`、`error_severity` 切片分析。  
- Debug 时可打开 GA4 **实时 / DebugView** 监控事件流，也可以在 DevTools 网络面板搜索 `mp/collect` 请求验证载荷。

## 8. 后续维护注意事项

- 新增事件时请复用 `trackUsageEvent` 或 `handleError` 管道，并更新本文档。  
- 确认参数类型均为 `string` / `number` / `boolean`（符合 `TrackUsageEventPayload` 限制）。  
- 若事件依赖用户同意，请在 UI 中明确提示并尊重存储的隐私设置。

如有疑问或需要新增指标，请在代码库中创建 issue，并同步更新本文档。

