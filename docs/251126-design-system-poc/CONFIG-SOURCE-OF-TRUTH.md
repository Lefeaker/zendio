# Config Source Of Truth

> **更新日期**：2026-03-15  
> **用途**：明确配置类资产的唯一主源、生成产物与验证命令，避免再次出现“双份静态真值并行维护”

---

## 当前结论

### Tailwind

- 主源：
  - `tailwind.shared.cjs`
- 扩展入口：
  - `tailwind.config.cjs`
  - `tailwind.config.global.cjs`
  - `tailwind.config.clipper.cjs`
  - `tailwind.config.video.cjs`
- 口径：
  - 共享主题、daisyUI 配置必须先落到 `tailwind.shared.cjs`
  - 具体入口文件只允许做 content 范围与局部扩展，不再复制主题片段
- 验证：
  - `npm run tailwind:build`
  - `npm run tailwind:build:global`
  - `npm run tailwind:build:clipper`
  - `npm run tailwind:build:video`

### Vitest aliases

- 主源：
  - `vitest.shared.ts`
- 消费入口：
  - `vitest.unit.config.ts`
  - `vitest.e2e.config.ts`
- 口径：
  - 新增或调整别名时，先改 `vitest.shared.ts`
  - 各 Vitest 配置文件只消费共享别名工厂，不单独复制 alias 数组

### Browser manifests

- 主源：
  - `scripts/utils/manifestSources.mjs`
- 生成脚本：
  - `scripts/generate-manifests.mjs`
- 生成产物：
  - `public/manifest.json`
  - `public/manifest.firefox.json`
- 运行时消费：
  - `scripts/build.mjs` 直接从 `manifestSources.mjs` 生成浏览器 manifest，再应用 REST host 权限覆盖
- 口径：
  - 浏览器共有字段只能改主源
  - Chrome / Firefox 差异只能通过 browser override 表达
  - `public/manifest*.json` 视为生成产物，不再手改
- 验证：
  - `npm run manifest:generate`
  - `npm run build:fast`
  - `npm run build:firefox:fast`

### Locales

- 主源：
  - `src/i18n/config.ts`
  - `src/i18n/locales.ts`
  - `src/i18n/locales/*.ts`
- 生成脚本：
  - `scripts/gen-locales.mjs`
- 生成产物：
  - `public/_locales/*/messages.json`
- 口径：
  - 语言列表、fallback 链、Chrome 静态消息键以 `src/i18n/config.ts` 为准
  - locale 文案与 runtime/static 消息以 `src/i18n/locales*.ts` 为准
  - `public/_locales/**` 视为生成产物，不再手改
- 自动审计：
  - `npm run audit:locales:report` 对账 `src/i18n/config.ts`、`src/i18n/locales.ts` 与 `src/i18n/locales/*.ts`
- 验证：
  - `npm run i18n:generate`
  - `npm run i18n:lint`
  - `npm run validate:i18n:budgets`

### Design tokens

- 当前主源：
  - `src/styles/design-tokens.css`
  - `src/options/styles/design-tokens.css`
- 当前消费层：
  - `tailwind.shared.cjs`
  - `src/options/styles/**`
  - `src/styles/**`
- 当前口径：
  - 全局 token 值以 `src/styles/design-tokens.css` 为准
  - Options/AOBX token 值以 `src/options/styles/design-tokens.css` 为准
  - Tailwind 仅映射 CSS 变量名，不重新定义 token 数值
- 自动审计：
  - `npm run audit:design-tokens:report` 校验 `tailwind.shared.cjs` 使用的 CSS 变量是否都已在上述两份 token 主源内定义
- 剩余事项：
  - 若后续继续推进，应只处理“global token / AOBX token 双轨是否还需要继续保留”，不再重开 Tailwind 共享层工作

---

## CI 基线

- `npm run audit:deps:report`
- `npm run audit:platform-services:report`
- `npm run audit:design-tokens:report`
- `npm run audit:locales:report`
- `npm run manifest:generate && git diff --exit-code -- public/manifest.json public/manifest.firefox.json`
- `npm run i18n:generate && git diff --exit-code -- public/_locales`

---

## 变更规则

1. 改共享配置，先改主源，再跑生成或构建命令。
2. 不直接编辑生成产物。
3. 若需要新增第二套配置族，必须先在主文档登记批次，而不是直接复制现有文件。
