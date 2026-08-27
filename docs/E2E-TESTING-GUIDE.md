# E2E Testing Guide

## Canonical commands

All executable test tools run through the Node 20.20.2 command boundary. The
boundary resolves the tracked profile, absolute executable, argv, canonical
repository cwd, closed environment, descriptor policy, output limits and
cancellation behavior. Do not replace these routes with `npx`, a bare binary,
a shell command chain or a caller-selected timeout/concurrency value.

### Vitest flow tests

```bash
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.e2e.config.ts
```

A single registered E2E shard uses the direct coordinator and remains
single-process:

```bash
node scripts/run-test-shards.mjs e2e options
```

All E2E shards use the fixed `vitest-shards-v1` policy:

```bash
node scripts/run-test-shards.mjs e2e
```

### Browser interaction harness

```bash
node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser
```

The fixed browser shard coordinator owns the YAML, reader-panel and smoke
descriptors, uses at most two live leaves, and allocates separate result and
HTML-report directories:

```bash
node scripts/run-browser-test-shards.mjs e2e
```

### Visual regression suite

```bash
node scripts/run-browser-test-shards.mjs visual
```

The visual registry is fixed to `chromium-desktop`, `chromium-tablet` and
`chromium-mobile`. A caller cannot select an executable, browser channel,
environment, cwd, output path, shell, TTY or concurrency.

### Local bundled Chromium acceptance

`playwright.bundled-chromium.config.ts` is the local-only acceptance config for
the lock-matched Playwright Chromium cache. The canonical `bundled` coordinator
splits its exact eight-file collection into four browser E2E files and four
visual files. Both leaves use the repository-local Playwright CLI with no
system-browser fallback, fixed ports (`43103` / `43104`), one fixed coordinator-built
dist and isolated output/report directories. The coordinator acquires the
existing Playwright build lease, creates that dist from a fresh `build:dev`,
and holds the lease until both leaves finish. The visual leaf depends on the
E2E leaf, so an E2E failure prevents visual admission without leaving a live
Playwright web server or releasing the dist to another lease-aware build.

The extension leaves select Playwright's full bundled Chromium with
`headless: false`, then use Chromium's own `--headless=new` mode. They do not
set a browser channel or executable path and therefore never fall back to a
system browser.

```bash
PLAYWRIGHT_BROWSERS_PATH=/absolute/cache/path \
  node scripts/run-browser-test-shards.mjs bundled
```

The cache must already contain the locked revisions. This route never installs
browsers, does not consume a caller-prebuilt dist, does not accept
caller-selected ports/dist/output paths, and does not replace the existing CI
visual routes. The standard Chromium visual projects also use the lock-matched
bundled browser without a channel override.

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

### Site-oriented checks

- AI chat extraction flows under `tests/e2e/*AiChatFlow.test.ts`
- `tests/e2e/videoPanelFlow.test.ts`
- `tests/e2e/content-scripts-repository.test.ts`

## Adding a flow test

Use `tests/unit` for isolated logic, `tests/e2e` for repository wiring or
cross-module interaction, and Playwright when browser rendering or layout is
part of acceptance. Keep each flow narrow and assert stable repository state,
messages, accessible DOM roles/labels or visible status.

Every non-browser test file must have exactly one registered shard owner.
Browser additions must update the fixed browser descriptor registry and its
contract test; do not add a second spawn or queue implementation.

## Failure behavior

The first shard failure closes admission, concurrently cancels every live
sibling and waits for all child closes and stdout/stderr/FD4/FD5 drains.
Never-started leaves are reported as cancelled. A successful late event cannot
clear the first failure.

CI runs Vitest E2E and each browser/visual surface as independent jobs. A failed
flow is fixed in product code unless the product contract intentionally changed;
snapshot or fixture changes require that explicit contract decision.
