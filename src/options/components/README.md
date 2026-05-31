# Options Components Directory

> Production truth: formal Options UI is rendered by `src/options/app/productionStitchShell.ts` and `src/options/stitch/*`. Do not restore Options Tailwind, `clipper.tailwind.css`, `video.tailwind.css`, or retired Daisy-themed migration workflows.

> Compatibility truth: this directory still contains legacy and test-owned surfaces. They may be used for compatibility fixes or owner migration work, but they do not own the production Options startup chain.

## Current Production Owners

| Need                                                       | Current owner                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Options startup and production state binding               | `src/options/index.ts`, `src/options/app/bootstrap.ts`, `src/options/app/productionStitchShell.ts` |
| Options schema, render contract, content, and runtime CSS  | `src/options/stitch/*`                                                                             |
| Foundation tokens, icons, lifecycle, a11y, and style hosts | `src/ui/foundation/*`                                                                              |
| Reusable controls                                          | `src/ui/primitives/*` and `src/ui/patterns/*`                                                      |
| Stable domain widgets                                      | `src/ui/domains/*`                                                                                 |
| Production design tokens                                   | `src/styles/design-tokens.css`                                                                     |

## Directory Map

```text
src/options/components/
├── controls/        # business controls reused by legacy/compat tests and migration work
├── formSections/    # legacy FormSection registry; migrate-then-delete until owners move
├── infrastructure/  # legacy options-only modal/list infrastructure
├── sections/        # legacy class sections plus retained REST helper files
└── services/        # options-only service helpers
```

## Compatibility Surfaces

- The old layout shell source has been retired. Do not restore it as a fallback shell, preview shortcut, or production startup owner.
- `formSections/` contains the old `FormSectionRegistry` and snapshot infrastructure. Do not reconnect it to the production startup chain.
- old class section files under `sections/*Section.ts` are `migrate-then-delete` until tests and fixtures move to Stitch production behavior.
- REST helper files under `sections/restSection*.ts` remain production/verification-owned unless a fresh owner audit proves an exact file can move to `delete-now`.
- `infrastructure/` may contain compatibility utilities used by tests or migration scaffolding; verify ownership before deleting.

## Development Rules

1. For new production Options UI behavior, edit `src/options/stitch/*` and the production shell/state owners.
2. For shared UI primitives or patterns, edit `src/ui/primitives/*` or `src/ui/patterns/*`.
3. For domain-owned UI, prefer `src/ui/domains/*`.
4. For compatibility work in this directory, keep changes targeted and add or update tests that prove the current behavior.
5. Before deleting any `src/options/components/**` path, prove it is owner-free with production build graph, import graph, package/build scripts, public/manifest assets, tests/visual checks, required verification commands, and a committed `docs/retired-code-inventory.md` `delete-now` decision.

## Verification

Use the changed surface to choose the smallest sufficient gate:

```bash
npm run audit:build-graph:report
npm run audit:retired-code:report
npm run audit:options-mainline:report
npm run verify:stitch-secondary
npm run test:unit -- tests/unit/options
npm run quality
npm run verify:preflight
```

Options/Stitch runtime UI changes require `npm run verify:stitch-secondary`.

## Historical Notes

Older comments and class names may still contain `Daisy*` compatibility names where the implementation imports `src/ui/primitives/*` owners. Those names are compatibility labels, not active style guidance. Do not create new retired-style migration instructions, Tailwind bridge scripts, or historical migration markers in production docs.
