# 性能优化与热点基线

日期：2026-05-18

## 1. 构建真值

验证命令：

```bash
npm run build:dev
npm run audit:build:report
```

2026-05-18 stabilization 复核使用 fresh build：

```bash
npm run clean
npm run build:dev
npm run audit:build:report
```

当前真值：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `56.0 KB`
- `build/dist/options/index.js`: `997 B`
- `build/dist/onboarding/index.js`: `12.3 KB`
- 总 chunk 数：`98`

当前 shared chunk Top 3（`chunk-*`，按 `tools/report-build-splitting.mjs` 口径）：

- 最大 shared chunk：`181.8 KB`
- 第二大 shared chunk：`128.3 KB`
- 第三大 shared chunk：`82.8 KB`

当前大型 runtime/lazy chunks（不等同于 shared Top 3 预算口径）：

- `chunks/runtimeEntry-*.js`: `262.5 KB`
- `chunks/videoSessionControllers-*.js`: `71.0 KB`
- `chunks/videoLazyRuntime-*.js`: `37.0 KB`

当前重点功能 chunk：

- No `RestSection-*` chunk is emitted in the 2026-05-18 report.
- No `yaml-config-*` chunk is emitted in the 2026-05-18 report.
- `chunks/registry-*.js`: `3.6 KB`

当前 `audit:build:report` 预算口径：

- `content/runtime.js <= 56 KB`
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

- `src/content/video/videoSessionRuntime.ts`: `395` 行
- `src/options/components/sections/RestSectionView.ts`: `260` 行
- `src/ui/domains/privacy/PrivacySettingsView.ts`: `255` 行
- `src/options/components/sections/UsageDashboardSection.ts`: `172` 行
- `src/ui/domains/yaml-config/yamlConfigTableRenderer.ts`: `233` 行
- `src/ui/domains/yaml-config/yamlConfigTableStateModel.ts`: `183` 行
- `src/content/reader/utils/markdownBuilder.ts`: `288` 行
- `src/options/state/StateManager.ts`: `deepClone=0`, `JSON.stringify=0`
- `src/options/state/optionsStore.ts`: `deepClone=0`, `JSON.stringify=0`

本轮有效收口结果：

- `videoSessionRuntime` 当前为 `395` 行，仍需作为 runtime hotspot 观察项
- `PrivacySettingsView`、`UsageDashboardSection` 已达到 stretch 目标
- `RestSectionView` 已落到本轮最低目标内
- YAML config table state/model 已拆分到当前热点口径内
- 本轮新增子模块已按热点治理范围压到目标值，避免用拆分制造新的超限热点
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

- `tools/baselines/lint-warnings.json` 基线仍记录历史 warning 债务；checked-in warning guard baseline 为 `322` 条，2026-05-21 fresh warning count 为 `274` 条，不代表 lint 债务已经清零。`lint:warnings-report` 会重写该 baseline；baseline 下调留到 M7 final baseline sync。
- Firefox build path 已在 2026-05-18 stabilization 中通过 `npm run build:firefox`；Firefox browser smoke 仍不是本轮强制浏览器收口范围。
- 当前本地执行环境 Node.js 为 `v23.9.0`，高于 `package.json` 声明的 `>=20 <21`，验证命令通过但仍应回到 Node `20.x` 作为发布环境。
