# Non-Production Code Ownership

Last updated: 2026-05-18

## 3.0 Definition

Non-Production Code 3.0 treats every `src/**` path as owned until structured evidence proves otherwise. A file is not deletion-ready merely because it is absent from the production esbuild output. Retained source imports, barrel re-exports, tests, scripts, public or manifest assets, and required browser or visual verification commands are all owners.

`npm run audit:non-production-source:report` is the ownership inventory. It prints every classified row and must exit 0 once every `src/**` path has a structured owner decision. A non-zero report exit means unresolved `stop-unknown`, `delete-now`, `migrate-test-owner`, or `migrate-script-owner` rows remain and the completion state is blocked until each exact path is migrated, deleted with six proofs, or reclassified with an explicit owner and deletion condition.

`npm run audit:non-production-source:check` is the enforceable hard gate. It must exit 0 in `quality` and any equivalent preflight, CI, package, or release gate.

## Allowed src Facades

Compatibility shells, barrel files, type-only entrypoints, and public UI boundaries may remain under `src/**` only when they have an explicit owner and deletion condition. Common retained decisions include:

- `retain-production`: production build or retained import graph ownership exists.
- `retain-production-facade`: the file preserves a public import shape, architecture boundary, compatibility shell, or source-of-truth contract.
- `retain-test-contract`: the file is intentionally retained for a documented production contract used by tests.
- `migrate-import-owner`: retained source imports, re-exports, or dependencies must move before deletion.
- `migrate-script-owner`: scripts, tools, audits, docs, package/build checks, public assets, manifests, or required verification commands still own the path.
- `migrate-test-owner`: tests, visual specs, browser checks, or fixtures still own the path.

Do not classify UI domains, primitives, patterns, hosts, shared schemas, shared interfaces, style tokens, or runtime contract files as deletion candidates unless all six deletion proofs are present and empty and source-of-truth docs no longer require them.

## Test Fixtures

Retired verification fixtures belong under `tests/fixtures/**`, not `src/**`. The retired Options preview runtime has already moved to `tests/fixtures/options-preview/**`; future verification fixtures must not reintroduce preview-backed source ownership under `src/options/preview/**`.

Old Options layout, form section, section class, and non-YAML widget paths are not current implementation guidance. They may remain only while a documented production, import, test, script, public, manifest, or verification owner exists.

## Delete-Now Procedure

`delete-now` is allowed only when all six owner proofs are available and empty for the exact path:

1. Production build graph proof.
2. Retained source import graph proof, including re-exports from index or barrel files.
3. Test, visual, and browser dependency proof.
4. Package and build script proof.
5. Public and manifest asset proof.
6. Required verification command proof.

If any proof is non-empty, malformed, missing, or unknown, the row must remain a retained or migrate decision, or `stop-unknown` if it cannot be classified. Source deletion is not permitted from `stop-unknown`, `migrate-*`, `retain-*`, or contradictory `delete-now` rows.

## Audit Commands

Use both commands together:

```bash
npm run audit:non-production-source:report
npm run audit:non-production-source:check
```

Record the report command's exit status and decision counts. The expected completion state is report exit 0. If the report exits 1, do not claim completion; record the exact blocking rows and either migrate them, delete them with six proofs, or add an exact retained-contract decision.

Require the check command to exit 0. It fails on:

- `stop-unknown > 0`;
- unsafe `delete-now` rows whose six deletion proofs are missing, malformed, or non-empty;
- internal classifier contradictions where retained source import, re-export, dependency, script, test, public, manifest, or required verification owners coexist with `delete-now`.

It does not fail merely because `migrate-import-owner`, `migrate-script-owner`, `migrate-test-owner`, `retain-production`, or `retain-production-facade` inventory remains. The separate report command is stricter for completion audits: unresolved `migrate-test-owner` and `migrate-script-owner` rows must not remain in a completed orchestration.

## Current Retained Contracts

The 2026-05-17 technical-debt orchestration completed classification and deletion safety
governance. The 2026-05-18 gap-closure audit resolved the remaining report-blocking
rows through exact retained-contract classifications. No existing `src/**` file was
deleted in Plan 6 or in the gap-closure pass.

As of the 2026-05-18 gap-closure audit, `npm run audit:non-production-source:report`
exits 0. These exact source contracts remain intentionally retained with owner and
deletion-condition metadata in `tools/report-non-production-source.mjs`:

- `src/components/trial-notice.ts` — trial notice documented UI contract.
- `src/content/clipper/shared/styleManager.ts` — clipper inline style manager documented contract.
- `src/env.d.ts` — TypeScript build and audit global declaration contract.
- `src/options/stitch/runtime/actions.ts` — Stitch runtime action id contract.
- `src/options/stitch/styles/variants/stitch-secondary.css` — Stitch Secondary static style asset contract.
- `src/styles/clipper/highlight-themes.css` — reader and video highlight theme build asset contract.
- `src/styles/design-tokens.css` — design token source-of-truth asset.
- `src/ui/foundation/tokens/index.ts` — design token metadata source contract.

Future changes must not hide new rows with broad allowlists or promote unresolved
report blockers into production hard gates. Each new blocker needs an exact owner
migration, exact retained-contract decision, or six-proof deletion record.
