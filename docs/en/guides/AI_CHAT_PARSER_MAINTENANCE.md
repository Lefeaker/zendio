# AI Chat Parser Maintenance Guide

## Overview

The AI chat exporter now uses a modular registry. Each platform (ChatGPT, Claude, Copilot, Gemini, Tongyi, DeepSeek, Kimi) has its own parser module located in `src/third_party/ai-chat-exporter/platforms/`. Shared helpers live under `src/third_party/ai-chat-exporter/shared/`, and `parseChatDOM` routes requests through the registry defined in `registry.ts`.

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
    ├── gemini.ts
    ├── tongyi.ts
    ├── deepseek.ts
    └── kimi.ts
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
- Add or update assertions in `tests/unit/aiChatParsers/parsers.test.ts` to cover the new behaviour.
- Run `npm run test` to execute the entire Vitest suite.
- When modifying markdown conversion rules, add focused tests to the shared module to protect against regressions.

## Debugging Tips

- Use `console.log` sparingly; prefer wrapping logs with platform prefixes (e.g. `[Gemini]`).
- When verifying DOM selectors, paste the fixture into a jsdom sandbox (see existing tests) or inspect the live DOM via browser devtools before updating selectors.
- Blob URLs must be converted to base64 before serialization. Reuse `convertBlobImageToBase64` from `shared/assets.ts`.

## Release Notes

- Updating parser logic may warrant a changelog entry under `docs/zh-cn/chinese-ai-platform/` or the English release notes depending on scope.
- If parser schemas change (e.g. new fields in `ParsedMessage`), ensure backwards compatibility for existing clips or provide a migration script.

## Contact & Ownership

- Parser code is consumed by `src/content/extractors/aiChatExtractor.ts`. Coordinate changes with the extraction team to keep detection rules aligned with DOM updates.
