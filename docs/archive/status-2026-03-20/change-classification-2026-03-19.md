# Change Classification - 2026-03-19

This branch snapshot groups the current work in `AiiinOB` into development changes vs local/generated files so the in-progress branch can be committed cleanly.

## Included in the branch snapshot

- Source refactors and feature work under `src/`
- Test migration and new coverage under `tests/`
- Documentation updates and additions under `docs/`
- Build, packaging, and quality tooling updates in `scripts/`, `package.json`, `tsconfig*`, `vitest*`, workflow files, and supporting config files
- Intentional tracked deletions where files were removed or relocated during the refactor

## Ignored from the branch snapshot

- Build outputs: `dist/`, `build/`, `releases/`, `*.xpi`
- Local automation/editor state: `.claude/`
- Temporary or disposable outputs: `tmp/`, `trash/`, `test-results/`

## Status summary before staging

- Modified: 112
- Deleted: 86
- Untracked: 353

Main affected areas:

- `src/`
- `tests/`
- `docs/`
- `scripts/`

This classification is intentionally narrow: it keeps the current development snapshot while excluding generated or local-only files.
