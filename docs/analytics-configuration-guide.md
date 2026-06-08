# Analytics Configuration Guide

This guide covers the public extension-side telemetry configuration. It does not cover relay implementation details.

## 1. Production contract

- Production telemetry is relay-first.
- The extension only needs public config: measurement ID, relay endpoint, transport mode, consent, and client/session identifiers.
- The owner-controlled relay keeps the GA `api_secret` on the server side.
- Extension source and build output must never contain the relay-side `api_secret`.

## 2. Tracked defaults

`src/shared/errors/analytics/analyticsConfig.ts` is a tracked, non-sensitive default:

- placeholder measurement ID: `G-XXXXXXXXXX`
- default disabled consent state
- public transport fields only
- no committed secret material

Clean checkouts must stay buildable and typecheckable with those defaults.

## 3. Public config inputs

The active build contract exposes these public values:

- `measurementId`
- `transportMode`
- `relayEndpoint`

The current build-time public markers are:

- `__AIIINOB_GA_MEASUREMENT_ID__`
- `__AIIINOB_GA_RELAY_ENDPOINT__`
- `__AIIINOB_GA_TRANSPORT_MODE__`

Recommended production values:

- `transportMode=relay`
- a non-placeholder measurement ID
- an owner relay endpoint reachable from the extension runtime

## 4. Consent behavior

- Usage events send only when usage analytics consent is enabled.
- `extension_error` sends only when error-reporting consent is enabled.
- Enabling one consent does not enable the other event family.
- Disabling both consent bits stops production telemetry from the extension.

## 5. Owner setup flow

1. Create a GA4 property and a relay that owns the server-side `api_secret`.
2. Inject the public measurement ID, relay endpoint, and `transportMode=relay` into the release build or owner local environment.
3. Keep the tracked analytics config placeholder-only and commit-safe.
4. Enable the required consent in the extension settings before validating live traffic.
5. Use relay debug mode when validating payload correctness.

Measurement ID alone is not sufficient for production telemetry. Production sends require the owner relay path and the relay-side secret.

## 6. Debug validation

- In debug mode, the relay should surface GA validation results through `validationMessages`.
- `validationMessages: []` means the debug payload passed GA validation.
- A `2xx` response without validation details is not enough to prove the payload is valid.

## 7. Optional local validation script

The repo keeps a non-destructive validation helper:

```bash
node scripts/setup-error-analytics.js \
  --measurement-id G-1234567890 \
  --relay-endpoint https://relay.example/collect \
  --transport-mode relay
```

What the script does:

- checks that tracked config is still placeholder-only and secret-free
- validates the supplied public measurement ID and relay endpoint format
- reminds you that production debug validation must come from relay `validationMessages`

What the script does not do:

- it does not prompt for or store a GA secret
- it does not write tracked source files
- it does not generate integration code snippets

## 8. Dev-only direct debug

`directDebug` exists only for explicit development validation. It is not the production path and should not be documented as the normal release setup.

## 9. Do not do this

- Do not commit a real measurement ID to tracked placeholder defaults unless the owner has explicitly decided the value is public and release-safe.
- Do not put a GA `api_secret` in extension config, source, tests, or build output.
- Do not treat a production collect `2xx` as payload validity proof.
- Do not tell users to enable both consent toggles unless both event families are actually needed.
