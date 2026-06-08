# Google Analytics Dashboard Setup

This guide is for owners operating the relay-backed telemetry pipeline.

## 1. Preconditions

- A GA4 property and web data stream already exist.
- The owner-controlled relay keeps the server-side `api_secret`.
- The extension release receives only public config: measurement ID, relay endpoint, and transport mode.
- Active event names and params come from [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md).

## 2. Active production events for dashboards

Use these event families for active owner dashboards:

- support prompt interaction events:
  - `support_link_clicked`
  - `support_like_clicked`
  - `support_dislike_clicked`
  - `support_review_link_clicked`
  - `support_review_acknowledged_clicked`
  - `support_dislike_reddit_clicked`
  - `support_github_feedback_clicked`
  - `support_like_toast_shown`
  - `support_dislike_toast_shown`
- usage reset event:
  - `clear_stats`
- i18n layout signal:
  - `i18n_text_overflow`
- error telemetry:
  - `extension_error`

Do not treat these as standard production dashboard inputs:

- `usage_dashboard_increment` (`contract-helper`)
- `runtime_harness_open` (`dev-only`)
- the retired video telemetry contract

## 3. Recommended custom dimensions

Create only the dimensions you actually plan to use. The most useful stable dimensions in the current contract are:

| Dimension         | Applies to                              |
| ----------------- | --------------------------------------- |
| `target`          | `support_link_clicked`                  |
| `variant`         | support prompt variant events           |
| `key`             | `i18n_text_overflow`                    |
| `language`        | `i18n_text_overflow`                    |
| `component`       | `i18n_text_overflow`, `extension_error` |
| `priority`        | `i18n_text_overflow`                    |
| `error_code`      | `extension_error`                       |
| `error_domain`    | `extension_error`                       |
| `error_category`  | `extension_error`                       |
| `error_severity`  | `extension_error`                       |
| `browser_name`    | `extension_error`                       |
| `browser_version` | `extension_error`                       |
| `extractor`       | `extension_error`                       |
| `feature`         | `extension_error`                       |
| `step`            | `extension_error`                       |
| `action`          | `extension_error`                       |
| `locale`          | `extension_error`                       |
| `domain`          | `extension_error`                       |
| `protocol`        | `extension_error`                       |

## 4. Recommended custom metrics

| Metric                 | Applies to                       |
| ---------------------- | -------------------------------- |
| `timestamp`            | `clear_stats`, `extension_error` |
| `length`               | `i18n_text_overflow`             |
| `limit`                | `i18n_text_overflow`             |
| `error_severity_level` | `extension_error`                |
| `statusCode`           | `extension_error`                |
| `retryCount`           | `extension_error`                |
| `timeout`              | `extension_error`                |
| `batchSize`            | `extension_error`                |
| `itemCount`            | `extension_error`                |
| `duration`             | `extension_error`                |
| `memoryUsage`          | `extension_error`                |
| `tabCount`             | `extension_error`                |

## 5. Suggested dashboards

### Support prompt health

- event counts by `variant`
- support link target split (`ko-fi` vs `afdian`)
- dislike follow-up clicks (`support_dislike_reddit_clicked`, `support_github_feedback_clicked`)

### I18n layout risk

- `i18n_text_overflow` count by `language`
- top overflowing `key` values
- overflow distribution by `component` and `priority`

### Error stability

- `extension_error` count by `error_code`
- `extension_error` count by `error_domain`
- severity trend using `error_severity` and `error_severity_level`
- version and browser breakdown using service-added `extension_version` plus browser dimensions

## 6. Debug acceptance workflow

1. Enable relay debug mode for the test request.
2. Trigger a known event through the extension.
3. Inspect the relay response body.
4. Treat `validationMessages: []` as accepted by GA validation.
5. Treat any non-empty validation message array as a release blocker until fixed.

A `2xx` response alone is not enough. The accepted signal is the relay-provided validation result.

## 7. Privacy and logging reminders

- The relay owns the server-side `api_secret`.
- Extension source and build output must stay secret-free.
- Production logs must not contain full event params or raw validation bodies.
- Keep dashboards focused on bounded enums and sanitized technical metadata, not user content.
