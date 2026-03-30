# YAML Configuration Update Summary

## Feature Highlights

- **valuePath Advanced Panel**: Each field now exposes a dedicated advanced area for configuring `valuePath`. When the path fails to resolve and no fallback is provided, a warning is logged to help diagnose missing data. The panel also lists common context keys for quick reference.
- **Improved Array Input UX**: Array defaults use a multi-line editor—one item per line—with live “chip” previews. Values are parsed automatically into YAML arrays during save/export.
- **Domain Override Manager**: A new domain override card lets you enable/disable fields, define defaults, and supply `valuePath` overrides per domain. It supports adding/removing fields and surfaces validation errors inline.
- **Copy/Import Awareness**: The options-page “Copy configuration” and “Import configuration” flows now persist normalized `yamlConfig` data, keeping custom YAML settings intact when syncing across browsers.

## Validation & Usability

- Added validation messages across both the main field table and domain override panels (empty names, duplicate fields, type/default mismatches, whitespace in `valuePath`, etc.) to block invalid saves.
- Export pipelines warn when a non-required field’s `valuePath` cannot resolve and no default exists, preventing silent data loss.

## Testing Coverage

- Added unit tests for article, fragment, and video exports to verify custom fields, array defaults, and `valuePath` hydration.
- Extended configuration transfer tests to confirm `yamlConfig` survives copy/paste workflows.
- Added an end-to-end simulation that persists YAML overrides through `optionsStore` and asserts the exported front matter honors domain rules and custom fields.
- Added a Playwright browser interaction test (`tests/visual/yaml-config.interaction.spec.ts`) to cover domain override editing and visible array chip previews.

Localized strings for all new UI copy have been propagated to every supported language.

---

# YAML 字段配置更新说明

## 新增能力

- **valuePath 高级面板**：字段支持在「高级配置」中指定 `valuePath`，并在取值失败时提供告警，方便排查。界面同步展示常用上下文字段示例。
- **数组类型输入体验**：默认值改用多行输入，每行代表一个数组成员，并提供即时的「chips」预览，保存时自动解析为 YAML 数组。
- **域名覆盖管理 UI**：新增「域名覆盖」卡片，可為特定域名配置字段启用状态、默认值与 `valuePath`，并支持增删字段、校验错误提示。
- **配置复制/导入支持 YAML**：选项页「复制配置」「导入配置」动作现在会携带并识别 `yamlConfig` 数据，跨浏览器同步时不会遗失自定义 YAML 设定。

## 校验与可用性

- 字段列表与域名覆盖均新增校验提示（空值、重复字段、类型不匹配、valuePath 含空白等），阻止保存错误配置。
- 当字段 `valuePath` 未命中且没有默认值时，导出链路会输出警告日志，避免静默丢失数据。

## 测试覆盖

- 新增针对文章、网页片段、视频导出的单元测试，验证自定义字段、数组默认值与 `valuePath` 写入行为。
- 更新配置传输测试，确保 `yamlConfig` 在复制/粘贴过程中保持一致。
- 新增 e2e 级联用例，模拟通过 `optionsStore` 持久化 YAML 覆盖并校验导出的 frontmatter 是否按域名规则与自定义字段生效。
- 新增 Playwright 浏览器交互测试（`tests/visual/yaml-config.interaction.spec.ts`），验证域名覆盖编辑流程与数组 chips 预览。

以上改动已同步至多语言文案，可在最新构建中直接体验。
