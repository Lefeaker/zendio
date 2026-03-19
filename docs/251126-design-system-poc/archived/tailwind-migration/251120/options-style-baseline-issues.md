# Options 样式基线 Issue Note（2025-11-20）

- **执行人**：当前 PR 作者
- **Commit**：`5adddda2ae946787019b4033f9bf9127a0b40b5d`
- **日志**：`tmp/tailwind-baseline/eslint.log`、`tmp/tailwind-baseline/vitest.log`

## 1. ESLint 告警（`npm run lint`）

- **背景剪藏/连接通道仍依赖 `any`（Owner：Background Pipelines）**  
  `src/background/application/clipProcessor.ts:40-54`、`src/background/pipelines/clipPipeline.ts:52-185`、`src/background/pipelines/connectionTest.ts:26-214`、`src/background/index.ts:27-104` 存在大量 `@typescript-eslint/no-explicit-any`、`no-unsafe-member-access`、`no-unsafe-argument`、`no-misused-promises` 告警。需要补全领域类型（如 `ChromeErrorContext`、`SupportPromptOptions`）并为事件处理器拆分 `void` wrapper，确保剪藏/连接测试流程在 Tailwind 迁移前可获得干净静态检查。

- **Options Section `applySnapshot` 与断言冗余（Owner：Options UI）**  
  `src/options/components/sections/*.ts`（如 `ReadingSection.ts:69`、`RestSection.ts:485`、`RoutingSection.ts:375`、`UsageSection.ts:159-175` 等）统一被命中 `@typescript-eslint/require-await` 与 `no-unnecessary-type-assertion`。建议在 `applySnapshot` 中改用同步函数或补充必要的 `await`，并移除多余的 `as HTMLDivElement` 断言。

- **Options 控件与 Layout 仍使用多余断言（Owner：Options Controls）**  
  `src/options/components/controls/domainMappings.ts:43-161`、`controls/yamlConfigTable.ts:542-1883`、`components/layout/MainContent.ts:142-165` 仍有 `no-unnecessary-type-assertion`、`no-unused-vars` 告警。需要统一 util 的返回类型并删除冗余断言（例如 `as HTMLElement`）以恢复 lint 清零。

- **基础设施/共享层 `RestClient`、`pseudoLocalization` 仍暴露 `any`（Owner：Infrastructure）**  
  `src/infrastructure/restClient.ts:15-90`、`src/i18n/pseudoLocalization.ts:79`、`src/infrastructure/optionsRepository.ts:32` 报告 `no-unsafe-return`、`no-unsafe-member-access`、`no-misused-promises`。需为 `RestResponse`、`PseudoLocalizationOptions` 补完类型定义并在 `optionsRepository` 使用布尔判断包装 Promise。

> 以上告警累计约 2000 项。Tailwind 迁移前需至少锁定上述四个区域的负责人，逐项清理或在 lint 配置中标注豁免依据。

## 2. Vitest stderr 噪音（`npm run test:unit`）

- `tests/unit/content/keyboardShortcutsIntegration.test.ts`、`tests/unit/content/clipperDialog*.test.ts` 在日志中重复输出 `[ServiceRegistry] Overriding existing service registration Symbol(platformServices)`。虽然不会导致失败，但会掩盖真正的错误。建议在测试装置中显式关闭 `ServiceRegistry` 复注册日志或在 helper 中使用幂等注册。

## 2025-11-22 单测同步

- **Options 单测未同步 `.aobx-*` 命名（Owner：Options QA）**  
  `tests/unit/options/optionsMessages.test.ts`、`NavigationController.test.ts`、`yamlConfigTable.test.ts`、`ReadingSection.test.ts`、`RoutingSection.test.ts`、`confirmDialog.test.ts` 等仍然依赖历史 `.aob-*` 类，导致 251120 基线验证时大量 DOM 查询为空。已统一改为 `.aobx-*` 并复测 `npm run test:unit`，如再新增 Section/控件请同时更新对应测试。

- **UsageSection/MainContent 缺少 SVG 构造函数（Owner：Options QA）**  
  JSDOM 没有内置 `SVGPathElement` 等构造，UsageSection 及 MainContent 在导入 UsageSection 时会直接抛出 `ReferenceError`。新增 `tests/utils/svgElementPolyfill.ts` 并在相关用例中引入，确保后续针对 SVG 的重构可持续复测。

- **连接测试错误提示更新（Owner：Background Pipelines）**  
  `handleVaultConnectionTest` 在新的 Fetch 封装中会返回 `Body is unusable...`，导致旧单测仍期望 `HTTP 401/404`。已将断言调整为匹配 `[Vault 名称] 连接失败` 与底层消息，后续如需重新暴露 HTTP code，请同步更新测试。
