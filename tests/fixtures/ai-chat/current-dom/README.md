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
| `perplexity-live-tabpanel-role-drift-2026-06-28.html` | Perplexity | Perplexity live DOM repair 2026-06-28 | `role="tabpanel"` panels can contain both a `group/query` user prompt and a later assistant `prose`; parser output must remain user-first alternating and strip source/sidebar/citation/copy noise |

## P14 Live Closeout Fixtures

P14 adds sanitized fixtures from the 2026-06-27 closeout smoke after DeepSeek
and Qianwen were reopened in the owner's Chrome profile. They preserve the live
DOM shape without raw conversation text.

| File | Platform | Owner | Live-shape evidence |
| --- | --- | --- | --- |
| `deepseek-live-residual-2026-06-27.html` | DeepSeek | P14 | parser evidence only: shared-thread ordering can start with an assistant `.ds-message`, so the manifest marks `expectedValidation: 'role-incomplete'` and product export must fail closed; user `.ds-message` nodes use `d29f3d7d` / `fbb737a4` wrappers and may mention platform names such as DeepSeek or Qwen in message text |
| `tongyi-qianwen-live-residual-2026-06-27.html` | Tongyi/Qianwen | P14 | `message-select-wrapper-*` wrappers can contain empty `share-selection-*` nodes before the real `chat-question-wrap` / `answerItem-*` content, and a `last-message-item` wrapper can nest a final question/answer pair |


## ChatGPT October 2026 message boundaries

`chatgpt-current-2026-10-31.html` is sanitized from a two-turn test conversation
captured in Chrome on 2026-10-31. Each `data-turn-key` contains a user and an
assistant message. The source uses `h4[data-conversation-role]`,
`data-user-message-bubble` and `data-markdown-text-style="assistant-message"`,
without `article` or `data-message-author-role` roots. Assertions retain all four
messages, lists, code and math while excluding native role labels and actions.
Additional parser tests preserve multiple response blocks and repeated messages,
reject unknown/missing explicit role evidence, and distinguish unrelated article
content from legacy `h5` role headings. A prior synthetic unlabelled article was
updated to include an explicit native role heading; an arbitrary article is not
sufficient evidence that its author is the assistant.

A second temporary live test on 2026-10-31 observed nonempty assistant content
while `data-talvt-turn-state="in_progress"`. The same turn became `complete`
after its final output line appeared. The sanitized inline generation fixture in
`tests/unit/third_party/chatgpt.test.ts` covers both states through the real
extractor: generation-in-progress and mounted empty modern messages reject with
a recoverable incomplete-conversation error; completed content exports in full.
Parser error diagnostics also prevent a partial result with both roles from
silently passing validation. The guard does not depend on localized stop-button
text and does not add waits or change the user's scroll position.

Before an assistant root exists, the observed busy status is scoped under
`data-thread-user-message-navigation-content`; its `role="status"` and
`aria-busy="true"` are checked only within that transcript owner. An unrelated
page busy status does not block export. A submitted last user turn without an
assistant answer is incomplete even after the busy status disappears.

`chatgpt-code-source-2026-11-01.html` reconstructs the semantic code-block shape
observed during live long-history verification, with neutral replacement text.
Inside `data-code-block="true"`, `data-code-block-source="true"` can contain a
`code` element without `pre`. Its separate action header can mount later and show
the generic label `代码`. The focused fixture preserves this shape, a real
language label, existing `pre` nesting, surrounding prose and math. It does not
replace the earlier capture or retain private conversation content.

## Grok signed-in transcript rows

`grok-gateway-current-2026-10-31.html` preserves a signed-in two-round test
conversation captured in Chrome on 2026-10-31. Conversation IDs and prompts are
replaced with deterministic values; list, table, code, math and forty numbered
answer lines retain the observed DOM shape. Signed-in `gateway:` rows and the
`transcript:submit-spacer` end marker differ from public-share `response:` rows
and `transcript:bottom-spacing`. Both use stable IDs, explicit article roles and
`transcript:top-inset`. The gateway extraction tests cover an overflowing live
shape, an empty final assistant without a working indicator, unresolved message
rows, structural follow-up text exclusion and restoration of the original scroll
position. The virtual transcript tests exercise both row families across windows.

## Message-image evidence

`grok-generated-image-current-2026-10-31.html` is sanitized from a real generated
image response: explicit assistant article, `response-content-markdown`, nested
image tile and one HTTPS `img`, with a separate download control. Its response
has no prose after removing that control. The prompt, image path and control
labels are replaced with neutral values; the external source URL becomes a
relative fixture path under the existing privacy policy. This is DOM/parser evidence only: the
observed original image fetch and native download returned HTTP 403, so the
fixture does not prove successful acquisition or attachment persistence.

`../imageAdapterSynthetic.ts` supplies controlled 11-platform image ownership
contracts. Those fixtures exercise image-only messages, outside-body galleries,
button wrappers and excluded UI; they are not captures of each platform's
current generated/uploaded image DOM. Remaining platforms still need that live
evidence in addition to common byte-pipeline and installed-save acceptance.

## Claude failed image upload capture

`claude-upload-failed-current-2026-10-31.html` preserves the semantic
`data-cds="UserMessage"` owner with `data-turn-key`, its sibling
`MessageAttachments` / `file-thumbnail` image, and its nested `user-message`
text body. It was captured from an owned neutral-image test in Chrome. The site
reported both upload and send failure, with `data-state="failed"` on the user
owner and image attachment; no successful assistant reply was observed. Source
URLs and the turn identity are replaced with deterministic fixture values.

This is an explicit rejection fixture: parsing must return no messages and the
fatal `claude_message_failed` diagnostic, and validation must reject the batch.
The focused Claude tests remove only the failed state and combine this shape
with an existing assistant fixture to test sibling image ownership and an
image-only user. Those variants are synthetic and do not certify a successful
Claude upload or save.
