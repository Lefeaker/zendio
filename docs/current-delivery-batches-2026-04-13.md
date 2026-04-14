# 当前交付批次归属

日期：2026-04-14

## 目的

这份文档用于描述重定义后的 `M4` 真实交付边界。  
它不再试图证明旧版“单批 `<=45 files`”预算，而是说明当前交付分支到底保留了哪四批内容，以及哪些真值已经被停车分支承接。

## 当前真值

- 当前交付主线采用 `B1 / B2 / B3 / B4` 四个交付提交
- 当前交付分支工作树：`0` 个开放路径
- 当前 retained set 相对基线 `9b9d300`：`295 files changed, 16365 insertions(+), 7929 deletions(-)`
- 原始超量工作树已保全到 `parking/m4-overflow-2026-04-14`
- 已验真的技术绿树已保全到 `parking/m4-green-validated-2026-04-14`
- 本文档用于说明“当前分支保留什么”，不再承担旧版文件数预算证明

## 归属优先级

当路径同时命中多个范围时，按以下顺序归属，避免重复计数：

- `B1` 门禁、失败路径、privacy 降级
- `B2` Options / UI 热点主线
- `B3` content / video / yaml-config 热点主线
- `B4` 浏览器基础设施、文档、剩余 runtime/i18n/test/tooling 真值
- 停车分支 / 归档项

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
