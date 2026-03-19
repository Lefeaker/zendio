# 技术债剩余实施路线图

> **更新日期**：2026-03-15  
> **用途**：只保留**尚未完成**或**经抽查发现仍不稳定**的技术债工作，供后续执行人直接接手  
> **判定口径**：以当前仓库代码与抽查结果为准，不再重复记录已完成批次

---

## 当前回归结论

已完成批次整体方向正确：`window.__aiob*` 主链已退出，`getPlatformServices()` 已从大部分 shared / UI / service 高层调用点迁出。

本轮回归的真实结论已更新为：

- `tests/unit/options/bootstrap.test.ts`：通过
- `tests/unit/background/runtimeMessages.test.ts`：通过
- `tests/unit/background/clipPipeline.test.ts` / `tests/unit/background/contextMenus.test.ts`：通过
- `tests/unit/content/bootstrap.test.ts`：通过
- `tests/unit/content/aiChatExtractor.test.ts` / `tests/unit/content/fragmentConfig.test.ts`：通过
- `tests/e2e/phase4/shadow-dom.test.ts`：通过
- `tests/unit/background/bootstrap.test.ts`：通过

因此，产品主链 P0 回归项已经关闭；当前需要继续锁定的真值是 `src/options/index.ts` 作为 Options composition root，而不是旧文档里提到的 `options/app/bootstrap.ts`。第一优先级已切换为：

1. 固化 residual inventory / allowlist 真值
2. 收完 repository 双轨与默认依赖残留
3. 回写并固化 `background/bootstrap.test.ts` 门禁真值
4. 启动 Phase 4 orchestrator pilot
5. 以最小启动批次推进类型 / 路径 / 依赖审计基础设施

---

## 不再列入本文件的已完成事项

以下工作已完成，不再作为本文件任务继续跟踪：

- Phase 1：全局状态污染收口
- Phase 2 已完成的大部分平台直连迁出批次
- Phase 3：Options 唯一正式页面启动链收口
- 已归档的 Tailwind / 样式迁移主线

本文件从现在开始只记录**剩余工作**。

---

## 剩余工作总顺序

1. **固化已完成的 P0 真值与 allowlist**
2. **收完 Phase 2 余项与默认依赖残留**
3. **修复当前唯一测试门禁不稳定点**
4. **启动 Phase 4 orchestrator 拆分**
5. **再推进类型 / 配置 / 路径 / DOM / DI 体系治理**
6. **最后做低优先级尾项与可观测性接入**

---

## P0：必须先做

### 1. 固化当前 allowlist 并冻结回流边界

**当前状态**

- 进行中

**原因**

- 当前非测试 `getPlatformServices()` 命中已经只剩 4 处，但文档与后续提交仍需要围绕这份 allowlist 保持一致
- 如果不先冻结，后续 shared / UI / service 层容易再次回流平台 locator

**目标**

- 明确 `background/index.ts`、`content/index.ts`、`options/index.ts`、`platform/services.ts` 是当前唯一允许保留的非测试命中
- 禁止 listener / pipeline / shared / UI / service 层新增 `getPlatformServices()`
- 将 `src/options/index.ts` 而不是 `src/options/app/bootstrap.ts` 固定为 Options composition root 真值

**验收**

- `rg -n "getPlatformServices\\(" src -g '!**/*.test.*'`
- `npm run audit:platform-services:report`
- 输出仅剩：`src/background/index.ts`、`src/content/index.ts`、`src/options/index.ts`、`src/platform/services.ts`

---

### 2. 收完 Phase 2 residual inventory

**当前状态**

- 已完成第一轮 allowlist 固化，残留真值已更新

**当前剩余点**

- `getPlatformServices()` 当前非测试命中为 4 处：
  - `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/background/index.ts:20`
  - `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/content/index.ts:42`
  - `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/options/index.ts:6`
  - `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/platform/services.ts:52`
- `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/background/bootstrap.ts` 与 `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/content/bootstrap.ts` 已退出 locator，不再列为 residual inventory
- 默认依赖残留已完成清理：
  - `src/options/app/bootstrap.ts` 已改为 composition root 显式注入 storage
  - `src/options/components/sections/UsageSection.ts` 已改为回退 DI `platformServices.storage`
  - `src/content/clipper/services/fragmentConfig.ts` 已移除模块级 `defaultOptionsRepository`
  - `src/content/extractors/aiChatExtractor.ts` 已移除模块级 `defaultOptionsProvider`

**任务目标**

- 明确 allowlist：哪些调用点允许作为 bootstrap / composition root 保留
- 对不该继续保留的点继续迁出
- 不再让 listener / pipeline / service / shared / UI 层重新回流平台直连
- `options/app/bootstrap.ts` 已退出 locator，options root 改为 `src/options/index.ts`

**硬约束**

- 只处理 residual inventory 和 allowlist
- 不把 bootstrap 装配点和业务服务点混为一谈
- 不为了“零调用”而强行制造更隐蔽的 service locator
- 禁止重新引入 `chromeStorageService` 默认参数或模块级 mutable default

**验收**

- `rg -n "getPlatformServices\\(" src -g '!**/*.test.*'`
- `npm run audit:platform-services:report`
- 输出应只剩明确允许的 composition root / platform 层命中
- 同时复核默认依赖清理结果是否被新提交回流

---

### 3. 完成 Options repository 双轨统一

**当前状态**

- 已完成
- Options UI / content / background 正式代码已全量切到 `IOptionsRepository` 主合同
- compatibility adapter 仅保留单一工厂入口 `createCompatibilityOptionsRepository`
- `PlatformServices.optionsRepository` 已从平台服务合同中移除；`src/content` / `src/background` 非测试代码中 bridge 残留命中已清零

**当前未闭环点**

- 无运行时阻塞项
- legacy `OptionsRepository` 兼容语义仍保留在 compatibility adapter、本地测试夹具与少量 e2e 支撑代码，已不再作为主链 residual

**任务目标**

- 明确 `IOptionsRepository` 为唯一主合同
- 统一 load / save / subscribe / merge / normalize 的主链职责
- 结束“主链 + 兼容链语义并存但边界不清”的状态

**当前 residual inventory**

- compatibility adapter：`src/infrastructure/optionsRepository.ts`
- Options UI 主链：`src/infrastructure/repositories/ChromeOptionsRepository.ts` + `src/options/state/optionsStore.ts`
- `src/content/index.ts`、reader/video session、selection/runtime/extractor/default-config 链路已全量切到 `IOptionsRepository`
- `src/content` / `src/background` 非测试代码中 `platform.optionsRepository` 与 `adaptOptionsRepository()` 命中已清零
- `src/content/clipper/services/fragmentConfig.ts` 与 `src/content/extractors/aiChatExtractor.ts` 仍兼容 legacy repository contract，但已不再保留模块级默认状态；仅用于显式注入测试 / 兼容夹具
- Firefox / 测试侧已不再使用浏览器专用 compatibility factory 名称，统一改走 `createCompatibilityOptionsRepository`

**不允许**

- 顺手重做整个 Options 架构
- 新增第二套 repository 抽象

**验收**

- Options UI 只依赖一个主 repository 合同
- 兼容层若仍保留，必须明确只剩过渡职责和退役路径
- 当前结果：满足；已通过 focused unit/e2e、`typecheck:app`、`typecheck:tests`、`typecheck:strict` 与 `npm run audit:deps:report`

---

### 4. 修复 `tests/unit/background/bootstrap.test.ts` 测试桩不稳定点

**当前状态**

- 已完成

**目标**

- 修正该测试文件的 hoisted mock / import 顺序
- 恢复 `background/bootstrap` 作为 Phase 2/Phase 3 收口的稳定验收门禁
- 不借机改动 `src/background/bootstrap.ts` 的已完成依赖注入行为

**验收**

- `npx vitest run --config vitest.unit.config.ts tests/unit/background/bootstrap.test.ts`
- 结果：通过，且不引入新的平台 locator 回流

---

## P1：主链收稳后立刻开始

### 4. 启动 Phase 4 orchestrator 拆分

这一阶段已进入 pilot 准备/实施中，必须按固定顺序小步推进。

#### 4.1 第一刀：`src/content/video/session.ts`

**当前状态**

- 已完成首刀
- 已抽出：
  - `src/content/video/sessionState.ts`
  - `src/content/video/sessionPlatformController.ts`
  - `src/content/video/sessionDom.ts`
- `session.ts` 仍是 orchestrator，但平台访问 / DOM presenter / 运行时状态已不再全部堆叠在单文件主体中

**目标**

- 按职责拆分，不按行数拆
- 先拆：
  - 状态
  - 生命周期
  - 平台访问
  - DOM / presenter

**约束**

- 只开一个 pilot，不并行拆第二个 orchestrator
- 若状态复杂度仍失控，可只在这个模块内试点 `xstate`

#### 4.2 后续固定顺序

1. `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/options/components/controls/yamlConfigTable.ts`
   - 已完成第一轮职责拆分：
     - `src/options/components/controls/yamlConfigTableModel.ts`
     - `src/options/components/controls/yamlConfigTableValidation.ts`
     - `src/options/components/controls/yamlConfigTableDom.ts`
     - `src/options/components/controls/yamlConfigTableTypes.ts`
   - `yamlConfigTable.ts` 保留为 orchestration 入口，但状态建模 / 校验归一化 / DOM 构建已不再堆叠在单文件主体中
2. `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/content/clipper/components/dialog.ts`
   - 已完成首轮职责拆分：
     - `src/content/clipper/components/dialogPresenter.ts`
     - `src/content/clipper/components/dialogSessionState.ts`
     - `src/content/clipper/components/dialogShortcuts.ts`
     - `src/content/clipper/components/dialogTypes.ts`
   - `dialog.ts` 当前保留 orchestration / DI / 仓储订阅 / 事件编排，DOM presenter、会话态、快捷键判定与 comment 归一化已移出主文件
3. `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/content/reader/session.ts`
   - 已完成首轮职责拆分接线：
     - `src/content/reader/highlightController.ts`
     - `src/content/reader/services/highlightManager.ts`
     - `src/content/reader/panelCoordinator.ts`
     - `src/content/reader/services/exporter.ts`
     - `src/content/reader/sessionMessages.ts`
   - `session.ts` 当前保留 session orchestration / prompt 交互 / 生命周期编排，highlight DOM 操作、panel presenter 协调、markdown 导出与 hint 文案已不再全部堆叠在主文件主体中
4. `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/content/index.ts`
   - 已完成首轮职责拆分：
     - `src/content/runtime/contentClipOrchestrator.ts`
     - `src/content/runtime/contentRuntimeEvents.ts`
   - `index.ts` 当前保留 content composition root / bootstrap 装配；clip 主流程编排与 DOM 事件接线已移出主文件，并已补 focused runtime tests
5. `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/background/index.ts`
   - 已完成首轮职责拆分：
     - `src/background/backgroundStartup.ts`
     - `src/background/trialLifecycle.ts`
   - `index.ts` 当前保留 background composition root；listener 装配、usage stats 启动与 install/trial 生命周期已移出主文件，并已补 focused background tests
6. `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/background/listeners/contextMenus.ts`
   - 已完成首轮职责拆分：
     - `src/background/listeners/contextMenusTypes.ts`
     - `src/background/listeners/contextMenusCoordinator.ts`
   - `contextMenus.ts` 当前保留 listener 注册与动作路由；运行时状态、菜单初始化、URL 判定与自动注入编排已移出主文件，并已通过 focused context menu tests
7. `/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/background/pipelines/clipPipeline.ts`
   - 已完成首轮职责拆分：
     - `src/background/pipelines/clipPipelineSupport.ts`
     - `src/background/pipelines/clipPipelineHelpers.ts`
   - `clipPipeline.ts` 当前保留 pipeline orchestration；support prompt 分发、payload 归一化与 notification safety 已移出主文件，并已通过 focused clip pipeline tests

**阶段完成标准**

- 单个 orchestrator 不再承担 3 类以上主职责
- 平台访问、状态、DOM、序列化边界可单独定位
- 当前 pilot 结论：
  - `video/session.ts` 已进入可继续迭代的分层状态
  - `yamlConfigTable.ts` 已完成同类首轮拆分并保留行为稳定性
  - `clipper/components/dialog.ts` 已完成同类首轮拆分并通过 focused dialog tests
  - `content/reader/session.ts` 已完成同类首轮拆分并通过 focused reader tests
  - `content/index.ts` 已完成同类首轮拆分并通过 focused content/runtime tests
  - `background/index.ts` 已完成同类首轮拆分并通过 focused background tests
  - `background/listeners/contextMenus.ts` 已完成同类首轮拆分并通过 focused background tests
  - `background/pipelines/clipPipeline.ts` 已完成同类首轮拆分并通过 focused background tests；Phase 4 固定顺序 pilot 已全部跑通，下一步应回到 Phase 5 类型/配置/路径治理批次

---

### 5. 启动 Phase 5：类型系统默认基线收紧

**当前状态**

- 已启动最小批次：
  - `tsconfig` / `vitest` 已接入 `@shared/*`、`@content/*`、`@options/*` 最小路径别名
  - 应用主链新增改动已完成低风险类型修补
  - 已补一批低风险测试类型债：
    - analytics manifest/runtime mock
    - overflow logger literal narrowing
    - trial manager manifest mock
    - reader window globals declaration
    - background/content/options bootstrap mocks
    - platform chrome messaging/notifications/tabs mocks
    - browserDetection / analyticsConfig test typing
  - `npx tsc --noEmit --project tsconfig.tests.json --pretty false` 当前已通过
  - `tests` 层深层相对导入（`@shared/*` / `@content/*` / `@options/*` 目标范围）已清零

**当前真值**

- `src` 正式脚本 residual：`24`
- `tests` residual：`0`
- `tests/e2e/phase4/shadow-dom.test.ts` 已修复测试环境中的样式加载桩，当前通过
  - Phase 5 新增已完成低风险批次：
    - classification / clip schema 边界收紧与 error payload schema 化
    - `contentMessageRouter` support prompt 消息边界收敛
    - background pipeline / runtime message / REST 连接链路一轮 `exactOptionalPropertyTypes` 修补
    - YAML front matter 调用链一轮 `domain?: string` 条件传参修补
  - `tests/unit/options/experimentalShell.test.ts` 的 query-flag / missing-container 运行时残留已修复
  - `options` / `platform` / `shared` 剩余 strict 主簇已完成收口：
    - options exact-optional 批次
    - chrome / firefox storage/context menu/runtime/messaging 兼容层
    - shared analytics / yamlConfig / url / taxonomyMigration / testHelpers
  - 全仓测试类型债仍需继续分批清理，但已从“完全未清理”进入“可持续分批收口”状态

**当前真值**

- `npx tsc --noEmit --project tsconfig.tests.json --pretty false`：通过
- `npm run typecheck:strict -- --pretty false`：通过
- 本轮关键回归已通过：
  - `tests/unit/options/optionsFormAdapter.test.ts`
  - `tests/unit/options/yamlConfigTable.test.ts`
  - `tests/unit/options/connectionTestRunner.test.ts`
  - `tests/unit/options/infrastructure/ModalController.test.ts`
  - `tests/unit/options/layout/NavigationController.test.ts`
  - `tests/unit/options/layout/Sidebar.test.ts`
  - `tests/unit/options/sections/RestSection.test.ts`
  - `tests/unit/options/sections/RoutingSection.test.ts`
  - `tests/unit/options/sections/PrivacySection.test.ts`
  - `tests/unit/options/sections/UsageSection.test.ts`
  - `tests/unit/options/sections/VideoSection.test.ts`
  - `tests/unit/options/sections/YamlConfigSection.test.ts`
  - `tests/unit/platform/chrome/storage.test.ts`
  - `tests/unit/platform/firefox/storage.test.ts`
  - `tests/unit/platform/firefox/contextMenus.test.ts`
  - `tests/unit/shared/yamlConfigService.test.ts`
  - `tests/unit/shared/errors/analyticsConfig.test.ts`
  - `tests/unit/shared/errors/analytics/googleAnalyticsReporter.test.ts`

**任务目标**

- 推进更严格的默认 TypeScript 基线
- 优先处理边界层的宽松类型与散落断言

**阶段结论**

1. `tsconfig.tests` 已全绿
2. `typecheck:strict` 已全绿
3. Phase 5 最初规划的 content/shared/options/platform/shared 严格类型收口批次已完成
4. 后续若继续推进，应转入 Phase 6 / Phase 7 的结构治理，而不是继续把 Phase 5 视为未完成主线

**推荐顺序**

1. 将 Phase 5 状态切换为“已完成”，只保留后续新增改动的守门验证
2. 进入 Phase 6 配置 / token / Tailwind 碎片收口
3. 再推进 Phase 7 路径别名 / DOM 边界 / DI 简化
4. 持续保留：
   - `npx tsc --noEmit --project tsconfig.tests.json --pretty false`
   - `npm run typecheck:strict -- --pretty false`

---

## P2：结构稳定后推进

### 6. Phase 6：配置 / Token / Tailwind 碎片收口

**当前状态**

- 已完成首轮 source-of-truth 收口

**当前真值**

- Tailwind 多入口共享主题 / daisyUI 配置已抽到 `tailwind.shared.cjs`
- 以下配置已改为基于共享层扩展，不再各自复制主题片段：
  - `tailwind.config.cjs`
  - `tailwind.config.global.cjs`
  - `tailwind.config.clipper.cjs`
  - `tailwind.config.video.cjs`
- Vitest 路径别名共享层已抽到 `vitest.shared.ts`
- `vitest.unit.config.ts` / `vitest.e2e.config.ts` 已接入共享 alias 解析
- 浏览器 manifest 已改为单一主源：
  - `scripts/utils/manifestSources.mjs` 负责共享字段与浏览器差异覆盖
  - `scripts/generate-manifests.mjs` 负责回写 `public/manifest.json` 与 `public/manifest.firefox.json`
  - `scripts/build.mjs` 已直接基于主源对象生成 `build/dist/manifest.json`
- design token 与 Tailwind 共享层已接入对账审计：
  - `tools/report-design-token-alignment.mjs`
  - `npm run audit:design-tokens:report`
- design token 主源真值已明确为双轨：
  - `src/styles/design-tokens.css`
  - `src/options/styles/design-tokens.css`
- locales 主源已接入一致性审计：
  - `tools/report-locale-source-alignment.mjs`
  - `npm run audit:locales:report`
- 本轮验证已通过：
  - `npm run tailwind:build`
  - `npm run tailwind:build:global`
  - `npm run tailwind:build:clipper`
  - `npm run tailwind:build:video`
  - `npm run manifest:generate`
  - `npm run audit:design-tokens:report`
  - `npm run audit:locales:report`
  - focused Vitest 回归
  - `npm run build:fast`
  - `npm run build:firefox:fast`

**包含工作**

- TypeScript / Tailwind / Vitest 配置职责图
- design token 双轨主源确认
- manifest 单一主源与浏览器差异生成
- Tailwind 多配置共享层抽取
- `CONFIG-SOURCE-OF-TRUTH.md` 真值文档维护

**目标**

- 每类配置只有清晰主源与扩展关系
- 不再依赖人工同步近似配置

**下一步**

1. 保持 tailwind / vitest / manifest / locales / design-token 审计继续作为守门基线
2. 若后续继续处理 design token，只讨论 global token / AOBX token 双轨是否退役，不再重开共享层抽取
3. 后续主线应转回 Phase 7 或 Observability，而不是继续把 Phase 6 视为未收口

---

### 7. Phase 7：路径别名 / DOM 边界 / DI 简化

**当前状态**

- 已完成：
  - `audit:imports:report` 已接入，作为深层相对导入基线命令
  - `src/options/components/**` 已完成一轮 `@shared/*` 别名归一化
  - `src/content/**` 已完成第二轮低风险 `@shared/*` / `@content/*` 归一化
  - `tests/unit/**` 已开始小批次 alias 归一化，验证 `vitest.shared.ts` 的共享 alias 解析在测试层稳定可用
  - `src/background/services/configService.ts` 已退出 `shared/config/defaultOptions` 直连，回到 `shared/config` 主入口
  - `@i18n/*`、`@platform/*`、`@third-party/*` alias 批次已落地并完成 source residual 清零

**包含工作**

- 建立最小路径别名：`@shared/*`、`@content/*`、`@options/*`
- 引入 `dependency-cruiser` / `madge` 持续边界检查
- 为高频 DOM 操作建立 adapter / helper 边界
- 简化典型模块的 DI 守卫

**目标**

- 新代码不再继续增加深层相对导入
- DOM 操作与业务逻辑边界稳定
- 架构边界开始具备自动检查能力

**当前真值**

- `src` 正式脚本口径：
  - `npm run audit:imports:report` residual 已从上一轮 42 条收窄到 `0`
- `tests` 额外扫描口径：
  - 现有目标范围 `@shared/*` / `@content/*` / `@options/*` residual 已清零
  - `tests` 层已不再存在可直接落入既有 alias family 的深层 `src/(shared|content|options)` 导入
- 当前已使用别名族：
  - `@shared/*`
  - `@content/*`
  - `@options/*`
  - `@i18n/*`
  - `@platform/*`
  - `@third-party/*`

**下一步**

1. 维持现有 alias 边界，不允许回流
2. DOM boundary 与 DI/platform quarantine 后续单开批次推进，不和 alias 清理混批

**最小启动命令**

- `npm run audit:deps:report`
- `npm run audit:imports:report`
- `rg -n "from '\\.\\./\\.\\./\\.\\./" src`

---

## P3：最后处理

### 8. Phase 8：低优先级维护债收尾

**当前状态**

- 已启动首个低风险收尾批次

**范围**

- I18n 生成化
- TODO / FIXME 清理
- Reader / Video 重复对话框抽象
- `featureFlags.ts` legacy 旗标清理
- barrel / 目录层级整理
- 脚本职责整理
- 文档与参考文件清理
- `fast-check`
- `MSW`

**当前真值**

- `src/content/reader/featureFlags.ts` 已退役，不再保留 reader `legacy` / `daisy` 双轨切换
- `src/content/reader/presentation/readerPanelView.ts` 已固定走 `ReaderDialogPanel`
- `tests/unit/content/reader/ReaderPanelViewFactory.test.ts` 已改为单轨验证
- `tests/e2e/reader-panel-site.spec.ts`、`tests/e2e/reader-panel-complete.spec.ts`、`tests/e2e/readerPanelFlow.test.ts` 已移除无意义的 `__aiobReaderDialogVersion` 注入
- `src/env.d.ts` 已移除对应全局声明
- `src/options/components/sections/AiSection.ts` 已将平台标签切到 `DaisyBadge`
- `src/options/components/sections/DiagnosisSection.ts` 已将诊断输出切到 `DaisyCard` 包裹的 log viewer
- `src/options/components/shared/DaisyCheckbox.ts` 已补齐最小 checkbox helper，并已接入：
  - `src/options/components/sections/AiSection.ts`
  - `src/options/components/sections/FragmentSection.ts`
  - `src/options/components/sections/VideoSection.ts`
- `src/options/components/shared/DaisySelect.ts`、`src/options/components/shared/DaisyRadioGroup.ts`、`src/options/components/shared/DaisyTable.ts` 已补齐最小 presenter helper，并已接入：
  - `src/options/components/sections/LanguageSection.ts`
  - `src/options/components/sections/ReadingSection.ts`
  - `src/options/components/sections/RestSection.ts`
- 当前 `TODO / FIXME` 基线为 `0`
- 顺带收益：Phase 7 source import baseline 已收口为 `0`

---

### 9. Observability Track：Sentry 最小闭环

**当前状态**

- 已完成 provider / build-time 接线，待运行时 DSN rollout 与同意链路联调

**当前真值**

- `src/background/bootstrap.ts` 已接入：
  - `initializeErrorAnalytics(errorHandler)`
  - background 全局未捕获异常边界注册
- `src/content/bootstrap.ts` 已接入：
  - `initializeErrorAnalytics(errorHandler)`
  - content 全局未捕获异常边界注册
- `src/options/bootstrap.ts` 已接入：
  - `initializeErrorAnalytics(errorHandler)`
  - options legacy bootstrap 全局未捕获异常边界注册
- `src/background/services/obsidianWriter.ts` 已接入：
  - REST 写入失败进入统一错误链后继续原样抛出
- `src/platform/chrome/utils.ts` / `src/platform/firefox/utils.ts` 已接入：
  - 不支持当前浏览器运行时环境时，先进入 `chrome-api` 错误链，再保持原始抛错语义
- `src/shared/errors/globalErrorBoundary.ts` 已建立共享未捕获异常接线工具
- `src/shared/errors/analytics/index.ts` 已支持多 reporter registry，并允许显式注入目标 `ErrorHandler`
- `src/shared/errors/analytics/sentryConfig.ts` / `src/shared/errors/analytics/sentryReporter.ts` 已建立零依赖 Sentry provider
- `scripts/build.mjs` / `src/env.d.ts` 已接入 Sentry build-time defines：
  - `__AIIINOB_SENTRY_DSN__`
  - `__AIIINOB_SENTRY_ENVIRONMENT__`
  - `__AIIINOB_SENTRY_RELEASE__`
  - `__AIIINOB_SENTRY_ENABLED__`
- 已补 focused 验证：
  - `tests/unit/shared/errors/globalErrorBoundary.test.ts`
  - `tests/unit/shared/errors/analytics/sentryConfig.test.ts`
  - `tests/unit/shared/errors/analytics/sentryReporter.test.ts`
  - `tests/unit/shared/errors/analytics/index.test.ts`
  - `tests/unit/background/bootstrap.test.ts`
  - `tests/unit/content/bootstrap.test.ts`
  - `tests/unit/options/optionsBootstrapDependencies.test.ts`
  - `tests/unit/background/obsidianWriter.test.ts`
  - `tests/unit/platform/chrome/utils.test.ts`
  - `tests/unit/platform/firefox/utils.test.ts`

**首批范围**

- background worker 未捕获异常
- content script 注入失败
- REST 写入失败
- 平台兼容异常

**启动时机**

- 在 Phase 2 residual inventory 和 Options repository 主链统一基本稳定后开始
- 可与 Phase 4 并行，但不应早于当前 P0 问题

**最小首批验收**

- background 未捕获异常入口已接入
- content script 注入失败已接入
- options legacy bootstrap 未捕获异常入口已接入
- REST 写入失败已接入统一错误链
- 平台不支持环境异常已接入统一错误链
- 不早于 P0 / Phase 2 residual inventory / Options repository 主链统一
- 当前结果：
  - background / content / options 的全局异常入口已接入现有 `ErrorHandler`
  - analytics reporter 初始化已进入 background / content / options bootstrap 主链
  - REST 写入失败已开始进入 observability 主链
  - platform compatibility 异常已开始进入 observability 主链
  - Sentry provider 与 build-time config injection 已落地，并有 focused unit tests 覆盖
  - `npm run build:fast`、focused vitest、`npm run typecheck:app`、`npm run typecheck:tests` 已通过
  - 尚缺运行时 DSN / release / consent 联调，因此 O-1 仍不标记为最终完成

---

## 当前推荐交接顺序

### Batch 1

1. 继续 P0：维持 `getPlatformServices()` allowlist 冻结，不允许回流
2. 补运行时搜索 / 审计守门验证

### Batch 2

1. 完成 O-1：Sentry DSN / release / consent 真机联调
2. 维持：
   - `npx tsc --noEmit --project tsconfig.tests.json --pretty false`
   - `npm run typecheck:strict -- --pretty false`

### Batch 3

1. 若仍需继续推进结构治理，再单开 Phase 4 后续 orchestrator / DOM boundary / DI quarantine 批次
2. 不再把已完成的 Phase 5 / Phase 6 / Phase 7 / Phase 8 作为活跃实施入口

---

## 完成定义

当以下剩余事项都完成后，本文件可归零：

- `src/options/index.ts` allowlist 与 `src/options/app/bootstrap.ts` 注入边界保持稳定
- Phase 2 residual inventory 收口完成
- `npx tsc --noEmit --project tsconfig.tests.json --pretty false` 持续通过
- `npm run typecheck:strict -- --pretty false` 持续通过
- Options repository 双轨统一完成
- Phase 4-8 依序完成
- Sentry 最小可观测性闭环建立
