# Current DOM AI Chat Fixtures

This directory is the current-DOM lane for AI chat parser drift. It exists so
parser fixes can be verified against sanitized DOM shapes without live website
access in CI.

## Capture Source

Raw live captures must stay ignored under:

```text
/Users/mac/Documents/Dev/AI2OB_Plg/.tmp/ai-chat-parser-productionization-2026-06-24/live-dom-snapshots/
```

Never commit raw live DOM. Only commit a sanitized fixture after it has a
manifest entry in `tests/fixtures/ai-chat/fixtureManifest.ts`.

## Sanitization Rules

Before adding an active fixture:

- replace account names, emails, workspace names, private URLs, user ids, and
  real conversation text with deterministic sample text;
- remove bearer tokens, API keys, session ids, analytics ids, and request ids;
- preserve DOM shape, platform classes, data attributes, role markers, code
  block wrappers, table wrappers, and toolbar structure needed to reproduce
  parser drift;
- remove external URLs unless the URL shape is the exact behavior under test;
- keep toolbar/action text only when a matrix assertion proves it is removed
  from Markdown output.

## Manifest Status

Use `status: 'pending'` for planned P05/P06/P07 fixture slots whose sanitized
HTML is not committed yet. Pending entries are documentation and merge guidance
only; `parserCurrentDomMatrix.test.ts` does not parse them.

Switch a row to `status: 'active'` only in the same commit that adds the
sanitized fixture file and assertions:

- `expectedTitle` when title extraction is part of the regression;
- `expectedMessageCount` for message discovery drift;
- `expectedRoles` for user/assistant role drift;
- `sentinels` for Markdown content that must be retained;
- `absentSentinels` for toolbar, copy, citation, or shell noise that must be
  stripped.

## Current Active Fixture

`harness-chatgpt-current-synthetic.html` is a synthetic P04 harness fixture. It
is not a live capture and should not be used as evidence for ChatGPT drift. Its
purpose is to keep the current-DOM loader, matrix assertions, and privacy scan
executable before P05/P06/P07 add real sanitized fixtures.
