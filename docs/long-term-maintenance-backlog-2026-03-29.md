# 长期维护 Backlog

日期：2026-04-14

## P1

1. 维持三项 typecheck 门禁常绿
   - 当前真值：`quality`、`verify:preflight`、CI 已统一包含 `typecheck:app` / `typecheck:tests` / `typecheck:strict`
   - 剩余风险：后续脚本或 CI 变更再次把 `strict` 从主门禁里移出

2. 维持本轮包体预算不回退
   - 当前真值：`content/runtime 54.5 KB`、`options/index 94.7 KB`、shared Top3 `173.3 / 82.8 / 67.6 KB`、`RestSection 34.2 KB`、`yaml-config 9.6 KB`、`chunk count 130`
   - 守门：`npm run audit:build:report`

3. 维持热点模块行数不回弹
   - 当前真值：
     - `videoSessionRuntime.ts = 314`
     - `RestSectionView.ts = 300`
     - `PrivacySettingsView.ts = 260`
     - `UsageDashboardSection.ts = 231`
     - `yamlConfigTableControllerState.impl.ts = 471`
   - 守门：`npm run audit:performance:report`

## P2

4. 继续清理 lint warning 基线债务
   - 当前真值：`quality` 当前报告 warning 总量下降到 `356`
   - 当前结论：这是为了恢复主门禁可用性做的阶段性基线对齐，不代表 warning 已清零

5. 继续治理浏览器验真稳定性
   - 当前真值：`visual:test`、`test:e2e:browser`、`test:e2e:browser:reader-panel` 已通过
   - 当前补强：`run-playwright` 已自动分配独立 `webServer` 端口，`start-playwright-web-server` 已补 build lock，降低并发时的 `EADDRINUSE` / `build/dist` 竞争
   - 剩余重点：继续观察完整浏览器链在 CI 与本地串行执行下的稳定性

6. 继续治理旧版 M4 的规模纪律
   - 当前真值：重定义后的 `M4` 已通过，但 retained set 仍为 `295 files changed`
   - 当前结论：原始的“工作树 `<=80`、单批 `<=45 files`、`<=1500` 净变更行、责任域 `<=2`”已退役为下一阶段治理项
   - 后续处理：若团队需要恢复这套纪律，应基于 `parking/m4-overflow-2026-04-14` 与 `parking/m4-green-validated-2026-04-14` 单独开治理阶段，而不是回写成本轮已达成

## P3

7. Firefox 路径补强
   - 本轮不作为强制收口项
   - 后续在 Chromium 稳态保持前提下补充最小 smoke
