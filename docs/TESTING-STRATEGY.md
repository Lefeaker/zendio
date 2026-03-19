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
- section controllers and view-model logic
- content helpers, presenters, prompt state, dialog orchestration

### Flow / E2E

- Command: `npm run test:e2e`
- Config: `vitest.e2e.config.ts`
- Scope: `tests/e2e/**/*.test.ts`

Use flow tests for:
- autosave and sync flows in Options
- Reader / Video / Support Prompt user journeys
- repository-backed content script integration

### Browser Visual / Interaction

- Command: `npm run test:e2e:browser`
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
npm run lint:warnings-guard
npm run test:coverage
npm run test:e2e
```

### Coverage thresholds

`vitest.unit.config.ts` enforces these minimum thresholds:

- Lines: `80`
- Statements: `80`
- Functions: `80`
- Branches: `75`

The thresholds are evaluated in CI through `npm run test:coverage`.

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
npm run test:e2e -- readerPanelFlow.test.ts videoPanelFlow.test.ts supportPromptFlow.test.ts
```

## CI expectations

The GitHub Actions workflow in `.github/workflows/ci.yml` now checks:

- `npm run typecheck`
- `npm run lint`
- `npm run lint:warnings-guard`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run test:e2e:browser`
- build, i18n, and packaging steps

Pull requests also receive a coverage summary comment based on `coverage/coverage-summary.json`.
