# GA4 / Telemetry Contract Reference

> Last updated: 2026-06-09
> Status: active source of truth for extension-side telemetry names, consent, and params

This document reflects the final proxy-first telemetry contract implemented by:

- `src/shared/analytics/eventCatalog.ts`
- `src/shared/types/analytics.ts`
- `src/background/services/telemetryService.ts`
- `src/shared/errors/analytics/googleAnalyticsReporter.ts`

## 1. Transport rules

- Production telemetry uses one background-owned send entry and an owner-controlled relay.
- Extension source and build output must never contain a GA `api_secret`.
- The tracked analytics config is non-sensitive and disabled by default. Public config is limited to measurement ID, transport mode, relay endpoint, consent, and client/session identifiers.
- Production transport is `relay`. `directDebug` is a dev-only mode and is valid only when `debugMode=true`.
- The telemetry service appends `extension_version`, `engagement_time_msec`, `session_id` when available, and `debug_mode` when debug is enabled.
- Production logs must not print full event params. The current service logs only stable summaries such as `eventName`, `transportMode`, `statusCode`, `validationMessageCount`, and skip reasons.

## 2. Consent rules

- Usage telemetry requires usage analytics consent.
- Error telemetry requires error-reporting consent.
- Turning on one consent does not authorize the other event family.
- The runtime config may become `enabled` when either consent bit is present, but each event still checks its own consent kind before transport.

## 3. Debug validation rules

- Relay debug responses may include `validationMessages`.
- `validationMessages: []` means the debug payload was accepted by GA validation.
- A relay `2xx` or GA collect `2xx` alone is not proof that the payload is valid.
- Non-empty validation messages must be treated as validation failures and fixed before rollout.

## 4. Production event catalog

All events below are active production telemetry unless noted otherwise.

| Event                                 | Consent          | Producer params                                                                | Notes                                                  |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `support_link_clicked`                | `analytics`      | `target`                                                                       | Stable enum only: `ko-fi` or `afdian`.                 |
| `support_like_clicked`                | `analytics`      | `variant`                                                                      | `first`, `returning`, or `acknowledged`.               |
| `support_dislike_clicked`             | `analytics`      | none                                                                           | Click signal only.                                     |
| `support_review_link_clicked`         | `analytics`      | `variant?`                                                                     | Optional support toast variant.                        |
| `support_review_acknowledged_clicked` | `analytics`      | `variant?`                                                                     | Optional support toast variant.                        |
| `support_dislike_reddit_clicked`      | `analytics`      | none                                                                           | No raw URL payloads.                                   |
| `support_github_feedback_clicked`     | `analytics`      | none                                                                           | No raw URL payloads.                                   |
| `support_like_toast_shown`            | `analytics`      | `variant`                                                                      | Support toast presentation only.                       |
| `support_dislike_toast_shown`         | `analytics`      | none                                                                           | Toast presentation only.                               |
| `clear_stats`                         | `analytics`      | `timestamp`                                                                    | Non-negative client timestamp for the reset action.    |
| `i18n_text_overflow`                  | `analytics`      | `key`, `language`, `length`, `used_short`, `component?`, `priority?`, `limit?` | Safe i18n identifiers and bounded layout metrics only. |
| `extension_error`                     | `errorReporting` | see below                                                                      | Sanitized technical error metadata only.               |

### `extension_error` producer contract

Required producer params:

- `error_code`
- `error_domain`
- `error_category`
- `error_severity`
- `error_severity_level`
- `error_recoverable`
- `error_description`
- `timestamp`

Optional sanitized producer params:

- `browser_name`
- `browser_version`
- `extractor`
- `type`
- `method`
- `statusCode`
- `feature`
- `step`
- `component`
- `action`
- `retryCount`
- `timeout`
- `batchSize`
- `itemCount`
- `duration`
- `memoryUsage`
- `cacheHit`
- `apiVersion`
- `userAgent`
- `platform`
- `locale`
- `theme`
- `screenResolution`
- `viewportSize`
- `connectionType`
- `isOnline`
- `tabCount`
- `extensionContext`
- `domain`
- `protocol`
- `stackTrace`

Service-added params:

- `extension_version`
- `engagement_time_msec`
- `session_id` when available
- `debug_mode` when debug is enabled

The shared reporter sanitizes context before emitting `extension_error`. It does not own the network request path.

## 5. Non-production catalog entries

These names exist in the final catalog for audit or compatibility reasons, but they are not normal active production telemetry.

| Event                       | Scope             | Current meaning                                                                            |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `usage_dashboard_increment` | `contract-helper` | Typed helper contract only. Do not document it as standard production dashboard telemetry. |
| `runtime_harness_open`      | `dev-only`        | Harness-only signal from runtime observability tooling.                                    |

Removed or absent names:

- The legacy QR feedback event is no longer part of the active telemetry contract.
- The retired video telemetry contract remains blocked at the runtime boundary and is intentionally omitted from active event lists.

## 6. Runtime boundary notes

- Canonical runtime telemetry messages use `TRACK_TELEMETRY_EVENT`.
- The background runtime boundary still accepts legacy usage messages with `TRACK_USAGE_EVENT` and legacy `track` for current allowlisted usage events.
- `extension_error` is accepted only through canonical telemetry messages, not through the legacy usage path.

## 7. Documentation maintenance rules

- Add or update events from `eventCatalog.ts`, not from stale docs.
- Do not document direct production GA calls from extension code.
- Do not tell owners or developers to place a GA `api_secret` in extension source, build output, or tracked config.
- If a future event changes scope, sync this file and `docs/source-of-truth-index.md` in the same commit.
