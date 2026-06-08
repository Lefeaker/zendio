# Error Analytics System Overview

`extension_error` is the only active production error telemetry event in the current contract.

## 1. System goal

The current telemetry design keeps one production error pipeline:

1. application code creates or normalizes an `AppError`
2. the shared error reporter sanitizes the error context
3. the reporter emits an `extension_error` producer payload
4. the background telemetry service validates consent and params
5. the background service sends the payload to the owner-controlled relay
6. the relay may forward the payload to GA with its server-side `api_secret`

The shared reporter does not own the network request path.

## 2. Component responsibilities

### Shared error reporter

`src/shared/errors/analytics/googleAnalyticsReporter.ts`:

- converts sanitized errors into `extension_error` params
- emits only bounded technical metadata
- never constructs production GA collect URLs
- logs only a minimal debug summary when debug mode is enabled

### Background telemetry service

`src/background/services/telemetryService.ts`:

- is the single extension-owned network send entry
- checks event scope, allowed params, and required params
- enforces event-level consent
- adds service-owned params such as `extension_version`
- sends relay requests in production
- records summary logs without printing full event params

### Owner-controlled relay

The relay:

- owns the server-side `api_secret`
- accepts public extension payloads
- may run debug validation and return `validationMessages`
- is the only place where server-side GA secret handling belongs

## 3. Consent model

- Usage analytics consent does not authorize error telemetry.
- Error-reporting consent does not authorize usage telemetry.
- `extension_error` requires the error-reporting consent bit.

The runtime config may be enabled when either consent exists, but transport still checks the specific consent kind per event.

## 4. Sanitized error metadata

The current `extension_error` contract allows:

- required core error fields:
  - `error_code`
  - `error_domain`
  - `error_category`
  - `error_severity`
  - `error_severity_level`
  - `error_recoverable`
  - `error_description`
  - `timestamp`
- optional sanitized technical context such as browser info, extractor, method, bounded counts, locale, domain, protocol, and redacted stack labels

The contract does not allow raw user content such as:

- page text
- markdown
- vault or file paths
- full URLs with query strings
- tokens, secrets, or passwords

## 5. Logging rules

Current production-safe logging is summary-only:

- telemetry service logs stable skip reasons and request summaries
- debug validation logs only `validationMessageCount`, not raw validation bodies
- the shared reporter logs only short code/domain/severity summaries

Production logs must not include full event params.

## 6. Debug validation

- Debug validation must come from the relay response.
- `validationMessages: []` means the debug payload passed GA validation.
- A `2xx` response without validation detail is not enough to prove correctness.

## 7. Related docs

- [GA4 / Telemetry Contract Reference](./ga4-telemetry-reference.md)
- [Analytics Configuration Guide](./analytics-configuration-guide.md)
- [Error Analytics Integration Guide](./error-analytics-integration-guide.md)
- [Google Analytics Dashboard Setup](./google-analytics-dashboard-setup.md)
