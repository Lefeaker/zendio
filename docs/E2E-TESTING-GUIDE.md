# E2E Testing Guide

## Commands

### Vitest flow tests

```bash
npm run test:e2e
```

### Browser interaction harness

```bash
npm run test:e2e:browser
```

### Visual regression suite

```bash
npm run visual:test
```

## Current focus areas

### Options flows

Representative files:

- `tests/e2e/optionsFragmentAutoSave.test.ts`
- `tests/e2e/optionsTemplatesAutoSave.test.ts`
- `tests/e2e/optionsVaultRouterAutoSave.test.ts`
- `tests/e2e/optionsLanguageSwitch.test.ts`
- `tests/e2e/optionsNavigationLazyLoad.test.ts`
- `tests/e2e/yamlOverridesFlow.test.ts`

### Content flows

Representative files:

- `tests/e2e/clipperFlow.test.ts`
- `tests/e2e/readerPanelFlow.test.ts`
- `tests/e2e/videoPanelFlow.test.ts`
- `tests/e2e/supportPromptFlow.test.ts`
- `tests/e2e/content-scripts-repository.test.ts`

### Site-oriented / integration checks

Representative files:

- AI chat extraction flows under `tests/e2e/*AiChatFlow.test.ts`
- `tests/e2e/videoPanelFlow.test.ts`
- `tests/e2e/content-scripts-repository.test.ts`

## How to add a new flow test

### Choose the right layer

- Use `tests/unit` if the logic can be isolated from app wiring.
- Use `tests/e2e` when you need repository wiring, autosave chains, or cross-module interaction.
- Use Playwright / visual tests when browser rendering or layout is part of the acceptance criteria.

### Keep flows narrow

A good flow test should prove one user-facing path, for example:

- open UI
- perform a meaningful interaction
- assert persisted state or visible outcome

Avoid building giant scenario tests that cover unrelated branches.

### Prefer stable assertions

Assert against:

- saved repository state
- emitted messages
- visible status text
- DOM role / label / test ids already treated as stable contracts

Avoid asserting implementation-only CSS details unless the test is explicitly visual.

## CI behavior

CI runs flow checks after unit coverage passes. If a flow fails:

- fix the behavioral regression first
- only update snapshots or expected fixtures when product behavior intentionally changed

## Debugging tips

### Run a single flow file

```bash
npm run test:e2e -- supportPromptFlow.test.ts
```

### Run a targeted unit + flow pair

```bash
npm run test:unit -- tests/unit/content/SupportPrompt.test.ts
npm run test:e2e -- supportPromptFlow.test.ts
```

### Inspect browser-oriented regressions

```bash
npm run test:e2e:browser
npm run visual:test
```
