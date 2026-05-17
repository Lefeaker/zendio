# 工程命令与入口

最后更新：2026-05-18

## 推荐运行环境

- Node.js：`20.x`，本轮最终矩阵使用 `20.20.2`
- npm：`10.x`
- Playwright：`npx playwright install --with-deps chromium`

## 当前技术栈真值

- TypeScript、esbuild、Vitest、Playwright、ESLint、Prettier、Stylelint、Zod、Stitch runtime CSS、WebExtension APIs。
- Stitch runtime CSS 是 Options、onboarding 与 content runtime panels 的正式生产 UI 样式路径。
- Tailwind / DaisyUI 仅保留为历史迁移材料或归档参考，不属于当前生产构建链。
- formal `superpowers` specs/plans 固定存放在外层 workspace 的 `docs/codex-superpowers/*`。

## 本轮统一门禁真值

- `npm run quality`
  - 显式包含 `typecheck:app`
  - 显式包含 `typecheck:tests`
  - 显式包含 `typecheck:strict`
  - 显式包含 `audit:retired-code:report`
  - 显式包含 `audit:production-shape:report`
  - 显式包含 `audit:build-graph:report`
  - 显式包含 `audit:non-production-source:check`
  - 显式包含 `audit:deps:report`
  - 显式包含 `audit:design-system-doc:report`
- `npm run verify:preflight`
  - 显式包含 `typecheck:app`
  - 显式包含 `typecheck:tests`
  - 显式包含 `typecheck:strict`
  - 串行继续执行 `lint -- --quiet`、`build:dev`
  - 在后续 audit report commands 前显式包含 `audit:imports:check`
  - 串行继续执行 UI 架构、交互契约、Options 主链、构建与性能 audit report commands
- `npm run audit:deps:report`
  - 使用 `dependency-cruiser@16.10.4` 巡检 `src/**/*.ts`、`src/**/*.tsx`、`src/**/*.js`
  - 当前必须覆盖至少 `400` modules 和 `300` dependencies
  - 任何 dependency-cruiser violation（包含 circular dependency）均视为失败
  - 当前实测：`modules=760 dependencies=2325 violations=0`
- `npm run audit:build-graph:report`
  - 使用 production esbuild entrypoints 的 metafile 证据区分 production、harness、validation/public owners 和 unused retired candidates
  - 删除 `src` retired path 前必须结合该报告、import graph、script/test/public scan 共同证明无 owner
- `npm run audit:non-production-source:report`
  - 输出 Non-Production Source ownership inventory，可因 `migrate-*` / `retain-*` 报告行以 report-only 语义退出非零
  - 退出非零时记录 counts 与 `stop-unknown` 状态；只要 `check` 通过，该退出码本身不是 hard-gate 失败
  - 不得直接接入 `quality`、`verify:preflight`、CI、package 或 release hard gate
- `npm run audit:non-production-source:check`
  - 使用同一份 ownership evidence 做 hard-gate 安全检查
  - 仅因 `stop-unknown`、不安全 `delete-now` 证明矛盾或缺失结构化删除证明失败；不会只因 `migrate-import-owner`、`migrate-script-owner`、`migrate-test-owner`、`retain-production` 或 `retain-production-facade` inventory 失败
- `npm run audit:retired-code:report`
  - 读取 `docs/retired-code-inventory.md`
  - 阻止 `delete-now` path 在 `src` 中回归，或被 package/scripts/src/tests/public/manifest 与视觉/浏览器验证继续引用
- `npm run audit:design-system-doc:report`
  - 检查设计系统治理文档的必需入口、引用与文件存在性
  - fail closed 阻止 active docs/workflow files 恢复当前 Tailwind/DaisyUI 指导
  - 明确排除 `src/options/**/*.ts` 兼容 alias；source alias 清理必须另开 AST/import-aware 迁移计划
- `npm run audit:imports:check`
  - 作为 `verify:preflight` hard gate 运行在 type/lint/build checks 之后、后续 audit report commands 之前
  - 阻止 `src/**/*.{ts,tsx,mts,cts}` 中三层及以上 deep relative imports
  - 覆盖 static imports、dynamic imports 与 re-exports；当前 allowlist 为空
- `npm run audit:production-shape:report`
  - 读取 `docs/production-code-hotspots.md`
  - 强制热点 LOC 阈值，并阻止 renderer/widget facade 重新出现硬编码可见文本赋值
- `.github/workflows/ci.yml`
  - 显式执行同一组三项 typecheck，不再依赖隐式覆盖

## 当前推荐执行顺序

本地前置守门：

```bash
npm run quality
npm run verify:preflight
npm run typecheck:strict
```

浏览器与交互验真：

```bash
npm run test:e2e:browser:smoke
npm run test:e2e:browser
npm run test:e2e:browser:reader-panel
npm run visual:test
```

## 当前构建预算真值

`npm run audit:build:report` 当前执行以下预算：

- `content/runtime.js <= 56 KB`
- `options/index.js <= 107 KB`
- 最大 shared chunk `<= 175 KB`
- 第二大 shared chunk `<= 145 KB`
- 第三大 shared chunk `<= 101 KB`
- `RestSection <= 40 KB`
- `yaml-config <= 70 KB`
- `chunk count <= 132`
- 当前 `M4` 口径以“保住已验真的 retained set”为准，不再强制证明旧版单批文件数预算
- 当前实测 `content/runtime.js` 为 `57,299` bytes，预算上限为 `57,344` bytes。

## 核心命令

- `npm run build:dev`
- `npm run build`
- `npm run typecheck:app`
- `npm run typecheck:tests`
- `npm run typecheck:strict`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:e2e:browser`
- `npm run test:e2e:browser:smoke`
- `npm run test:e2e:browser:reader-panel`
- `npm run test:coverage`
- `npm run test:i18n`
- `npm run visual:test`
- `npm run audit:deps:report`
- `npm run audit:imports:check`
- `npm run audit:build-graph:report`
- `npm run audit:retired-code:report`
- `npm run audit:production-shape:report`
- `npm run report:release-summary`

## 正式代码入口

- foundation：`src/ui/foundation/*`
- primitives：`src/ui/primitives/*`
- patterns：`src/ui/patterns/*`
- hosts：`src/ui/hosts/*`
- domains：`src/ui/domains/*`
- Options 主链：`src/options/index.ts -> src/options/runtimeEntry.ts -> src/options/app/bootstrap.ts -> src/options/app/productionStitchShell.ts`
- content 主链：`src/content/index.ts -> src/content/runtime/*`

## Retired / Compatibility Guardrails

- 旧 Options preview 源树不得重新引入；验证夹具归属为 `tests/fixtures/options-preview/**`。
- `src/options/components/layout/**`、`src/options/components/formSections/**`、旧 class section 文件与非 YAML widgets 保持 `migrate-then-delete`，直到 build graph、import graph、script/test/public owner 证明均清零。
- 已删除的 retired preview/runtime compatibility 路径不得作为 production、test 或 verification owner 回流。

## 已降级为兼容壳的入口

- `src/content/video/session.ts`
- `src/content/video/platforms/bilibiliPlatform.ts`
- `src/ui/domains/yaml-config/yamlConfigTableDom.ts`
- `src/ui/domains/yaml-config/yamlConfigTableModel.ts`
- `src/ui/domains/privacy/PrivacySettings.ts`
- `src/options/components/sections/RestSection.ts`
- `src/options/components/sections/FragmentSection.ts`
- `src/options/components/sections/UsageSection.ts`

## MCP / 本地浏览器调试入口

- `http://localhost:4173/options/index.html`
- `http://localhost:4173/onboarding/index.html`
- `http://localhost:4173/content-orchestrator-harness.html`
- `http://localhost:4173/runtime-observability-harness.html`
- `http://localhost:4173/interaction-contract-harness.html`
