# Current DOM AI Chat Fixtures

This directory is the current-DOM lane for AI chat parser drift. It exists so
parser fixes can be verified against sanitized DOM shapes without live website
access in CI.

## Capture Source

Raw live captures must stay ignored under:

```text
/Users/mac/Documents/Dev/AI2OB_Plg/.tmp/ai-chat-parser-productionization-2026-06-24/live-dom-snapshots/
/Users/mac/Documents/Dev/AI2OB_Plg/.tmp/ai-chat-live-dom-residual-repair-2026-06-25/
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

Use `status: 'pending'` for planned fixture slots whose parser repair is not
complete yet. Pending entries are skipped by `parserCurrentDomMatrix.test.ts`.
Unrepaired P10 residual entries may have committed sanitized HTML, but they must
be covered by fixture-shape tests and privacy scan rather than canonical
parser-output assertions.

Switch a row to `status: 'active'` only in the same commit that adds the
sanitized fixture file and assertions:

- `expectedTitle` when title extraction is part of the regression;
- `expectedMessageCount` for message discovery drift;
- `expectedRoles` for user/assistant role drift;
- `sentinels` for Markdown content that must be retained;
- `absentSentinels` for toolbar, copy, citation, or shell noise that must be
  stripped.

## Current Active Fixtures

`harness-chatgpt-current-synthetic.html` is a synthetic P04 harness fixture. It
is not a live capture and should not be used as evidence for ChatGPT drift. Its
purpose is to keep the current-DOM loader, matrix assertions, and privacy scan
executable before P05/P06/P07 add real sanitized fixtures.

## P06 Chinese-Family Fixtures

P06 adds focused sanitized reproductions for Chinese-family drift where no raw
live DOM snapshot was available from P00:

| File | Platform | Coverage |
| --- | --- | --- |
| `deepseek-current-2026-06-24.html` | DeepSeek | role detection across ancestor/data attributes, duplicate suppression, toolbar cleanup |
| `doubao-current-2026-06-24.html` | Doubao | current message roots without `message-block-container`, sidebar/history exclusion, toolbar cleanup |
| `tongyi-qianwen-current-2026-06-24.html` | Tongyi/Qianwen | Qianwen-shaped message roots through the Tongyi parser and line-number cleanup |

## P07 Assistant-Family Fixtures

`perplexity-current-2026-06-24.html` is a sanitized P07 current-DOM regression
fixture for the Perplexity empty-extraction drift. It keeps the current query
and answer container shape, plus sources/sidebar/toolbars that must be stripped
from Markdown output.

## P10 Live Residual Fixtures

P10 adds sanitized residual fixtures from the 2026-06-25 built-dist smoke
diagnostics. These fixtures intentionally preserve the live selector gaps that
the 2026-06-24 fixtures missed. P12 promotes the Chinese-family entries to
active parser assertions, and P13 promotes Perplexity to an active parser
assertion.

| File | Platform | Owner | Live-shape evidence |
| --- | --- | --- | --- |
| `deepseek-live-residual-2026-06-25.html` | DeepSeek | P10/P12 | `ds-message`, `ds-markdown`, `ds-markdown-paragraph`, `ds-markdown-cite`, `ds-assistant-message-main-content`; no friendly `data-message-role` wrappers |
| `tongyi-qianwen-live-residual-2026-06-25.html` | Tongyi/Qianwen | P10/P12 | `message-select-wrapper-question-*`, `message-select-wrapper-answer-*`, `chat-question-wrap`, `answerItem-*`, `qk-md-text`, `data-msgid`, `data-chat-id`, `data-req-id` |
| `doubao-live-residual-2026-06-25.html` | Doubao | P10/P12 | `data-message-id`, `data-container-type="block-v2"`, `data-thinking-box`, `data-render-engine`, `whitespace-pre-wrap`; no `message-block-container`, `semi-chat-message`, or `data-container-type="message"` roots |
| `perplexity-live-residual-2026-06-25.html` | Perplexity | P10/P13 | `group/query`, `max-w-threadContentWidth`, `prose`; P13 parser output returns `user/assistant/user/assistant` and strips source/sidebar/citation/copy noise |
