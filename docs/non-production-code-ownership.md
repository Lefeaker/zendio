# Non-Production Code Ownership

Last updated: 2026-06-01

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

## Fixture And Archive Ownership

The 2026-05-25 M4.2 fixture/archive proof classified the tracked archive and fixture directories without deleting or moving long-lived docs. Sizes were measured from a clean worktree with `du -sh`; references were captured with `rg -n "251126-design-system-poc|reference-fixtures|legacy-options-assets|options-preview" docs tests tools scripts src package.json`.

| Path                             |       Size | Runtime owner              | Test or tool owner                                                                                           | Doc owner                                                                                                         | Decision                                                                                                                |
| -------------------------------- | ---------: | -------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `docs/251126-design-system-poc/` | local-only | none in clean tracked tree | none in clean tracked tree                                                                                   | ignored local POC archive; historical references remain in tracked archive/status docs                            | retain as ignored local archive only; do not stage, move, or delete in repo milestones without explicit owner approval. |
| `docs/archive/`                  |       304K | none                       | design-system and UI architecture audit scripts reference `legacy-options-assets` archive entries            | `docs/archive/README.md`, `docs/design-system-governance.md`, `docs/DESIGN-SYSTEM-INDEX.md`, source-of-truth docs | retain archive; not delete-now.                                                                                         |
| `docs/reference-fixtures/`       |       112K | none                       | `tools/report-ui-architecture-alignment.mjs` and design-system doc audit cover legacy reference fixtures     | `docs/reference-fixtures/README.md`, Bilibili remediation docs, source-of-truth docs                              | retain reference fixtures; not delete-now.                                                                              |
| `tests/fixtures/`                |       340K | none                       | AI chat e2e tests, Options preview runtime tests, `scripts/build-preview.mjs`, schema runtime renderer tests | `docs/non-production-code-ownership.md`, `docs/architecture-boundaries.md`, `src/options/README.md`               | retain test fixtures; not delete-now.                                                                                   |

`docs/reference-fixtures/**` and `tests/fixtures/**` must not be deleted while tests, visual specs, build-preview scripts, or source-of-truth docs reference them. Any future archival movement must first update these owners and rerun `npm run audit:design-system-doc:report`, `npm run verify:stitch-secondary`, `npm run visual:test`, `npm run typecheck:tests`, and `npm run test:unit`.

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
npm run audit:production-build-graph:report
npm run audit:non-production-source:report
npm run audit:non-production-source:check
```

Record the report command's exit status and decision counts. The expected completion state is report exit 0. If the report exits 1, do not claim completion; record the exact blocking rows and either migrate them, delete them with six proofs, or add an exact retained-contract decision.

Require the check command to exit 0. It fails on:

- `stop-unknown > 0`;
- unsafe `delete-now` rows whose six deletion proofs are missing, malformed, or non-empty;
- internal classifier contradictions where retained source import, re-export, dependency, script, test, public, manifest, or required verification owners coexist with `delete-now`.

It does not fail merely because `migrate-import-owner`, `migrate-script-owner`, `migrate-test-owner`, `retain-production`, or `retain-production-facade` inventory remains. The separate report command is stricter for completion audits: unresolved `migrate-test-owner` and `migrate-script-owner` rows must not remain in a completed orchestration.

2026-06-05 GA/i18n PR merge truth: after `audit:production-build-graph:report`,
`audit:non-production-source:report` exits 0 with counts
`migrate-import-owner: 130`, `retain-production: 569`, and
`retain-production-facade: 17`. The four Plan 09 completion blockers were
resolved without weakening gates:

- `src/options/components/controls/readingTemplateControls.ts` was deleted after exact owner proof; current reading template behavior is covered by the production Stitch template state owner.
- `src/options/components/infrastructure/ModalController.ts` was deleted after exact owner proof; retired modal hosts remain absent from the production Options HTML contract.
- `src/ui/foundation/keyboard/index.ts` is explicitly retained as the UI foundation keyboard source-of-truth boundary.
- `src/ui/hosts/options/index.ts` is explicitly retained as the Options UI host source-of-truth boundary.

2026-06-12 P01 audit truth fix: `resolveSourceImport()` now normalizes import
specifier query/hash suffixes such as `?inline` before retained-source import
classification. After rerunning `audit:production-build-graph:report` and
`audit:non-production-source:report`, the report exits 0 with counts
`migrate-import-owner: 133`, `retain-production: 621`, and
`retain-production-facade: 17`. `src/content/video/video-control-bar.css` no
longer appears as a false `migrate-test-owner`; its production owner is
`src/content/video/videoControlBarStyles.ts` importing
`./video-control-bar.css?inline`. Current decision counts are
`migrate-import-owner: 134`, `retain-production: 624`, and
`retain-production-facade: 17`.

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
- `src/ui/foundation/keyboard/index.ts` — UI foundation keyboard source-of-truth boundary.
- `src/ui/hosts/options/index.ts` — Options UI host source-of-truth boundary.

Future changes must not hide new rows with broad allowlists or promote unresolved
report blockers into production hard gates. Each new blocker needs an exact owner
migration, exact retained-contract decision, or six-proof deletion record.
