# All-in-Obsidian Chrome Extension Privacy Policy

Public project page: https://github.com/Lefeaker/AllinOB

Last updated: 2026-06-09

This policy explains how the extension handles local data and optional telemetry.

## 1. Scope

This policy applies to installation, use, update, and removal of the extension.

The extension is local-first. Most features run entirely in the browser and local Obsidian environment. Optional telemetry is sent only when the user enables the relevant consent toggle.

## 2. Data processed locally

By default, the extension processes the following information locally:

- clipped page content, AI-export content, and generated markdown needed to complete the user-requested workflow
- saved configuration such as Obsidian REST endpoint, local vault settings, export paths, and template preferences
- optional local diagnostic logs used for debugging by the user

This local processing does not by itself enable telemetry upload.

## 3. Optional telemetry

When the user enables telemetry consent, the extension may send limited telemetry to an owner-controlled relay.

### Usage analytics consent

Usage analytics may send bounded product interaction events such as:

- support prompt interactions
- `clear_stats`
- `i18n_text_overflow`

### Error-reporting consent

Error reporting may send the sanitized `extension_error` event.

### Telemetry safety rules

- extension source and build output do not contain the GA `api_secret`
- the relay owns the server-side `api_secret`
- production logs do not include full event params
- telemetry is limited to bounded enums, counters, and sanitized technical metadata

## 4. Data not collected in telemetry

The active telemetry contract does not intentionally collect:

- page content or selected text
- markdown bodies
- vault paths or local filesystem paths
- raw URLs with query strings
- authentication tokens, passwords, or secrets
- personal profile data unrelated to extension diagnostics

## 5. Data use purposes

We process data only to:

- complete clipping, export, and local vault workflows requested by the user
- preserve user settings across sessions
- diagnose extension stability issues when the user enables error reporting
- measure bounded product interaction trends when the user enables usage analytics

We do not sell or rent user data for advertising.

## 6. Obsidian local REST API access

- the extension may call the local Obsidian REST API only when the user configures it
- API tokens stay in extension storage and can be changed or revoked by the user
- requests target the local loopback environment chosen by the user

## 7. Local vault directory access

- local vault access is optional and requires explicit user authorization
- the browser grants only the chosen directory handle
- users can revoke the permission through the extension or browser permission controls

## 8. Third-party processing

Optional telemetry may be forwarded by the owner-controlled relay to Google Analytics 4.

Important boundaries:

- the extension sends only the public relay payload
- the relay, not the extension, keeps the server-side `api_secret`
- telemetry is sent only after the matching user consent bit is enabled

If telemetry consent is disabled, the extension should not send those events.

## 9. Retention and deletion

- local settings remain until the user removes them or uninstalls the extension
- local vault permissions and local REST configuration can be revoked by the user at any time
- turning off telemetry consent stops future extension-side telemetry sends

Previously received owner-side telemetry records may remain subject to the owner's analytics retention policy.

## 10. User choices

Users may:

- review and change extension settings
- enable or disable usage analytics independently from error reporting
- revoke local vault and host permissions
- remove stored configuration by clearing extension data or uninstalling the extension

## 11. Security measures

- sensitive local settings are stored only for extension functionality
- telemetry secrets remain outside extension source and build output
- permissions follow a least-privilege design
- sanitization removes or redacts sensitive technical context before error telemetry is emitted

## 12. Contact

For privacy or data-handling questions:

- Email: allinobsidian@outlook.com
- GitHub Issues: <https://github.com/aiiinob/all-in-obsidian/issues>
