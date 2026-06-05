# 选项页多语言适配真值说明

更新时间：2026-06-05
适用范围：`src/options/**`

## 当前真值

- `Options` 主路径的可见文案必须走 `Messages` -> `src/i18n/catalog/messages/<lang>/runtime.json` / `schema.json` -> `src/i18n/generated/locales/*.generated.ts` 链路。
- 2026-06-01 旧 Options Section 类已清退；当前 Options 主路径文案由 production Stitch schema、`src/options/stitch/content.ts`、`src/options/app/**` 与 i18n catalog source 共同承载。
- 本轮新增的 i18n key 已同步到 release catalog source：
  - `diagnosisDescription`
  - `diagnosisSummaryHint`
  - `diagnosisResultTitle`
  - `routingRulesPriorityNote`
  - `videoPromptCustomizationTitle`
  - `videoPromptLabelTitle`
  - `videoPromptLabelPlaceholder`
  - `videoPromptLabelHint`
  - `videoPromptShortcutTitle`
  - `videoPromptShortcutPlaceholder`
  - `videoPromptShortcutHint`
  - `videoSupportedPlatformsTitle`
  - `videoPlatformSupportedBadge`
  - `videoEnableButton`
  - `videoSaveConfigButton`
  - `videoPlatformYoutubeName`
  - `videoPlatformYoutubeDescription`
  - `videoPlatformBilibiliName`
  - `videoPlatformBilibiliDescription`

## 已验证结果

- `npm run typecheck:app`
- `npm run typecheck:tests`
- `npm run typecheck:strict -- --pretty false`
- `npm run lint -- --quiet`
- `npm run i18n:lint`
- `npm run audit:locales:report`
- `npx vitest run --config vitest.unit.config.ts tests/unit/options/productionStitchShell*.test.ts tests/unit/options/schemaI18nParity.test.ts`

浏览器抽查：

- `http://localhost:4180/options/index.html`
  - `Configuration Diagnosis` 区块已显示新的说明文案
  - `Routing Rules` 区块已显示 `Tip: higher priority rules match first...`
  - `Video mode` 区块已显示 `Floating prompt copy and shortcut` 与 `Supported platforms`

截图：

- `tmp/options-i18n-validation-20260321.png`

## 现行约束

新增选项页文案时，必须同时满足：

1. 在 `src/i18n/catalog/messages/en/runtime.json` 或对应 `schema.json` 添加英文 baseline key。
2. 在全部 release `src/i18n/catalog/messages/<lang>/runtime.json` 或对应 `schema.json` 添加同名 key。
3. 运行 `npm run i18n:catalog:generate` 生成 `src/i18n/generated/messages.generated.ts`、`localeRegistry.generated.ts` 和 `generated/locales/*.generated.ts`。
4. Production Stitch schema、content、shell 或 domain owner 不得直接写死未登记的用户可见字符串。
5. 至少补一条对应 production Stitch/schema/i18n 单测，验证 locale 文案进入渲染或 schema 结果。
6. 运行 `npm run i18n:lint`、`npm run i18n:catalog:check` 与 `npm run audit:locales:report`。

## 当前剩余风险

- 旧预览 HTML / 历史过程文档中仍可能保留示例性硬编码文本，但它们不构成 `Options` 生产路径真值。
- 若新增 Section 只补 catalog source、不补 `setMessages()` 断言，仍有回流风险。
