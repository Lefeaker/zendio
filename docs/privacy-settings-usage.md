# Privacy Settings Usage

This page explains how the current telemetry consent toggles behave.

## 1. Consent model

| Toggle          | Consent bit      | Event family                                               |
| --------------- | ---------------- | ---------------------------------------------------------- |
| Usage analytics | `analytics`      | support prompt events, `clear_stats`, `i18n_text_overflow` |
| Error reporting | `errorReporting` | `extension_error`                                          |

Important rules:

- Turning on usage analytics does not enable error telemetry.
- Turning on error reporting does not enable usage telemetry.
- Turning both toggles off stops active production telemetry from the extension.

## 2. Current active usage events

Usage analytics consent covers these active production events:

- `support_link_clicked`
- `support_like_clicked`
- `support_dislike_clicked`
- `support_review_link_clicked`
- `support_review_acknowledged_clicked`
- `support_dislike_reddit_clicked`
- `support_github_feedback_clicked`
- `support_like_toast_shown`
- `support_dislike_toast_shown`
- `clear_stats`
- `i18n_text_overflow`

Additional catalog notes:

- `usage_dashboard_increment` is a `contract-helper` and should not be treated as a normal production reporting promise.
- `runtime_harness_open` is `dev-only`.
- the retired video telemetry contract is rejected at the runtime boundary.

## 3. What error reporting collects

Error reporting consent allows only `extension_error`, which carries sanitized technical metadata such as:

- standardized error code and error domain
- severity and recoverability
- extension version and timestamp
- bounded browser / platform / locale / count fields
- redacted domain, protocol, and stack labels when available

It does not authorize raw user content, markdown, full URLs, vault paths, or secrets.

## 4. Transport and privacy notes

- Production telemetry uses an owner-controlled relay.
- Extension source and build output never contain a GA `api_secret`.
- The tracked analytics config is non-sensitive and disabled by default.
- Production logs must not include full event params.

## 5. Debug validation

If owners validate telemetry in debug mode:

- the relay should return `validationMessages`
- `validationMessages: []` means the debug payload was accepted
- a `2xx` response alone is not enough to prove correctness

## 6. User guidance

Recommended user-facing expectations:

- enable usage analytics only if you want anonymous product interaction telemetry
- enable error reporting only if you want sanitized technical error telemetry
- review the privacy policy for the list of collected and non-collected data classes

## 7. Related docs

- [Privacy Policy](./privacy-policy.md)
- [GA4 / Telemetry Contract Reference](./ga4-telemetry-reference.md)
- [Analytics Configuration Guide](./analytics-configuration-guide.md)
