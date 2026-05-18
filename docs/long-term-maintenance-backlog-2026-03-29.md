# 长期维护 Backlog

日期：2026-05-18

## P1

1. 维持三项 typecheck 门禁常绿
   - 当前真值：`quality`、`verify:preflight`、CI 已统一包含 `typecheck:app` / `typecheck:tests` / `typecheck:strict`
   - 剩余风险：后续脚本或 CI 变更再次把 `strict` 从主门禁里移出

2. 维持本轮包体预算不回退
   - 当前真值：`content/runtime 56.0 KB`、`options/index 997 B`、`onboarding/index 12.3 KB`、shared Top3 `181.8 / 128.3 / 82.8 KB`、`chunk count 98`
   - 守门：`npm run audit:build:report`
   - 剩余风险：`content/runtime.js` 贴近 `56 KB` 预算，后续 runtime 入口改动必须 fresh `clean + build:dev + audit:build:report`

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
   - 当前真值：`lint:warnings-guard` 当前 baseline 为 `322`
   - 当前结论：这是为了恢复主门禁可用性做的阶段性基线对齐，不代表 warning 已清零
   - 后续处理：继续清理 broad historical `require-await`、测试 fixture typing、type assertion / unsafe assignment 债务；不要通过降低 ESLint 规则或无解释 disable 来“归零”

5. 继续治理浏览器验真稳定性
   - 当前真值：2026-05-18 stabilization 中 `test:e2e:browser:local-vault`、`test:e2e:browser:smoke`、`verify:stitch-secondary`、`visual:test` 已通过
   - 当前补强：`run-playwright` 已自动分配独立 `webServer` 端口，`start-playwright-web-server` 已补 build lock，降低并发时的 `EADDRINUSE` / `build/dist` 竞争
   - 剩余重点：继续观察完整浏览器链在 CI 与本地串行执行下的稳定性

6. 维持 Local Vault / offscreen / release 风险证据
   - 当前真值：Chrome manifest 包含 `offscreen` permission，Firefox manifest 不包含 `offscreen`；两者 web accessible resources 不再使用 `<all_urls>` matches
   - 当前真值：Local Vault browser harness `7` 项通过；publish script unit 与 dry-run 已验证；`package:ci` 产物检查已验证
   - 剩余风险：Chrome Web Store 实际发布仍依赖真实 CWS 环境变量和人工商店审核，不能把 dry-run 视为已发布

7. 继续治理旧版 M4 的规模纪律
   - 当前真值：重定义后的 `M4` 已通过，但 retained set 仍为 `295 files changed`
   - 当前结论：原始的“工作树 `<=80`、单批 `<=45 files`、`<=1500` 净变更行、责任域 `<=2`”已退役为下一阶段治理项
   - 后续处理：若团队需要恢复这套纪律，应基于 `parking/m4-overflow-2026-04-14` 与 `parking/m4-green-validated-2026-04-14` 单独开治理阶段，而不是回写成本轮已达成

## P3

8. Firefox 路径补强
   - `npm run build:firefox` 已在 2026-05-18 stabilization 中通过
   - Firefox browser smoke 本轮不作为强制收口项
   - 后续在 Chromium 稳态保持前提下补充最小 smoke
