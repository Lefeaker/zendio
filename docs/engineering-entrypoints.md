# 工程命令与入口

最后更新：2026-06-09

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
  - 显式包含 `audit:locales:report`，在 i18n lint 与字符预算通过后校验 config、locale loaders、catalog runtime/static/schema source、generated locale modules 与 public `_locales` 一致
  - i18n 产品范围决策为 `release-13-languages`：release-supported human UI locales 为 `en`、`zh-CN`、`ja`、`de`、`fr`、`es-ES`、`es-419`、`it`、`ko`、`pt-BR`、`ru`、`zh-TW`
  - `qps-ploc` 分类为 `dev-test-only`；production build/package output 与 release-surface audit 不允许出现 `qps-ploc` loader/chunk 或 `_locales/qps-ploc/messages.json`
  - Chrome ZIP 与 Firefox XPI package 脚本会解包最终产物并通过 `tools/audit-release-archive.mjs` 复用 release-surface 审计
  - `npm run test:i18n` 包含 `layout:report`；clean worktree 中需先运行 `npm run build:dev` 或 `npm run build` 生成 `build/dist`
  - `lint:options-css` 的当前有效规则覆盖 `src/options/**/*.css`；`src/options/stitch/styles/**` 的 `--print-config` 必须包含非空 `selector-class-pattern`
  - 显式包含 `lint:hardcoded`；当前 standalone 输出为 `0` errors / `6` warnings，warning-only 不阻塞该 hard gate
  - 显式包含 `i18n:catalog:check`；catalog/generated artifact drift 会在 `quality`、`verify:preflight` 与 CI 中阻塞
  - `audit:design-system-doc:report` 只检查 tracked / non-ignored 的 active style guidance；被 `.gitignore` 标记的本地过程 archive 不进入当前样式真值口径
  - `i18n:catalog:generate` 当前从 `src/i18n/catalog/messages/<lang>/{runtime,static,schema}.json` 生成 `src/i18n/generated/*`、`src/i18n/generated/locales/*.generated.ts` 与 `public/_locales/**`；`npm run i18n:generate` 保持原命令名，但现在只是兼容包装层，实际委托给 catalog generator
  - `public/_locales/**` 是当前 catalog-owned WebExtension static source；root `_locales/**` 已退役并删除，不参与 production build/package ownership
- `npm run verify:preflight`
  - 显式包含 `verify:runtime`
  - 显式包含 `typecheck:app`
  - 显式包含 `typecheck:tests`
  - 显式包含 `typecheck:strict`
  - 显式包含 `i18n:catalog:check`
  - 串行继续执行 `lint -- --quiet`、`build:dev`、`audit:*` 报告
- `.github/workflows/ci.yml`
  - 显式执行同一组三项 typecheck，不再依赖隐式覆盖
  - `Verify generated i18n catalog artifacts are up to date` 显式运行 `npm run i18n:catalog:check`
  - `Verify preflight baseline` 后显式运行 `build:fast` 与 `audit:release-surface:report`
  - `Locale source alignment audit report` 是 hard gate，不再 `continue-on-error`
  - `Enforce hardcoded config guard` 显式运行 `npm run lint:hardcoded`
- 2026-05-22 final exit gate 真值：在 Node `v20.20.2` / npm `10.8.2` 下，`quality`、`verify:preflight`、`test:unit`、`clean`、`build:dev`、`audit:build:report`、`audit:performance:report`、`verify:stitch-secondary`、`visual:test`、browser smoke、reader-panel、local-vault 均已通过；`build/dist/content/runtime.js` raw `54,554` bytes，低于当时 `57,600` stop gate
- 2026-05-24 M2.5 budget ratchet 真值：M2.1-M2.4 合入后，`audit:build:report` 的 `content/runtime.js` raw stop gate 收紧为 `56,320` bytes；chunk count 收紧为 `<= 112`；hotspot line budgets 以 `docs/performance-baseline.md` 为准
- 2026-06-07 video legacy recovery 真值：视频/阅读 draft 自动恢复入口改为 lazy `sessionDraftAutoRestore-*` chunk 后，`audit:build:report` 的 `content/runtime.js` raw stop gate 同步为 `57,344` bytes；chunk count 继续守住 `<= 112`；完整 build/hotspot 真值以 `docs/performance-baseline.md` 为准
- 2026-06-08 options i18n PR/main merge build-budget 真值：P14 12-language Options i18n final branch 与当前 main 的 video note stability / session draft lazy recovery 合并后，dev build `content/runtime.js` raw stop gate 同步为 `57,348` bytes，`onboarding/index.js` raw stop gate 同步为 `16,395` bytes，chunk count 同步为 `<= 114`；single/shared/locale/YAML chunk budgets 未放宽
- 2026-06-09 video screenshot/session stability final truth：`codex/aiiinob-video-asset-stability-2026-06-08-integration` 在 `fbc24294` 通过 `quality`、`verify:preflight`、P01 attachment + 视频专项 Vitest `11` 文件 / `201` tests、`videoListenerScope.browser.test.ts` Chromium `11` tests。截图准备队列已从 session runtime 静态路径拆为 lazy chunk，`audit:build:report` 当前 dev build chunk count 为 `116`；只同步 chunk count gate，不放宽 entry、single chunk、shared chunk、locale chunk 或 YAML chunk size budget。
- 2026-05-26 M10 source-of-truth sync 真值：maintainability-debt M0-M10 合入后的 integration branch 上，`quality`、`verify:preflight`、`lint:type-any`、`audit:performance:report`、`audit:build:report`、`audit:compatibility-duplicates:check` 与 `audit:non-production-source:report` 均已重新采集；当前 type/warning/non-production source 数值见下文
- 2026-05-26 M10 budget ratchet 真值：`quality` 显式包含 `lint:type-any:ratchet`；`verify:preflight` 继续包含 `audit:performance:report`，且 performance report 覆盖当前全部 `src` >250 LOC 文件
- 2026-06-01 Plan 09 compatibility duplicate 真值：`quality` 显式包含 `audit:compatibility-duplicates:check`；当前 usage/rest compatibility candidate files 为 `0`，exact duplicate groups 为 `0`，allowlist entries 为 `0`，因此没有生产 allowlist。工具中的旧 `src/options/components/sections/usage*.ts` / `src/options/widgets/shared/usage/**` scope 是 retired compatibility reintroduction guard，只用于防止已退役 usage compatibility shells 被重新引入并复制，不代表当前生产 owner。
- 2026-05-25 post-gap runtime guard 真值：本轮验证使用 Node `v20.20.2` / npm `10.8.2`；`package.json` 与 `package-lock.json` root engines 要求 Node `>=20.19 <21`，`verify:runtime` 会读取 `package.json` 的 `engines.node` 并已接入 `quality` 与 `verify:preflight`
- 2026-06-09 dependency-audit 真值：Node `v20.20.2` / npm `10.8.2` 下，`npm audit --omit=dev` 当前为 `0` vulnerabilities，production runtime release gate 仍为 green；`npm audit --audit-level=low` 当前因 dev tooling dependency `vitest <3.2.6` / `@vitest/coverage-v8 <=3.2.5` 返回 `2` critical findings，未接入 `quality` / `verify:preflight`，不得表述为当前全量 green。
- 2026-05-29 Plan 11 G2/G3 governance 真值：`lint:hardcoded` 已接入 `quality` 与 CI；`audit:platform-boundary:report` 仍是 report-only standalone evidence，当前报告 `148` findings（composition-root `11`、offscreen-local-vault-permission-root `1`、platform-adapter `93`、shared-runtime-helper `23`、type-only `20`），不得当作 hard gate；全量 `npm audit --audit-level=low` 不是 `quality` hard gate，当前 dev tooling advisory 见上一条。
- 2026-05-29 Plan 11 G4 preflight 真值：`audit:imports:check` 已恢复为 green，当前输出 `No deep relative imports found.`；`verify:preflight` 不再因 `src/content/shared/panels/sessionPanelResizeAdapter.ts` 的深层相对导入失败
- 2026-06-01 Plan 09 final verification 真值：Node `v20.20.2` / npm `10.8.2` 下，YAML editor / Stitch host 的 `exactOptionalPropertyTypes` gap 已用窄范围类型安全修复收口；`typecheck:strict`、`quality`、`verify:preflight`、`build`、`verify:stitch-secondary` 均已重新通过。该修复未放宽门禁，preview freeze JS allowlist 仅刷新为精确 hash。
- 2026-06-03 video-mode structural repair 真值：P01-P06 合入后，`lint:type-any:ratchet` 已按当前实测同步为 overall `0/971/1616/41/4`、src `0/537/565/5/0`、tests `0/434/1051/36/4`；本次同步只反映新增视频/哔哩哔哩测试夹具的 current truth，同时收紧 overall assertions/non-null 与 src unknown/assertion 上限。
- 2026-06-04 i18n-v2 M11 type-ratchet 真值：M02-M10 accepted i18n generated source/test expansion 后，`lint:type-any:ratchet` 已按当前实测同步为 overall `0/991/1658/41/4`、src `0/549/579/5/0`、tests `0/442/1079/36/4`；M11 自身新增 gate test 不增加 type-debt 计数，`any` 与 `ts-expect-error` 上限未放宽。
- 2026-06-05 GA / i18n PR merge type-ratchet 真值：两个 PR 合并后的当前 `lint:type-any` 实测为扫描 `1071` files，overall `0/1084/1776/41/4`、src `0/588/606/5/0`、tests `0/496/1170/36/4`；`lint:type-any:ratchet` 的 checked-in 上限同步为 overall `0/1084/1776/41/4`、src `0/588/606/5/0`、tests `0/496/1170/36/4`，`any` 继续保持 `0`，`non-null` 与 `ts-expect-error` 上限保持原值。
- 2026-06-06 session-draft current-main reintegration type-ratchet 真值：session draft integration 重新基于当前 `origin/main` 合入并补齐 active video draft restore 回退后，`lint:type-any` 实测扫描 `1091` files，overall `0/1132/1845/53/4`、src `0/612/626/7/0`、tests `0/520/1219/46/4`；`lint:type-any:ratchet` 的 checked-in 上限同步为这些 current truth，`any` 继续保持 `0`，`ts-expect-error` 继续保持 `4`，不得用 tests 下降抵消 src 增长。
- 2026-06-07 video legacy recovery type-ratchet 真值：当前集成树 `lint:type-any` 实测扫描 `1111` files，overall `0/1125/1838/53/4`、src `0/612/622/7/0`、tests `0/513/1216/46/4`；`lint:type-any:ratchet` 的 checked-in 上限同步为这些 current truth，`any` 继续保持 `0`，`ts-expect-error` 继续保持 `4`。
- 2026-06-08 options i18n PR/main merge type-ratchet 真值：当前合并树 `lint:type-any` 实测扫描 `1133` files，fresh overall `0/1113/1819/38/4`、src `0/613/628/7/0`、tests `0/500/1191/31/4`；`lint:type-any:ratchet` 的 checked-in 上限守住 overall `0/1125/1838/53/4`、src `0/613/628/7/0`、tests `0/513/1216/46/4`，本次只同步 src merge truth，`any` 继续保持 `0`，`ts-expect-error` 继续保持 `4`。
- 2026-06-07 video note stability 修复真值：`codex/aiiinob-video-note-stability-2026-06-07-integration` 解决了视频时间戳备注在第 6 个及后续 capture 上因 live draft flush、未 scoped editor stop、runtime mutation 绕过 draft sync 而不稳定的问题；最终行为要求新增时间戳、切换其他时间戳截图状态、勾选评论区文字、删除其他 capture、pagehide/visibility persistence 与 export preparation 均不得丢失任一 timestamp note，且截图状态切换不得 seek/pause/play 可见视频。该集成树已通过 `quality`、`verify:preflight`、`test:unit`、`tests/e2e/videoPanelFlow.test.ts` Chromium desktop、reader-panel browser E2E 与独立 closeout audit；P05/P06 的窄 helper extraction / test hardening 已在 workspace plan 中补充记录。

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

GA production release public config is loaded from ignored
`.env.production.local`. The reusable owner commands are:

```bash
npm run analytics:validate:prod
npm run build:prod:ga
npm run package:prod:ga
npm run package:firefox:prod:ga
npm run release:prod:ga
```

The file must only contain public build config (`measurementId`,
`transportMode`, `proxyEndpoint`). GA `api_secret` remains server-only in the
Cloudflare Worker secret `GA4_API_SECRET`.
`directDebug` is also proxy-backed: it requires an owner debug proxy endpoint and
must not call Google debug endpoints directly from the extension.
`analytics:validate:prod` is a static/public-config + owner env sanity check; it
does not prove real GA property delivery, DebugView visibility, or server-side
`api_secret` injection. If `.env.production.local` is absent, the validator still
runs and reports missing public values as warnings.

## 当前 Lint / Type 债务真值

2026-05-29 post-remediation governance truth:

- `npm run lint -- --quiet`：通过，当前没有 ESLint error。
- `npm run lint:warnings-guard`：通过；当前 video screenshot/session stability integration fresh warning count 为 `141`，gate 输出为 `Warning 总量下降 6 条（现在 141 条）`。
- `npm run lint:warnings-report`：会重写 `tools/baselines/lint-warnings.json`，不得在普通里程碑中随手运行后遗留 diff；只在有意同步 warning truth 时运行。
- 当前 fresh warning 主要规则族：`require-await`（`99`）与 unsafe type warnings（`no-unsafe-assignment: 27`、`no-unsafe-return: 6`、`no-unsafe-argument: 2`、`no-unsafe-member-access: 3`、`no-unsafe-call: 1`）。
- `npm run lint:hardcoded`：通过；当前为 `0` errors / `6` warning-only findings，且已接入 `quality` 与 CI。
- `npm run lint:type-any`：扫描当前 video screenshot/session stability integration `1142` files；fresh overall 为 `any: 0`、`unknown: 1125`、assertions `1838`、non-null assertions `42`、`ts-expect-error: 3`；src 为 `0/613/623/7/0`；tests 为 `0/512/1215/35/3`。
- `scripts/audit-types.mjs` 支持 overall 阈值参数 `--max-any`、`--max-unknown`、`--max-assertions`、`--max-non-null`、`--max-ts-expect-error`，并支持 scoped 阈值参数 `--max-src-*` / `--max-tests-*`。
- `npm run lint:type-any:ratchet`：当前 checked-in 上限仍守住 overall `0/1125/1838/53/4`、src `0/613/628/7/0`、tests `0/513/1216/46/4`，并已接入 `quality` 作为 type-debt hard gate；当前实测为 overall `0/1125/1838/42/3`、src `0/613/623/7/0`、tests `0/512/1215/35/3`。fresh count 低于 checked-in 上限时，不得把上限误写成当前实测，也不得用 tests 下降抵消 src 增长。

## 当前构建预算真值

`npm run audit:build:report` 当前执行以下预算：

- `content/index.js <= 1 KB`
- `content/runtime.js <= 56 KB`（raw `57,348` bytes）
- `options/index.js <= 12 KB`
- `onboarding/index.js <= 16 KB`（raw `16,395` bytes）
- 任一 chunk `<= 320 KB`
- 最大 shared chunk `<= 190 KB`
- 第二大 shared chunk `<= 136 KB`
- 第三大 shared chunk `<= 90 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 116`
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
- `build/dist/content/runtime.js`: `54.9 KB`（raw `56,170` bytes；raw stop gate `56,320`）
- `build/dist/options/index.js`: `997 B`
- `build/dist/onboarding/index.js`: `15.8 KB`（raw `16,200` bytes）
- chunks: `109`
- GA content/onboarding telemetry now lives behind lazy `clipFlowAnalytics-*` / `onboardingAnalytics-*` chunks so entry bundles remain within the existing release gates.

2026-06-06 session-draft current-main reintegration build truth:

- `quality`、`verify:preflight`、Chrome `build`、Firefox `build:firefox`、release surface audits 与 Chrome/Firefox Local Vault release audits 在 Node `v20.20.2` 下通过
- dev `build/dist/content/runtime.js`: `54.9 KB`（raw `56,170` bytes；raw stop gate `56,320`）
- dev chunks: `110`
- Chrome production fast `build/dist/content/runtime.js`: `47.6 KB`
- Chrome production fast chunks: `91`
- 详细 build/hotspot 数值以 [`performance-baseline.md`](./performance-baseline.md) 为准

2026-06-08 options i18n PR/main merge build truth:

- `quality`、`verify:preflight`、Chrome `build:fast`、`build:dev` 与 `audit:build:report` 在 Node `v20.20.2` 下通过
- dev `build/dist/content/runtime.js`: `56.0 KB`（raw `57,348` bytes；raw stop gate `57,348`）
- dev chunks: `114`
- performance coverage: trackedSourceFiles=`726`、hotspotsOver250=`95`、registeredLineBudgets=`113`
- `sessionDraftAutoRestore-*` 作为 lazy chunk 承载页面进入后的 reader/video draft 自动恢复，不再把恢复实现本体压入 content 主入口

2026-06-09 video screenshot/session stability final build truth:

- `quality`、`verify:preflight`、P01 attachment + 视频专项 Vitest `11` 文件 / `201` tests 与 `videoListenerScope.browser.test.ts` Chromium `11` tests 在 Node `v20.20.2` 下通过
- dev `build/dist/content/runtime.js`: `56.0 KB`（raw `57,348` bytes；raw stop gate `57,348`）
- dev chunks: `116`
- shared Top 3: `134.9 KB` / `128.1 KB` / `82.8 KB`
- `chunks/runtimeEntry-*.js`: `240.5 KB`
- `chunks/videoSessionControllers-*.js`: `85.6 KB`
- `chunks/videoLazyRuntime-*.js`: `44.8 KB`
- `chunks/videoScreenshotPreparationQueue-*.js`: `18.0 KB`
- performance coverage: sourceFiles=`733`、hotspotsOver250=`94`、registeredLineBudgets=`113`
- `videoScreenshotPreparationQueue-*` 是截图准备实现的显式 lazy split；chunk count gate 只为该 split 与小型 shared screenshot-intent bridge 同步，entry/shared/locale/YAML size gates 未放宽

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
