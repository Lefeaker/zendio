# 选项页多语言适配整改指南

> 版本：v0.1  
> 更新时间：2025-11-25  
> 适用范围：AiiinOB 选项页（`src/options/**`）多语言适配与文案治理

---

## 1. 背景

选项页组件化与运行时治理已完成，但目前仍存在以下多语言适配缺口：

- 模板化后新增的 UI 片段未完全接入 `data-i18n` 绑定。
- 个别 Section 使用硬编码中文/英文文案，未抽取至 `messages.ts`/`_locales`。
- 新增 locales（如 `de`, `es-419`）尚未覆盖全部键值。
- 端到端测试仅验证语言切换流程，未对各 Section 文案进行全面回归。

为保障国际化质量并满足 Chrome Web Store 审核要求，需要在现有架构上补齐上述工作。

---

## 2. 目标

1. **文案抽离统一化**：所有可见字符串均走 `messages.ts` → I18n 资源 → DOM 绑定链路。
2. **视图全量绑定**：选项页内的模板/动态组件全部使用 `data-i18n` 或 `pageI18nBinder` 注册。
3. **Locale 覆盖率达 100%**：`en`, `zh-CN`, `ja`, `de`, `es-ES`, `es-419`, `fr`, `ko`, `qps-ploc` 等 locale 文件拥有一致键集。
4. **测试与校验完善**：更新单元/E2E 测试覆盖语言切换、动态加载 Section 的文案验证，并在 CI 中新增文案键缺失检查。

---

## 3. 当前状态速览

| 模块 | 状态 | 备注 |
|------|------|------|
| `PageI18nController` | ✅ 正常工作，`ensureDeclarativeI18nController()` 会挂载 binder。 |
| `OptionsApp`/`MainContent` | ✅ 懒加载后每个 Section 在 `setMessages()` 时可更新文案。 |
| Section 文案绑定 | ⚠️ 部分节点仍使用 `textContent` 直接赋值。 |
| `_locales` | ⚠️ 新增语言缺少若干键值（以 `messages.zh-CN.json` 为准）。 |
| 测试 | ⚠️ `optionsLanguageSwitch.test.ts` 仅验证占位符，不校验 Section 细节。 |
| CI 校验 | ⚠️ 仅跑 `npm run validate:i18n:budgets`，未检查键缺失或未翻译占位符。 |

---

## 4. 整改步骤

### 阶段 A：梳理与抽离文案

1. **收集硬编码字符串**  
   - 使用 `rg -n "['\"]` 检查 `src/options` 下的中文/英文字面量。  
   - 重点排查：`NavigationController`、`TemplatesSection`、`UsageSection`、模态框、Toast 文案等。
2. **抽离到 `messages.ts`**  
   - 在 `src/options/components/messages.ts` 添加键值定义，使用现有类型 `OptionsMessages`.  
   - 更新 `src/options/components/i18nContext.ts` 使 binder 可以读取新键。
3. **同步 `_locales`**  
   - 以 `zh_CN/messages.json` 和 `en/messages.json` 为基准，新增键保持完全一致。  
   - 对其他语言文件（`de`, `es_419`, `es_ES`, `fr`, `ja`, `ko`, `qps-ploc`）填充同名键，未翻译可暂用英文占位但需标记 TODO。

### 阶段 B：视图绑定与生命周期

1. **DOM 模板增加 `data-i18n`**  
   - `src/options/index.html`、各 Section 的模板/动态插入 HTML 使用 `data-i18n="key"`。  
   - 对复杂内容使用 `data-i18n-html`，确保 binder 正确替换。  
2. **组件内 `setMessages()` 实现**  
   - 对已有 `setMessages()` 的 Section，注入字符串时统一走 `this.messages.xxx`。  
   - 确保 `render()`/`applySnapshot()` 时调用 `this.setText()` 或挂载 binder（若依赖 `PageI18nBinder`）。
3. **懒加载 Section 的更新**  
   - 在 `MainContent.mountSection()` 后，若 `this.messages` 存在，立即调用 `section.setMessages(this.messages)`。  
   - `NavigationController` 监听 `aob:sectionmounted` 后，触发 binder 更新。

### 阶段 C：Locale 覆盖与校验

1. **统一键集**  
   - 新建脚本或使用现有 `scripts/check-locale-keys.mjs`（如无则新增）对 `_locales` 键进行比对。  
   - 在 `npm run validate:i18n:budgets` 中串联该脚本，或新增 `npm run validate:i18n:keys`。  
2. **处理 `qps-ploc`**  
   - 该 pseudo locale 用于 UI 长度测试，确保字符串包裹正确且无硬编码导致的截断。
3. **字体/排版检查**  
  - 在 `aob-options.css` 中确认未对特定语言写死宽度；如有需要，使用 `html[lang="xx"]` 选择器做最小调整。

### 阶段 D：测试与验证

1. **单元测试**  
   - 更新 `tests/unit/options/sections/*.test.ts`，确保 `setMessages()` 后对应文本发生变化。  
   - 对 `NavigationController.test.ts` 增加语言切换后的标签文本断言。
2. **端到端测试**  
   - `tests/e2e/optionsLanguageSwitch.test.ts`：  
     - 使用 `withDomEnvironment` 加载完整选项页片段，切换语言后断言关键 Section 文案。  
     - 验证 `RestSection` 占位符、`TemplatesSection` 按钮、模态框标题等。  
   - 若需要，可在 Playwright 测试（如有）中添加多语言截图比对。
3. **CI 更新**  
   - 在 `.github/workflows/ci.yml` 中增加：  
     ```bash
     npm run validate:i18n:keys
     npm run test:unit -- --runInBand --filter "options.*i18n"
     npm run test:e2e -- --runInBand --filter "options.*Language"
     ```  
     具体命令根据实际脚本命名调整。

---

## 5. 待交付物

| 输出 | 说明 |
|------|------|
| 文案文件 | `src/options/components/messages.ts`、`_locales/**/messages.json` 键集统一。 |
| 代码变更 | 所有硬编码文案移除；Section/模态框使用 `data-i18n` 或 `setMessages()`。 |
| 验证报告 | `npm run typecheck:tests`、`npm run lint`、`npm run test:unit`、`npm run test:e2e`、`npm run validate:i18n:keys` 的成功记录。 |
| 文档更新 | 更新 `docs/options-ui-alignment-guide.md`、`docs/options-refactor-summary-2025.md` 的国际化章节。 |

---

## 6. 验收标准

1. 打开选项页，切换任意支持语言，所有文本（包括按钮、占位符、Toast、Modal、错误提示）均切换成功，无残留硬编码。
2. `_locales` 中任意语言文件与 `en/messages.json` 键数量一致。
3. 多语言相关的单元/E2E 测试全部通过；CI 增加的键集校验无报警。
4. 运行 `npm run typecheck:tests`、`npm run lint`、`npm run test:unit`、`npm run test:e2e`、`npm run validate:i18n:keys` 均成功。

---

## 7. 建议的人力拆分

| 任务 | 建议责任人 | 预计耗时 |
|------|------------|----------|
| 文案抽离 & 绑定改造 | Options 前端 | 2 ~ 3 天 |
| Locale 键集补全 | 翻译支持 / 前端 | 1 天 |
| 测试补充 | QA/前端 | 1 天 |
| CI & 文档更新 | 前端 | 0.5 天 |

---

> 备注：如发现某些文案需按区域差异化处理，统一在 `messages.ts` 中添加注释并在 `_locales` 内提供变体。必要时可与产品沟通确认优先级。祝实施顺利！ 🎉
