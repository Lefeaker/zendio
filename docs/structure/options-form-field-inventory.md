# Options Form Field Inventory

> 来源：`src/options/schema.ts` (`OPTIONS_FORM_SCHEMA`)
>
> **最新状态（2025-11-02）**：`OPTIONS_FORM_SCHEMA` 已清空，所有选项字段由对应 Section 组件通过 `formSectionManager` 托管。下表保留历史映射，供追溯旧 DOM ID 与字段关系使用。

## Component Ownership Map

| Option Domain | Section Component | Snapshot Handler |
| --- | --- | --- |
| aiChat | `src/options/components/sections/AiSection.ts` | `registerFormSection('aiChat', …)` |
| readingSession | `src/options/components/sections/ReadingSection.ts` | `registerFormSection('readingSession', …)` |
| rest/templates/deepResearch/video/fragment/classifier/yamlConfig/domainMappings | 对应 `sections/*.ts` 组件 | 详见 `src/options/README.md` 的 Section 生命周期说明 |

## Legacy Schema Inventory（保留历史对照）

| Section | Option Key | DOM Hook | Control | Default Source | Notes |
| --- | --- | --- | --- | --- | --- |
| rest | httpsUrl | `#restHttpsUrl` | text | `configProvider.getRestDefaults().httpsUrl` | Legacy `renderOptionsForm`（现已移除）负责处理 `baseUrl` 回退；如今由 `mergeOptions` + Section 托管完成 |
| rest | httpUrl | `#restHttpUrl` | text | `configProvider.getRestDefaults().httpUrl` |  |
| rest | vault | `#restVault` | text | `configProvider.getRestDefaults().vault` | Drives default vault entry in routing table |
| rest | apiKey | `#restKey` | password | `configProvider.getRestDefaults().apiKey` |  |
| templates | article | `#tplArticle` | text | `configProvider.getTemplates().article` | Referenced by reading template helper |
| templates | fragment | `#tplFragment` | text | `configProvider.getTemplates().fragment` | Referenced by reading template helper |
| templates | reading | `tplReadingMode` / `tplReadingCustom` via helper | custom | `configProvider.getTemplates().reading` | `applyReadingTemplateControls` binds `#tplReadingMode`, `#tplReadingCustom`, `#tplArticle`, `#tplFragment` |
| templates | ai | `#tplAI` | text | `configProvider.getTemplates().ai` |  |
| domainMappings | domainMappings | `#domainMappings` container | custom | `DEFAULT_DOMAIN_MAPPINGS` | Managed through `createListEditor` rows |
| yamlConfig | yamlConfig | `#yamlConfigTable`, `#yamlDomainOverrides` | custom | `null` | `createYamlConfigController` consumes pre-built markup, section wires `onDirty` to schedule auto-save |
| aiChat | includeTimestamps | `#aiIncludeTimestamps` | checkbox | `false` |  |
| aiChat | userName | `#aiUserName` | text | `'USER'` |  |
| deepResearch | pureMode | `#deepResearchPureMode` | checkbox | `false` |  |
| video | floatingPromptEnabled | `#videoFloatingPrompt` | checkbox | `true` |  |
| readingSession | exportMode | `#readingExportMode` | select | `'highlights'` | Options: `highlights`, `full` |
| readingSession | highlightTheme | `#readingHighlightTheme` container | custom | `'gradient'` | Helper toggles `[data-theme]` buttons, persists `data-selected-theme` |
| fragmentClipper | useFootnoteFormat | `#fragmentUseFootnote` | checkbox | `FRAGMENT_DEFAULTS.useFootnoteFormat` |  |
| fragmentClipper | captureContext | `#fragmentCaptureContext` | checkbox | `FRAGMENT_DEFAULTS.captureContext` |  |
| fragmentClipper | selectionModifierEnabled | `#fragmentModifierToggle` | checkbox | `FRAGMENT_DEFAULTS.selectionModifierEnabled` | Field effect toggles `#fragmentModifierKeysGroup` |
| fragmentClipper | selectionModifierKeys | `[data-fragment-modifier-key]` within `#fragmentModifierKeysGroup` | custom | `FRAGMENT_DEFAULTS.selectionModifierKeys` | Extracted from checked modifier chips |
| fragmentClipper | keyboardShortcutsEnabled | `#fragmentKeyboardShortcutsEnabled` | checkbox | `FRAGMENT_DEFAULTS.keyboardShortcutsEnabled` |  |
| classifier | enabled | `#clsEnable` | checkbox | `false` | Field effect toggles `#classifierConfig` block |
| classifier | provider | `#clsProvider` | select | `'ollama'` | Options: ollama / openai / compatible |
| classifier | endpoint | `#clsEndpoint` | text | `'http://localhost:11434/api/chat'` |  |
| classifier | model | `#clsModel` | text | `'llama3.1'` |  |
| classifier | apiKey | `#clsKey` | password | `''` |  |
| classifier | taxonomy | `#clsTax` | textarea | `DEFAULT_CLASSIFIER_TAXONOMY` serialized | Parsed via `parseClassifierTaxonomy` |

⚠️ `FragmentClipperOptions` finalize stage still expects `contextLength` / `contextMode`; these controls are not represented in `OPTIONS_FORM_SCHEMA` and must be accounted for during component migration.
