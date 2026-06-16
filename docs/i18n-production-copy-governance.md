# I18n Production Copy Governance

最后更新：2026-06-16

## 当前不变量

Production user-visible copy 的长期治理目标必须满足以下规则：

- 产品自有可见文案只能来自 i18n catalog，或来自 `UserVisibleMessageDescriptor` 这类 typed descriptor 的 key。
- Background/content 边界只传递 descriptor、message code 与 params；不要跨边界传递新写的中文产品文案。
- UI owner 在拥有当前 `Messages` 的位置格式化 descriptor；shared error factory、pipeline payload builder、content message guard 不负责拼接最终可见句子。
- 技术日志、站点原生 token、用户提供内容、诊断数据与产品自有 UI copy 必须分开分类。只有产品自有 UI copy 必须 catalogize；非产品文本必须有 allowlist proof。

当前 hard gate 与 report 的覆盖范围不同：`audit:i18n-hardcoded-user-copy:check` 是已接入 `quality` 的中文/CJK 与 descriptor-boundary hard gate；`audit:i18n-uncatalogued-user-copy` 是英文 uncatalogued-copy 的第一阶段 report-only 审计，用于把新增英文 UI copy、translation fallback 与 descriptor payload 迁移候选显性化。不要把第一阶段英文 report 表述为 hard gate。

## Catalog Source

Runtime、schema 与 WebExtension static 文案来源是：

- `src/i18n/catalog/messages/<locale>/runtime.json`
- `src/i18n/catalog/messages/<locale>/schema.json`
- `src/i18n/catalog/messages/<locale>/static.json`

Release human UI locales 固定为 `en`、`zh-CN`、`ja`、`de`、`fr`、`es-ES`、`es-419`、`it`、`ko`、`pt-BR`、`ru`、`zh-TW`。`qps-ploc` 是 dev/test-only pseudo-locale，不得进入 production runtime registry、build output、Chrome ZIP 或 Firefox XPI release surface。

Catalog 维护流程：

```bash
npm run i18n:catalog:generate
npm run i18n:catalog:check
npm run i18n:lint
npm run audit:locales:report
```

新增 runtime key 时，先补 English source catalog，再补齐全部 release locale。同一个 catalog-owner 变更内运行 `npm run i18n:catalog:generate`，让 `src/i18n/generated/**` 与 `public/_locales/**` 由工具刷新；不要手写 generated artifacts。若 generator 因 key registry 来自当前 generated English catalog 而拒绝新增 key，按 catalog-owner 口径在同一受控提交中补 English source 与 generated key registry，再运行 generate/check 归一化。

## Descriptor Contract

Typed boundary descriptor 定义在 `src/shared/i18n/userVisibleMessageDescriptor.ts`：

- `key`: runtime catalog key 字符串。
- `values`: `string | number | boolean | null | undefined` 组成的 params record。
- `fallback`: 仅限非中文兼容兜底或缺 key 的受控边缘场景；不得作为新中文产品文案通道。
- `isUserVisibleMessageDescriptor()` 验证跨边界 payload。
- `toSerializableUserVisibleMessageDescriptor()` 丢弃 `undefined` params，输出可传输 descriptor。

格式化入口是 `src/i18n/userVisibleMessageFormatter.ts` 的 `formatUserVisibleMessage(descriptor, messages, fallback?)`。只有拥有当前 `Messages` 的 UI owner、notification owner 或 Options renderer 应该格式化 descriptor。Shared error factory、background pipeline、content message guard 可以 import descriptor 类型和 guard，但不要 import generated locale catalog 或 `DEFAULT_RUNTIME_MESSAGES` 来生成最终可见 copy。

常见字段：

- Shared errors: `userMessageDescriptor`
- Connection results: `messageDescriptor`、`errorDescriptor`、`labelDescriptor`
- Support progress: `message`
- App/runtime payloads: descriptor sibling must accompany user-visible `message` / `label` / `title` / `description` fields when those fields can cross background/content boundaries.

## Hardcoded User-Copy Audit

Audit owner:

- Script: `scripts/audit-i18n-hardcoded-user-copy.mjs`
- Allowlist: `tools/i18n-hardcoded-user-copy-allowlist.json`

Npm entrypoints:

```bash
npm run audit:i18n-hardcoded-user-copy
npm run audit:i18n-hardcoded-user-copy:check
```

`audit:i18n-hardcoded-user-copy` prints the report. `audit:i18n-hardcoded-user-copy:check` is the hard gate and is wired into `quality`; it first writes `build/reports/production-build-graph.json`, then runs the audit in `--check` mode. Directly running `node scripts/audit-i18n-hardcoded-user-copy.mjs --check` is lower-level: it does not refresh the production build graph, so prefer the npm script for gate evidence.

The audit excludes catalog/generated locale sources and scans production-reachable `src/**` plus `public/**` for:

- CJK product-authored source literals outside catalog.
- Chinese fallback args in translation helpers.
- User-visible boundary payload fields without descriptor siblings.
- Stale or invalid allowlist entries.

Valid allowlist entries must include `id`, `path`, `category`, `reason`, `ownerPlan`, `revisit`, a stable locator (`line`, `pattern`, or `literalIncludes`), and applicable `findingKinds`. Broad path-only allowlists are invalid. The current retained allowlist is limited to P21 site-native AI parser tokens and must be revisited if parser ownership changes.

## English Uncatalogued-Copy Report

Audit owner:

- Script: `scripts/audit-i18n-uncatalogued-user-copy.mjs`
- Allowlist: `tools/i18n-uncatalogued-user-copy-allowlist.json`

Npm entrypoint:

```bash
npm run audit:i18n-uncatalogued-user-copy
```

This command first refreshes `build/reports/production-build-graph.json`, then scans production-reachable `src/**` plus relevant `public/**`. It excludes catalog/generated locale sources, `public/_locales/**`, dev harness public HTML, tests/docs/fixtures/generated files, technical identifiers, URLs, event names, class/icon tokens, CSS text, and site-native AI parser token arrays.

The report currently classifies:

- `english-translation-fallback`: English fallback text in translation helper calls. Existing findings are migration candidates unless a future narrow allowlist classifies a specific retained fallback as `acceptable-fallback`.
- `uncatalogued-ui-copy`: English product-authored UI copy in user-visible object fields such as `label`, `title`, `message`, `description`, `placeholder`, and `ariaLabel`.
- `descriptor-boundary`: English user-visible payload fields under background/content/runtime/error boundaries without a descriptor sibling.
- `html-uncatalogued-copy` and `dom-text-copy`: text nodes or DOM text assignment outside the catalog.

Current tree truth on 2026-06-16 after the AI parser graph cleanup: `scanned=573 findings=407 unexpected=407 staleAllowlist=0`, grouped as `translation-fallback=253`, `english-literal=134`, `descriptor-boundary=20`. Top owners are `src/options/stitch/content.ts`, `src/options/stitch/schema/resources/onboarding.ts`, `src/options/stitch/schema/resources/plugin-setup.ts`, `src/options/stitch/schema/resources/data-usage.ts`, `src/options/stitch/schema/resources/privacy-policy.ts`, and `src/options/stitch/schema/settings/maintenance.ts`.

Because the current report still contains hundreds of real migration candidates, it is not wired into `quality`, `verify:preflight`, CI, build, package, or release gates. The CLI supports `--check`, but that mode is reserved for local ratchet experiments until the current findings are migrated or narrowly classified. Do not add a broad path-only allowlist to force `--check` green.

Gate-readiness criteria:

- Current findings are migrated to catalog/descriptor or covered by narrow allowlist entries with `id`, `path`, `category`, `reason`, `ownerPlan`, `revisit`, and a stable locator.
- `npm run audit:i18n-uncatalogued-user-copy` is standalone green in report mode and `node scripts/audit-i18n-uncatalogued-user-copy.mjs --check` has been evaluated against the intended allowlist without stale entries.
- The owner records false-positive analysis in the execution ledger before wiring any check mode into `quality`, `verify:preflight`, CI, build, package, or release scripts.

## Surface Ownership

The current post-migration ownership is:

- Options/Stitch static settings, resource, overview, and runtime surface copy: P16, catalog-backed via `SchemaContext.messages`, `SchemaContext.t`, and production shell messages.
- Changelog/release-note resource copy: P17, catalog-backed production resource rendering.
- Shared `AppError` user-facing messages: P18, descriptor-backed `userMessageDescriptor`.
- Vault routing, REST candidates, config defaults, Zod/schema defaults, and YAML generator warnings: P19, descriptor or catalog-backed output.
- Content runtime Clipper/Stitch/export destination fallbacks: P20, catalog-backed or non-Chinese compatibility defaults; no synthesized setup labels.
- AI chat parser native tokens: P21, source-site token allowlist only; product fallback titles must be neutral or localized.
- Hard gate and allowlist policy: P22, `quality` runs `audit:i18n-hardcoded-user-copy:check`.

## Regression Expectations

Post-migration regression coverage is anchored by `tests/unit/i18n/hardcodedSurfaceCoverage.test.ts`. That test maps every migrated P03-P22 surface to executable evidence and asserts the coverage matrix does not introduce new CJK literals.

When adding or changing production user-visible copy, include focused tests for the affected owner and run at least:

```bash
npm run typecheck
npm run build:dev
npm run test:i18n
npm run audit:i18n-hardcoded-user-copy:check
npx vitest run --config vitest.unit.config.ts tests/unit/i18n/hardcodedSurfaceCoverage.test.ts
```

Run broader `npm run quality`, `npm run test`, and browser/visual checks when the change touches shared runtime boundaries, Options shell rendering, exported content, package scripts, generated catalog artifacts, or release surface behavior.
