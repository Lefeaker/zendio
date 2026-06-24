# AI Chat Parser Maintenance Guide

## Overview

The AI chat exporter now uses a modular registry. Each platform (ChatGPT, Claude, Copilot, DeepSeek, Doubao, Gemini, Kimi, Monica, Perplexity, Tongyi) has its own parser module located in `src/third_party/ai-chat-exporter/platforms/`. Shared helpers live under `src/third_party/ai-chat-exporter/shared/`, and `parseChatDOM` routes requests through the registry defined in `registry.ts`.

```
src/third_party/ai-chat-exporter/
├── parse.ts                # Public API (parseChatDOM, chatHtmlToMarkdown)
├── registry.ts             # Parser registry + fallback result
├── types.ts                # Common types and parser contracts
├── shared/
│   ├── assets.ts           # Blob/base64 helpers
│   ├── constants.ts        # DEFAULT_CHAT_TITLE, supported ids
│   ├── dom.ts              # DOM sanitizers
│   └── markdown.ts         # HTML → Markdown converter
└── platforms/
    ├── chatgpt.ts
    ├── claude.ts
    ├── copilot.ts
    ├── deepseek.ts
    ├── doubao.ts
    ├── gemini.ts
    ├── kimi.ts
    ├── monica.ts
    ├── perplexity.ts
    └── tongyi.ts
```

## Adding a New Platform

1. Duplicate an existing platform module as a starting point (e.g. `chatgpt.ts`).
2. Update selectors and model metadata extraction inside the new file. Make sure to:
   - Emit `ParsedResult` with sanitized Markdown via `chatHtmlToMarkdown`.
   - Record platform-specific assets (images, attachments) if available.
3. Export the parser as `const <platform>Parser: ChatPlatformParser`.
4. Register the parser in `registry.ts` by importing it and adding it to `registeredParsers`.
5. Provide URL detection for the new platform in `src/content/extractors/aiChatExtractor.ts` if needed.

## Updating Shared Logic

- Global constants belong in `shared/constants.ts`.
- DOM cleanup utilities should live in `shared/dom.ts`; reuse them rather than duplicating selectors inside platform modules.
- Markdown conversion helpers are centralised in `shared/markdown.ts`. When adding constructs (tables, KaTeX, custom components), extend this file and add regression tests.

## Testing Checklist

- Unit fixtures reside in `tests/fixtures/ai-chat/`. Create a minimal HTML fixture that reproduces the target DOM structure for the platform.
- Current-DOM drift fixtures reside in `tests/fixtures/ai-chat/current-dom/` and are governed by `tests/fixtures/ai-chat/fixtureManifest.ts`.
- Add or update assertions in `tests/unit/third_party/parsers.test.ts` or `tests/unit/third_party/parserCurrentDomMatrix.test.ts` to cover the new behaviour.
- Parser drift fixes must add or update the fixture and the unit assertion in the same commit.
- Run the parser-focused suite before wider validation:

```bash
npx vitest run --config vitest.unit.config.ts tests/unit/third_party/parsers.test.ts tests/unit/third_party/gemini.test.ts tests/unit/third_party/markdownRules.test.ts tests/unit/content/aiChatExtractor.test.ts
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
