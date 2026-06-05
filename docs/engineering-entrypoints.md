# 工程命令与入口

最后更新：2026-06-05

## 推荐运行环境

- Node.js：`.nvmrc` pins `20.20.2`；package engines allow `>=20.19 <21`
- npm：validated `10.8.2`；package engines allow `>=10 <11`
- Playwright：`npx playwright install --with-deps chromium`

## 本轮统一门禁真值

- `npm run quality`
  - 显式包含 `verify:runtime`，运行 `scripts/verify-runtime.mjs` 校验当前 Node.js 满足 `package.json` 的 `engines.node`
  - 显式包含 `typecheck:app`
  - 显式包含 `typecheck:tests`
  - 显式包含 `typecheck:strict`
  - 显式执行 production `build:fast` 后运行 `audit:release-surface:report`
  - 显式包含 `audit:locales:report`，在 i18n lint 与字符预算通过后校验 config、locale loaders、locale files 三方一致
  - i18n 产品范围决策为 `release-13-languages`：release-supported human UI locales 为 `en`、`zh-CN`、`ja`、`de`、`fr`、`es-ES`、`es-419`、`it`、`ko`、`pt-BR`、`ru`、`zh-TW`
  - `qps-ploc` 分类为 `dev-test-only`；production build/package output 与 release-surface audit 不允许出现 `qps-ploc` loader/chunk 或 `_locales/qps-ploc/messages.json`
  - `npm run test:i18n` 包含 `layout:report`；clean worktree 中需先运行 `npm run build:dev` 或 `npm run build` 生成 `build/dist`
  - `lint:options-css` 的当前有效规则覆盖 `src/options/**/*.css`；`src/options/stitch/styles/**` 的 `--print-config` 必须包含非空 `selector-class-pattern`
  - 显式包含 `lint:hardcoded`；当前 standalone 输出为 `0` errors / `8` warnings，warning-only 不阻塞该 hard gate
  - `audit:design-system-doc:report` 只检查 tracked / non-ignored 的 active style guidance；被 `.gitignore` 标记的本地过程 archive 不进入当前样式真值口径
- `npm run verify:preflight`
  - 显式包含 `verify:runtime`
  - 显式包含 `typecheck:app`
  - 显式包含 `typecheck:tests`
  - 显式包含 `typecheck:strict`
  - 串行继续执行 `lint -- --quiet`、`build:dev`、`audit:*` 报告
- `.github/workflows/ci.yml`
  - 显式执行同一组三项 typecheck，不再依赖隐式覆盖
  - `Verify preflight baseline` 后显式运行 `build:fast` 与 `audit:release-surface:report`
  - `Locale source alignment audit report` 是 hard gate，不再 `continue-on-error`
  - `Enforce hardcoded config guard` 显式运行 `npm run lint:hardcoded`
- 2026-05-22 final exit gate 真值：在 Node `v20.20.2` / npm `10.8.2` 下，`quality`、`verify:preflight`、`test:unit`、`clean`、`build:dev`、`audit:build:report`、`audit:performance:report`、`verify:stitch-secondary`、`visual:test`、browser smoke、reader-panel、local-vault 均已通过；`build/dist/content/runtime.js` raw `54,554` bytes，低于当时 `57,600` stop gate
- 2026-05-24 M2.5 budget ratchet 真值：M2.1-M2.4 合入后，`audit:build:report` 的 `content/runtime.js` raw stop gate 收紧为 `56,320` bytes；chunk count 收紧为 `<= 112`；hotspot line budgets 以 `docs/performance-baseline.md` 为准
- 2026-05-26 M10 source-of-truth sync 真值：maintainability-debt M0-M10 合入后的 integration branch 上，`quality`、`verify:preflight`、`lint:type-any`、`audit:performance:report`、`audit:build:report`、`audit:compatibility-duplicates:check` 与 `audit:non-production-source:report` 均已重新采集；当前 type/warning/non-production source 数值见下文
- 2026-05-26 M10 budget ratchet 真值：`quality` 显式包含 `lint:type-any:ratchet`；`verify:preflight` 继续包含 `audit:performance:report`，且 performance report 覆盖当前全部 `src` >250 LOC 文件
- 2026-06-01 Plan 09 compatibility duplicate 真值：`quality` 显式包含 `audit:compatibility-duplicates:check`；当前 usage/rest compatibility candidate files 为 `0`，exact duplicate groups 为 `0`，allowlist entries 为 `0`，因此没有生产 allowlist。工具中的旧 `src/options/components/sections/usage*.ts` / `src/options/widgets/shared/usage/**` scope 是 retired compatibility reintroduction guard，只用于防止已退役 usage compatibility shells 被重新引入并复制，不代表当前生产 owner。
- 2026-05-25 post-gap runtime guard 真值：本轮验证使用 Node `v20.20.2` / npm `10.8.2`；`package.json` 与 `package-lock.json` root engines 要求 Node `>=20.19 <21`，`verify:runtime` 会读取 `package.json` 的 `engines.node` 并已接入 `quality` 与 `verify:preflight`
- 2026-05-29 Plan 10 D3 dependency-audit 真值：Node `v20.20.2` / npm `10.8.2` 下，`npm audit --omit=dev` 与 `npm audit --audit-level=low` 均为 `0` vulnerabilities；production runtime release gate 与 dev/release toolchain audit 均为 green
- 2026-05-29 Plan 11 G2/G3 governance 真值：`lint:hardcoded` 已接入 `quality` 与 CI；`audit:platform-boundary:report` 仍是 report-only standalone evidence，当前报告 `148` findings（composition-root `11`、offscreen-local-vault-permission-root `1`、platform-adapter `93`、shared-runtime-helper `23`、type-only `20`），不得当作 hard gate；`npm audit --audit-level=low` 当前 green 但未接入 `quality`
- 2026-05-29 Plan 11 G4 preflight 真值：`audit:imports:check` 已恢复为 green，当前输出 `No deep relative imports found.`；`verify:preflight` 不再因 `src/content/shared/panels/sessionPanelResizeAdapter.ts` 的深层相对导入失败
- 2026-06-01 Plan 09 final verification 真值：Node `v20.20.2` / npm `10.8.2` 下，YAML editor / Stitch host 的 `exactOptionalPropertyTypes` gap 已用窄范围类型安全修复收口；`typecheck:strict`、`quality`、`verify:preflight`、`build`、`verify:stitch-secondary` 均已重新通过。该修复未放宽门禁，preview freeze JS allowlist 仅刷新为精确 hash。
- 2026-06-05 GA production telemetry P13 type-ratchet gap fix 真值：GA 集成树当前 `lint:type-any` 实测为扫描 `1036` files，overall `0/1064/1736/41/4`、src `0/576/596/5/0`、tests `0/488/1140/36/4`；本次同步只刷新 `unknown` / `assertions` current truth，`any` 继续保持 `0`，`non-null` 与 `ts-expect-error` 上限保持原值。

## 当前推荐执行顺序

本地前置守门：

```bash
npm run quality
npm run verify:preflight
npm run typecheck:strict
```

浏览器与交互验真：

```bash
npm run test:e2e:browser:local-vault
npm run test:e2e:browser:smoke
npm run test:e2e:browser
npm run test:e2e:browser:reader-panel
npm run verify:stitch-secondary
npm run visual:test
```

Reader/video browser E2E command truth:

- `node scripts/run-playwright.mjs test tests/e2e/<file> --project=chromium-desktop` automatically uses `playwright.reader.config.ts` when no explicit `--config` is supplied.
- `playwright.reader.config.ts` starts the local Playwright web server and runs `build:dev`, so reader/video browser E2E tests do not depend on a pre-existing `build/dist`.
- Visual browser tests remain owned by `playwright.config.ts` and `tests/visual/**`.

Local Vault / release handoff checks:

```bash
npm run clean
npm run build
npm run audit:release-surface:report
npm run audit:local-vault-release:report -- --browser chrome
npm run build:firefox
npm run audit:local-vault-release:report -- --browser firefox
npm run release:chrome -- --zip <release.zip>
```

`build/dist` is a single-browser-target output. Run the Chrome Local Vault release
audit immediately after the Chrome production build, then rebuild for Firefox
before running the Firefox audit; do not reuse a Firefox build for Chrome audit or
a Chrome build for Firefox audit. `build:fast` / `build:firefox:fast` are only
acceptable when a surrounding standalone quality gate has already passed.

`release:chrome` is a dry-run alias. A real Chrome Web Store publish must use
`npm run release:chrome:publish -- --zip <release.zip>` with owner-provided
credentials and manual confirmation.

## 当前 Lint / Type 债务真值

2026-05-29 post-remediation governance truth:

- `npm run lint -- --quiet`：通过，当前没有 ESLint error。
- `npm run lint:warnings-guard`：通过；checked-in baseline 仍为 `132`，fresh warning count 为 `127`，当前 gate 输出为 `Warning 总量下降 5 条`，baseline file 尚未同步收紧。
- `npm run lint:warnings-report`：会重写 `tools/baselines/lint-warnings.json`，不得在普通里程碑中随手运行后遗留 diff；只在有意同步 warning truth 时运行。
- 当前 warning 主要规则族：`require-await`（`94`）与 unsafe type warnings。
- `npm run lint:hardcoded`：通过；当前为 `0` errors / `8` warning-only findings，且已接入 `quality` 与 CI。
- `npm run lint:type-any`：扫描当前 GA 集成树 `1036` files；overall 为 `any: 0`、`unknown: 1064`、assertions `1736`、non-null assertions `41`、`ts-expect-error: 4`；src 为 `0/576/596/5/0`；tests 为 `0/488/1140/36/4`。
- `scripts/audit-types.mjs` 支持 overall 阈值参数 `--max-any`、`--max-unknown`、`--max-assertions`、`--max-non-null`、`--max-ts-expect-error`，并支持 scoped 阈值参数 `--max-src-*` / `--max-tests-*`。
- `npm run lint:type-any:ratchet`：同时守住 overall `0/1064/1736/41/4`、src `0/576/596/5/0`、tests `0/488/1140/36/4`，并已接入 `quality` 作为 type-debt hard gate；tests 下降不得抵消 src 增长。

## 当前构建预算真值

`npm run audit:build:report` 当前执行以下预算：

- `content/index.js <= 1 KB`
- `content/runtime.js <= 55 KB`
- `options/index.js <= 12 KB`
- `onboarding/index.js <= 16 KB`
- 任一 chunk `<= 320 KB`
- 最大 shared chunk `<= 190 KB`
- 第二大 shared chunk `<= 136 KB`
- 第三大 shared chunk `<= 90 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 112`
- 当前 `M4` 口径以“保住已验真的 retained set”为准，不再强制证明旧版单批文件数预算

2026-05-29 Plan 11 G3 dev build truth:

- `npm run verify:preflight` 后的 `npm run audit:build:report` 通过
- `build/dist/content/runtime.js`: `53.1 KB`（raw `54,375` bytes；raw stop gate `56,320`）
- `build/dist/options/index.js`: `997 B`
- `build/dist/onboarding/index.js`: `12.3 KB`
- chunks: `103`
- 2026-05-22 review gap patch 在 Node `v20.20.2` / npm `10.8.2` 下补跑并通过 Chrome `npm run build` -> `npm run audit:local-vault-release:report -- --browser chrome`、Firefox `npm run build:firefox` -> `npm run audit:local-vault-release:report -- --browser firefox`
- `src/shared/errors/analytics/analyticsConfig.ts` is tracked as a non-sensitive disabled default; clean checkout no longer needs a copied ignored local analytics file for typecheck/build.

2026-06-05 GA production telemetry P13 final build truth:

- `quality` 与 `verify:preflight` 在 Node `v20.20.2` 下通过
- `build/dist/content/runtime.js`: `54.9 KB`（raw `56,246` bytes；raw stop gate `56,320`）
- `build/dist/options/index.js`: `997 B`
- `build/dist/onboarding/index.js`: `15.8 KB`（raw `16,200` bytes）
- chunks: `108`
- GA content/onboarding telemetry now lives behind lazy `clipFlowAnalytics-*` / `onboardingAnalytics-*` chunks so entry bundles remain within the existing release gates.

## 核心命令

- `npm run build:dev`
- `npm run build`
- `npm run typecheck:app`
- `npm run typecheck:tests`
- `npm run typecheck:strict`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:e2e:browser`
- `npm run test:e2e:browser:smoke`
- `npm run test:e2e:browser:reader-panel`
- `npm run test:coverage`
- `npm run test:i18n`
- `npm run lint:hardcoded`
- `npm run audit:locales:report`
- `npm run visual:test`
- `npm run verify:runtime`
- `npm run report:release-summary`
- `npm run audit:local-vault-release:report`
- `npm run audit:release-surface:report`

## 正式代码入口

- foundation：`src/ui/foundation/*`
- primitives：`src/ui/primitives/*`
- patterns：`src/ui/patterns/*`
- hosts：`src/ui/hosts/*`
- domains：`src/ui/domains/*`
- Options 主链：`src/options/index.ts -> src/options/app/bootstrap.ts`
- content 主链：`src/content/index.ts -> src/content/runtime/*`

## 已降级为兼容壳的入口

- `src/content/video/session.ts`
- `src/content/video/platforms/bilibiliPlatform.ts`
- `src/ui/domains/privacy/PrivacySettings.ts`

## MCP / 本地浏览器调试入口

生产构建与发布包默认不包含 harness 入口；`build:dev` / dev server 保留以下 harness 页面用于本地浏览器调试：

- `http://localhost:4173/options/index.html`
- `http://localhost:4173/onboarding/index.html`
- `http://localhost:4173/content-orchestrator-harness.html`
- `http://localhost:4173/runtime-observability-harness.html`
- `http://localhost:4173/interaction-contract-harness.html`
