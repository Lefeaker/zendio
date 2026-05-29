# 性能优化与热点基线

日期：2026-05-29

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

当前 production fast build 真值：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `46.8 KB`
- `build/dist/options/index.js`: `672 B`
- `build/dist/onboarding/index.js`: `7.1 KB`
- 总 chunk 数：`86`
- `chunks/runtimeEntry-*.js`: `148.7 KB`
- `chunks/videoLazyRuntime-*.js`: `51.9 KB`
- `chunks/videoSessionControllers-*.js`: `37.6 KB`

当前 dev build 真值：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `53.1 KB`（raw `54,375` bytes；距离 `56,320` raw-byte stop gate 还有 `1,945` bytes）
- `build/dist/options/index.js`: `997 B`
- `build/dist/onboarding/index.js`: `12.3 KB`
- 总 chunk 数：`103`
- `chunks/runtimeEntry-*.js`: `284.7 KB`
- `chunks/videoSessionControllers-*.js`: `70.9 KB`
- `chunks/qps-ploc-*.js`: `57.1 KB`（raw `58,486` bytes）
- `chunks/videoLazyRuntime-*.js`: `41.1 KB`

当前 shared chunk Top 3（`chunk-*`，按 `tools/report-build-splitting.mjs` 口径，以 dev build 为更高值）：

- 最大 shared chunk：`184.0 KB`
- 第二大 shared chunk：`128.3 KB`
- 第三大 shared chunk：`82.8 KB`

当前重点功能 chunk：

- No `RestSection-*` chunk is emitted in the 2026-05-29 report.
- No `yaml-config-*` chunk is emitted in the 2026-05-29 report.
- `chunks/registry-*.js`: `3.6 KB`

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
- `RestSection <= 40 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 112`

## 2. 热点真值

验证命令：

```bash
npm run audit:performance:report
```

当前热点：

- `src/content/video/videoSessionRuntime.ts`: `395` 行
- `src/content/reader/utils/markdownBuilder.ts`: `288` 行
- `src/options/components/sections/RestSectionView.ts`: `260` 行
- `src/ui/domains/privacy/PrivacySettingsView.ts`: `255` 行
- `src/options/app/productionStitchShellMount.ts`: `254` 行
- `src/content/extractors/articleExtractor.ts`: `222` 行
- `src/options/components/sections/FragmentSectionView.ts`: `204` 行
- `src/options/state/optionsStore.ts`: `194` 行
- `src/ui/domains/yaml-config/yamlConfigTableStateModel.ts`: `182` 行
- `src/content/video/platforms/bilibiliPlatformAdapter.ts`: `178` 行
- `src/options/components/sections/UsageDashboardSection.ts`: `173` 行
- `src/content/index.ts`: `153` 行
- `src/options/state/StateManager.ts`: `128` 行；`deepClone=0`，`JSON.stringify=0`
- `src/content/runtime/bootstrapRuntime.ts`: `77` 行
- `src/ui/domains/yaml-config/yamlConfigTableRenderer.ts`: `66` 行
- `src/ui/domains/usage-chart/usageChartRenderers.ts`: `23` 行

当前 hotspot line budget 口径：

- 全部 `src` >250 LOC 文件均有 exact current-line budget；2026-05-29 当前覆盖 `100` 个路径，完整列表见 `tools/report-performance-hotspots.mjs`。
- 当前 top line budgets：`schemaShellMessages.ts <= 2133`、`stitch/content.ts <= 906`、`i18n/messages.ts <= 752`、`stitch/types.ts <= 743`。
- 当前业务/运行时重点 budgets：`videoSessionRuntime.ts <= 395`、`markdownBuilder.ts <= 288`、`RestSectionView.ts <= 260`、`PrivacySettingsView.ts <= 255`、`productionStitchShellMount.ts <= 254`。

本轮有效收口结果：

- `productionStitchShellMount.ts` 已从 `427` 行拆到 `254` 行，并在 M5.3 将预算收紧到 `<= 254`。
- `usageChartRenderers.ts` 已从 `407` 行拆到 `23` 行；当前已低于 >250 LOC line-budget 覆盖阈值，不再作为 M5.3 line-budget 路径。
- Markdown/parser decomposition 将 `markdown.ts` 从 `441` 行拆到 `138` 行，将 `markdownRules.ts` 从 `335` 行拆到 `120` 行；二者目前由 parser characterization tests 保护，不在 hotspot budget 表中单独设 gate。
- `videoSessionRuntime` 当前仍为 `395` 行，保留为 runtime hotspot 观察项。
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

- `tools/baselines/lint-warnings.json` 基线仍记录历史 warning 债务；2026-05-29 当前 checked-in baseline 为 `141` 条，fresh warning count 为 `140`。`lint:warnings-report` 仍会重写该 baseline，只能在有意同步 warning truth 时运行。
- Firefox build path 已在 2026-05-18 stabilization 中通过 `npm run build:firefox`；Firefox browser smoke 仍不是本轮强制浏览器收口范围。
- 2026-05-24 M2.5 budget ratchet 使用 Node.js `v20.20.2` / npm `10.8.2`，并先以 standalone `audit:build:report` / `audit:performance:report` 验证新预算，再接入 `quality` / `verify:preflight`。
- 2026-05-22 review gap patch 已确认 M6.2 retained low-reuse retirement 是安全 no-op：没有新增 delete-approved path，低复用 retained/source compatibility 仍是后续债务，不应表述为已完成退役。
