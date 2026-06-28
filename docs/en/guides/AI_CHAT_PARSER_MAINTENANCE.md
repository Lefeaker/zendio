# AI Chat Parser Maintenance Guide

## Overview

The AI chat exporter now uses a modular parser registry plus a lightweight platform metadata registry. The current supported product surface is ChatGPT, Claude, Copilot, Gemini, Tongyi/Qianwen, DeepSeek, Kimi, Doubao, Monica, and Perplexity. Each platform has its own parser module located in `src/third_party/ai-chat-exporter/platforms/`. Shared helpers live under `src/third_party/ai-chat-exporter/shared/`, `parseChatDOM` routes requests through the parser registry defined in `registry.ts`, and product-facing metadata lives in `platformRegistry.ts`.

```
src/third_party/ai-chat-exporter/
├── parse.ts                # Public API (parseChatDOM, chatHtmlToMarkdown)
├── platformRegistry.ts     # Host detection, aliases, product labels/links, fallback-title policy
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
5. Register the runtime parser in `runtimePlatformParsers.ts`; keep it behind the existing `runtimeRegistry.ts` lazy boundary.
6. Add lightweight platform metadata in `platformRegistry.ts`: id, display label, host patterns, aliases, Options URL, and fallback-title policy when the platform needs one.
7. Add an `AI_CHAT_DOCUMENT_PREPARERS` entry in `src/content/extractors/aiChatDocumentPreparer.ts` only when the platform needs live-page preparation such as virtual-list scrolling. Do not put live DOM preparation inside parser modules.

## Product Surface Sync

- Options/Stitch displays supported platform labels and links from `getAIChatProductSurfacePlatforms()` in `platformRegistry.ts`.
- URL host detection and aliases also come from `platformRegistry.ts`; do not add platform detection switches in `aiChatExtractor.ts`.
- Fallback title policy comes from `getAIChatFallbackTitlePolicy()`. Localized required titles must use existing message keys; neutral parser tokens such as "Doubao Chat" and "Monica Chat" live in metadata.
- AI chat templates rely on exported metadata such as `meta.platform`; default domain mappings stay user-owned and do not add AI platform host aliases by default. This avoids silently changing vault routing for existing users.
- Usage telemetry keeps the low-cardinality `ANALYTICS_PLATFORMS` contract. ChatGPT, Claude, and Gemini are tracked as named AI platforms; Copilot, Tongyi/Qianwen, DeepSeek, Kimi, Doubao, Monica, Perplexity, and future AI IDs intentionally map to `other` unless a later GA dashboard/docs migration expands the schema.
- Parser implementation remains behind the lazy runtime parser boundary. Options/product surfaces may import lightweight platform metadata, but must not import parser implementations or the runtime parser registry into Options bundles.

## Drift Fix Checklist

When a platform DOM drift is found:

1. Reproduce the empty or incorrect parse with a focused unit test.
2. Add or update the sanitized current-DOM fixture and manifest row only when the drift depends on a real current DOM shape.
3. Keep empty extraction fail-closed: a parser that cannot identify user or assistant content must return the fallback empty parse instead of emitting toolbar/sidebar text.
4. Update the platform parser and shared helpers without changing unrelated parser families.
5. Re-run the focused parser/current-DOM matrix before broader product verification.

## Updating Shared Logic

- Global constants belong in `shared/constants.ts`.
- DOM cleanup utilities should live in `shared/dom.ts`; reuse them rather than duplicating selectors inside platform modules.
- Markdown conversion helpers are centralised in `shared/markdown.ts`. When adding constructs (tables, KaTeX, custom components), extend this file and add regression tests.
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
