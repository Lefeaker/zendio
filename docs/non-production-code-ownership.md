# Non-Production Code Ownership

Last updated: 2026-05-18

## 3.0 Definition

Non-Production Code 3.0 treats every `src/**` path as owned until structured evidence proves otherwise. A file is not deletion-ready merely because it is absent from the production esbuild output. Retained source imports, barrel re-exports, tests, scripts, public or manifest assets, and required browser or visual verification commands are all owners.

`npm run audit:non-production-source:report` is the ownership inventory. It prints every classified row and may exit non-zero while intentional `migrate-*` or retained inventory remains. That non-zero exit is evidence to inspect and record; it is not by itself a hard-gate failure.

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

Record the report command's exit status and decision counts. A report exit 1 is acceptable when the counts are understood, `stop-unknown` is 0, and remaining rows are owner-approved `migrate-*` or `retain-*` inventory.

Require the check command to exit 0. It fails on:

- `stop-unknown > 0`;
- unsafe `delete-now` rows whose six deletion proofs are missing, malformed, or non-empty;
- internal classifier contradictions where retained source import, re-export, dependency, script, test, public, manifest, or required verification owners coexist with `delete-now`.

It does not fail merely because `migrate-import-owner`, `migrate-script-owner`, `migrate-test-owner`, `retain-production`, or `retain-production-facade` inventory remains.

## Current Report-Only Backlog

The 2026-05-17 technical-debt orchestration completed classification and deletion safety
governance. It did not clear the non-production migration backlog, and no existing
`src/**` file was deleted in Plan 6.

As of the 2026-05-18 completion audit, `npm run audit:non-production-source:report`
exits 1 with eight report-only rows:

- `src/components/trial-notice.ts`
- `src/content/clipper/shared/styleManager.ts`
- `src/env.d.ts`
- `src/options/stitch/runtime/actions.ts`
- `src/options/stitch/styles/variants/stitch-secondary.css`
- `src/styles/clipper/highlight-themes.css`
- `src/styles/design-tokens.css`
- `src/ui/foundation/tokens/index.ts`

These rows are tracked in `docs/long-term-maintenance-backlog-2026-03-29.md` with
owner evidence and acceptance commands. They must not be hidden by a broad allowlist
or promoted into a production hard gate until each row has an owner-approved
migration or explicit retained-contract decision.
