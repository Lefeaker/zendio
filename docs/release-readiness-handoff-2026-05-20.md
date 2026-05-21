# Release Readiness Handoff - 2026-05-20

## Scope

This handoff records final release-readiness evidence for the stabilization
integration branch. It does not add product behavior, reset lint warning debt, or
upgrade dev/release dependencies.

- Branch: `codex/aiiinob-release-readiness-2026-05-20`
- Worktree: `/Users/mac/Documents/Dev/AI2OB_Plg/.worktrees/AiiinOB/codex/aiiinob-release-readiness-2026-05-20`
- Base commit: `dada57edef5821dffb2e30af6fa01c64a2349b4f`
- Node: `v20.20.2`
- npm: `10.8.2`
- Node install source: existing local `nvm` install at `/Users/mac/.nvm/versions/node/v20.20.2`
- Command environment: `PATH=/Users/mac/.nvm/versions/node/v20.20.2/bin:$PATH`

## Node 20 Reproduction

The release-readiness worktree was installed with:

```bash
npm ci
```

under Node `v20.20.2` / npm `10.8.2`. The install completed without an engine
warning. It still reported the known dev/release toolchain audit findings; those
are tracked below and in the long-term backlog.

Clean checkout analytics evidence:

- `src/shared/errors/analytics/analyticsConfig.ts` is tracked.
- `git check-ignore -v src/shared/errors/analytics/analyticsConfig.ts` returns no ignore match.
- The tracked Measurement ID remains the placeholder `G-XXXXXXXXXX`.
- No real GA4 Measurement ID is committed in the tracked config.

## Release Gates

All required release gates below passed under Node 20:

```bash
npm run typecheck
npm run typecheck:strict
npm run lint -- --quiet
npm run lint:warnings-guard
npm run test:unit
npm run clean
npm run build:dev
npm run audit:build:report
npm run audit:local-vault-release:report -- --browser chrome
npm run build
npm run build:firefox
npm run audit:local-vault-release:report -- --browser firefox
npm run test:e2e:browser:local-vault
npm run test:e2e:browser:smoke
npm run verify:stitch-secondary
npm run visual:test
npm audit --omit=dev
```

Observed results:

- `test:unit`: `249` files / `1413` tests passed.
- `audit:build:report`: `content/runtime.js` remained at `56.0 KB`; chunk count remained `98`.
- Chrome Local Vault readiness audit found `chunks/localVaultPermissionPrompt-TOJCWVUH.js`.
- Firefox Local Vault readiness audit found `chunks/localVaultPermissionPrompt-YHLYU7HC.js`.
- `test:e2e:browser:local-vault`: `7` tests passed.
- `test:e2e:browser:smoke`: `3` tests passed.
- `verify:stitch-secondary`: preview freeze passed, `73` unit tests passed, Stitch visual parity had `22` passed / `2` expected skipped, runtime/task-success alignment had `31` passed.
- `visual:test`: `144` passed / `6` expected skipped.
- `npm audit --omit=dev`: `0` vulnerabilities.

Expected non-blocking failure:

```bash
npm audit --audit-level=low
```

This still fails with `26` dev/release toolchain vulnerabilities (`10`
moderate / `16` high). This is not treated as a runtime dependency release
blocker because `npm audit --omit=dev` is clean. No dependency upgrade was made
in this release-readiness pass.

## Package Artifacts

Chrome and Firefox artifacts were generated under Node 20:

```bash
npm run package
npm run package:firefox
```

Generated artifacts were moved to ignored local evidence:

- `/Users/mac/Documents/Dev/AI2OB_Plg/.tmp/aiiinob-stabilization-2026-05-18/release-artifacts-2026-05-20/all-in-ob-v0.2.0.zip`
- `/Users/mac/Documents/Dev/AI2OB_Plg/.tmp/aiiinob-stabilization-2026-05-18/release-artifacts-2026-05-20/all-in-ob-v0.2.0.xpi`

Artifact sanity checks:

- Both artifacts contain `manifest.json`.
- Both artifacts contain `local-vault-permission.html` and `local-vault-permission.js`.
- Both artifacts contain `offscreen/local-vault.html` and `offscreen/local-vault.js`.
- Both artifacts contain `content/runtime.js`.
- Both artifacts contain a `chunks/localVaultPermissionPrompt-*.js` chunk.
- In both artifacts, `content/runtime.js` references the prompt chunk basename/path.
- In both artifacts, the prompt chunk contains `local-vault-permission.html`.
- Chrome artifact permissions include `offscreen`.
- Firefox artifact permissions omit `offscreen`.
- Both artifacts use WAR matches `http://*/*` and `https://*/*`.
- Neither artifact uses `<all_urls>` in WAR matches.

## Chrome Web Store Safety

The Chrome Web Store release commands were safety-checked without real publish:

- `release:chrome` remains an alias for `release:chrome:dry-run`.
- `npm run release:chrome` without `--zip` exits `1` with:
  `Dry-run requires --zip <path>. Refusing to auto-select release artifacts.`
- `npm run release:chrome -- --zip ./missing-release.zip` with dummy CWS env exits `1` because the zip does not exist.
- `npm run release:chrome -- --zip ./all-in-ob-v0.2.0.zip` with dummy CWS env exits `0`, prints the upload/publish URLs, and does not upload or publish.
- `npm run release:chrome:publish` without `--zip` exits `1` with:
  `Publish mode requires --zip <path>. Refusing to auto-select release artifacts.`

Real `release:chrome:publish` was not run.

## Local Vault Manual Release Checklist

Automated coverage completed:

- `test:e2e:browser:local-vault` passed.
- Chrome and Firefox `audit:local-vault-release:report` passed.
- Package artifact inspection matched the readiness audit.

Remaining manual owner checklist before release:

1. Use the fresh Chrome `build/dist` from the release candidate or the generated Chrome artifact.
2. Load the unpacked extension in Chrome via `chrome://extensions/`.
3. Trigger the Local Vault authorization entry from Options.
4. Confirm the Local Vault permission prompt is visible.
5. Cancel the prompt and confirm existing vault settings remain intact.
6. Trigger authorization again and select a real local test folder.
7. Confirm successful permission handoff; if safe for the environment, perform a test write into the selected folder.
8. Confirm reauthorization works after revoking or invalidating the saved folder handle.

Why this remains manual:

- The current automated harness uses fake File System Access and fake IndexedDB
  to cover app behavior deterministically.
- The real OS file picker cannot be completed by the Playwright harness in this
  environment without manual interaction and owner-selected local folder scope.

## Skipped Commands

- Real Chrome Web Store upload/publish: skipped by policy; requires owner
  credentials and explicit owner authorization.
- Real OS file picker Local Vault selection: not automated; covered by the
  manual release checklist above.
- `npm audit fix --force`: skipped by policy; dependency upgrades are a separate
  plan.

## Rollback

Rollback point for this release-readiness evidence branch:

```bash
git reset --hard dada57edef5821dffb2e30af6fa01c64a2349b4f
```

If this branch is merged to the stabilization integration branch, the same base
commit is the rollback point for removing this documentation-only handoff.

## Remaining Release Risks

- `content/runtime.js` is exactly at the `56.0 KB` budget and remains sensitive
  to any future content runtime import growth.
- `npm audit --audit-level=low` remains red for dev/release tooling; see
  `docs/long-term-maintenance-backlog-2026-03-29.md`.
- Real Chrome Web Store publish remains owner-controlled.
- Real Local Vault OS picker authorization remains a manual pre-release check.
