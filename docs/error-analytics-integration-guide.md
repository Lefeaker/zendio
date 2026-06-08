# Error Analytics Integration Guide

Use this guide when touching the existing error-reporting pipeline.

## 1. Integration rules

- Keep using the existing error handling pipeline. Do not add direct GA fetch logic in feature code.
- `extension_error` is the only active production error telemetry event.
- The shared reporter is a producer only; the background telemetry service is the single extension-owned send entry.
- Production telemetry uses the owner-controlled relay. The relay owns the server-side `api_secret`.
- Error telemetry requires the error-reporting consent bit only.

## 2. Current flow

```text
AppError -> sanitizeErrorForAnalytics -> GoogleAnalyticsReporter
        -> emitTelemetryEvent(extension_error)
        -> background telemetryService
        -> owner relay
        -> GA
```

The reporter no longer owns direct transport. That responsibility lives in the background telemetry service.

## 3. Producer contract

Required producer params for `extension_error`:

- `error_code`
- `error_domain`
- `error_category`
- `error_severity`
- `error_severity_level`
- `error_recoverable`
- `error_description`
- `timestamp`

Optional sanitized producer params may include:

- browser info
- extractor / feature / step / action labels
- HTTP method and bounded status/count fields
- locale / platform / theme / connection labels
- redacted `domain`, `protocol`, and stack labels

Service-added params:

- `extension_version`
- `engagement_time_msec`
- `session_id` when available
- `debug_mode` when debug is enabled

## 4. What not to send

Do not let producer code send:

- selected text
- markdown
- vault paths or local filesystem paths
- raw URLs with query strings
- tokens, passwords, or other secret material
- full validation bodies

## 5. Consent and config checks

Before expecting error telemetry to send, verify:

1. error-reporting consent is enabled
2. measurement ID is not the placeholder default
3. production transport mode is `relay`
4. a relay endpoint is configured

Usage analytics consent is not enough for `extension_error`.

## 6. Debug validation

- Run validation through the relay debug path.
- Treat `validationMessages: []` as the accepted signal.
- Treat non-empty validation messages as payload bugs.
- Do not treat a `2xx` response alone as sufficient proof.

## 7. Optional validation helper

The repo keeps a non-destructive setup helper for public config checks:

```bash
node scripts/setup-error-analytics.js \
  --measurement-id G-1234567890 \
  --relay-endpoint https://relay.example/collect \
  --transport-mode relay
```

The script checks only public relay-facing config guidance. It does not write tracked source files and does not request a secret.

## 8. Review checklist

- no new direct GA transport code outside the background telemetry service
- no extension-side secret placement
- no full event params in production logs
- docs still match [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md)
