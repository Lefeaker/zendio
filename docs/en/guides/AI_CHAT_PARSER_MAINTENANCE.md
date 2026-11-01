# AI Chat Parser Maintenance Guide

## Overview

The AI chat exporter now uses a modular parser registry plus layered lightweight platform metadata. The current supported product surface is ChatGPT, Claude, Copilot, Gemini, Tongyi/Qianwen, DeepSeek, Kimi, Doubao, Monica, Perplexity, and Grok. Each platform has its own parser module located in `src/third_party/ai-chat-exporter/platforms/`. Shared helpers live under `src/third_party/ai-chat-exporter/shared/`, `parseChatDOM` routes requests through the parser registry defined in `registry.ts`, platform identity metadata lives in `platformIdentity.ts`, product-facing metadata lives in `platformProductSurface.ts`, and `platformRegistry.ts` remains only as a compatibility facade.

```
src/third_party/ai-chat-exporter/
├── parse.ts                # Public API (parseChatDOM, chatHtmlToMarkdown)
├── platformIdentity.ts     # Supported ids, host detection, aliases
├── platformProductSurface.ts # Options labels/links and fallback-title policy
├── platformRegistry.ts     # Compatibility facade for older imports
├── registry.ts             # Parser registry + fallback result
├── runtimeRegistry.ts      # Lazy content-runtime parser boundary
├── runtimePlatformParsers.ts # Runtime-only parser implementation map
├── types.ts                # Common types and parser contracts
├── shared/
│   ├── assets.ts           # Blob/base64 helpers
│   ├── constants.ts        # DEFAULT_CHAT_TITLE, supported ids
│   ├── dom.ts              # DOM sanitizers
│   ├── markdown.ts         # HTML → Markdown converter
│   └── profileEngine.ts    # Opt-in profile parser with fail-closed role handling
└── platforms/
    ├── chatgpt.ts
    ├── claude.ts
    ├── copilot.ts
    ├── deepseek.ts
    ├── doubao.ts
    ├── gemini.ts
    ├── grok.ts
    ├── kimi.ts
    ├── monica.ts
    ├── perplexity.ts
    └── tongyi.ts
```

## Adding a New Platform

1. Duplicate an existing platform module as a starting point (e.g. `chatgpt.ts`).
2. Update selectors and model metadata extraction inside the new file. Make sure to:
   - Emit `ParsedResult` with sanitized Markdown via `chatHtmlToMarkdown`.
   - Implement `collectImages(root, config)` using the same message/content ownership as `parse`, including image-only messages and message galleries.
   - Pass the per-parse `config.imageResolver` through shared Markdown conversion. Do not fetch images in a parser or install a global resolver.
3. Export the parser as `const <platform>Parser: ChatPlatformParser`.
4. Register the parser in `registry.ts` by importing it and adding it to `registeredParsers`.
5. Register the runtime parser in `runtimePlatformParsers.ts`; keep it behind the existing `runtimeRegistry.ts` lazy boundary.
6. Add platform identity metadata in `platformIdentity.ts`: id, display label, host patterns, and aliases when needed.
7. Add product-surface metadata in `platformProductSurface.ts`: Options URL, optional product label, and fallback-title policy when the platform needs one.
8. Add an `AI_CHAT_DOCUMENT_PREPARERS` entry in `src/content/extractors/aiChatDocumentPreparer.ts` only when the platform needs live-page preparation such as virtual-list scrolling. Do not put live DOM preparation inside parser modules.

Live preparation must restore the original scroll position on both success and failure.
If loading, a collection limit, or a missing message window prevents a complete snapshot,
throw `extractionErrors.aiChatPreparationIncomplete` rather than exporting a partial
conversation. Its recoverable `EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE` code has a
localized message distinct from missing message roles. Keep platform diagnostics in
the internal context; never expose raw page content or arbitrary error parameters in
the public failure response.

## Product Surface Sync

- Options/Stitch displays supported platform labels and links from `getAIChatProductSurfacePlatforms()` in `platformProductSurface.ts`. The localized supported-platform badge uses the length of that displayed list rather than a handwritten count.
- URL host detection and aliases come from `platformIdentity.ts`; do not add platform detection switches in `aiChatExtractor.ts`.
- Fallback title policy comes from `getAIChatFallbackTitlePolicy()`. Product-surface fallback titles must use catalog message keys; neutral source-site fallback tokens stay inside platform parser modules.
- AI chat templates rely on exported metadata such as `meta.platform`; default domain mappings stay user-owned and do not add AI platform host aliases by default. This avoids silently changing vault routing for existing users.
- Usage telemetry keeps the low-cardinality `ANALYTICS_PLATFORMS` contract. ChatGPT, Claude, and Gemini are tracked as named AI platforms; Copilot, Tongyi/Qianwen, DeepSeek, Kimi, Doubao, Monica, Perplexity, and future AI IDs intentionally map to `other` unless a later GA dashboard/docs migration expands the schema.
- Parser implementation remains behind the lazy runtime parser boundary. Options/product surfaces may import `platformProductSurface.ts`, but must not import parser implementations, `runtimeRegistry.ts`, or `runtimePlatformParsers.ts` into Options bundles.
- New consumers should import the narrow metadata owner they need. Do not add new direct imports from the compatibility `platformRegistry.ts` facade unless preserving an older public path.

## Drift Fix Checklist

When a platform DOM drift is found:

1. Reproduce the empty or incorrect parse with a focused unit test.
2. Add or update the sanitized current-DOM fixture and manifest row only when the drift depends on a real current DOM shape.
3. Keep empty extraction fail-closed: a parser that cannot identify user or assistant content must return the fallback empty parse instead of emitting toolbar/sidebar text.
4. Keep export validation fail-closed: after leading `system` messages, the first recovered conversation turn must be `user`, and successful export requires both `user` and `assistant` roles.
5. If a sanitized parser fixture intentionally preserves assistant-first evidence, mark its manifest row with `expectedValidation: 'role-incomplete'` so parser evidence cannot be confused with a successful export fixture.
6. Update the platform parser and shared helpers without changing unrelated parser families.
7. Re-run the focused parser/current-DOM matrix before broader product verification.

## Updating Shared Logic

ChatGPT's current DOM uses `h4[data-conversation-role]` and separate user/assistant
content attributes; one `[data-turn-key]` contains both roles. Preserve explicit
legacy role attributes/headings, but do not infer roles from position or arbitrary
article text. Keep multiple content blocks and repeated message text in order.

Grok support targets conversations on `grok.com`, including its public share
transcripts and images inside conversation messages. It does not claim X-embedded
Grok, the separate Imagine workspace, or arbitrary non-image attachments.
Virtual transcripts require the Grok document preparer: collect overlapping windows
by stable `response:` (public share) or `gateway:` (signed-in) row ID, require
`transcript:top-inset` and the observed `bottom-spacing` or `submit-spacer` end
marker, and restore the original scroll
position. Loading, response generation, gaps or collection limits must fail before
saving rather than produce a truncated note. Parser-only fixtures cannot certify
that preparation or file writing succeeded. Only the three known structural rows
are excluded from message collection; unknown or unhydrated rows must not silently
disappear. Empty assistant content remains incomplete even without a working icon.
Scroll advances may use the last rendered message row's bottom edge to avoid
repeatedly scanning a tall mounted row. Keep the half-viewport overlap, stable-key
continuity check and existing time/window limits; mounted message count alone does
not prove the transcript is complete.

Model metadata must come from an explicit model control or label. In particular,
Tongyi must not interpret account nicknames, conversation prose or an unrelated
global selection preference as the model used for the captured conversation.

- Global constants belong in `shared/constants.ts`.
- DOM cleanup utilities should live in `shared/dom.ts`; reuse them rather than duplicating selectors inside platform modules.
- Markdown conversion helpers are centralised in `shared/markdown.ts`. Add behavior regressions to `tests/unit/shared/markdown.test.ts`. Code-language labels require a directly associated code block and either an explicit language attribute or a recognized name inside an identified code-label/component. An ordinary paragraph remains content even when it is exactly a language name; lists and distant labels are not language declarations. Do not infer away content after the DOM has already been flattened into Markdown.
- The profile parser engine in `shared/profileEngine.ts` is opt-in. It fails closed when a container role cannot be resolved; set `fallbackRole` explicitly only when the platform contract owns that behavior.
- Per-platform helpers should use specific names such as `perplexityCandidates.ts` or `chineseFamilyHelpers.ts`. Do not add broad family facades unless they own real shared behavior used by multiple platforms.

## Testing Checklist

- Unit fixtures reside in `tests/fixtures/ai-chat/`. Create a minimal HTML fixture that reproduces the target DOM structure for the platform.
- Current-DOM drift fixtures reside in `tests/fixtures/ai-chat/current-dom/` and are governed by `tests/fixtures/ai-chat/fixtureManifest.ts`.
- Add or update assertions in `tests/unit/third_party/parsers.test.ts` or `tests/unit/third_party/parserCurrentDomMatrix.test.ts` to cover the new behaviour.
- Parser drift fixes must add or update the fixture and the unit assertion in the same commit.
- Current-DOM fixture work is a separate lane from product surface sync. Do not edit fixture HTML when a task only changes Options, docs, i18n, or telemetry decisions.
- Run the parser-focused suite before wider validation:

```bash
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/third_party/parsers.test.ts tests/unit/third_party/gemini.test.ts tests/unit/third_party/markdownRules.test.ts tests/unit/content/aiChatExtractor.test.ts
```

- When modifying markdown conversion rules, add focused tests to the shared module to protect against regressions.

## Fixture Governance

`tests/fixtures/ai-chat/fixtureManifest.ts` is the executable index for committed parser fixtures, and `tests/fixtures/ai-chat/README.md` is the human-readable governance document. Update both whenever a fixture is added, renamed, or materially changed.

Each fixture entry must record:

- fixture filename;
- source capture date in `YYYY-MM-DD` format, or `legacy-unknown` for fixtures that predate this governance rule;
- platform and expected parser id passed to `parseChatDOM`;
- expected title and a short expected output sentinel;
- privacy stripping status.
- active/pending status.

Before committing a fixture:

- strip account names, emails, tokens, workspace names, private URLs, and user identifiers;
- replace personal conversation text with deterministic sample text that still exercises the DOM shape;
- remove external network references unless the parser behavior being tested needs the attribute shape;
- keep toolbar/action text only when the regression specifically proves that it is stripped from Markdown output;
- add or update the matching unit assertions in `tests/unit/third_party/parsers.test.ts`.

For live-derived drift work, save raw captures only under ignored local evidence:

```text
/Users/mac/Documents/Dev/AI2OB_Plg/.tmp/ai-chat-parser-productionization-2026-06-24/live-dom-snapshots/
```

Commit only sanitized `current-dom/*.html` files. Pending manifest entries reserve
P05/P06/P07 fixture slots and are skipped by the current-DOM matrix until the
sanitized file is added and the row is switched to `status: 'active'`.

## Debugging Tips

- Use `console.log` sparingly; prefer wrapping logs with platform prefixes (e.g. `[Gemini]`).
- When verifying DOM selectors, paste the fixture into a jsdom sandbox (see existing tests) or inspect the live DOM via browser devtools before updating selectors.
- Blob URLs must be converted to base64 before serialization. Reuse `convertBlobImageToBase64` from `shared/assets.ts`.

## Release Notes

- Updating parser logic may warrant a changelog entry under `docs/zh-cn/chinese-ai-platform/` or the English release notes depending on scope.
- If parser schemas change (e.g. new fields in `ParsedMessage`), ensure backwards compatibility for existing clips or provide a migration script.

## Contact & Ownership

- Parser code is consumed by `src/content/extractors/aiChatExtractor.ts`. Coordinate changes with the extraction team to keep detection rules aligned with DOM updates.

### ChatGPT paginated and virtual history

The ChatGPT preparer uses the visible `data-app-action-timeline-scroll` owner and
stable `data-turn-key` identities. A new page of older messages can increase both
scroll height and scroll position; a temporarily stable height is not proof of
the conversation start. Preparation stays at the start until the history loading
indicator disappears, then collects overlapping mounted turn windows in order.
It advances by mounted turn geometry and re-reads the current height so long
responses and changing layout do not imply missing windows. Repeated text in
different turn IDs remains separate.

A preparation is shared only by concurrent callers for the same Document, URL
and active scroll owner. A route or owner change rejects the old snapshot and
never scrolls the new chat. Generation, unresolved identities, disjoint windows,
content changes, missing boundaries or the bounded 60-second/200-window budget
return the recoverable incomplete-conversation error instead of partial export.
Restoration is bounded and only touches the original conversation owner.
Success requires the original visible turn/relative offset or bottom position to
be verified after restoration. A failed scan makes a bounded best-effort attempt;
a route change or a now-unmounted anchor after height changes can prevent full
restoration, but never turns the failed scan into a successful partial export. The unit regression includes the real extractor, dynamic
pagination, height growth after the original anchor, duplicate message text,
concurrent callers, failures and same-Document navigation.

The ChatGPT-specific shared `chatgptCodeBlocks.ts` helper recognizes the observed
`data-code-block-source="true" > code` component inside `data-code-block="true"`.
The parser normalizes only its own clone to `pre`/`code`, retaining code text and
explicit language metadata. A recognized language in the component's excluded
action header becomes fence metadata; generic action labels are not prose.
Existing `pre` blocks do not acquire nested fences. The history signature reuses
this component recognition, ignores only its action header and ordinary excluded
UI, and keeps language metadata separately so meaningful code/language changes
still reject. It does not run full Markdown conversion during scroll sampling.

## Message image files

The production extractor saves message images for all eleven registered platforms
through `meta.attachments`. The historical top-level `assets` field is not the
attachment transport. Uploaded and generated images share this path. Avatars,
source-card thumbnails and interface icons are excluded by message ownership.

`aiChatPreparedExtraction` owns an ephemeral bundle containing a frozen document,
image occurrences and binary attachments. Virtual ChatGPT, Grok and DeepSeek
windows capture their live resource descriptors and clones together, then obtain
bytes before scrolling can remove the window. Identical concurrent preparation
requests share the complete bundle; parsing and final validation remain local to
each caller. Source navigation, changed image content, a missing image source or
incomplete collection rejects the export before any files are written. Changing
non-content button labels does not change message content.

Within one preparation, repeated source URLs share their pending acquisition and
byte conversion. Different URLs are still read independently and deduplicated by
their verified byte hash. A failed or cancelled preparation cannot be resumed;
a new export starts a fresh preparation without reusing its rejected promises.

Each image occurrence has a separate temporary reference. After building the final
Markdown, the existing attachment lexer must find every expected occurrence once.
Only then are these references mapped to content-hash attachment IDs. Identical
bytes share a file named `ai-image-<sha256>.<extension>` while every original
message position remains present. Literal Markdown inside code stays literal.
Image descriptions are serialized as literal text with CommonMark punctuation
escaped, so backticks or HTML-like descriptions cannot hide neighboring image
references from the final integrity check.

Message ownership must agree between image collection and text parsing. ChatGPT
role boundaries and legacy role labels ignore hidden descendants while retaining
the rejection of visible conflicts. Kimi resolves non-overlapping message roots
before either operation and preserves the text fragments within each root;
container nesting must not duplicate images or discard later text fragments.
An identified Kimi message owns its full visible subtree, including text outside
the usual body containers. Generic internal `.message` nodes do not turn that
owner into a list. Determine independent messages from role/identity and grouping
evidence after excluding hidden and native-action contexts; never discard an
owner based only on descendant counts. Visible conflicting message boundaries
must fail explicitly rather than produce a successful, incomplete transcript.

The resource loader preserves fetched PNG, JPEG, GIF, WebP, AVIF and validated SVG
bytes; it does not reencode a screenshot or a canvas. SVG support is a static
subset: basic shapes/text, gradients, local references, common inline styles and
static filters. Scripts, external resources, stylesheets, animations and
unsupported XML/CSS constructs fail explicitly; this is not a full SVG sanitizer. A selected `currentSrc`
resource is not a guarantee of the platform's original upload resolution. Explicit
resource URLs may be used only when exposed by the page; never invent CDN paths
or alter signed parameters. The same-origin content request uses browser-managed
same-origin credentials; cross-origin requests omit credentials. The observed
Grok asset path is a narrow exception: a source at `https://grok.com` requesting
`https://assets.grok.com` uses browser-managed credentials and `cache: no-store`
on its first content request. Other sources and similar-looking hosts do not
inherit this policy, and explicit HTTP failures still do not trigger retries. A constrained
anonymous background request is available only for a verified current source
document and an allowed observed host after a network rejection. It is not a
general fetch proxy. The observed Kimi signed image route on `https://www.kimi.com`
(`/apiv2-files/sign-obj/` with unique `filename`, `sig` and `t=t` fields) is a
narrow exception: a manual opaque redirect or network rejection may use the
verified background owner. That owner anonymously follows the official signed
route and requires the final origin `https://prod-chat-kimi.tos-cn-beijing.volces.com`
before reading the bounded body. Fetch cannot inspect intermediate hops in
advance; this is trust in that specific official route, not unrestricted redirect
validation. Every other background request retains manual redirect rejection.
Explicit HTTP errors, bad content and size failures are not retried in another
context. No cookie, debugger or webRequest permission is added.

Limits are 50 distinct images, 15 MiB decoded bytes per image (20 MiB base64),
48 MiB aggregate encoded image content, 48 MiB of retained unique source URL
characters, 48 MiB of occurrence descriptor characters (including repeated URLs,
alt text and picture sources), and 1,000 image occurrences. The occurrence bound
is checked before cloning and before signature serialization. The complete
CLIP_RESULT JSON is limited to 60 MiB of UTF-8, leaving room below Chromium's
64 MiB transport ceiling described in the [Chrome messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/messaging). Image acquisition uses two concurrent workers, a
30-second resource deadline and an absolute 120-second preparation deadline.
Existing DOM scan/window limits remain; only time spent waiting for image bytes
is accounted separately from the DOM scan budget. Text-only exports make no
image requests. Explicit lazy/original resource fields take precedence over
placeholder images. A native lazy image without a selected currentSrc or an
explicit resource must finish loading before export; this version does not guess
srcset selection or automatically wait for such images. Missing, expired or
inaccessible required images fail explicitly;
there is no silent remote-link fallback or partial-image success.

The existing attachment planner and writers own REST, native Downloads and local
vault outputs. Files are confirmed before the note; actual download filenames
(including native uniquify) determine the links. Downstream partial/unknown write
results keep their existing meaning. Retrying after interruption is a new export;
this feature adds no persistent replay journal or duplicate-free Downloads retry.

Regression evidence must distinguish adapter fixtures, current sanitized DOM,
installed-extension file writes and live service access. `imageAdapters.test.ts`
covers all eleven adapters; `aiChatImageAttachments.browser.test.ts` starts at the
production extractor and checks actual bytes and links at all three sinks. A
passing parser fixture does not demonstrate access to a signed image CDN. The
2026-10-31 Grok generated-image fixture is actual sanitized DOM. Live production
module extraction has separately preserved its original JPEG bytes and local
attachment reference. Installed-extension destination writes require their own
verification; fixture parsing, page resource access and final writes are distinct
observations. The observed Kimi route supplies a 240×358 preview of the uploaded
image; preserve its returned bytes without claiming the original upload resolution.
Gemini blob URLs can be readable in the real extension isolated world even when
page-MAIN fetch fails. Verify the actual execution world before adding a pixel
conversion fallback. The exporter currently preserves the available original
resource bytes and does not use a canvas fallback. Preserve that distinction when assessing future platform drift.
