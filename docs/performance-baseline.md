# 性能优化与热点基线

日期：2026-04-14

## 1. 构建真值

验证命令：

```bash
npm run build:dev
npm run audit:build:report
```

当前真值：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `54.5 KB`
- `build/dist/options/index.js`: `94.7 KB`
- `build/dist/onboarding/index.js`: `11.1 KB`
- 总 chunk 数：`130`

当前共享 chunk Top 3：

- 最大 shared chunk：`173.3 KB`
- 第二大 shared chunk：`82.8 KB`
- 第三大 shared chunk：`67.6 KB`

当前重点功能 chunk：

- `chunks/RestSection-*.js`: `34.2 KB`
- `chunks/yaml-config-*.js`: `9.6 KB`
- `chunks/yamlConfigTable-*.js`: `570 B`
- `diagnostics` lazy chunk：`13.2 KB`

当前 `audit:build:report` 预算口径：

- `content/runtime.js <= 56 KB`
- `options/index.js <= 107 KB`
- 最大 shared chunk `<= 175 KB`
- 第二大 shared chunk `<= 145 KB`
- 第三大 shared chunk `<= 101 KB`
- `RestSection <= 40 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 132`

## 2. 热点真值

验证命令：

```bash
npm run audit:performance:report
```

当前热点：

- `src/content/video/videoSessionRuntime.ts`: `314` 行
- `src/options/components/sections/RestSectionView.ts`: `300` 行
- `src/ui/domains/privacy/PrivacySettingsView.ts`: `260` 行
- `src/options/components/sections/UsageDashboardSection.ts`: `231` 行
- `src/ui/domains/yaml-config/yamlConfigTableControllerState.impl.ts`: `471` 行
- `src/content/reader/utils/markdownBuilder.ts`: `288` 行
- `src/options/state/StateManager.ts`: `deepClone=0`, `JSON.stringify=0`
- `src/options/state/optionsStore.ts`: `deepClone=0`, `JSON.stringify=0`

本轮有效收口结果：

- `videoSessionRuntime` 已达到 stretch 目标
- `PrivacySettingsView`、`UsageDashboardSection` 已达到 stretch 目标
- `RestSectionView` 已落到本轮最低目标内
- `yamlConfigTableControllerState.impl` 已落到 `<= 500`
- 本轮新增子模块已按热点治理范围压到目标值，避免用拆分制造新的超限热点
- Options 低频 diagnostics 已从主入口拆出
- `YamlConfigView` 已改为 view/controller 双层 lazy，`yaml-config` 主块已压到 `9.6 KB`

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

- `lint-warnings.json` 基线仍记录历史 warning 债务；当前 `quality` 已报告 warning 总量下降到 `356` 条，不代表 lint 债务已经清零。
- Firefox 不在本轮强制浏览器收口范围内，仍保留为后续增强项。
