# I18n Production Copy Governance

最后更新：2026-06-17

## 当前不变量

Production user-visible copy 的长期治理目标必须满足以下规则：

- 产品自有可见文案只能来自 i18n catalog，或来自 `UserVisibleMessageDescriptor` 这类 typed descriptor 的 key。
- Background/content 边界只传递 descriptor、message code 与 params；不要跨边界传递新写的中文产品文案。
- UI owner 在拥有当前 `Messages` 的位置格式化 descriptor；shared error factory、pipeline payload builder、content message guard 不负责拼接最终可见句子。
- 技术日志、站点原生 token、用户提供内容、诊断数据与产品自有 UI copy 必须分开分类。只有产品自有 UI copy 必须 catalogize；非产品文本必须有 allowlist proof。

当前 hard gate 覆盖两条互补审计：`audit:i18n-hardcoded-user-copy:check` 是已接入 `quality` 的中文/CJK 与 descriptor-boundary hard gate；`audit:i18n-uncatalogued-user-copy:check` 是已接入 `quality` 与 `verify:preflight` 的英文 uncatalogued-copy hard gate，用于阻止新增英文 UI copy、translation fallback 与 descriptor payload 绕过 catalog/descriptor。

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
- App/runtime payloads: descriptor sibling must accompany user-visible `message` / `label` / `title` / `description` / `subtitle` / `hint` / `body` fields when those fields can cross background/content boundaries.
- Shared error fallbacks: `normalizeToAppError(..., { defaultMessage })` is user-visible whenever it can populate `message` / `userMessage`; production English fallbacks must use catalog-backed descriptors instead of raw prose.

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

## English Uncatalogued-Copy Hard Gate

Audit owner:

- Script: `scripts/audit-i18n-uncatalogued-user-copy.mjs`
- Allowlist: `tools/i18n-uncatalogued-user-copy-allowlist.json`

Npm entrypoints:

```bash
npm run audit:i18n-uncatalogued-user-copy
npm run audit:i18n-uncatalogued-user-copy:check
```

Both npm entrypoints first refresh `build/reports/production-build-graph.json`, then scan production-reachable `src/**` plus relevant `public/**`. `audit:i18n-uncatalogued-user-copy` prints the report; `audit:i18n-uncatalogued-user-copy:check` is the hard gate and is wired into `quality` and `verify:preflight`. Directly running `node scripts/audit-i18n-uncatalogued-user-copy.mjs --check` is lower-level because it does not refresh the production build graph, so prefer the npm script for gate evidence.

The audit excludes catalog/generated locale sources, `public/_locales/**`, dev harness public HTML, tests/docs/fixtures/generated files, technical identifiers, URLs, event names, class/icon tokens, CSS text, and site-native AI parser token arrays. Numbered natural-language UI titles are not technical token lists merely because they contain a list marker or numeric token.

Coverage includes user-visible field taxonomy beyond the original title/label/message set: `subtitle`, `hint`, `body`, `defaultMessage`, `placeholder`, `ariaLabel`, numbered step/title prose, and comparable UI fields are scanned when they appear in production-reachable source. `normalizeToAppError(..., { defaultMessage: "..." })` is a dedicated descriptor-boundary check because that option can become a user-facing fallback. Localized overlay objects with descriptor siblings remain valid; raw preview seed copy is allowed only when catalog-backed, localized by the production renderer, or backed by executable proof that production rendering does not consume the raw field directly.

The report currently classifies:

- `english-translation-fallback`: English fallback text in translation helper calls. Existing findings are migration candidates unless a future narrow allowlist classifies a specific retained fallback as `acceptable-fallback`.
- `uncatalogued-ui-copy`: English product-authored UI copy in user-visible object fields such as `label`, `title`, `message`, `description`, `subtitle`, `hint`, `body`, `placeholder`, `defaultMessage`, and `ariaLabel`.
- `descriptor-boundary`: English user-visible payload fields under background/content/runtime/error boundaries without a descriptor sibling, including `normalizeToAppError` raw English `defaultMessage` fallbacks.
- `html-uncatalogued-copy` and `dom-text-copy`: text nodes or DOM text assignment outside the catalog.

Current tree truth on 2026-06-17 after P01-P07 English copy governance, P07d surface-localization owner split, P08 gate wiring, the coverage follow-up for `defaultMessage` plus expanded visible fields, the numbered UI title false-negative follow-up, and the current `origin/main` merge: `scanned=578 findings=0 unexpected=0 staleAllowlist=0`. The English allowlist currently has `0` rules, so the gate is not masking retained product UI copy.

Valid future allowlist entries must include `id`, `path`, `category`, `reason`, `ownerPlan`, `revisit`, a stable locator (`line`, `pattern`, or `literalIncludes`), and applicable `findingKinds`. Broad path-only allowlists are invalid. Do not add an allowlist rule for product-authored UI copy that should be catalog-backed.

Gate maintenance criteria:

- New production English UI copy must enter the catalog or a typed descriptor before it reaches source.
- Any retained non-product English text must be narrowly classified with allowlist proof and zero stale entries.
- Before changing audit behavior or allowlist policy, run `npm run audit:i18n-uncatalogued-user-copy`, `npm run audit:i18n-uncatalogued-user-copy:check`, `npm run quality`, and `npm run verify:preflight`.

## Surface Ownership

The current post-migration ownership is:

- Options/Stitch static settings, resource, overview, and runtime surface copy: P16, catalog-backed via `SchemaContext.messages`, `SchemaContext.t`, and production shell messages.
- Changelog/release-note resource copy: P17, catalog-backed production resource rendering.
- Shared `AppError` user-facing messages: P18, descriptor-backed `userMessageDescriptor`.
- Vault routing, REST candidates, config defaults, Zod/schema defaults, and YAML generator warnings: P19, descriptor or catalog-backed output.
- Content runtime Clipper/Stitch/export destination fallbacks: P20, catalog-backed or non-Chinese compatibility defaults; no synthesized setup labels.
- AI chat parser native tokens: P21, source-site token allowlist only; product-surface fallback titles must be catalog-backed/localized, and source-site neutral fallback tokens stay inside parser modules.
- Hard gate and allowlist policy: P22, `quality` runs `audit:i18n-hardcoded-user-copy:check`.
- English uncatalogued-copy hard gate: P08 plus coverage follow-up, `quality` and `verify:preflight` run `audit:i18n-uncatalogued-user-copy:check`; the gate covers raw English `normalizeToAppError` default fallbacks, production-visible `subtitle` / `hint` / `body` fields, and numbered natural-language UI titles.

## Regression Expectations

Post-migration regression coverage is anchored by `tests/unit/i18n/hardcodedSurfaceCoverage.test.ts`. That test maps every migrated P03-P22 surface to executable evidence and asserts the coverage matrix does not introduce new CJK literals.

When adding or changing production user-visible copy, include focused tests for the affected owner and run at least:

```bash
npm run typecheck
npm run build:dev
npm run test:i18n
npm run audit:i18n-hardcoded-user-copy:check
npm run audit:i18n-uncatalogued-user-copy:check
npx vitest run --config vitest.unit.config.ts tests/unit/i18n/hardcodedSurfaceCoverage.test.ts
```

Run broader `npm run quality`, `npm run test`, and browser/visual checks when the change touches shared runtime boundaries, Options shell rendering, exported content, package scripts, generated catalog artifacts, or release surface behavior.
