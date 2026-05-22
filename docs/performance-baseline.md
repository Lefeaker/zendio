# 性能优化与热点基线

日期：2026-05-22

## 1. 构建真值

验证命令：

```bash
npm run build:dev
npm run audit:build:report
```

2026-05-21 M7 final baseline sync 复核使用 fresh build：

```bash
npm run clean
npm run build:dev
npm run audit:build:report
```

2026-05-22 final exit gate 已在 Node `v20.20.2` / npm `10.8.2` 下复跑同一构建/性能门禁，并保留当前 raw-byte 真值。

当前真值：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `53.3 KB`（raw `54,554` bytes；距离 `57,600` raw-byte stop gate 还有 `3,046` bytes）
- `build/dist/options/index.js`: `997 B`
- `build/dist/onboarding/index.js`: `12.3 KB`
- 总 chunk 数：`102`

当前 shared chunk Top 3（`chunk-*`，按 `tools/report-build-splitting.mjs` 口径）：

- 最大 shared chunk：`181.8 KB`
- 第二大 shared chunk：`128.3 KB`
- 第三大 shared chunk：`82.8 KB`

当前大型 runtime/lazy chunks（不等同于 shared Top 3 预算口径）：

- `chunks/runtimeEntry-*.js`: `276.8 KB`
- `chunks/videoSessionControllers-*.js`: `70.9 KB`
- `chunks/qps-ploc-*.js`: `57.1 KB`
- `chunks/videoLazyRuntime-*.js`: `37.8 KB`

当前重点功能 chunk：

- No `RestSection-*` chunk is emitted in the 2026-05-18 report.
- No `yaml-config-*` chunk is emitted in the 2026-05-18 report.
- `chunks/registry-*.js`: `3.6 KB`

当前 `audit:build:report` 预算口径：

- `content/runtime.js <= 56 KB`（workspace stop gate 另按 raw `57,600` bytes 执行）
- `options/index.js <= 107 KB`
- `onboarding/index.js <= 20 KB`
- 任一 chunk `<= 650 KB`
- 最大 shared chunk `<= 196 KB`
- 第二大 shared chunk `<= 145 KB`
- 第三大 shared chunk `<= 130 KB`
- locale chunk `<= 60 KB`
- `RestSection <= 40 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 132`

## 2. 热点真值

验证命令：

```bash
npm run audit:performance:report
```

当前热点：

- `src/options/app/productionStitchShellMount.ts`: `427` 行
- `src/ui/domains/usage-chart/usageChartRenderers.ts`: `407` 行
- `src/content/video/videoSessionRuntime.ts`: `395` 行
- `src/options/components/sections/RestSectionView.ts`: `260` 行
- `src/ui/domains/privacy/PrivacySettingsView.ts`: `255` 行
- `src/content/reader/utils/markdownBuilder.ts`: `288` 行
- `src/content/extractors/articleExtractor.ts`: `222` 行
- `src/options/components/sections/FragmentSectionView.ts`: `204` 行
- `src/options/state/optionsStore.ts`: `194` 行
- `src/ui/domains/yaml-config/yamlConfigTableStateModel.ts`: `183` 行
- `src/content/video/platforms/bilibiliPlatformAdapter.ts`: `178` 行
- `src/options/components/sections/UsageDashboardSection.ts`: `173` 行
- `src/content/index.ts`: `154` 行
- `src/options/state/StateManager.ts`: `deepClone=0`, `JSON.stringify=0`
- `src/options/state/optionsStore.ts`: `deepClone=0`, `JSON.stringify=0`

本轮有效收口结果：

- `videoSessionRuntime` 当前为 `395` 行，仍需作为 runtime hotspot 观察项
- `PrivacySettingsView`、`UsageDashboardSection` 已达到 stretch 目标
- `RestSectionView` 已落到本轮最低目标内
- YAML config table renderer/state/model 已拆分到当前热点口径内；`yamlConfigTableRenderer.ts` 当前为 `67` 行
- 本轮新增子模块中，`productionStitchShellMount.ts` 与 `usageChartRenderers.ts` 仍是 400+ 行残留热点；2026-05-22 review gap patch 已把二者纳入 `audit:performance:report` 与 `audit:production-shape:report`，当前预算均为 `<= 450` 行，后续拆分仍按债务跟踪
- Options 低频 diagnostics 已从主入口拆出
- `YamlConfigView` 已改为 view/controller 双层 lazy；2026-05-18 build report 不再产出旧 `yaml-config-*` chunk 名称

## 3. 浏览器验真

已通过：

- `npm run test:e2e:browser:smoke`
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

- `tools/baselines/lint-warnings.json` 基线仍记录历史 warning 债务；2026-05-21 M7 已将 checked-in warning guard baseline 从 `322` 下调到 `266` 条。`lint:warnings-report` 仍会重写该 baseline，只能在有意同步 warning truth 时运行。
- Firefox build path 已在 2026-05-18 stabilization 中通过 `npm run build:firefox`；Firefox browser smoke 仍不是本轮强制浏览器收口范围。
- 历史 M7 分支本地验证曾使用 Node.js `v23.9.0`；2026-05-22 final exit gate 已回到 Node `v20.20.2` / npm `10.8.2` 并通过构建、性能、Stitch、视觉与浏览器 smoke/reader-panel/local-vault 验证。
- 2026-05-22 review gap patch 已确认 M6.2 retained low-reuse retirement 是安全 no-op：没有新增 delete-approved path，低复用 retained/source compatibility 仍是后续债务，不应表述为已完成退役。
