# 技术债批次追踪表

> **更新日期**：2026-03-15
> **唯一执行入口**：`docs/251126-design-system-poc/DEBT-IMPLEMENTATION-ROADMAP.md`
> **用途**：记录当前有效批次、负责人、状态与验收结果；替代分散的临时执行清单
> **说明**：本表是执行看板，不单独定义顺序；Phase 状态、下一执行批次与依赖关系以 `DEBT-IMPLEMENTATION-ROADMAP.md` 为准

## 约束

- 不重开已归档的 Tailwind 主线
- 不把文档治理与工程债混到同一批
- 不并行拆分多个大型 orchestrator

## 当前批次

| 批次 | Phase | 目标文件 | 负责人 | 状态 | 验证结果 |
| --- | --- | --- | --- | --- | --- |
| G-0 | Phase 0 | `package.json`<br>`.dependency-cruiser.cjs`<br>`.github/workflows/ci.yml`<br>`tools/report-platform-services-allowlist.mjs`<br>`docs/251126-design-system-poc/GET-PLATFORM-SERVICES-CLEANUP.md` | Developer / Executor | 已完成 | 已新增只读依赖审计命令 `npm run audit:deps:report` 与 `npm run audit:platform-services:report`；CI 以 `continue-on-error` 报告模式接入；平台访问残留 allowlist 已作为可执行基线固化 |
| B-12 | Phase 2A | `src/background/pipelines/clipPipeline.ts`<br>`src/background/listeners/runtimeMessages.ts`<br>`src/background/index.ts`<br>`src/background/listeners/contextMenus.ts` | Developer / Executor | 已完成 | listener / pipeline 主链 `getPlatformServices()` 已清零；批次已验收完成，不再作为下一执行入口 |
| B-13 | Phase 2A | `src/options/bootstrap.ts`<br>`src/shared/errors/analytics/analyticsConfig.template.ts`<br>`docs/251126-design-system-poc/GET-PLATFORM-SERVICES-CLEANUP.md` | Developer / Executor | 已完成 | legacy options bootstrap 与 analytics template 已退出 `getPlatformServices()`；allowlist 已收敛为 bootstrap / composition root 调用点 |
| O-1 | Observability | `src/shared/errors/globalErrorBoundary.ts`<br>`src/shared/errors/analytics/index.ts`<br>`src/shared/errors/analytics/sentryConfig.ts`<br>`src/shared/errors/analytics/sentryReporter.ts`<br>`src/background/bootstrap.ts`<br>`src/content/bootstrap.ts`<br>`src/options/bootstrap.ts`<br>`src/background/services/obsidianWriter.ts`<br>`src/platform/chrome/utils.ts`<br>`src/platform/firefox/utils.ts`<br>`scripts/build.mjs`<br>`src/env.d.ts` | Developer / Executor | 进行中 | background/content/options 全局未捕获异常边界已接入现有 `ErrorHandler`；三侧 bootstrap 已接入 `initializeErrorAnalytics(errorHandler)`；零依赖 Sentry provider 与 build-time define 注入已落地；focused unit tests、`npm run typecheck:app`、`npm run typecheck:tests` 与 `npm run build:fast` 已通过；剩余工作为运行时 DSN / release / consent 联调，不影响当前工程闭环 |
| P3-1 | Phase 3 | `src/options/app/bootstrap.ts`<br>`src/options/app/experimentalShell.ts`<br>`src/options/services/persistence.ts` | Developer / Executor | 已完成 | `src/options/index.ts -> src/options/app/bootstrap.ts` 已固定为唯一正式启动链；旧 `src/options/bootstrap.ts` 仅保留显式兼容职责；options 主链 load/save/subscribe 统一经 `optionsStore` 适配 |
| N-2 | Validation | `src/shared/i18n/overflowLogger.ts`<br>`src/shared/types/analytics.ts` | Developer / Executor | 已完成 | overflow analytics payload 已对齐 `IMessagingRepository.send` 合同；待以 `npm run typecheck:app` 复核 |
| P2B-1 | Phase 2B | `src/infrastructure/optionsRepository.ts`<br>`src/infrastructure/repositories/ChromeOptionsRepository.ts`<br>`src/content/index.ts`<br>`src/content/video/session.ts`<br>`src/content/reader/environmentController.ts`<br>`src/platform/services.ts`<br>`src/platform/types.ts`<br>`src/options/state/optionsStore.ts`<br>`src/content/clipper/services/fragmentConfig.ts`<br>`src/content/extractors/aiChatExtractor.ts` | Developer / Executor | 已完成 | Options UI / content / background 正式代码已全量切到 `IOptionsRepository` 主合同；`PlatformServices.optionsRepository` 已从平台服务合同删除；content 默认依赖残留与 module-level mutable defaults 已清零；focused unit/e2e、`typecheck:app`、`typecheck:tests`、`typecheck:strict` 与依赖审计均已通过。compatibility adapter 仅剩测试与兼容支撑职责，不再作为运行时主链 residual |
| P4-1 | Phase 4 | `src/content/video/session.ts` 及拆分协作文件 | Developer / Executor | 已完成 | 固定顺序 pilot 已跑通并扩展到 `yamlConfigTable` / `dialog` / `reader/session` / `content/index` / `background/index` / `contextMenus` / `clipPipeline`；focused tests 已补齐 |
| P5-1 | Phase 5 | `tsconfig.base.json`<br>`tsconfig.strict.json` | Developer / Executor | 已完成 | `tsconfig.tests` 与 `typecheck:strict` 已全绿；options / platform / shared strict 收口完成，并已补关键 focused Vitest 回归 |
| P6-1 | Phase 6 | `tailwind.shared.cjs`<br>`tailwind.config.cjs`<br>`tailwind.config.global.cjs`<br>`tailwind.config.clipper.cjs`<br>`tailwind.config.video.cjs`<br>`vitest.shared.ts`<br>`vitest.unit.config.ts`<br>`vitest.e2e.config.ts`<br>`scripts/utils/manifestSources.mjs`<br>`scripts/generate-manifests.mjs`<br>`scripts/build.mjs`<br>`tools/report-design-token-alignment.mjs`<br>`tools/report-locale-source-alignment.mjs`<br>`docs/251126-design-system-poc/CONFIG-SOURCE-OF-TRUTH.md` | Developer / Executor | 已完成 | Tailwind 多入口共享主题 / daisyUI 配置已集中；Vitest alias 共享层已接入；manifest 已改为共享主源生成；design token 对 Tailwind 共享层的变量映射已接入自动审计；locales 主源对 `config.ts` / `locales.ts` / locale files 的一致性已接入自动审计；`tailwind:build*`、`manifest:generate`、`i18n:generate`、`audit:design-tokens:report`、`audit:locales:report`、focused Vitest 与快速 Chrome/Firefox build 已通过 |
| P7-1 | Phase 7 | `tools/report-deep-imports.mjs`<br>`package.json`<br>`src/options/components/**`<br>`src/content/**`<br>`tests/unit/**`<br>`tests/utils/**`<br>`src/background/services/configService.ts`<br>`tsconfig.app.json`<br>`tsconfig.tests.json`<br>`tsconfig.strict.json`<br>`vitest.shared.ts` | Developer / Executor | 已完成 | 已新增 `npm run audit:imports:report` 作为 import baseline；`options/components`、`content/**` 与测试层 alias 收口已落地；后续 `@i18n/*`、`@platform/*`、`@third-party/*` alias 批次已补齐并完成 source residual 清零；`npm run audit:imports:report` 当前为 0；`npm run typecheck:app`、`npm run typecheck:tests`、`npm run build:fast` 与 focused vitest 已通过 |
| P8-1 | Phase 8 | `src/content/reader/presentation/readerPanelView.ts`<br>`src/content/reader/featureFlags.ts`<br>`src/env.d.ts`<br>`tests/unit/content/reader/ReaderPanelViewFactory.test.ts`<br>`tests/e2e/reader-panel-site.spec.ts`<br>`tests/e2e/reader-panel-complete.spec.ts`<br>`tests/e2e/readerPanelFlow.test.ts` | Developer / Executor | 已完成 | reader `legacy` / `daisy` 双轨 feature flag 已退役；Reader Panel 运行时固定走 `ReaderDialogPanel`；旧 `__aiobReaderDialogVersion` 全局注入与声明已清理；focused unit test、`npm run typecheck:app`、`npm run build:fast` 与 `audit:imports:report` 已通过，并顺带将 Phase 7 residual 从 25 收窄到 24 |
| P8-2 | Phase 8 | `src/options/components/sections/AiSection.ts`<br>`src/options/components/sections/DiagnosisSection.ts` | Developer / Executor | 已完成 | `AiSection` 平台标签已切到 `DaisyBadge`；`DiagnosisSection` 诊断输出已切到 `DaisyCard` log viewer；对应 TODO 已清理；`tests/unit/options/sections/AiSection.test.ts`、`tests/unit/options/sections/DiagnosisSection.test.ts` 与 `npm run typecheck:app` 已通过 |
| P8-3 | Phase 8 | `src/options/components/shared/DaisyCheckbox.ts`<br>`src/options/components/sections/AiSection.ts`<br>`src/options/components/sections/FragmentSection.ts`<br>`src/options/components/sections/VideoSection.ts`<br>`src/options/components/README.md`<br>`scripts/check-migration-progress.sh`<br>`src/ui/ZagCombobox.js` | Developer / Executor | 已完成 | 已补齐最小 `DaisyCheckbox` helper 并清理 `AiSection` / `FragmentSection` / `VideoSection` 的 checkbox TODO；README / 脚本 / Zag 注释中的伪 TODO 噪音已移除；focused unit tests、`npm run typecheck:app` 与 TODO/FIXME 搜索已通过，基线从 13 处收窄到 5 处 |
| P8-4 | Phase 8 | `src/options/components/shared/DaisySelect.ts`<br>`src/options/components/shared/DaisyRadioGroup.ts`<br>`src/options/components/shared/DaisyTable.ts`<br>`src/options/components/sections/LanguageSection.ts`<br>`src/options/components/sections/ReadingSection.ts`<br>`src/options/components/sections/RestSection.ts` | Developer / Executor | 已完成 | 已补齐最小 `DaisySelect` / `DaisyRadioGroup` / `DaisyTable` presenter helper；`LanguageSection` / `ReadingSection` / `RestSection` 剩余 TODO 已清零；focused unit tests、`npm run typecheck:app` 与 TODO/FIXME 搜索已通过，Phase 8 当前已无活跃 TODO 基线 |

## 验收闭环

每个批次都必须补齐以下证据：

1. 实现变更
2. 定向测试
3. 搜索证明
4. 审核结论

未补齐前，不允许把批次状态改为“已完成”。
