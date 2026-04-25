# 工程命令与入口

最后更新：2026-04-17

## 推荐运行环境

- Node.js：`20.x`
- npm：`10.x`
- Playwright：`npx playwright install --with-deps chromium`

## 本轮统一门禁真值

- `npm run quality`
  - 显式包含 `typecheck:app`
  - 显式包含 `typecheck:tests`
  - 显式包含 `typecheck:strict`
- `npm run verify:preflight`
  - 显式包含 `typecheck:app`
  - 显式包含 `typecheck:tests`
  - 显式包含 `typecheck:strict`
  - 串行继续执行 `lint -- --quiet`、`build:dev`、`audit:*` 报告
- `npm run acceptance:stitch-secondary`
  - 先执行 `npm run preview:freeze-check`
  - 再执行 `npm run visual:test:stitch-secondary`
  - 用于锁定 preview-as-truth 的正式视觉合同
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
npm run acceptance:stitch-secondary
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
- `npm run visual:test:stitch-secondary`
- `npm run acceptance:stitch-secondary`
- `npm run test:coverage`
- `npm run test:i18n`
- `npm run visual:test`
- `npm run report:release-summary`

## 正式代码入口

- foundation：`src/ui/foundation/*`
- primitives：`src/ui/primitives/*`
- patterns：`src/ui/patterns/*`
- hosts：`src/ui/hosts/*`
- domains：`src/ui/domains/*`
- Options 主链：`src/options/index.ts -> src/options/runtimeEntry.ts -> src/options/app/bootstrap.ts`
- Options 正式 UI：`src/options/app/productionSchemaShell.ts` + `src/options/schema/*` + `src/options/widgets/*`
- Options 视觉真值：`src/options/preview/*` + `future/options-component-preview/options-preview-stitch-secondary.html`
- Options 兼容说明：`src/options/README.md` 与 `src/options/components/README.md`
- content 主链：`src/content/index.ts -> src/content/runtime/*`

## 已降级为兼容壳的入口

- `src/options/bootstrap.ts`
- `src/content/video/session.ts`
- `src/content/video/platforms/bilibiliPlatform.ts`
- `src/ui/domains/yaml-config/yamlConfigTableDom.ts`
- `src/ui/domains/yaml-config/yamlConfigTableModel.ts`
- `src/ui/domains/privacy/PrivacySettings.ts`
- `src/options/components/infrastructure/ModalController.ts`
- `src/options/components/sections/RestSection.ts`
- `src/options/components/sections/FragmentSection.ts`
- `src/options/components/sections/UsageSection.ts`
- `src/options/components/layout/OptionsApp.ts`
- `src/options/components/layout/MainContent.ts`
- `src/options/components/formSections/formSectionManager.ts`

## MCP / 本地浏览器调试入口

- `http://localhost:4173/options/index.html`
- `http://localhost:4173/onboarding/index.html`
- `http://localhost:4173/content-orchestrator-harness.html`
- `http://localhost:4173/runtime-observability-harness.html`
- `http://localhost:4173/interaction-contract-harness.html`
