# 文件重构任务卡片

> 说明：本文件基于 `docs/structure/file-refactor-plan.md` 制作，按优先级拆解为可执行的任务卡片。建议以卡片顺序推进，每张卡片完成后在PR或周报中同步结论。

## 卡片 1 · Options 页面架构拆分
**目标**
- 将 `src/options/index.ts` 与相关模块拆分到 `app/`、`components/`、`services/`、`state/`、`utils/`，降低单文件复杂度并明确职责。
- 保持现有表单、导入导出、连接测试的功能行为不变，并补充必要的单元测试。

**背景与痛点**
- 现有入口文件近千行，集成初始化、状态、UI、校验等多重逻辑，难以维护。
- 多处直接访问 `chrome.storage` 与 DOM，缺少抽象层导致测试困难。

**拆分子任务**
- 创建 `src/options/app/bootstrap.ts` 与 `routing.ts`，迁移初始化流程并提供明确定义的启动方法。
- 建立 `src/options/state/optionsStore.ts` 与 `vaultRouterStore.ts`，封装与 `chrome.storage` 的交互和事件派发。
- 将表单、列表、弹窗等 UI 拆到 `src/options/components/`，每个组件暴露 `render`、`bindEvents` 等最小接口。
- 重组 `src/options/services/` 下的 `configTransfer.ts`、`validation.ts`、`connectionTester.ts`，将之前散落的逻辑迁移并补充错误处理。
- 将工具函数收敛到 `src/options/utils/`，清理重复代码，并通过 barrel 文件输出公共方法。
- 回归 `src/options/index.ts`，只保留入口装配代码并更新引入路径。

**交付验收标准**
- Options 页面加载无控制台错误，功能（保存、导入、测试连接）回归通过。
- 新增或更新的 store、服务具备至少一项单元测试覆盖核心逻辑。
- 代码通过现有构建与 lint 检查（若配置）。

**依赖与准备**
- 与团队明确 UI 组件划分边界，确认未来是否引入框架（当前以原生方案继续）。
- 规划 `tsconfig`/`vite` 路径别名，避免迁移后出现相对路径噪音。

**风险与缓解**
- UI 拆分可能导致事件绑定遗漏，可在拆分后编写冒烟脚本验证关键交互。
- Storage 抽象层变更需关注异步行为，建议先编写 store 的单元测试。

## 卡片 2 · Background 剪藏管线模块化
**目标**
- 将 `src/background/index.ts` 中的监听、业务管线、服务层拆分到对应目录，提升可扩展性。
- 为关键服务（VaultRouter 包装、分类、写入）定义类型与错误处理策略。

**背景与痛点**
- 单文件承担消息路由、剪藏流程、第三方写入等职能，修改任一流程都会影响整体。
- 多处使用 `any` 或隐式返回值，缺少类型约束。

**拆分子任务**
- 在 `src/background/listeners/` 下新建 `contextMenus.ts` 与 `runtimeMessages.ts`，分别托管 UI 入口与消息注册。
- 新建 `src/background/pipelines/clipPipeline.ts`、`connectionTest.ts`，将业务流程封装为可测试的纯函数或服务类。
- 建立 `src/background/services/vaultRouterService.ts`、`classificationService.ts`、`obsidianWriter.ts`，引入统一的错误与超时处理。
- 补充 `src/background/types/` 中的 payload、配置、通知类型，并在各模块替换原有 `any`。
- 更新入口文件，仅负责注册监听器并连接管线。

**交付验收标准**
- 手动触发剪藏流程与连接测试时，行为与日志与现状一致。
- 新增服务具备类型定义与最小单元测试（可模拟失败场景）。
- 引入的类型在 background、content、options 间保持一致。

**依赖与准备**
- 需要 Shared 类型卡片中抽离出的核心类型。
- 与日志/监控需求对齐好错误处理接口。

**风险与缓解**
- 拆分后消息常量可能散落，需在 `src/content/shared/` 和 `src/shared/constants/` 中维护统一枚举。
- 需确认 Chrome Service Worker 生命周期下各模块的懒加载策略，避免 import 顺序问题。

## 卡片 3 · Content Clipper 拆分
**目标**
- 将剪藏 UI、提取器、共享工具迁移至 `src/content/clipper/`、`extractors/`、`shared/` 目录，减轻耦合。
- 保持注入与通信流程稳定，便于后续扩展其他页面类型。

**背景与痛点**
- 现有 `clipper-dialog.ts` 既负责渲染也处理状态与消息，难以复用。
- 页面提取逻辑散落在 `adapters` 中，命名与职责不统一。

**拆分子任务**
- 在 `src/content/extractors/` 中按类型新建 `articleExtractor.ts`、`aiChatExtractor.ts`、`selectionExtractor.ts`，迁移并统一导出接口。
- 建立 `src/content/clipper/components/dialog.ts`、`commentForm.ts` 等纯 UI 模块，剥离 DOM 操作与状态控制。
- 新建 `src/content/clipper/services/selectionController.ts`、`contextCapture.ts`，封装业务逻辑与 background 通讯。
- 将纯工具迁移到 `src/content/clipper/utils/`（如 `textFragment.ts`、`timestamp.ts`），并写入单元测试。
- 复写 `src/content/index.ts`，仅保留入口与依赖装配，按剪藏类型实例化服务。

**交付验收标准**
- 在不同页面类型（文章、AI 对话、手动选中）下，剪藏流程可正常启动与提交。
- 新增 extractor 与服务均有至少一个测试覆盖核心逻辑（可使用 JSDOM）。
- 内容脚本打包产物体积与原方案相近或更小。

**依赖与准备**
- 需要与 background 模块确认消息常量与 payload 类型。
- 建议先确定组件命名与导出接口，便于团队并行开发。

**风险与缓解**
- DOM 结构变动可能导致选择器失效，可为关键节点添加数据标记并在测试中断言。
- 内容脚本注入顺序需测试浏览器兼容性，尤其是 Firefox。

## 卡片 4 · Shared 类型与常量治理
**目标**
- 在 `src/shared/constants/`、`config/`、`types/` 下集中管理跨端复用资源，减少重复定义与隐式约定。
- 为后续测试、LSP 支持和未来 SDK 化奠定结构基础。

**背景与痛点**
- Options、Background、Content 各处定义自己的 payload 或常量，容易出现字段不一致。
- 默认配置、模板合并逻辑紧耦合在旧文件中，不利于复用。

**拆分子任务**
- 在 `src/shared/types/` 中定义 `ClipPayload`、`VaultConfig`、`OptionsState` 等接口，提供 barrel 汇总导出。
- 将平台常量、通知键值、默认模板移动到 `src/shared/constants/`，替换原有硬编码。
- 拆分 `src/shared/config/store.ts` 为 `defaultOptions.ts` 与 `optionsMerger.ts`，并补充类型注释。
- 为第三方 API 调用结果定义类型别名，减少 `any`。
- 调整 background、content、options 各模块的引用路径指向 shared 目录。

**交付验收标准**
- 所有跨模块使用的类型均从 `src/shared/types/` 引入。
- 默认配置合并逻辑拥有单元测试，覆盖 merge 以及降级场景。
- 运行时无类型推断错误或未解析的导入。

**依赖与准备**
- 建议与 QA/产品确认常量命名及默认值，避免迁移后出现文案差异。
- 需同步 background、content 的迁移进度，避免循环依赖。

**风险与缓解**
- 共享类型修改可能破坏旧逻辑，迁移时保持向后兼容并记录变更日志。
- Barrel 文件需避免循环引用，可通过导出顺序或拆分进一步优化。

## 卡片 5 · 测试与 CI/CD 搭建
**目标**
- 为重构后的模块建立最小测试框架，并配置 CI 流程保证质量。
- 在迁移过程中提供验证手段，降低回归风险。

**背景与痛点**
- 现阶段缺少自动化测试与流水线，难以及时发现拆分导致的回归。

**拆分子任务**
- 创建 `tests/unit/` 目录结构，选定 Jest 或 Vitest 并配置基础运行脚本。
- 为 `resolvePath`、`VaultRouter`、`optionsMerger`、extractor 等纯逻辑模块补充单元测试。
- 规划 `tests/e2e/` 使用 Playwright 或 Puppeteer，编写最小剪藏与 Options 烟雾用例。
- 在 `tests/fixtures/` 中维护 HTML 片段、配置样例与 mock 响应，供单元与 E2E 复用。
- 新增 `.github/workflows/ci.yml`，执行构建、lint、单元测试，并预留 e2e workflow（可先跳过）。

**交付验收标准**
- `pnpm test`（或对应 npm script）在 CI 与本地均可通过。
- 至少一个端到端用例验证剪藏链路。
- 工作流在主分支成功运行并阻止失败用例合并。

**依赖与准备**
- 与团队确认使用的测试框架与浏览器自动化方案。
- 需要 background 与 content 模块提供 mockable 接口或依赖注入点。

**风险与缓解**
- Playwright/Puppeteer 运行可能受 CI 环境限制，可先在本地验证并于 CI 使用容器镜像。
- 单元测试需关注扩展环境 API，可通过 `webextension-polyfill` mock。

