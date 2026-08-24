# Testing Strategy

## Goals

- Keep `src/` changes behind fast unit feedback.
- Enforce a minimum unit coverage gate in CI.
- Preserve flow-level confidence for Options, Reader, Video, and Support Prompt.
- Separate unit, flow, and browser-visual checks so failures are easier to triage.

## Test Layers

### Unit

- Command: `npm run test:unit`
- Coverage command: `npm run test:coverage`
- Config: `vitest.unit.config.ts`
- Scope: `tests/unit/**/*.test.ts`

Use unit tests for:

- repository behavior and error wrapping
- options store / merger normalization
- overview privacy consent persistence and privacy-domain view-model behavior
- section controllers and view-model logic
- content helpers, presenters, prompt state, dialog orchestration

### Flow / E2E

- Command: `npm run test:e2e`
- Config: `vitest.e2e.config.ts`
- Scope: `tests/e2e/**/*.test.ts`

Use flow tests for:

- autosave and sync flows in Options
- Support Prompt and repository-backed user journeys that run in Vitest
- repository-backed content script integration

Reader and Video browser files are excluded from `vitest.e2e.config.ts`; they are owned by the
browser routes below rather than presented as Vitest E2E coverage.

### Browser Visual / Interaction

- YAML interaction: `npm run test:e2e:browser`
- Reader panel: `npm run test:e2e:browser:reader-panel`
- Complete Video matrix: `npm run test:e2e:browser:video`
- Firefox browser compatibility: `npm run test:e2e:browser:firefox`
- Command: `npm run visual:test`

Use browser-based checks for:

- Shadow DOM rendering regressions
- YAML config interaction harness
- locale layout / visual regressions

## Quality Gates

### Local baseline

Run before merging substantial changes:

```bash
npm run typecheck
npm run lint
npm run audit:components:report
npm run audit:interaction-contract:report
npm run audit:platform-services:report
npm run lint:warnings-guard
npm run audit:test-suite-ownership:check
npm run test:coverage
npm run test:e2e
```

`npm run audit:test-suite-ownership:check` is a standalone ownership gate in R01. A generic full
test or coverage invocation is verification evidence, not a second canonical collection owner.

### Coverage thresholds

`vitest.unit.config.ts` enforces these minimum thresholds:

- Lines: `77`
- Statements: `76.5`
- Functions: `77.5`
- Branches: `66.5`

The thresholds are evaluated in CI through `npm run test:coverage`.

2026-06-16 Vitest 4 / Vite 8 migration note: a detached `origin/main` check on
Vitest `3.2.6` passed the old `80/80/80/75` thresholds with statements/lines
`81.22%`, functions `86.5%`, branches `78.5%`. After upgrading to Vitest
`4.1.9` and `@vitest/coverage-v8` `4.1.9`, the same source/test set reports
statements `76.71%`, lines `77.03%`, functions `77.93%`, branches `66.86%` with
non-comparable provider totals. The gate remains enabled and tracks the Vitest
4 measured floor; do not treat the old thresholds as current truth under the new
provider.

The coverage denominator still contains retired Options glob exclusions so old
compatibility paths cannot distort coverage if they are inspected from history or
temporarily restored during an audit. Current source truth is that the old
widgets tree is absent:

- `src/options/widgets/shared/**`

Any reintroduced path under that tree must re-enter Non-Production Code 3.0
classification and satisfy six-owner proof before deletion. Production Stitch
behavior remains covered by the production Stitch tests.

## Recommended author workflow

### Small refactor

```bash
npm run typecheck
npm run lint
npm run test:unit -- tests/unit/path/to/file.test.ts
```

### Repository / options boundary change

```bash
npm run typecheck
npm run lint
npm run test:coverage
npm run test:e2e -- optionsVaultRouterAutoSave.test.ts yamlOverridesFlow.test.ts
```

### Content UI change

```bash
npm run typecheck
npm run lint
npm run test:unit -- tests/unit/content/
npm run test:e2e -- supportPromptFlow.test.ts
npm run test:e2e:browser:reader-panel
npm run test:e2e:browser:video
```

## CI expectations

The GitHub Actions workflow in `.github/workflows/ci.yml` now checks:

- `npm run typecheck`
- `npm run lint`
- `npm run lint:warnings-guard`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run test:e2e:browser`
- `Browser video flow` runs only `npm run test:e2e:browser:video`
- `Browser Firefox flow` runs only `npm run test:e2e:browser:firefox` after its distinct Firefox
  browser installation step
- build, i18n, and packaging steps

The ownership report validates the collection topology locally. Its later CI/quality hard wiring is
deferred until the convergence milestone gives every then-current browser file a canonical route.

Pull requests also receive a coverage summary comment based on `coverage/coverage-summary.json`.

## Current Baseline

The current handoff baseline is documented in:

- [`README.md`](./README.md)
- [`engineering-entrypoints.md`](./engineering-entrypoints.md)
- [`runtime-observability-and-regression.md`](./runtime-observability-and-regression.md)
- [`privacy-settings-usage.md`](./privacy-settings-usage.md)
- [`performance-baseline.md`](./performance-baseline.md)
- [`final-acceptance-report-2026-03-20.md`](./final-acceptance-report-2026-03-20.md)
