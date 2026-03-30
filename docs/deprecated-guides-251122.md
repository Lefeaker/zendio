# 废弃指南清单（2025-11-22）

> 说明：根据《development-guidelines.md》“文档需与实现保持一致”的要求，对 `AiiinOB/docs/` 下的指引类文档进行了梳理。以下条目已与当前代码脱节，继续保留会误导开发者，现已统一搬迁到 `trash/docs/20251122-deprecated-guides/` 归档，便于历史查阅。

## 1. docs/options-navigation-implementation.md
- **废弃原因**：文档指导直接在 `options/index.html` 中插入 `.nav-sidebar` / `.nav-trigger-zone` 等静态结构，但现有导航完全由 `Navigation` 组件在运行期渲染，且采用 `.aobx-navigation*` 命名，不再需要手工改 HTML。
- **依据**：
  - `src/options/index.html:1` 仅挂载 `#optionsShellRoot` 并无文档描述的静态导航容器。
  - `src/options/components/layout/Navigation.ts:27` 起的实现表明导航 DOM、状态切换与无障碍属性都在组件内部完成。
- **替代方案**：导航与懒加载的使用方式已写入 `src/options/README.md` 以及 `OptionsApp` / `NavigationController`，应以实际组件代码作为准绳。

## 2. docs/options-form-registry-scope-plan.md
- **废弃原因**：文档声称 `FormSectionRegistry` 仍依赖 `provideFormSectionRegistry` 全局单例，需要迁移到作用域注入。但当前代码已经完成这一改造。
- **依据**：
  - `src/options/components/formSections/formSectionManager.ts:1` 只导出 `FormSectionRegistry` 类本身，不再包含任何 `provide/get` 单例方法。
  - `src/options/components/layout/MainContent.ts:6` 将 `formRegistry` 作为 `MainContentConfig` 的必填参数，并在渲染、挂载 Section 时通过实例传递，证明依赖注入链路已经落地。
- **替代方案**：作用域注册器的使用规范现在由 `src/options/README.md` §0.1/§2 以及 `BaseSection` 说明覆盖，本指南可以归档。

## 3. docs/modularization-opportunities-analysis-report.md
- **废弃原因**：报告围绕 `usageDashboard.ts`、`vaultRouterSection.ts`、`optionsForm.ts` 等旧版巨石文件提出拆分建议，但这些文件已经在 2025 的组件化重构中完全移除，章节内容与现状不符。
- **依据**：
  - `src/options/components/layout/MainContent.ts:35` 通过动态导入 `sections/*` 来管理每个功能区，取代了旧版单文件实现。
  - `src/options/components/sections/UsageSection.ts:1` 展示了新的 `UsageSection` 结构（含 `usageDashboard.utils`），对应逻辑已拆分并模块化。
- **替代方案**：现行架构、目录与职责划分详见 `docs/options-page-refactor-plan.md`（现已更新）与 `src/options/README.md`，不再需要旧的机会分析报告。

## 4. docs/options-refactor-followup-guide.md
- **废弃原因**：文档列出的“待办”包括 Section 懒加载、Fragment 上下文控件回归、Helper 控制器组件化等，但这些项目已经完成，并配套单元 / E2E 覆盖。
- **依据**：
  - `src/options/components/layout/MainContent.ts:35` 与 `tests/e2e/optionsNavigationLazyLoad.test.ts:1` 证明懒加载及导航联动已实现并有测试。
  - `src/options/components/sections/FragmentSection.ts:259` 提供上下文长度/模式控件，`tests/e2e/optionsFragmentAutoSave.test.ts:1` 负责自动保存回归。
  - `src/options/components/controls/vaultRouterController.ts:1` 与 `tests/e2e/optionsVaultRouterAutoSave.test.ts:1` 显示 helper 控制器已经组件化并受测试保护。
- **替代方案**：最新状态请参考 `src/options/README.md`、`docs/development-guidelines.md` 以及相应的 E2E/单测，原 follow-up 指南应转入历史记录。

## 5. docs/options-doc-refresh-plan.md
- **废弃原因**：文档规划在 README/Agent/PR 模板中添加“快速上手”“必跑命令”“文档更新责任”等内容。当前仓库已经完成所有事项，文档仅保留过时计划。
- **依据**：
  - `src/options/README.md:7` 起新增的 “0. 快速上手” 模块已覆盖目录、样式规范、命令清单与常见问题，正是该计划的目标。
  - `.github/PULL_REQUEST_TEMPLATE.md:5` 起新增 Options 专属 checklist，强制作者勾选文档更新/日志要求，满足计划要求。
  - `agent.md:1` 起也同步引用 `src/options/README.md`，提醒开发遵循现有文档。
- **替代方案**：继续使用 README + PR 模板 + `docs/options-doc-refresh-log.md` 追踪文档刷新；本计划文档可移除或归档。

## 6. docs/migration-guide.md
- **废弃原因**：指导将第三方聊天解析与 Obsidian Turndown 规则迁入骨架，但这些迁移已完成。
- **依据**：
  - `src/third_party/ai-chat-exporter/parse.ts:8` 与 `src/content/extractors/aiChatExtractor.ts:2` 展示了正式的 `parseChatDOM` 实现与调用路径。
  - `src/content/extractors/articleExtractor.ts:3` 及 `src/content/clipper/shared/turndownFactory.ts:2` 已全量调用 `applyObsidianRules`，HTML→Markdown 规则无需再迁移。
- **替代方案**：参考 `src/content/extractors`、`src/third_party/ai-chat-exporter/` 的现有实现；如需补充文档，直接在对应 README 或开发指南中更新。

## 7. docs/options-tech-debt-remediation-guide.md
- **废弃原因**：列出的“债务”均已修复，包括 FormSectionRegistry 作用域化、PrivacySettings 组件化、导航控制器与 CSS 单入口。
- **依据**：
  - `src/options/components/formSections/formSectionManager.ts:1` 已无全局单例，`MainContentConfig` 要求传入实例。
  - `src/options/components/controls/privacySettings.ts:1` 继承 `BaseComponent` 并构建显式 DOM，不再使用 innerHTML。
  - `src/options/index.html:7` 只引入 `aob-options.css`，脚本/README 也约束 `.aobx-*` 命名。
- **替代方案**：保持现有架构，若有新债务请在 `docs/development-guidelines.md` 或仓库 issue 中跟踪。

## 8. docs/options-shell-alignment-guide.md
- **废弃原因**：文档声称 `VaultRouterController` 不是组件，且 legacy CSS 仍在使用，但现状已经对齐。
- **依据**：
  - `src/options/components/controls/vaultRouterController.ts:1` 已继承 `BaseComponent` 并提供 `render()/destroy()`。
  - `src/options/index.html:7` 只引用 `aob-options.css`，`options-aob.css` 等遗留文件已删除。
- **替代方案**：以 `src/options/README.md` 与 `options-refactor-summary-2025.md` 中的最新描述为准，必要时在 README 更新状态。

## 9. docs/typescript-typecheck-governance.md
- **废弃原因**：文件记录了尚未接入 `tsc` 的过渡期工作项，如今 `package.json:8-17` 已提供 `typecheck` 脚本并在 CI 中执行，文档内容失真。
- **依据**：
  - `package.json` 中的 `typecheck:app`/`typecheck:tests` 脚本可直接运行，`tsconfig.*` 已拆分完成。
  - 文档提及的旧文件（如 `optionsForm.ts`）已删除或替换。
- **替代方案**：继续沿用 `npm run typecheck` 及相关脚本；若需新的类型治理计划，可在仓库 Wiki 或新的指南中撰写。

## 10. docs/codebase-analysis-and-refactoring-report.md
- **废弃原因**：仍以旧目录和大文件为基准（`src/options/components/usageDashboard.ts`、`vaultRouterSection.ts` 等），但这些文件只存在于 `trash/old-options-page/`。
- **依据**：
  - `rg --files -g '*usageDashboard.ts'`、`rg --files -g '*vaultRouterSection.ts'` 仅命中旧版 trash 目录；现行 Sections 位于 `src/options/components/sections/*.ts`。
- **替代方案**：若需最新分析，可基于 `UsageSection`、`NavigationController` 等真实文件重新撰写。

## 11. docs/directory-restructure-plan.md
- **废弃原因**：规划目录包含 `src/options/schema.ts`、`components/confirmDialog.ts` 等已移除文件；当前 `src/options` 仅保留 `app/`、`components/`、`state/` 等新结构。
- **依据**：
  - `ls src/options` 与 `ls src/options/components` 均未出现文档描述的路径。
- **替代方案**：以 `src/options/README.md` 的目录说明为准，需要新重构计划时再撰写。

## 12. docs/tech-debt-audit-report-2024.md
- **废弃原因**：审计仍引用不存在的 `src/options/schema.ts`、`src/options/components/usageDashboard.ts`，并假定 `npm run typecheck` 未引入，与当前脚本不符。
- **替代方案**：依赖现有 lint/typecheck/CI 输出评估技术债务，如需新的审计可重写。

## 13. docs/options-page-refactor-plan.md
- **废弃原因**：文档仍把 `usageDashboard.ts`、`vaultRouterSection.ts` 视为现役组件，但这些文件只保存在 `trash/old-options-page/options-full/components/`，实际实现位于 `src/options/components/sections/*.ts`。
- **替代方案**：参考 `src/options/README.md` 与现有 Section 代码，若需新的改版计划请按现状重写。

## 14. docs/options-ui-alignment-guide.md
- **废弃原因**：指南引用 `layoutNavigation.ts` 等已删除脚本，导航/壳层现在由 `NavigationController`、`OptionsApp` 负责，而且 README 已覆盖一致性说明。
- **替代方案**：以 `src/options/components/layout/NavigationController.ts`、`MainContent.ts` 等文件为准；如需说明文档，可在 README 中维护最新流程。

---

> 建议：以上文件可整体迁移到 `trash/archived-guides/`（如需保留历史）或直接删除，并在 README / Agent 中保持对有效指南的引用，防止新成员查阅到过期内容。
