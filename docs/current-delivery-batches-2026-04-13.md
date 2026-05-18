# 当前交付批次归属

日期：2026-05-18

## 目的

这份文档用于描述重定义后的 `M4` 真实交付边界，以及 2026-05-18 稳定化 orchestration 对当前工作树的归属事实。
它不再试图证明旧版“单批 `<=45 files`”预算，也不把计划状态写成已完成状态。

## 当前真值

- 2026-05-18 audit-time 工作树不是干净状态：`129` 个开放 status rows，其中 `104` 个 modified paths、`25` 个 untracked paths。
- Phase 0 已逐路径归属全部 `129` 行：重复路径 `0`、缺失路径 `0`、`X-owner-stop` `0`。
- 唯一 defer 路径：`AGENTS.md`，归属 `D1-defer`，不在本轮 source/test/script/manifest/package/docs 提交范围内。
- 2026-05-18 stabilization 使用新的批次口径：`B1-green-tree`、`B2-local-vault-risk`、`B3-options-shell-split`、`B4-lint-priority`、`B5-doc-truth`、`D1-defer`。
- integration branch：`codex/aiiinob-stabilization-2026-05-18-integration`。
- 已集成 stabilization commits：
  - Phase 1 `a0ca241342a0caa38f4d678fbab45427b1752b27`
  - Phase 3 `19c7395cd4d13ee589869bf9824c3fc7849cfe60`
  - Phase 4 `d9fa5a6e93c54269047f7e6e4a3d2be604dc43c6`
  - Phase 5 `8bd286aa906d923c525fc5f2fb6c461febc5cf37`
- 本文档当前描述“审计时的 dirty tree 如何被归属”和“已验证 integration 保留什么”；不要把它解读为“当前无开放路径”。

## 2026-05-18 Stabilization 批次

| Batch                    | Owner plan                                          | Commit / status                            | Verified facts                                                                                                                            |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `B1-green-tree`          | Green tree recovery                                 | `a0ca241342a0caa38f4d678fbab45427b1752b27` | `test:unit` 通过；fresh `build:dev` + `audit:build:report` 通过；`content/runtime.js` 回到预算内。                                        |
| `B2-local-vault-risk`    | Local Vault/offscreen/manifest/release verification | `19c7395cd4d13ee589869bf9824c3fc7849cfe60` | Local Vault browser harness、manifest machine audit、publish script unit/dry-run、package artifact check 已验证。                         |
| `B3-options-shell-split` | production Stitch shell owner split                 | `8bd286aa906d923c525fc5f2fb6c461febc5cf37` | `productionStitchShell.ts` 不再内联承担 local folder authorization、vault connection aggregation、button-action scroll guard 三个 owner。 |
| `B4-lint-priority`       | priority lint warning burn-down                     | `d9fa5a6e93c54269047f7e6e4a3d2be604dc43c6` | warning guard 通过，当前 tracked warning baseline 为 `322`。历史 warning debt 未清零。                                                    |
| `B5-doc-truth`           | documentation truth reconciliation                  | 本文档所在 Phase 6                         | 仅记录已验证事实、剩余风险和 skipped commands。                                                                                           |
| `D1-defer`               | none                                                | not staged                                 | `AGENTS.md` repo collaborator rule change deferred; owner may promote separately.                                                         |

## 2026-05-18 Verification Snapshot

- `npm run typecheck`：通过。
- `npm run typecheck:strict`：通过。
- `npm run lint -- --quiet`：通过。
- `npm run lint:warnings-guard`：通过，warning baseline `322`。
- `npm run test:unit`：通过，`248` files / `1405` tests。
- `npm run clean && npm run build:dev && npm run audit:build:report`：通过，`content/runtime.js` `56.0 KB`，chunks `98`。
- `npm run build`：通过。
- `npm run build:firefox`：通过。
- `npm run test:e2e:browser:local-vault`：通过，`7` tests。
- `npm run test:e2e:browser:smoke`：通过，`3` tests。
- `npm run visual:test`：通过，`144` passed / `6` skipped。
- `npm run verify:stitch-secondary`：通过。
- Skipped commands：Phase 5 结束时没有跳过必需命令；Phase 6 初始 `typecheck` 曾因新 worktree 缺少依赖/ignored local analytics config 失败，安装依赖并复制 ignored local config 后通过。

## 归属优先级

当路径同时命中多个范围时，按以下顺序归属，避免重复计数：

- `B1` 门禁、失败路径、privacy 降级
- `B2` Options / UI 热点主线
- `B3` content / video / yaml-config 热点主线
- `B4` 浏览器基础设施、文档、剩余 runtime/i18n/test/tooling 真值
- 停车分支 / 归档项

以上 `B1`-`B4` 是 2026-04-14 M4 历史归属；2026-05-18 stabilization 批次以本页上方表格为准。

## B1 门禁与失败路径

归属范围：

- `.github/workflows/ci.yml`
- `package.json`
- `scripts/quality-check.mjs`
- `src/background/pipelines/connectionTest.ts`
- `src/infrastructure/restClient.ts`
- `src/ui/domains/privacy/**`
- `src/options/components/controls/connectionTest.ts`
- `src/options/services/connectionTestRuntime.ts`
- `tests/unit/background/connectionTestPipeline.test.ts`
- `tests/unit/infrastructure/restClient.test.ts`
- `tests/unit/options/sections/PrivacySection.test.ts`

状态：已固定为独立交付提交 `cf777fb`

## B2 Options / UI 热点

归属范围：

- `src/options/app/optionsShell*`
- `src/options/components/layout/MainContent.ts`
- `src/options/components/sections/RestSection*`
- `src/options/components/sections/FragmentSection*`
- `src/options/components/sections/Usage*`
- `tests/unit/options/optionsShell.test.ts`
- `tests/unit/options/bootstrap.test.ts`
- `tests/unit/options/sections/RestSection.test.ts`
- `tests/unit/options/sections/FragmentSection.test.ts`
- `tests/unit/options/sections/UsageSection.test.ts`

状态：已固定为独立交付提交 `f4a2b87`

## B3 content / video / yaml-config 热点

归属范围：

- `src/content/video/**` 热点主线
- `src/content/reader/utils/readerMarkdown*`
- `src/ui/domains/yaml-config/**`
- `tests/unit/content/video/**`
- `tests/unit/content/readerMarkdownBuilder.test.ts`
- `tests/unit/options/yamlConfigTable.test.ts`
- `tests/unit/options/yamlConfigView.test.ts`

状态：已固定为独立交付提交 `1b45b4f`

## B4 扩展收口批次

归属范围：

- 浏览器 / Playwright 基础设施
- `src/content/**` 剩余 runtime / clipper / reader / support-prompt 真值
- `src/i18n/**`
- `src/onboarding/**`
- `src/platform/firefox/utils.ts`
- `src/shared/schemas/**` 与必要 validation 真值
- `tests/**` 中支撑最终命令链的剩余对齐项
- `docs/**` 正式 source-of-truth 文档
- `tools/**`
- `lint-report.json` / `lint-warnings.json`

状态：这是重定义后的扩展 B4，当前提交为 `ea6f3b6`。  
它不再受旧版“单批 `<=45 files`”预算约束，而承担“把已经验真的最终真值正式落到当前交付分支”的职责。

## 停车分支

- `parking/m4-overflow-2026-04-14`
  - 保存原始大工作树，作为延期/溢出真值
- `parking/m4-green-validated-2026-04-14`
  - 保存已经跑通门禁、浏览器链和 coverage 的技术绿树

## 当前结论

- 当前交付边界已经明确，不再把超量 retained set 包装成“原始预算已达成”
- 当前 `M4` 的完成含义是：当前分支保留了已验真的交付真值，停车分支承接了延期/溢出真值
- 如果后续团队要恢复旧版工作树/批次规模纪律，需要单独开下一阶段治理项，而不是回写成“本轮已经做到”
