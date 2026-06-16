# 工程命令与入口

最后更新：2026-06-16

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
  - 显式包含 `audit:ga:proxy-contract`、`audit:ga:docs` 与 `audit:ga:legacy-api`
  - 显式执行 production `build:fast` 后运行 `audit:release-surface:report`
  - 显式在 production `build:fast` 后运行 `audit:ga:client-secret` 与 `audit:ga:release-surface`
  - 显式包含 `audit:locales:report`，在 i18n lint 与字符预算通过后校验 config、locale loaders、catalog runtime/static/schema source、generated locale modules 与 public `_locales` 一致
  - i18n 产品范围决策为 `release-13-languages`：release-supported human UI locales 为 `en`、`zh-CN`、`ja`、`de`、`fr`、`es-ES`、`es-419`、`it`、`ko`、`pt-BR`、`ru`、`zh-TW`
  - `qps-ploc` 分类为 `dev-test-only`；production build/package output 与 release-surface audit 不允许出现 `qps-ploc` loader/chunk 或 `_locales/qps-ploc/messages.json`
  - Chrome ZIP 与 Firefox XPI package 脚本会解包最终产物并通过 `tools/audit-release-archive.mjs` 复用 release-surface 审计
  - `npm run test:i18n` 包含 `layout:report`；clean worktree 中需先运行 `npm run build:dev` 或 `npm run build` 生成 `build/dist`
  - `lint:options-css` 的当前有效规则覆盖 `src/options/**/*.css`；`src/options/stitch/styles/**` 的 `--print-config` 必须包含非空 `selector-class-pattern`
  - 显式包含 `lint:hardcoded`；当前 standalone 输出为 `0` hardcoded findings
  - 显式包含 `audit:i18n-hardcoded-user-copy:check`；生产用户可见文案只能来自 i18n catalog 或 `UserVisibleMessageDescriptor` key，background/content 边界只传 descriptor/code/params。当前 hard gate 输出为 `scanned=577 findings=19 unexpected=0 staleAllowlist=0`，治理细节见 [`i18n-production-copy-governance.md`](./i18n-production-copy-governance.md)
  - `audit:i18n-uncatalogued-user-copy` 是英文 uncatalogued-copy standalone report-only；当前未接入 `quality`、`verify:preflight`、CI、build、package 或 release。当前 report 输出 `scanned=573 findings=407 unexpected=407 staleAllowlist=0`，分类为 `translation-fallback=253`、`english-literal=134`、`descriptor-boundary=20`；不要把它表述为 hard gate。
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
  - 显式包含 `audit:ga:proxy-contract`、`audit:ga:docs` 与 `audit:ga:legacy-api`
  - 串行继续执行 `lint -- --quiet`、`build:dev`、`audit:ga:client-secret`、`audit:ga:release-surface` 与其他 `audit:*` 报告
- `npm run test*` 与 `npm run visual*`
  - 每个 npm script entrypoint 显式前置 `verify:runtime`
  - 本地 PATH 指向不受支持 Node 版本时，先在 runtime guard 失败，不启动 Vitest / Playwright
- `.github/workflows/ci.yml`
  - 采用并行 job 拓扑：`static-gates`、`coverage`、`visual`、`e2e` 并行执行，`package` 通过 `needs: [static-gates, coverage, visual, e2e]` 汇总后再打包
  - 使用 workflow-level `concurrency`，同一 PR / ref 的新 run 会取消旧 run
  - 官方 JavaScript actions 使用 Node 24-compatible major：`actions/checkout@v6`、`actions/setup-node@v6`、`actions/upload-artifact@v7`、`actions/github-script@v8`
  - `static-gates` 显式运行 `npm run i18n:catalog:check` 与 `npm run verify:preflight`；三项 typecheck 仍由 `verify:preflight` 显式覆盖
  - `Verify preflight baseline` 后显式运行 `build:fast` 与 `audit:release-surface:report`
  - `Locale source alignment audit report` 是 hard gate，不再 `continue-on-error`
  - `Enforce hardcoded config guard` 显式运行 `npm run lint:hardcoded`
  - `package` job 只在前置门禁通过后使用 `npm run build:fast`，避免在 CI 后段通过 `npm run build` 重复触发完整 `quality`
- 2026-05-22 final exit gate 真值：在 Node `v20.20.2` / npm `10.8.2` 下，`quality`、`verify:preflight`、`test:unit`、`clean`、`build:dev`、`audit:build:report`、`audit:performance:report`、`verify:stitch-secondary`、`visual:test`、browser smoke、reader-panel、local-vault 均已通过；`build/dist/content/runtime.js` raw `54,554` bytes，低于当时 `57,600` stop gate
- 2026-05-24 M2.5 budget ratchet 真值：M2.1-M2.4 合入后，`audit:build:report` 的 `content/runtime.js` raw stop gate 收紧为 `56,320` bytes；chunk count 收紧为 `<= 112`；hotspot line budgets 以 `docs/performance-baseline.md` 为准
- 2026-06-07 video legacy recovery 真值：视频/阅读 draft 自动恢复入口改为 lazy `sessionDraftAutoRestore-*` chunk 后，`audit:build:report` 的 `content/runtime.js` raw stop gate 同步为 `57,344` bytes；chunk count 继续守住 `<= 112`；完整 build/hotspot 真值以 `docs/performance-baseline.md` 为准
- 2026-06-08 options i18n PR/main merge build-budget 真值：P14 12-language Options i18n final branch 与当前 main 的 video note stability / session draft lazy recovery 合并后，dev build `content/runtime.js` raw stop gate 同步为 `57,348` bytes，`onboarding/index.js` raw stop gate 同步为 `16,395` bytes，chunk count 同步为 `<= 114`；single/shared/locale/YAML chunk budgets 未放宽
- 2026-06-09 video screenshot/session stability final truth：`codex/aiiinob-video-asset-stability-2026-06-08-integration` 在 `fbc24294` 通过 `quality`、`verify:preflight`、P01 attachment + 视频专项 Vitest `11` 文件 / `201` tests、`videoListenerScope.browser.test.ts` Chromium `11` tests。截图准备队列已从 session runtime 静态路径拆为 lazy chunk，`audit:build:report` 当前 dev build chunk count 为 `116`；只同步 chunk count gate，不放宽 entry、single chunk、shared chunk、locale chunk 或 YAML chunk size budget。
- 2026-06-13 final combined integration 历史真值：当时 integration dev build exact stop gate 为 `content/runtime.js` raw `57,386` bytes、`onboarding/index.js` raw `16,459` bytes、`chunk count <= 118`；本次只同步结构债分支与 visible-tab screenshot/export 分支合并后的 dev chunk count，没有放宽 locale/single/shared/YAML budgets。P06 历史修复仍只在 `tests/unit/content/video/VideoSession.test.ts` 内收口 inherited full-file restored screenshot async wait 与 same-page owner-context harness race。
- 2026-06-13 final integration dependency-cycle truth：`audit:deps:report` 发现并阻塞了截图准备 queue/coordinator 循环与 i18n pseudo/runtime type 循环。最终修复将截图请求状态迁入 `videoScreenshotPreparationRequestStore.ts`，让 coordinator 只持有 queue interface；i18n `RuntimeMessages` 类型改由 `localeDefinition.ts` 从 generated messages 导出，pseudo locale/runtime service 不再从 `messages.ts` 回拉入口。复核后 `audit:deps:report` 为 `violations=0`，`audit:performance:report` 覆盖 `sourceFiles=755`、`hotspotsOver250=93`、`registeredLineBudgets=117`。
- 2026-06-15 post GA/video reconciliation performance 真值：`audit:performance:report` 输出 `sourceFiles=783`、`hotspotsOver250=95`、`registeredLineBudgets=120`。`videoCaptureMutationTransaction.ts` 合并后降至 `245` 行，不再是 >250 LOC hotspot；`runtimeMessages.ts` 当前为 `322` 行。预算以 `tools/report-performance-hotspots.mjs` 为准，本次未放宽 locale/single/shared/YAML budgets。
- 2026-05-26 M10 source-of-truth sync 真值：maintainability-debt M0-M10 合入后的 integration branch 上，`quality`、`verify:preflight`、`lint:type-any`、`audit:performance:report`、`audit:build:report`、`audit:compatibility-duplicates:check` 与 `audit:non-production-source:report` 均已重新采集；当前 type/warning/non-production source 数值见下文
- 2026-05-26 M10 budget ratchet 真值：`quality` 显式包含 `lint:type-any:ratchet`；`verify:preflight` 继续包含 `audit:performance:report`，且 performance report 覆盖当前全部 `src` >250 LOC 文件
- 2026-06-01 Plan 09 compatibility duplicate 真值：`quality` 显式包含 `audit:compatibility-duplicates:check`；当前 usage/rest compatibility candidate files 为 `0`，exact duplicate groups 为 `0`，allowlist entries 为 `0`，因此没有生产 allowlist。工具中的旧 `src/options/components/sections/usage*.ts` / `src/options/widgets/shared/usage/**` scope 是 retired compatibility reintroduction guard，只用于防止已退役 usage compatibility shells 被重新引入并复制，不代表当前生产 owner。
- 2026-06-13 test runtime guard 真值：`package.json` 中 `test` / `test:*` / `visual:*` npm scripts 均显式前置 `verify:runtime`；本地 PATH 指向 Node 23 等不支持版本时，测试入口会先失败在 runtime guard，不会启动 Vitest / Playwright。
- 2026-05-25 post-gap runtime guard 真值：本轮验证使用 Node `v20.20.2` / npm `10.8.2`；`package.json` 与 `package-lock.json` root engines 要求 Node `>=20.19 <21`，`verify:runtime` 会读取 `package.json` 的 `engines.node` 并已接入 `quality` 与 `verify:preflight`
- 2026-06-09 dependency-audit 真值：Node `v20.20.2` / npm `10.8.2` 下，`npm audit --omit=dev` 当前为 `0` vulnerabilities，production runtime release gate 仍为 green；`npm audit --audit-level=low` 当前因 dev tooling dependency `vitest <3.2.6` / `@vitest/coverage-v8 <=3.2.5` 返回 `2` critical findings，未接入 `quality` / `verify:preflight`，不得表述为当前全量 green。
- 2026-06-16 i18n hardcoded P22/post-strict-gap type-ratchet 真值：P16-P22 与 post-P22 strict gap 合入 integration 后，`lint:type-any` 扫描 `1231` files，fresh overall `0/1148/1973/47/3`、src `0/628/695/9/0`、tests `0/520/1278/38/3`；`lint:type-any:ratchet` checked-in 上限同步为 overall `0/1148/1973/53/4`、src `0/628/695/9/0`、tests `0/520/1278/46/4`。本次只同步 accepted integration current truth，`any` 继续保持 `0`，`ts-expect-error` 未增加，non-null 上限未放宽。
- 2026-06-16 i18n hardcoded production-copy 真值：`audit:i18n-hardcoded-user-copy` 为报告命令；`audit:i18n-hardcoded-user-copy:check` 会先生成 `build/reports/production-build-graph.json`，再以 `--check` 运行 hardcoded user-copy audit，并已接入 `quality`。当前保留 allowlist 仅限 P21 site-native AI parser tokens；P13 regression matrix `tests/unit/i18n/hardcodedSurfaceCoverage.test.ts` 绑定 P03-P22 migrated surfaces 到 executable evidence，integration full `npm run test` 已通过 `391` files / `2477` tests。
- 2026-06-16 English uncatalogued-copy report 真值：`audit:i18n-uncatalogued-user-copy` 会先刷新 production build graph，再扫描 production-reachable `src/**` 与 relevant `public/**` 中疑似英文 UI copy、translation fallback、descriptor-boundary payload、HTML/DOM text。当前 standalone report-only 输出 `scanned=573 findings=407 unexpected=407 staleAllowlist=0`；top owners 为 Options/Stitch content 与 schema resources。该 audit 未接入 hard gate，后续 gate 化必须先完成迁移/窄 allowlist/误报评估并记录 ledger，不得直接加入 `quality`。
- 2026-06-16 i18n hardcoded P15 preflight build-budget follow-up 前风险状态：`audit:build:report` 在 integration `ca8be48e` 上复现 post-P14 dev-build drift 后，同步 gates 为 `content/runtime.js` warning `58,564` raw bytes / hard stop `58,752`、`onboarding/index.js` warning `17,377` / hard stop `17,633`、release locale chunk hard stop `64 KB`、shared `chunk-*` top-three hard stops `213 KB` / `136 KB` / `133 KB`；当时 chunk count hard stop 为 `120`，single chunk `320 KB`、YAML `70 KB` 未变。该条保留风险来源，不再代表 follow-up 后当前 chunk count gate。
- 2026-06-16 i18n hardcoded follow-up build-budget 真值：AI chat runtime parser loaders 合并为一个 lazy `runtimePlatformParsers-*` boundary，并在 P3 follow-up 切断 `aiChatExtractor.ts -> parse.ts -> registry.ts -> platform parsers` 静态路径后，dev `audit:build:report` chunk count 从 `120` 降为 `101`；chunk count gate 收紧为 warning target `108` / hard stop `118`。`aiChatExtractor-*` 静态 import 图不再包含 platform parser implementation markers，platform parsers 只通过 `runtimeRegistry-*` 动态加载唯一 `runtimePlatformParsers-*`。本次没有提高任何 hard stop，也没有改变 entry/shared/locale/YAML size hard stops。
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
- 2026-06-12 P01 audit truth gate verification：`report-build-splitting` 现已识别 `.generated-*` release locale chunks；generated locale modules 仅承载 non-schema runtime messages 与 WebExtension static messages，schema/options copy 改由 `schemaMessages.generated.ts` + `@i18n/messages` consumer path 提供，不再回灌到 content/runtime locale chunks。当时 dev build release locale chunks 全部低于 `60 KB`：`de 34.7 KB`、`es-419 34.6 KB`、`es-ES 34.7 KB`、`fr 35.5 KB`、`it 33.5 KB`、`ja 37.9 KB`、`ko 35.3 KB`、`pt-BR 34.1 KB`、`ru 48.4 KB`、`zh-CN 29.7 KB`、`zh-TW 29.2 KB`；`audit:build:report`、`audit:locales:report` 与 `audit:performance:report` 均通过。

## 当前推荐执行顺序

本地前置守门：

```bash
npm run quality
npm run verify:preflight
npm run typecheck:strict
```

i18n production copy 守门：

```bash
npm run build:dev
npm run test:i18n
npm run audit:i18n-hardcoded-user-copy
npm run audit:i18n-hardcoded-user-copy:check
npm run audit:i18n-uncatalogued-user-copy
npx vitest run --config vitest.unit.config.ts tests/unit/i18n/hardcodedSurfaceCoverage.test.ts
```

`audit:i18n-hardcoded-user-copy` 只打印当前报告；`audit:i18n-hardcoded-user-copy:check` 是 hard gate 并由 `quality` 调用。直接运行 `node scripts/audit-i18n-hardcoded-user-copy.mjs --check` 不会刷新 `build/reports/production-build-graph.json`；优先使用 npm script，避免用过期 graph 审计。

`audit:i18n-uncatalogued-user-copy` 是英文 uncatalogued-copy report-only。它用于迁移计划、误报评估和后续 hard-gate 准备；当前发现数不为零，因此不能作为通过/失败门禁使用，也不能接入 `quality`。

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
npm run analytics:smoke:delivery
npm run build:prod:ga
npm run package:prod:ga
npm run package:firefox:prod:ga
npm run release:prod:ga
node scripts/run-ga-owner-smoke.mjs --mode proxy --event runtime_harness_open
node scripts/run-ga-owner-smoke.mjs --mode directDebug --event runtime_harness_open
```

The file must only contain public build config (`measurementId`,
`transportMode`, `proxyEndpoint`). GA `api_secret` remains server-only in the
Cloudflare Worker secret `GA4_API_SECRET`.
`directDebug` is also proxy-backed: it requires an owner debug proxy endpoint and
must not call Google debug endpoints directly from the extension.
Runtime `enabled` is live OR semantics (`analytics || errorReporting`), but actual
sendability stays event-scoped: usage/product events require `analytics` consent,
and `extension_error` requires `errorReporting` consent.
`analytics:validate:prod` is a static/public-config + owner env sanity check; it
now validates the tracked transport/consent contract, proxy-only negative guards,
and public env shape, but it still does not prove real GA property delivery,
DebugView visibility, or server-side `api_secret` injection. If
`.env.production.local` is absent, the validator still runs and reports missing
public values as warnings.
`audit:ga:proxy-contract` / `audit:ga:docs` / `audit:ga:legacy-api` are
deterministic static gates and are wired into `quality` and `verify:preflight`.
`audit:ga:client-secret` scans client runtime `src/**` plus the current
`build/dist` for secret-like GA tokens and direct Google Measurement Protocol
endpoints. `audit:ga:release-surface` scans the same `build/dist` surface and
can additionally check Chrome ZIP / Firefox XPI archives via repeated
`--archive <path>` arguments for secret/direct-endpoint leaks and debug success
log payload exposure. Neither gate requires live proxy success or owner-only
credentials.
`analytics:smoke:delivery` is an opt-in owner-run proxy acceptance smoke. It is
not wired into `quality`, `verify:preflight`, build, package, release, or CI.
By default it skips cleanly when the public env is incomplete; `--require-env`
turns incomplete env into failure; `--dry-run` prints only a redacted summary;
`--event-name` is limited to allowlisted synthetic events. It never accepts
`api_secret`, never prints event params, and refuses direct Google Measurement
Protocol hosts.
Successful production proxy sends are intentionally silent in the console. Only
`directDebug` emits `[analytics-events] Event sent (debug):` with a summary
(`eventName`, `transportMode`, `responseStatus`, validation message count) and
never logs event params.
`analytics_client_id` and `analytics_session_id` are local-only storage keys
until the relevant event-class consent and public config make a send possible;
`clearAllData()` / analytics data clear removes both ids.

## GA / Video Targeted Checks

```bash
npm run analytics:validate:prod
npm run analytics:smoke:delivery -- --dry-run
npm run audit:ga:proxy-contract
npm run audit:ga:docs
npm run audit:ga:legacy-api
npm run audit:ga:client-secret
npm run audit:ga:release-surface
node scripts/run-ga-owner-smoke.mjs --mode proxy --event runtime_harness_open
node scripts/run-ga-owner-smoke.mjs --mode directDebug --event runtime_harness_open
node scripts/run-ga-owner-smoke.mjs --help
npx vitest run --config vitest.unit.config.ts tests/unit/scripts/runGaOwnerSmoke.test.ts tests/unit/scripts/analyticsDeliverySmoke.test.ts
npx vitest run tests/unit/background/analyticsEvents.test.ts tests/unit/shared/errors/analytics/index.test.ts tests/unit/shared/errors/analyticsConfig.test.ts
npx vitest run tests/unit/content/video/videoScreenshotCacheRepository.test.ts tests/unit/content/video/VideoSession.test.ts
node scripts/run-playwright.mjs test tests/e2e/videoPanelFlow.test.ts tests/e2e/videoListenerScope.browser.test.ts --project=chromium-desktop
```

Use these commands to validate the settled GA consent/transport contract and the
video screenshot intent-to-attachment path. `report-ga-docs-contract` binds
`ga4-telemetry-reference.md` and `google-analytics-dashboard-setup.md` to the
current schema / proxy contract; it does not prove real GA property delivery,
DebugView visibility, or server-side `api_secret` injection.
`analytics:validate:prod` remains the static/public-config contract check, and
`analytics:smoke:delivery` only proves that an owner proxy accepted a synthetic
event under the current public env. For package/release surfaces, run
`npm run package:prod:ga` or `npm run package:firefox:prod:ga` first, then pass
the produced archive path(s) to
`npm run audit:ga:release-surface -- --archive <zip-or-xpi>`. Chrome ZIP and
Firefox XPI must be scanned against their own artifacts; do not reuse the wrong
browser target output. `run-ga-owner-smoke.mjs` is an owner CLI harness: it
rejects client-side secret env vars, sends only to the configured proxy endpoint,
and prints a redacted summary. Its local output proves request shape and local
proxy behavior only; it does not prove real GA property delivery, DebugView
visibility, or server-side `api_secret` injection unless the owner adds external
evidence. Screenshot attachment templates plan only export-time output paths /
Markdown URLs; durable draft state persists `screenshotRequested` plus
metadata-only `screenshotRef`, while screenshot bytes live in the expiring
browser storage cache and runtime `Blob` / binary flow until background
write/download boundaries. Cache hits restore without immediate visible-video
seek; legacy ref-less drafts and missing/expired cache entries fall back to
low-concurrency screenshot preparation.

## 当前 Lint / Type 债务真值

2026-05-29 post-remediation governance truth:

- `npm run lint -- --quiet`：通过，当前没有 ESLint error。
- `npm run lint:warnings-guard`：2026-06-14 P09 final verification isolated worktree fresh run 通过；checked-in baseline 仍为 `147`，当前 warning 总数为 `131`，gate 输出为 `Warning 总量下降 16 条（现在 131 条）`。当前规则族为 `@typescript-eslint/require-await: 100`、`@typescript-eslint/no-unsafe-assignment: 19`、`@typescript-eslint/no-unsafe-return: 6`、`@typescript-eslint/no-unsafe-argument: 2`、`@typescript-eslint/no-unsafe-member-access: 3`、`@typescript-eslint/no-unsafe-call: 1`。
- `npm run lint:warnings-report`：会重写 `tools/baselines/lint-warnings.json`，不得在普通里程碑中随手运行后遗留 diff；只在有意同步 warning truth 时运行。
- 当前 fresh warning 主要规则族：`require-await`（`100`）与 unsafe type warnings（`no-unsafe-assignment: 19`、`no-unsafe-return: 6`、`no-unsafe-argument: 2`、`no-unsafe-member-access: 3`、`no-unsafe-call: 1`）。
- `npm run lint:hardcoded`：通过；当前为 `0` hardcoded findings，且已接入 `quality` 与 CI。
- `npm run lint:type-any`：2026-06-16 i18n hardcoded P22/post-strict-gap integration fresh run 扫描 `1231` files；fresh overall 为 `any: 0`、`unknown: 1148`、assertions `1973`、non-null assertions `47`、`ts-expect-error: 3`；src 为 `0/628/695/9/0`；tests 为 `0/520/1278/38/3`。
- `scripts/audit-types.mjs` 支持 overall 阈值参数 `--max-any`、`--max-unknown`、`--max-assertions`、`--max-non-null`、`--max-ts-expect-error`，并支持 scoped 阈值参数 `--max-src-*` / `--max-tests-*`。
- `npm run lint:type-any:ratchet`：checked-in 上限为 overall `0/1148/1973/53/4`、src `0/628/695/9/0`、tests `0/520/1278/46/4`，并已接入 `quality` 作为 type-debt hard gate；2026-06-16 integration fresh run 通过。此次同步只反映 P16-P22 与 post-P22 strict gap accepted integration current truth，未放宽 `any`、`ts-expect-error` 或 warning baseline，且 tests 下降不得抵消 src 增长。
- `npm run audit:platform-boundary:report`：通过，当前为 `148` findings（composition-root `11`、offscreen-local-vault-permission-root `1`、platform-adapter `93`、shared-runtime-helper `23`、type-only `20`）；仍是 report-only，不得表述为 hard gate。
- `npm run audit:non-production-source:report`：在先运行 `npm run audit:production-build-graph:report` 后通过。P01 修复了 `resolveSourceImport()` 对 `?inline` / `#hash` specifier 的 owner 解析，`src/content/video/video-control-bar.css` 不再误报为 `migrate-test-owner`。当前 decision counts 为 `retain-production: 628`、`migrate-import-owner: 134`、`retain-production-facade: 17`。

## 当前构建预算真值

`npm run audit:build:report` 当前执行以下预算。2026-06-16 i18n hardcoded
follow-up 将 AI chat runtime parser per-platform wrapper chunks 合并到一个
lazy `runtimePlatformParsers-*` boundary，并在 P3 follow-up 切断
`aiChatExtractor.ts -> parse.ts -> registry.ts -> platform parsers` 静态路径
后，chunk count gate 已从 P15 的 warning `118` / hard stop `120` 收紧为
warning `108` / hard stop `118`；entry/shared/locale/YAML size gates 未放宽。

- `content/index.js <= 1 KB`
- `content/runtime.js`: warning target `58,564` raw bytes；hard stop `58,752` raw bytes
- `options/index.js <= 12 KB`
- `onboarding/index.js`: warning target `17,377` raw bytes；hard stop `17,633` raw bytes
- 任一 chunk `<= 320 KB`
- 最大 shared chunk `<= 213 KB`
- 第二大 shared chunk `<= 136 KB`
- 第三大 shared chunk `<= 133 KB`
- locale chunk `<= 64 KB`
- `yaml-config <= 70 KB`
- `chunk count`: warning target `108`；hard stop `118`
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

2026-06-13 final combined integration build/type truth:

- `npx vitest run tests/unit/content/video/VideoSession.test.ts -t "prepares requested screenshots from restored" --reporter=verbose` 与整文件 `tests/unit/content/video/VideoSession.test.ts` 已在当前 P06 分支通过；P06 只在测试内增加等待 screenshot payload 落入 restored state 的同步点，并显式接入 same-page owner-context harness，不修改 production `src/**`
- `build/dist/content/runtime.js`: `55.9 KB`（raw `57,209` bytes；raw stop gate `57,386`）
- `build/dist/onboarding/index.js`: `16.1 KB`（raw `16,459` bytes；raw stop gate `16,459`）
- dev chunks: `118`
- `chunks/messages-*.js`: `202.4 KB`
- `chunks/videoScreenshotPreparationQueue-*.js`: `21.1 KB`
- `lint:type-any` 扫描 `1193` files；fresh overall `0/1138/1934/45/3`、src `0/623/678/9/0`、tests `0/515/1256/36/3`
- `lint:type-any:ratchet` checked-in 上限为 overall `0/1138/1934/53/4`、src `0/623/678/9/0`、tests `0/515/1256/46/4`；本次只同步 GA production rewrite integration current truth，`any` 继续保持 `0`，`ts-expect-error` 未放宽
- `lint:warnings-guard` checked-in baseline 与 fresh warning count 均为 `160`（`src: 27`、`tests: 133`）；本次同步只反映 P01-P09 集成后的 warning truth，并先清掉可机械修复的 production lint warning

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
