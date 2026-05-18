# 长期维护 Backlog

日期：2026-05-18

## P1

1. 维持三项 typecheck 门禁常绿
   - 当前真值：`quality`、`verify:preflight`、CI 已统一包含 `typecheck:app` / `typecheck:tests` / `typecheck:strict`
   - 剩余风险：后续脚本或 CI 变更再次把 `strict` 从主门禁里移出

2. 维持本轮包体预算不回退
   - 当前真值：`content/runtime 57,483 bytes (56.1 KB)`、`options/index 997 B`、shared Top3 `181.8 / 128.3 / 82.8 KB`、`runtimeEntry 274.0 KB`、`videoSessionControllers 70.9 KB`、`chunk count 97`
   - 守门：`npm run audit:build:report`

3. 维持热点模块行数不回弹
   - 当前真值：
     - `videoSessionRuntime.ts = 395`
     - `RestSectionView.ts = 260`
     - `PrivacySettingsView.ts = 255`
     - `UsageDashboardSection.ts = 173`
     - `yamlConfigTableRenderer.ts = 233`
     - `yamlConfigTableStateModel.ts = 183`
   - 守门：`npm run audit:performance:report`

## P2

4. 继续清理 lint warning 基线债务
   - 当前真值：`quality` 当前报告 warning 总量下降到 `286`
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
   - 当前真值：`npm run build:firefox` 已纳入本轮强制验证
   - 后续在 Chromium 稳态保持前提下补充最小 Firefox browser smoke

8. Non-production source migration backlog
   - 当前真值：技术债 orchestration 已完成分类和防误删治理；`npm run audit:non-production-source:check` 是生产 hard gate，`npm run audit:non-production-source:report` 仍以 report-only 语义退出 1。
   - Owner：对应域 owner 迁移项目；删除前必须更新 `docs/non-production-code-ownership.md`，并为每个 exact path 留存六项 owner proof。
   - 当前 remaining rows：
     - `src/components/trial-notice.ts`：test owner `tests/unit/components/trialNotice.test.ts`；验收为迁移覆盖后 `npm run audit:non-production-source:report` 不再报告该 path，且 `npm run test:unit -- tests/unit/components/trialNotice.test.ts` 通过。
     - `src/content/clipper/shared/styleManager.ts`：test owners `tests/unit/content/readerSessionModifiers.test.ts`、`tests/unit/content/styleManager.test.ts`；验收为覆盖迁移后对应 unit tests、`npm run test:unit` 和 report 命令不再报告该 path。
     - `src/env.d.ts`：script owner `tools/report-ui-architecture-alignment.mjs`；验收为工具 owner 迁出或显式保留后 `npm run audit:ui-architecture:report`、`npm run audit:non-production-source:report` 通过对应检查。
     - `src/options/stitch/runtime/actions.ts`：test owner `tests/unit/options/stitchSharedRegistry.test.ts`；验收为 Stitch action 覆盖迁移后对应 unit test、`npm run verify:stitch-secondary` 和 report 命令不再报告该 path。
     - `src/options/stitch/styles/variants/stitch-secondary.css`：public owners `public/content-orchestrator-harness.html`、`public/runtime-observability-harness.html` plus visual/unit owners；验收为 harness/style owner 决策完成后 `npm run verify:stitch-secondary`、`npm run visual:test`、`npm run audit:non-production-source:report` 状态一致。
     - `src/styles/clipper/highlight-themes.css`：script owner `scripts/build.mjs`；验收为 build style owner 迁出或正式保留后 `npm run build`、`npm run build:firefox`、`npm run audit:non-production-source:report` 状态一致。
     - `src/styles/design-tokens.css`：script owners `scripts/build.mjs`、`tools/report-design-token-alignment.mjs`、`tools/report-ui-architecture-alignment.mjs` and test owner `tests/unit/options/optionsIndexHtmlModalHosts.test.ts`；验收为 design-token owner 决策完成后 `npm run audit:design-token-alignment:report`、`npm run audit:ui-architecture:report`、`npm run audit:non-production-source:report` 状态一致。
     - `src/ui/foundation/tokens/index.ts`：script owners `tools/report-design-system-doc.mjs`、`tools/report-ui-architecture-alignment.mjs` and test owner `tests/unit/tools/reportDesignSystemDoc.test.ts`；验收为 UI token barrel owner 迁出或正式保留后 `npm run audit:design-system-doc:report`、`npm run audit:ui-architecture:report`、`npm run audit:non-production-source:report` 状态一致。
