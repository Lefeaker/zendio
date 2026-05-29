# 长期维护 Backlog

日期：2026-05-19

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
   - 当前真值：`lint:warnings-guard` checked-in baseline 为 `322`；2026-05-21 fresh warning count 为 `274`
   - 当前结论：这是为了恢复主门禁可用性做的阶段性基线对齐，不代表 warning 已清零
   - 当前类型审计：`lint:type-any` 扫描 `997` files；`any: 12`、`unknown: 1059`、assertions `1832`、non-null assertions `129`、`ts-expect-error: 5`
   - 后续处理：继续清理 broad historical `require-await`、`no-unused-vars`、`unbound-method`、测试 fixture typing、type assertion / unsafe assignment 债务；不要通过降低 ESLint 规则或无解释 disable 来“归零”
   - Baseline 规则：`lint:warnings-report` 会重写 `tools/baselines/lint-warnings.json`；M1.2 不提交该 baseline，下调留到 M7 final baseline sync

5. 继续治理浏览器验真稳定性
   - 当前真值：2026-05-18 stabilization 中 `test:e2e:browser:local-vault`、`test:e2e:browser:smoke`、`verify:stitch-secondary`、`visual:test` 已通过
   - 当前补强：`run-playwright` 已自动分配独立 `webServer` 端口，`start-playwright-web-server` 已补 build lock，降低并发时的 `EADDRINUSE` / `build/dist` 竞争
   - 剩余重点：继续观察完整浏览器链在 CI 与本地串行执行下的稳定性

6. 维持 Local Vault / offscreen / release 风险证据
   - 当前真值：Chrome manifest 包含 `offscreen` permission，Firefox manifest 不包含 `offscreen`；两者 web accessible resources 不再使用 `<all_urls>` matches
   - 当前真值：Local Vault browser harness `7` 项通过，但该 harness 使用 fake File System Access / fake IndexedDB；完整真实系统文件选择器仍需人工 checklist
   - 当前真值：`audit:local-vault-release:report` 验证 build/dist 中 Local Vault permission/offscreen 文件、Chrome/Firefox manifest 差异、WAR 边界和 content/runtime lazy prompt chunk 可达
   - 当前真值：`release:chrome` 默认 dry-run，`release:chrome:publish` 必须显式传 `--zip <path>`；publish script unit 覆盖 dry-run、缺 env、显式 zip 和真实 publish 请求路径
   - 剩余风险：Chrome Web Store 实际发布仍依赖真实 CWS 环境变量、owner 手动确认和人工商店审核，不能把 dry-run 视为已发布

7. 继续治理旧版 M4 的规模纪律
   - 当前真值：重定义后的 `M4` 已通过，但 retained set 仍为 `295 files changed`
   - 当前结论：原始的“工作树 `<=80`、单批 `<=45 files`、`<=1500` 净变更行、责任域 `<=2`”已退役为下一阶段治理项
   - 后续处理：若团队需要恢复这套纪律，应基于 `parking/m4-overflow-2026-04-14` 与 `parking/m4-green-validated-2026-04-14` 单独开治理阶段，而不是回写成本轮已达成

## P3

8. Firefox 路径补强
   - `npm run build:firefox` 已在 2026-05-18 stabilization 中通过
   - Firefox browser smoke 本轮不作为强制收口项
   - 后续在 Chromium 稳态保持前提下补充最小 smoke

9. 单独规划 dev/release toolchain dependency upgrade
   - 当前真值：`npm audit --omit=dev` 为 `0` vulnerabilities，runtime dependency release gate 不受阻塞
   - 当前真值：`npm audit --audit-level=low` 仍失败，2026-05-29 D3 `web-ext` batch 后当前报告为 `8` vulnerabilities（`3` moderate / `5` high）
   - 历史口径：2026-05-20 release readiness handoff 中的 `26` vulnerabilities（`10` moderate / `16` high）仅保留为当时证据，不代表当前 audit truth
   - 风险范围：dev/release toolchain，当前 vulnerable package names 为 `ajv`、`brace-expansion`、`fast-uri`、`lodash`、`minimatch`、`node-forge`、`picomatch`、`ws`
   - 后续处理：不要在 release handoff 中盲目 `npm audit fix --force`；需要单独 dependency upgrade plan，评估 package/signing surface、glob/build/test file matching、dev server/test behavior、browser baseline 和 release audits

   分批升级计划：
   - Batch A status: `web-ext` / `tmp` 已在 2026-05-29 D3 first batch 降级出当前 audit list；剩余 release/schema chain 为 `node-forge` / `ajv` / `fast-uri`
     - Scope: release packaging, Firefox package/signing command behavior, schema validation chain.
     - Verification: `npm run package`, `npm run package:firefox`, Chrome/Firefox release-surface and local-vault release audits.
     - Rollback: revert dependency lockfile changes if package contents, signing flags, Gecko metadata, manifest validation, or release audits regress.

   - Batch B: `minimatch` / `brace-expansion` / `picomatch`
     - Scope: glob/build/test tooling and file matching semantics.
     - Verification: `npm run quality`, `npm run visual:test`, `npm run build`, production build graph and release-surface audits.
     - Rollback: revert if matched file sets, lint/test discovery, manifest/package contents, or build graph reachability change unexpectedly.

   - Batch C: `lodash` / `ws`
     - Scope: transitive dev server/test tooling and any archive/package helper behavior that consumes these packages.
     - Verification: `npm run test:unit`, relevant E2E/browser smoke checks, package checks, `npm audit --omit=dev`, and `npm audit --audit-level=low`.
     - Rollback: revert if dev server behavior, tests, archive contents, package names, or release artifact integrity changes unexpectedly.

   每个 batch 必须独立提交、独立验证，并在升级后重新记录 `npm audit --audit-level=low` 的变化；不得用单次 `npm audit fix --force` 覆盖所有依赖。
