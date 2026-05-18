# 项目稳定化与优化执行计划

> 日期：2026-04-14  
> 状态：已完成；`M4` 按 2026-04-14 重定义口径通过  
> 适用范围：`AiiinOB` 当前交付分支  
> 文档定位：本文件是本轮稳定化验收真值；旧版 `M4` 的工作树/批次规模预算已显式退役，不再作为本轮完成判定。

## 0. 当前真值

最近一次重新核实：

- 当前交付分支保留集相对基线 `9b9d300`：`295 files changed, 16399 insertions(+), 7929 deletions(-)`
- 当前交付分支工作树：`0` 个开放路径（`B1/B2/B3/B4` 已全部落成提交）
- `B4` 提交 `ea6f3b6` 相对基线 `9b9d300`：`295 files changed, 16365 insertions(+), 7929 deletions(-)`
- `content/runtime.js`: `54.5 KB`
- `options/index.js`: `94.7 KB`
- chunk count: `130`
- shared Top3: `173.3 KB / 82.8 KB / 67.6 KB`
- `RestSection` chunk: `34.2 KB`
- `yaml-config` chunk: `9.6 KB`
- coverage: statements `84.39%`, lines `84.39%`, functions `81.76%`, branches `75.51%`
- 绿树保全分支：`parking/m4-green-validated-2026-04-14`
- 全量溢出保全分支：`parking/m4-overflow-2026-04-14`

## 1. Milestone 状态

| Milestone | 状态                 | 当前结论                                                                                 |
| --------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `M0`      | 已通过               | `quality`、`verify:preflight`、CI 均包含 `typecheck:app/tests/strict`                    |
| `M1`      | 已通过               | connection/rest 已完成；Privacy 已改为 UI 降级优先，`MainContent` 复验无 Privacy 噪音    |
| `M2`      | 已通过               | 5 个热点全部达最低目标，3 个热点达 stretch，新增/拆出的 support modules 已复核为 `<=250` |
| `M3`      | 已通过               | 包体预算达标，浏览器 smoke / visual / reader-panel 路径均已通过                          |
| `M4`      | 已通过（重定义口径） | 当前分支保留已验真的技术真值；停车分支保存延期/溢出真值；正式文档与 backlog 已切到新口径 |
| `M5`      | 已通过               | 最终命令链在 Node `v20.20.2` 下复核通过，release summary 已生成                          |

## 2. M1 失败路径质量收口

当前验收口径：

- 对外失败语义只允许 `HTTP error`、`network error`、`config error`
- `connectionTest` 与 `restClient` 不允许把 `Body is unusable`、`Cannot read properties of undefined` 作为用户可见失败文本
- `PrivacySettings` 在 storage / analytics config 未配置时必须走受控 UI 降级，不默认输出已知噪音日志

退出命令：

```bash
npx vitest run tests/unit/background/connectionTestPipeline.test.ts
npx vitest run tests/unit/infrastructure/restClient.test.ts
npx vitest run tests/unit/options/layout/MainContent.test.ts
```

## 3. M2 热点模块继续压缩

当前目标：

| 文件                                                                | 最低目标 | Stretch 目标 | 当前真值 |
| ------------------------------------------------------------------- | -------: | -----------: | -------: |
| `src/content/video/videoSessionRuntime.ts`                          | `<= 360` |     `<= 320` |    `314` |
| `src/options/components/sections/RestSectionView.ts`                | `<= 300` |     `<= 260` |    `300` |
| `src/ui/domains/privacy/PrivacySettingsView.ts`                     | `<= 300` |     `<= 260` |    `260` |
| `src/options/components/sections/UsageDashboardSection.ts`          | `<= 280` |     `<= 260` |    `231` |
| `src/ui/domains/yaml-config/yamlConfigTableControllerState.impl.ts` | `<= 500` |     `<= 420` |    `471` |

当前结论：

- 5 个热点全部达到最低目标
- `videoSessionRuntime`、`PrivacySettingsView`、`UsageDashboardSection` 3 个热点达到 stretch
- `<=250` 仅适用于本轮新增/拆出的 support modules，不适用于上述 5 个主热点入口
- 当前新增/AM 的 `src/` support modules 已重新核实，无 `>250` 残留

## 4. M3 拆包与加载优化

当前预算：

- 最大 shared/vendor chunk `<= 175 KB`
- 第二大 shared chunk `<= 145 KB`
- 第三大 shared chunk `<= 101 KB`
- `RestSection` chunk `<= 40 KB`
- `yaml-config` lazy chunk `<= 70 KB`
- `content/runtime.js <= 56 KB`
- `options/index.js <= 107 KB`
- chunk count `<= 132`

当前真值：

- shared Top3: `173.3 KB / 82.8 KB / 67.6 KB`
- `RestSection`: `34.2 KB`
- `yaml-config`: `9.6 KB`
- `content/runtime.js`: `54.5 KB`
- `options/index.js`: `94.7 KB`
- chunk count: `130`

## 5. M4 文档与执行批次治理

### 新口径

`M4` 不再要求复刻 2026-04-13 版的“工作树 `<=80`、单批 `<=45 files`、净变更 `<=1500`、责任域 `<=2`”预算。  
这些预算已退役为下一阶段治理项，不再作为本轮完成判定。

### 本轮通过条件

`M4` 现在只要求：

- 当前交付分支保留一棵已经验真通过的 retained set
- 所有“做不进当前交付”的溢出项必须保全到停车分支，而不是混成口头“无关项”
- 正式 source-of-truth 文档、performance 文档、backlog、批次文档必须与当前交付真值一致
- 当前交付分支必须是可继续交付、可继续演进的状态

### 当前结论

- `parking/m4-overflow-2026-04-14` 保全了原始大工作树
- `parking/m4-green-validated-2026-04-14` 保全了已验真的技术绿树
- 当前交付分支采用 `B1/B2/B3 + 扩展 B4` 的实际收口方式
- 当前交付主线的 4 个交付提交为：
  - `cf777fb` `B1: align gates and failure paths`
  - `f4a2b87` `B2: shrink options UI hotspots`
  - `1b45b4f` `B3: split content and yaml hotspots`
  - `ea6f3b6` `B4: consolidate validated runtime and docs`
- 原始 M4 规模预算未被伪装成达成，而是明确下沉到 backlog

## 6. M5 收口验收

本次整改后按 Node `v20.20.2` 顺序复核通过：

```bash
npm run quality
npm run verify:preflight
npm run typecheck:strict
npm run test:coverage
npm run test:e2e
npm run test:i18n
npm run visual:test
npm run test:e2e:browser
npm run test:e2e:browser:reader-panel
npm run report:release-summary
```

验收标准：

- 上述命令全部退出码为 `0`
- coverage 阈值维持：statements `>=80`、lines `>=80`、functions `>=80`、branches `>=75`
- `build/reports/release-summary.md` 与 `build/reports/release-summary.json` 生成
- 本文件、批次文档、backlog、README 索引的状态必须一致
