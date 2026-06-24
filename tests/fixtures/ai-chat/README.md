# AI Chat Parser Fixtures

These fixtures are committed regression inputs for `src/third_party/ai-chat-exporter/**`.
They must stay deterministic, local, and privacy-stripped. Unit coverage lives in
`tests/unit/third_party/parsers.test.ts` unless a focused parser test owns the case.
The executable fixture manifest is `fixtureManifest.ts`; keep this README and the
manifest synchronized in the same commit.

## Naming

- Use `<platform>.html` for the primary layout.
- Use `<platform>-<scenario>.html` for drift or edge cases.
- Use `current-dom/<platform>-current-YYYY-MM-DD.html` for sanitized live-derived
  current-DOM captures.
- Use `current-dom/<platform>-current-<scenario>.html` for focused current-DOM
  regression slots that are not tied to a live capture date.
- Keep platform ids aligned with `parseChatDOM(<platform>, document)`.
- Do not use live network calls or external HTML downloads in tests.

## Required Metadata

When adding or materially changing a fixture, update the index below and
`fixtureManifest.ts` in the same commit as the parser/test change.

Each row must include:

- fixture filename;
- source capture date in `YYYY-MM-DD` format, or `legacy-unknown` only for
  fixtures that predate this governance rule;
- platform and expected parser id;
- expected title, message count, or Markdown sentinel;
- privacy stripping status.
- manifest status: `active` for committed parser fixtures and `pending` for
  planned current-DOM slots that do not have sanitized HTML yet.

## Privacy Stripping

Before committing fixture HTML:

- remove account names, emails, tokens, workspace names, private URLs, user ids,
  and real conversation text;
- replace personal content with deterministic sample text that preserves the DOM
  shape needed by the parser;
- remove external image/script/link URLs unless the exact attribute shape is the
  behavior under test;
- keep toolbar/action text only when a test asserts the parser removes it from
  Markdown output.

Current legacy fixtures were created before capture-date governance. Their
source capture date is therefore recorded as `legacy-unknown`; refreshes must
replace that value with an actual capture date. The current-DOM lane does not
allow `legacy-unknown` for committed files. On 2026-05-26, a privacy scan found
no email addresses, bearer tokens, common API-key tokens, or `http(s)` URLs in
this directory. `tests/unit/third_party/fixtureManifest.test.ts` now repeats
that privacy scan for active fixture files.

## Current DOM Lane

Current-DOM fixtures live under `current-dom/` and are documented in
`current-dom/README.md`. Raw live captures must stay ignored under:

```text
/Users/mac/Documents/Dev/AI2OB_Plg/.tmp/ai-chat-parser-productionization-2026-06-24/live-dom-snapshots/
```

The current-DOM matrix is driven by `fixtureManifest.ts`:

- `status: 'pending'` reserves a P05/P06/P07 slot and is skipped by parser
  matrix tests.
- `status: 'active'` requires a committed sanitized fixture file and parser
  assertions.
- Every committed `current-dom/*.html` fixture must use a concrete
  `YYYY-MM-DD` source capture date and `privacyStatus: 'sanitized'`.

## Fixture Index

| fixture | source capture date | platform | expected parser | expected coverage sentinel | privacy status |
| --- | --- | --- | --- | --- | --- |
| `chatgpt.html` | `legacy-unknown` | ChatGPT | `chatgpt` | title `Test Conversation`; assistant text `How can I help you today` | sanitized legacy fixture |
| `claude.html` | `legacy-unknown` | Claude | `claude` | title `Planning Session`; model `Claude Sonnet 3.5` | sanitized legacy fixture |
| `claude-code.html` | `legacy-unknown` | Claude | `claude` | keeps `typescript` and `bash` fences; removes `Copy code` | sanitized legacy fixture |
| `copilot.html` | `legacy-unknown` | Copilot | `copilot` | title `Travel Ideas`; assistant role present | sanitized legacy fixture |
| `deepseek.html` | `legacy-unknown` | DeepSeek | `deepseek` | title `Team Sync`; assistant text `concise summary` | sanitized legacy fixture |
| `deepseek-code.html` | `legacy-unknown` | DeepSeek | `deepseek` | keeps `python` fence and table; removes toolbar/copy text | sanitized legacy fixture |
| `doubao.html` | `legacy-unknown` | Doubao | `doubao` | title `示例会话`; table and `python` fence preserved | sanitized legacy fixture |
| `doubao-model.html` | `legacy-unknown` | Doubao | `doubao` | model `豆包旗舰版`; assistant text `旗舰版` | sanitized legacy fixture |
| `gemini.html` | `legacy-unknown` | Gemini | `gemini` | title `Sample Session`; deep research sentinels retained | sanitized legacy fixture |
| `kimi.html` | `legacy-unknown` | Kimi | `kimi` | title `创意草稿`; model contains `Kimi` | sanitized legacy fixture |
| `kimi-code.html` | `legacy-unknown` | Kimi | `kimi` | keeps `html` and TypeScript fences; strips code headers | sanitized legacy fixture |
| `kimi-new.html` | `legacy-unknown` | Kimi | `kimi` | title `研究计划`; new layout table sentinel retained | sanitized legacy fixture |
| `monica.html` | `legacy-unknown` | Monica | `monica` | title `AI 对话摘要`; model `GPT-4o` | sanitized legacy fixture |
| `monica-fallback.html` | `legacy-unknown` | Monica | `monica` | fallback model `Monica` | sanitized legacy fixture |
| `perplexity.html` | `legacy-unknown` | Perplexity | `perplexity` | title `AI Research Thread`; removes `Copy` | sanitized legacy fixture |
| `tongyi.html` | `legacy-unknown` | Tongyi | `tongyi` | title `研究计划`; model `Qwen2-Turbo` | sanitized legacy fixture |
| `tongyi-code.html` | `legacy-unknown` | Tongyi | `tongyi` | keeps TypeScript and Python fences; removes line numbers | sanitized legacy fixture |
| `tongyi-inline-numbers.html` | `legacy-unknown` | Tongyi | `tongyi` | strips inline numeric prefixes without removing indentation | sanitized legacy fixture |
| `tongyi-new.html` | `legacy-unknown` | Tongyi | `tongyi` | hashed class layout with four messages | sanitized legacy fixture |
| `current-dom/harness-chatgpt-current-synthetic.html` | `2026-06-24` | ChatGPT | `chatgpt` | synthetic current-DOM lane harness; assistant text `sanitized current DOM shape` | sanitized fixture |
| `current-dom/chatgpt-current-2026-06-24.html` | `2026-06-24` | ChatGPT | `chatgpt` | no-`article` role-marked DOM; assistant text `role attributes without article wrappers` | sanitized fixture |
| `current-dom/claude-current-2026-06-24.html` | `2026-06-24` | Claude | `claude` | no full Tailwind main container; keeps `ts` fence and strips thinking/artifact chrome | sanitized fixture |
| `current-dom/copilot-current-synthetic.html` | `2026-06-24` | Copilot | `copilot` | synthetic focused current guard; assistant text `parser support covered` | sanitized fixture |

## Pending Current DOM Slots

These manifest entries are intentionally `pending`; they do not require files
until the owning milestone contributes sanitized HTML and assertions.

| fixture | owner milestone | platform | capture kind |
| --- | --- | --- | --- |
| `current-dom/deepseek-current-2026-06-24.html` | P06 | DeepSeek | current DOM sanitized |
| `current-dom/doubao-current-2026-06-24.html` | P06 | Doubao | current DOM sanitized |
| `current-dom/tongyi-qianwen-current-2026-06-24.html` | P06 | Tongyi | current DOM sanitized |
| `current-dom/kimi-current-pass-regression-2026-06-24.html` | P06 | Kimi | focused regression |
| `current-dom/perplexity-current-2026-06-24.html` | P07 | Perplexity | current DOM sanitized |
| `current-dom/monica-current-pass-regression-2026-06-24.html` | P07 | Monica | focused regression |
| `current-dom/gemini-current-pass-regression-2026-06-24.html` | P07 | Gemini | focused regression |

## Drift Rule

Parser drift fixes must land as one commit containing:

- the new or updated fixture;
- updated fixture index metadata;
- the parser or shared Markdown change, if needed;
- a unit assertion covering title, message count or role, and at least one
  assistant Markdown sentinel.
