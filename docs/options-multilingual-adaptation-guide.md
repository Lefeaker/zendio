# 选项页多语言适配真值说明

更新时间：2026-06-07
适用范围：`src/options/**`

## 当前真值

- `Options` production 路径的可见文案必须走 `Messages` -> `src/i18n/catalog/messages/<lang>/runtime.json` / `schema.json` -> `src/i18n/generated/locales/*.generated.ts` 链路。
- production Stitch schema、builder 与 setting/resource/runtime surface copy 现在以 `SchemaContext.messages` / `SchemaContext.t(key, fallback)` 为主消费面；`src/options/app/**` 中的 shell/runtime helper 也必须读取当前语言 `Messages`，不能再把中文 preview copy 当 English fallback。
- `src/options/stitch/content.ts` 仍承载结构性 content truth，但 production body copy 不得靠手写中文默认值维持；native language labels 仅允许保留在语言选择器 option 文本中。
- Options production language selector 当前真值固定为 12 个 release human UI locales，顺序与 `RELEASE_LANGUAGE_ORDER` 一致：
  - `en`
  - `zh-CN`
  - `ja`
  - `de`
  - `fr`
  - `es-ES`
  - `es-419`
  - `it`
  - `ko`
  - `pt-BR`
  - `ru`
  - `zh-TW`
- production selector 禁止出现非 canonical `es` 与 dev-test-only `qps-ploc`。

## English residual rule

- English residual 检查以 production language selector 为边界：允许 selector option 内保留 native language names，例如 `简体中文`、`繁體中文`。
- selector 之外的 production settings/body/resource/runtime 文案在 English 下不得残留中文。
- 当前基线由 `tests/utils/optionsI18nTextAssertions.ts` 中的 `collectTextExcludingLanguageOptions()` / `expectNoChineseSettingsCopy()` 实现；任何未来规则放宽都必须先证明仍能拦截非 selector 残留。

## 当前验证锚点

- `tests/e2e/optionsLanguageSwitch.test.ts`
  - 验证 selector values 精确等于 `RELEASE_LANGUAGE_ORDER`
  - 验证 production selector 不包含 `es` / `qps-ploc`
  - 验证 `zh-CN -> en` 后六个 primary settings panels 都切到 English copy
- `tests/e2e/multilingualExpansion.test.ts`
  - 验证 release locale expansion 与 language normalization 仍匹配 release truth
- `tests/unit/options/productionStitchShell*.test.ts`
  - 验证 shell re-render、schema context 与 current messages 更新链路
- `tests/unit/options/schemaI18nParity.test.ts`
  - 验证 generated schema/runtime locale parity 与 representative key 覆盖
- `tests/unit/options/productionStitchSchemaPresence.test.ts`
  - 验证 production shell 暴露完整 selector values，且不包含 `qps-ploc`

## 未来修改 Options 文案的必跑命令

新增或修改 production Options copy 时，至少完成以下步骤：

1. 在 `src/i18n/catalog/messages/en/runtime.json` 或对应 `schema.json` 添加 English baseline key。
2. 在全部 12 个 release locale 的对应 catalog source 中补齐同名 key。
3. 运行 `npm run i18n:catalog:generate`，刷新 generated locale artifacts。
4. 确保 schema/builders 通过 `SchemaContext.t()`，shell/runtime helper 通过当前 `Messages` 读取新文案；不要引入新的 hardcoded body copy。
5. 补齐最小回归测试，至少覆盖 schema/render/runtime 中受影响的 production owner。
6. 运行以下命令并保留结果：
   - `npm run i18n:catalog:check`
   - `npm run audit:locales:report`
   - `npm run build:dev`
   - `npm run test:i18n`
   - `npx vitest run --config vitest.unit.config.ts tests/unit/options/productionStitchShell*.test.ts tests/unit/options/schemaI18nParity.test.ts tests/unit/options/productionStitchSchemaPresence.test.ts`
   - `npx vitest run --config vitest.e2e.config.ts tests/e2e/optionsLanguageSwitch.test.ts tests/e2e/multilingualExpansion.test.ts`
   - `npm run verify:stitch-secondary`

- 若 copy length、layout 或 modal/runtime preview 明显变化，再追加：
  - `npm run visual:stitch`
  - `npm run visual:test`

## 当前剩余风险

- 旧 preview HTML、历史归档文档与 compatibility-only 模块里仍可能保留示例性硬编码文本，但它们不构成 `Options` production truth。
- 若未来只补 catalog source、不补 English residual 测试或 `SchemaContext.t()`/`Messages` 消费链验证，中文回流仍可能在 selector 之外复发。
