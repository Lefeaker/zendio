# 工程命令与入口

最后更新：2026-05-25

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
- 2026-05-22 final exit gate 真值：在 Node `v20.20.2` / npm `10.8.2` 下，`quality`、`verify:preflight`、`test:unit`、`clean`、`build:dev`、`audit:build:report`、`audit:performance:report`、`verify:stitch-secondary`、`visual:test`、browser smoke、reader-panel、local-vault 均已通过；`build/dist/content/runtime.js` raw `54,554` bytes，低于当时 `57,600` stop gate
- 2026-05-24 M2.5 budget ratchet 真值：M2.1-M2.4 合入后，`audit:build:report` 的 `content/runtime.js` raw stop gate 收紧为 `56,320` bytes；chunk count 收紧为 `<= 112`；hotspot line budgets 以 `docs/performance-baseline.md` 为准
- 2026-05-25 M5.1 source-of-truth sync 真值：Plans 1-4 合入后的 integration branch 上，`quality`、`verify:preflight`、`lint:type-any`、`audit:performance:report`、`audit:build:report` 与 `audit:non-production-source:report` 均已重新采集；当前 type/warning/non-production source 数值见下文
- 2026-05-25 M5.3 budget ratchet 真值：`quality` 显式包含 `lint:type-any:ratchet`；`verify:preflight` 继续包含 `audit:performance:report`，且 performance report 已扩展到当前全部 `src` >250 LOC 文件
- 2026-05-25 M5.4 compatibility duplicate 真值：`quality` 显式包含 `audit:compatibility-duplicates:check`；当前 usage/rest compatibility candidate files 为 `16`，exact duplicate groups 为 `0`，因此没有生产 allowlist
- 2026-05-25 post-gap runtime guard 真值：本轮验证使用 Node `v20.20.2` / npm `10.8.2`；`package.json` 与 `package-lock.json` root engines 要求 Node `>=20.19 <21`，`verify:runtime` 会读取 `package.json` 的 `engines.node` 并已接入 `quality` 与 `verify:preflight`

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

2026-05-25 deep-debt integration truth:

- `npm run lint -- --quiet`：通过，当前没有 ESLint error。
- `npm run lint:warnings-guard`：通过；checked-in baseline 已同步为 `165`，fresh warning count 为 `165`。
- `npm run lint:warnings-report`：会重写 `tools/baselines/lint-warnings.json`，不得在普通里程碑中随手运行后遗留 diff；只在有意同步 warning truth 时运行。
- 当前 warning 主要规则族：`require-await`、`no-unused-vars`、`unbound-method`、unsafe type warnings、`no-explicit-any`。
- `npm run lint:type-any`：扫描 `1082` files；overall 为 `any: 0`、`unknown: 971`、assertions `1667`、non-null assertions `108`、`ts-expect-error: 5`。
- `scripts/audit-types.mjs` 支持 overall 阈值参数 `--max-any`、`--max-unknown`、`--max-assertions`、`--max-non-null`、`--max-ts-expect-error`，并支持 scoped 阈值参数 `--max-src-*` / `--max-tests-*`。
- `npm run lint:type-any:ratchet`：同时守住 overall `0/971/1667/108/5`、src `0/540/626/5/0`、tests `0/431/1041/103/5`，并已接入 `quality` 作为 type-debt hard gate；tests 下降不得抵消 src 增长。

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
- `RestSection <= 40 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 112`
- 当前 `M4` 口径以“保住已验真的 retained set”为准，不再强制证明旧版单批文件数预算

2026-05-25 M5.1 dev build truth:

- `npm run verify:preflight` 后的 `npm run audit:build:report` 通过
- `build/dist/content/runtime.js`: `53.1 KB`（raw `54,337` bytes；raw stop gate `56,320`）
- `build/dist/options/index.js`: `997 B`
- `build/dist/onboarding/index.js`: `12.3 KB`
- chunks: `102`
- 2026-05-22 review gap patch 在 Node `v20.20.2` / npm `10.8.2` 下补跑并通过 Chrome `npm run build` -> `npm run audit:local-vault-release:report -- --browser chrome`、Firefox `npm run build:firefox` -> `npm run audit:local-vault-release:report -- --browser firefox`
- `src/shared/errors/analytics/analyticsConfig.ts` is tracked as a non-sensitive disabled default; clean checkout no longer needs a copied ignored local analytics file for typecheck/build.

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
- `src/ui/domains/yaml-config/yamlConfigTableDom.ts`
- `src/ui/domains/yaml-config/yamlConfigTableModel.ts`
- `src/ui/domains/privacy/PrivacySettings.ts`
- `src/options/components/sections/RestSection.ts`
- `src/options/components/sections/FragmentSection.ts`
- `src/options/components/sections/UsageSection.ts`

## MCP / 本地浏览器调试入口

生产构建与发布包默认不包含 harness 入口；`build:dev` / dev server 保留以下 harness 页面用于本地浏览器调试：

- `http://localhost:4173/options/index.html`
- `http://localhost:4173/onboarding/index.html`
- `http://localhost:4173/content-orchestrator-harness.html`
- `http://localhost:4173/runtime-observability-harness.html`
- `http://localhost:4173/interaction-contract-harness.html`
