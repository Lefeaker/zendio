# 兼容性与回归矩阵

日期：2026-03-20

## 1. 浏览器兼容

已验证：

- Chrome / Chromium
  - `npm run test:e2e:browser`
  - 覆盖 `chromium-desktop`、`chromium-tablet`、`chromium-mobile`
- Firefox
  - `npm run build:firefox:dev`
  - `npx vitest run tests/firefox/firefox.test.ts tests/unit/platform/firefox/action.test.ts tests/unit/platform/firefox/contextMenus.test.ts tests/unit/platform/firefox/storage.test.ts tests/unit/platform/firefox/tabs.test.ts tests/unit/platform/firefox/utils.test.ts`
  - 可选：`npm run test:e2e:browser:firefox`（需要 Playwright 可控 Firefox 环境，本轮默认门禁未依赖此项）

结论：

- Chromium 路径已具备真实 browser interaction 回归
- Firefox 路径已具备构建与平台服务自动化回归；browser-interaction 默认门禁暂以 Chromium 为主

## 2. 站点兼容

已验证：

- `tests/e2e/claudeAiChatFlow.test.ts`
- `tests/e2e/kimiAiChatFlow.test.ts`
- `tests/e2e/monicaAiChatFlow.test.ts`
- `tests/e2e/deepseekAiChatFlow.test.ts`
- `tests/e2e/doubaoAiChatFlow.test.ts`
- `tests/e2e/tongyiAiChatFlow.test.ts`
- `tests/e2e/articleExtractionHardening.test.ts`
- `tests/e2e/clipperFlow.test.ts`

结论：

- AI 聊天站点、普通文章路径与 clipper 路径均有真实流测试覆盖

## 3. 关键交互

已验证：

- `tests/e2e/optionsFragmentAutoSave.test.ts`
- `tests/e2e/optionsLanguageSwitch.test.ts`
- `tests/e2e/optionsTemplatesAutoSave.test.ts`
- `tests/e2e/optionsVaultRouterAutoSave.test.ts`
- `tests/e2e/videoPanelFlow.test.ts`
- `tests/e2e/supportPromptFlow.test.ts`
- `tests/visual/yaml-config.interaction.spec.ts`

结论：

- Options auto-save、YAML 交互、video panel、support prompt 和关键 reader/video action 均已有自动化回归

## 4. Chrome MCP 手测

已验证页面：

- `http://localhost:4173/options/index.html`
- `http://localhost:4173/onboarding/index.html`
- `http://localhost:4173/content-orchestrator-harness.html`
- `http://localhost:4173/runtime-observability-harness.html`
- `http://localhost:4173/interaction-contract-harness.html`

已验证动作：

- Options shell / section 渲染、theme switch、YAML / Templates / Classifier / Deep Research 交互
- onboarding preview fallback 启动
- ClipperDialog / ReaderSession / VideoSession 挂载
- GA4 debug / Sentry envelope / global error boundary / usage event 观测链
- shared button / input / dialog 的 aria-invalid、aria-busy、role/dialog data-element 合同

截图：

- `tmp/options-p2-3-di-validation.png`
- `tmp/onboarding-p2-3-di-validation.png`
- `tmp/content-orchestrator-p2-4-performance-validation.png`
- `tmp/runtime-observability-p2-5-validation.png`
- `tmp/interaction-contract-harness-validation.png`
