# 性能优化与热点基线

日期：2026-06-06

## 1. 构建真值

验证命令：

```bash
npm run clean
npm run build:fast
npm run audit:build:report
npm run build:dev
npm run audit:build:report
```

2026-05-24 M2.5 budget ratchet 复核在 Node `v20.20.2` / npm `10.8.2` 下完成，输入为 M2.1-M2.4 全部合入后的 integration baseline。

2026-05-25 M4.3 dev build surface budget 复核在同一 Node/npm 版本下完成。Production fast build 继续排除 dev/test harness 与 `qps-ploc` pseudo-locale，并由 `audit:release-surface:report` 证明 forbidden harness members 与 forbidden dev/test pseudo-locale members 均为 `none`。Dev build 保留本地浏览器 harness 与 `qps-ploc`，但仍必须通过当前更严格的 `audit:build:report` 预算；该预算已经严于本轮 plan 的 `content/runtime.js <= 57,600 bytes`、`chunk count <= 132` 和 locale chunk `<= 60 KB` 约束。

2026-05-25 M5.1 source-of-truth sync 复核重新采集 `quality`、`verify:preflight`、`audit:performance:report` 与 `audit:build:report`。以下 dev build 与热点数值以该次采集为当前真值。

2026-05-25 M5.3 budget ratchet 将 `audit:performance:report` 的 line-budget 覆盖扩展为当前全部 `src` >250 LOC 文件；每个路径的预算等于本次实测行数。下方“当前热点”仍保留高信号业务/运行时热点摘要，完整预算集以 `tools/report-performance-hotspots.mjs` 为准。

2026-05-26 M10 doc/gate sync 复核重新采集 `quality`、`verify:preflight`、`audit:performance:report`、`build:dev` 与 `audit:build:report`。本页数值仍以当前 dev build 与 hotspot audit 为真值；M10 仅收紧已通过的 warning/type gate，不改变生产构建路径。

2026-05-29 Plan 11 G3 source-of-truth sync 复核重新采集 `build:fast`、`build:dev`、`audit:build:report` 与 `audit:performance:report`。本页数值以该次采集为当前构建和热点真值。

2026-06-06 session-draft current-main reintegration 复核重新采集 `quality`、`verify:preflight`、`build:fast`、`build:dev`、`audit:build:report`、`audit:performance:report`、Chrome `build` / release audit 与 Firefox `build:firefox` / release audit。当前 build/hotspot/line-budget 数值以该次采集为当前真值；reader/video session draft integration 新增的 hotspot owner 已补齐 exact current-line budgets，既有 runtime/message hotspots 也已同步到当前行数。

当前 production fast build 真值：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `47.6 KB`
- `build/dist/options/index.js`: `672 B`
- `build/dist/onboarding/index.js`: `9.1 KB`
- 总 chunk 数：`91`
- `chunks/runtimeEntry-*.js`: `157.4 KB`
- `chunks/videoLazyRuntime-*.js`: `71.3 KB`
- `chunks/videoSessionControllers-*.js`: `43.6 KB`

当前 dev build 真值：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `54.9 KB`（raw `56,170` bytes；距离 `56,320` raw-byte stop gate 还有 `150` bytes）
- `build/dist/options/index.js`: `997 B`
- `build/dist/onboarding/index.js`: `15.8 KB`（raw `16,200` bytes）
- 总 chunk 数：`110`
- `chunks/runtimeEntry-*.js`: `304.4 KB`
- `chunks/videoSessionControllers-*.js`: `83.4 KB`
- `chunks/qps-ploc-*.js`: `57.5 KB`（raw `58,906` bytes）
- `chunks/videoLazyRuntime-*.js`: `44.7 KB`

当前 shared chunk Top 3（`chunk-*`，按 `tools/report-build-splitting.mjs` 口径，以 dev build 为更高值）：

- 最大 shared chunk：`184.8 KB`
- 第二大 shared chunk：`82.9 KB`
- 第三大 shared chunk：`82.5 KB`

当前重点功能 chunk：

- No retired Options section chunk is emitted in the current report.
- No `yaml-config-*` chunk is emitted in the 2026-06-05 GA final report.
- `chunks/registry-*.js`: `3.6 KB`
- `chunks/clipFlowAnalytics-*.js`: `2.5 KB`
- `chunks/onboardingAnalytics-*.js`: `1.8 KB`

当前 `audit:build:report` 预算口径：

- `content/index.js <= 1 KB`
- `content/runtime.js <= 55 KB`（raw `56,320` bytes）
- `options/index.js <= 12 KB`
- `onboarding/index.js <= 16 KB`
- 任一 chunk `<= 320 KB`
- 最大 shared chunk `<= 190 KB`
- 第二大 shared chunk `<= 136 KB`
- 第三大 shared chunk `<= 90 KB`
- locale chunk `<= 60 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 112`

## 2. 热点真值

验证命令：

```bash
npm run audit:performance:report
```

当前热点摘要（完整 `src` >250 LOC 路径列表以 `tools/report-performance-hotspots.mjs` 为准）：

- `src/i18n/generated/localeRegistry.generated.ts`: `8865` 行
- `src/i18n/generated/schemaMessages.generated.ts`: `2173` 行
- `src/i18n/generated/messages.generated.ts`: `1312` 行
- `src/options/stitch/content.ts`: `906` 行
- `src/i18n/generated/locales/fr.generated.ts`: `785` 行；其他 generated release locale 文件当前在 `690`-`777` 行范围内
- `src/options/stitch/types.ts`: `743` 行
- `src/content/video/videoSessionRuntime.ts`: `691` 行
- `src/content/video/sessionOperations.ts`: `611` 行
- `src/options/stitch/ui/components.ts`: `592` 行
- `src/options/yaml-config-editor/view.ts`: `586` 行
- `src/third_party/ai-chat-exporter/platforms/gemini.ts`: `576` 行
- `src/background/pipelines/connectionTest.ts`: `573` 行
- `src/content/reader/session.ts`: `563` 行
- `src/options/stitch/schema/builders/surfaces.ts`: `558` 行
- `src/onboarding/bootstrap.ts`: `557` 行
- `src/content/clipper/components/clipperDialogController.ts`: `511` 行
- `src/options/app/productionStitchStateMapper.ts`: `509` 行
- `src/content/reader/services/highlightManager.ts`: `505` 行
- `src/background/application/clipProcessor.ts`: `502` 行
- `src/shared/analytics/eventCatalog.ts`: `485` 行
- `src/ui/domains/video/VideoDialog.ts`: `468` 行
- `src/content/video/videoPromptLifecycle.ts`: `458` 行
- `src/shared/analytics/analyticsSanitizers.ts`: `455` 行
- `src/content/reader/sessionOperations.ts`: `412` 行
- `src/content/reader/ui/ReaderDialogPanel.ts`: `396` 行
- `src/content/sessionDrafts/sessionDraftRepository.ts`: `394` 行
- `src/content/reader/sessionDrafts.ts`: `333` 行
- `src/shared/errors/analytics/analyticsConfig.ts`: `369` 行
- `src/shared/errors/analytics/analyticsConfig.template.ts`: `364` 行
- `src/background/listeners/runtimeMessages.ts`: `350` 行
- `src/content/video/sessionPlatformController.ts`: `260` 行
- `src/shared/errors/analytics/googleAnalyticsReporter.ts`: `317` 行

当前 hotspot line budget 口径：

- 全部当前 `src` >250 LOC 文件均有 guarded line budget；2026-06-06 session-draft current-main reintegration 后当前 trackedSourceFiles=`703`、动态发现 `102` 个热点路径，注册 `105` 个 line budgets，预算以 `tools/report-performance-hotspots.mjs` 为准。
- 当前 top line budgets：`localeRegistry.generated.ts <= 8899`、`schemaMessages.generated.ts <= 2173`、`messages.generated.ts <= 1312`、`stitch/content.ts <= 906`，以及 generated locale modules 中的 `fr.generated.ts <= 785`、`es-419.generated.ts <= 777`、`es-ES.generated.ts <= 777`、`de.generated.ts <= 776`。
- M12 current truth：`src/i18n/messages.ts` 已缩为 generated type shim，`src/i18n/schemaShellMessages.ts` 与手写 `src/i18n/locales/*.ts` 已删除；generated i18n 热点预算为 `localeRegistry.generated.ts <= 8899`、`schemaMessages.generated.ts <= 2173`、`messages.generated.ts <= 1312`，并新增 `src/i18n/generated/locales/*.generated.ts` exact current-line budgets。
- 当前业务/运行时/GA 重点 budgets：`yaml-config-editor/view.ts <= 746`、`video/sessionOperations.ts <= 611`、`videoSessionRuntime.ts <= 691`、`VideoDialogPanel.ts <= 407`、`videoControlBarButton.ts <= 395`、`sessionDraftRepository.ts <= 394`、`runtimeMessages.ts <= 350`、`reader/sessionDrafts.ts <= 333`、`bilibiliRichText.ts <= 302`、`bilibiliPlatformObserver.ts <= 292`、`markdownBuilder.ts <= 288`、`PrivacySettingsView.ts <= 255`、`productionStitchShellMount.ts <= 254`、`yaml-config-editor/rowModel.ts <= 254`、`eventCatalog.ts <= 485`、`analyticsSanitizers.ts <= 456`、`analyticsConfig.ts <= 369`、`analyticsConfig.template.ts <= 364`、`googleAnalyticsReporter.ts <= 320`。
- 2026-06-01 YAML i18n repair only raised release-locale line budgets by the exact newly added YAML field error/save-blocked message keys; runtime owner budgets are tracked by `tools/report-performance-hotspots.mjs` and must not be loosened without fresh evidence.

本轮有效收口结果：

- `productionStitchShellMount.ts` 已从 `427` 行拆到 `254` 行，并在 M5.3 将预算收紧到 `<= 254`。
- `usageChartRenderers.ts` 已从 `407` 行拆到 `23` 行；当前已低于 >250 LOC line-budget 覆盖阈值，不再作为 M5.3 line-budget 路径。
- Markdown/parser decomposition 将 `markdown.ts` 从 `441` 行拆到 `138` 行，将 `markdownRules.ts` 从 `335` 行拆到 `120` 行；二者目前由 parser characterization tests 保护，不在 hotspot budget 表中单独设 gate。
- `videoSessionRuntime` 当前为 `691` 行；session-draft P08 final integration 已把 `video/sessionOperations`、`reader/session`、`reader/sessionOperations`、`ReaderDialogPanel`、`sessionDraftRepository`、`reader/sessionDrafts`、`runtimeMessages` 与 `sessionPlatformController` 纳入 exact current-line budget，作为后续拆分观察项。
- `runtimeEntry` 在 M2.1-M2.4 后仍是最大 lazy/runtime chunk；本轮只收紧通用 max chunk/shared chunk 预算，不为 `runtimeEntry` 单独设置更紧命名 gate。

## 3. 浏览器验真

已通过：

- `npm run test:e2e:browser:smoke`
- `npm run test:e2e:browser:reader-panel`
- `npm run test:e2e:browser:local-vault`
- `npm run verify:stitch-secondary`
- `npm run visual:test`

覆盖到的真实路径：

- migration harness smoke
- Local Vault write harness
- Stitch Secondary preview-to-production parity
- Reader / Video / task-success runtime alignment
- video floating prompt Stitch-only runtime aliases

## 4. 债务备注

- `tools/baselines/lint-warnings.json` 基线记录当前 warning 债务；2026-06-06 session-draft current-main reintegration 已有意同步 checked-in baseline 为 `148` 条。`lint:warnings-report` 仍会重写该 baseline，只能在有意同步 warning truth 时运行。
- Firefox build path 已在 2026-05-18 stabilization 中通过 `npm run build:firefox`；Firefox browser smoke 仍不是本轮强制浏览器收口范围。
- 2026-05-24 M2.5 budget ratchet 使用 Node.js `v20.20.2` / npm `10.8.2`，并先以 standalone `audit:build:report` / `audit:performance:report` 验证新预算，再接入 `quality` / `verify:preflight`。
- 2026-05-22 review gap patch 已确认 M6.2 retained low-reuse retirement 是安全 no-op：没有新增 delete-approved path，低复用 retained/source compatibility 仍是后续债务，不应表述为已完成退役。
