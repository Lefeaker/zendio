# 执行状态快照

> 更新日期：2026-03-15
> 口径：以当前仓库代码、审计命令与 focused 验证结果为准
> 作用：记录本轮技术债路线图执行后的真实状态，避免后续继续沿用过时文档口径

---

## 总体结论

当前 roadmap 中可在仓库内继续落地的主线代码任务已基本完成。

已完成并验证的主线包括：

- Phase 2 residual / allowlist / repository 主链统一
- Phase 4 orchestrator 首轮 pilot 拆分
- Phase 5 类型治理
- Phase 6 source-of-truth / 审计基础设施
- Phase 7 路径别名与深层相对导入清理
- Phase 8 低风险维护债首轮与后续 helper 收尾
- Observability 代码侧最小闭环

当前剩余不再是“继续改仓库代码即可完成”的普通实施项，主要集中在：

- O-1 运行时联调：Sentry DSN / release / consent 真机验证
- P0 / Phase 2 持续守门：防止 `getPlatformServices()` allowlist 回流
- Phase 8 长期维护议题池：i18n 生成化、目录整理、脚本职责整理、`fast-check`、`MSW` 等

---

## 已完成工作

### Phase 2 / P0

- `getPlatformServices()` 非测试命中已冻结为 4 个 allowlist 文件：
  - `src/background/index.ts`
  - `src/content/index.ts`
  - `src/options/index.ts`
  - `src/platform/services.ts`
- `OptionsRepository` 主链已统一到 `IOptionsRepository`
- `PlatformServices.optionsRepository` 已退出生产主链
- content 默认依赖残留与 module-level mutable defaults 已清理

### Phase 4

- orchestrator 首轮 pilot 已完成，涉及：
  - `src/content/video/session.ts`
  - `src/options/components/controls/yamlConfigTable.ts`
  - `src/content/clipper/components/dialog.ts`
  - `src/content/reader/session.ts`
  - `src/content/index.ts`
  - `src/background/index.ts`
  - `src/background/listeners/contextMenus.ts`
  - `src/background/pipelines/clipPipeline.ts`

### Phase 5

- `typecheck:strict` 当前为通过状态
- tests / app / strict 三套类型口径已收口到当前真值

### Phase 6

- manifest source-of-truth 已建立
- design token / locales 自动审计已接入
- Tailwind / Vitest 共享配置层已建立

### Phase 7

- 已补齐 alias：
  - `@shared/*`
  - `@content/*`
  - `@options/*`
  - `@i18n/*`
  - `@platform/*`
  - `@third-party/*`
- `npm run audit:imports:report` 当前结果为 `0`

### Phase 8

- reader `legacy` / `daisy` 双轨 flag 已退役
- 已新增并接入最小 helper：
  - `DaisyCheckbox`
  - `DaisySelect`
  - `DaisyRadioGroup`
  - `DaisyTable`
- `TODO/FIXME` 活跃基线当前为 `0`

### Observability

- `globalErrorBoundary` 已接入 background / content / options
- REST 写入失败与平台兼容异常已进入统一错误链
- 零依赖 Sentry provider 已建立
- build-time Sentry defines 已注入：
  - `__AIIINOB_SENTRY_DSN__`
  - `__AIIINOB_SENTRY_ENVIRONMENT__`
  - `__AIIINOB_SENTRY_RELEASE__`
  - `__AIIINOB_SENTRY_ENABLED__`

---

## 当前验证结果

当前仓库已通过的关键验证包括：

- `npm run typecheck:app`
- `npm run typecheck:tests`
- `npm run typecheck:strict -- --pretty false`
- `npm run build:fast`
- `npm run audit:imports:report`
- `npm run audit:platform-services:report`

本轮还额外通过了多组 focused vitest，包括但不限于：

- `tests/unit/options/sections/LanguageSection.test.ts`
- `tests/unit/options/sections/ReadingSection.test.ts`
- `tests/unit/options/sections/RestSection.test.ts`
- `tests/unit/options/sections/AiSection.test.ts`
- `tests/unit/options/sections/DiagnosisSection.test.ts`
- `tests/unit/options/sections/FragmentSection.test.ts`
- `tests/unit/options/sections/VideoSection.test.ts`
- `tests/unit/content/dialogDependencies.test.ts`
- `tests/unit/content/clipperDialog.test.ts`
- `tests/unit/content/readerMarkdownBuilder.test.ts`
- `tests/unit/options/sections/PrivacySection.test.ts`
- `tests/unit/shared/errors/analytics/googleAnalyticsReporter.test.ts`
- `tests/unit/shared/errors/analytics/sentryConfig.test.ts`
- `tests/unit/shared/errors/analytics/sentryReporter.test.ts`
- `tests/unit/shared/errors/analytics/index.test.ts`

---

## 仍未完成的事项

### 1. O-1 运行时闭环

当前未完成的是运行时联调，而不是 provider 代码本身：

- Sentry DSN rollout
- release / environment 真机验证
- consent 链路联调
- 各上下文最终启用策略验证

### 2. P0 / Phase 2 长期守门

当前代码状态已满足 allowlist 验收，但仍需持续防回流：

- 持续运行 `audit:platform-services:report`
- 保证非测试 `getPlatformServices()` 命中不超出 allowlist
- 如需进一步压缩 compatibility / fallback 边界，应单独立项

### 3. Phase 8 长期维护议题池

这些仍属于维护范围，但当前并非活跃代码阻塞：

- i18n 生成化
- Reader / Video 重复对话框进一步抽象
- barrel / 目录层级整理
- 脚本职责整理
- 文档与参考文件清理
- `fast-check`
- `MSW`

---

## 建议的后续顺序

1. 完成 O-1 运行时联调
2. 将 P0 / Phase 2 文档状态切到更贴近当前代码真值的口径
3. 若仍要继续结构治理，再单开 orchestrator / DOM boundary / DI quarantine 新批次
4. 将 Phase 8 长期维护项拆成独立 backlog，而不是继续混在主线 debt roadmap 中
