# 性能优化与热点基线

日期：2026-05-18

## 1. 构建真值

验证命令：

```bash
npm run build:dev
npm run audit:build:report
```

当前真值：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `57,299` bytes (`56.0 KB`)
- `build/dist/options/index.js`: `997` bytes
- `build/dist/onboarding/index.js`: `12,601` bytes (`12.3 KB`)
- 总 chunk 数：`97`

当前共享 chunk Top 3：

- 最大 shared chunk：`181.8 KB`
- 第二大 shared chunk：`128.3 KB`
- 第三大 shared chunk：`82.8 KB`

当前重点功能 chunk：

- `chunks/runtimeEntry-*.js`: `274.1 KB`
- `chunks/videoSessionControllers-*.js`: `71.0 KB`
- `chunks/localVaultPermissionPrompt-*.js`: `3.3 KB`
- `diagnostics` lazy chunk：由 production build graph 与 build splitting report 继续审计

当前 `audit:build:report` 预算口径：

- `content/runtime.js <= 56 KB`
- `options/index.js <= 107 KB`
- 最大 shared chunk `<= 196 KB`
- 第二大 shared chunk `<= 145 KB`
- 第三大 shared chunk `<= 130 KB`
- `RestSection <= 40 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 132`
- 当前 `content/runtime.js` 只剩 `45` bytes 预算余量；任何 content startup 静态 import 相关改动必须额外跑 `npm run build:dev` 与 `npm run audit:build:report`。

## 2. 热点真值

验证命令：

```bash
npm run audit:performance:report
```

当前生产代码形状真值：

- `src/options/app/productionStitchShell.ts`: `854` LOC
- `src/options/widgets/YamlConfigWidget.ts`: `34` LOC
- `src/content/video/prompt.ts`: `5` LOC
- `src/content/clipper/components/dialog.ts`: `7` LOC
- `src/options/stitch/render/renderStitchView.ts`: `91` LOC
- `src/shared/services/yamlConfigService.ts`: `80` LOC

本轮有效收口结果：

- `videoSessionRuntime` 已达到 stretch 目标
- `PrivacySettingsView`、`UsageDashboardSection` 已达到 stretch 目标
- `RestSectionView` 已落到本轮最低目标内
- `yamlConfigTableControllerState.impl` 已落到 `<= 500`
- 本轮新增子模块已按热点治理范围压到目标值，避免用拆分制造新的超限热点
- Options 低频 diagnostics 已从主入口拆出
- `YamlConfigView` 已改为 view/controller 双层 lazy；当前 YAML 配置热点由 `yamlConfigTableRenderer.ts` (`233` LOC) 与 `yamlConfigTableStateModel.ts` (`183` LOC) 继续审计
- `npm run audit:production-shape:report` 已进入 `quality` hard gate，并强制上述热点 facade 阈值。

## 3. 浏览器验真

已通过：

- `npm run test:e2e:browser:smoke`
- `npm run test:e2e:browser`
- `npm run test:e2e:browser:reader-panel`
- `npm run visual:test`

覆盖到的真实路径：

- migration harness smoke
- content orchestrator harness
- runtime observability harness
- reader dialog 打开 / 导出 / 键盘关闭路径

## 4. 债务备注

- `lint-warnings.json` 基线仍记录历史 warning 债务；当前 `quality` 已报告 warning 总量下降到 `286` 条，不代表 lint 债务已经清零。
- Firefox production build 已纳入本轮强制验证；真实浏览器交互仍以 Chromium visual/e2e/browser gates 为主。
