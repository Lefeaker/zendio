# 工程命令与入口

最后更新：2026-03-31

## 推荐运行环境

- Node.js：`20.x`（仓库根 `.nvmrc` 为 `20`，CI 也按该主版本执行）
- npm：`10.x`
- Playwright 浏览器：执行 `npx playwright install --with-deps chromium`

如本机使用 Node 22+，Playwright 解析 TypeScript 配置时可能出现额外实验性告警；前置收口基线统一以 Node 20 LTS 为准。

## 前置阶段最低守门

- `npm run verify:preflight`
- `npm run test:e2e:browser`
- `npm run test:e2e:browser:smoke`

说明：

- `verify:preflight` 会串行执行 `typecheck:app`、`typecheck:tests`、`lint -- --quiet`、`build:dev`、`audit:ui-architecture:report`、`audit:interaction-contract:report`、`audit:build:report`、`audit:performance:report`
- browser smoke 默认按 `PLAYWRIGHT_WORKERS=1` 串行执行；如需提速，可显式传入 `PLAYWRIGHT_WORKERS=<n>` 做并行回归
- Playwright `webServer` 已改为 `node scripts/start-playwright-web-server.mjs`，避免依赖 `python3 -m http.server` 与 shell 环境色彩变量噪音

## 质量门禁

- `npm run quality`
  生产构建前统一门禁入口，会串行执行 UI 架构、组件入口、交互 contract、Options CSS、平台边界、深层导入、lint warning 与 i18n 检查。
- `npm run audit:ui-architecture:report`
  检查 `src/ui/*` 目录齐备、domains 依赖方向、已退役 wrapper / alias 是否复活、legacy 资产是否回流、`lucide` 是否越界导入。
- `npm run audit:components:report`
  审计旧 helper / 手写按钮 / 旧入口残留。
- `npm run audit:interaction-contract:report`
  审计 primitives contract、dialog marker 与 interaction harness 是否仍绑定正式入口。
- `npm run audit:platform-services:report`
  审计平台服务 allowlist。
- `npm run audit:imports:report`
  审计深层导入和边界回流。

## 构建入口

- `npm run build:dev`
- `npm run build`
- `npm run build:firefox:dev`
- `npm run build:firefox`

## 测试入口

- `npm run typecheck`
- `npm run typecheck:app`
- `npm run typecheck:tests`
- `npm run lint -- --quiet`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:e2e:browser`
- `npm run test:e2e:browser:smoke`
- `npm run test:e2e:browser:firefox`
- `npm run test:coverage`
- `npm run test:i18n`

## 关键 audit / 报告

- `npm run audit:ui-architecture:report`
- `npm run audit:components:report`
- `npm run audit:interaction-contract:report`
- `npm run audit:build:report`
- `npm run audit:performance:report`
- `npm run audit:repository-composition:report`
- `npm run audit:design-system-doc:report`
- `npm run audit:design-tokens:report`
- `npm run audit:locales:report`

## 正式代码入口

- foundation：`src/ui/foundation/*`
- primitives：`src/ui/primitives/*`
- patterns：`src/ui/patterns/*`
- hosts：`src/ui/hosts/*`
- domains：`src/ui/domains/*`

## MCP / 浏览器验证入口

- `http://localhost:4173/options/index.html`
- `http://localhost:4173/onboarding/index.html`
- `http://localhost:4173/content-orchestrator-harness.html`
- `http://localhost:4173/runtime-observability-harness.html`
- `http://localhost:4173/interaction-contract-harness.html`

## 已归档 / 已移除入口

以下资产与入口不再视为正式路径：

- `docs/archive/legacy-options-assets/obsidian-clipper-style.css`
- `docs/archive/legacy-options-assets/obsidian-hybrid-preview.html`
- `docs/archive/legacy-options-assets/optionuicsssuggest.md`
- `src/options/components/shared/*`
- `src/options/components/controls/VaultRouterView.ts`
- `src/options/components/controls/YamlConfigView.ts`
- `src/options/components/controls/privacySettings.ts`
- `src/options/components/controls/yamlConfigTable*.ts`
- `src/content/shared/daisy/*`
- `src/content/reader/components/ReaderDialog.ts`
- `src/content/video/components/VideoDialog.ts`
- `src/content/ui/supportPrompt/SupportPromptView.ts`

## Firefox 说明

- `npm run test:e2e:browser` 默认跑 Chromium 项目，作为当前稳定 browser-interaction 门禁。
- `npm run test:e2e:browser:smoke` 负责 migration harness 最小 smoke，用于前置阶段与 CI 最低浏览器守门。
- `npm run test:e2e:browser:firefox` 保留为可选路径，需要本机具备 Playwright 可控的 Firefox 环境。
