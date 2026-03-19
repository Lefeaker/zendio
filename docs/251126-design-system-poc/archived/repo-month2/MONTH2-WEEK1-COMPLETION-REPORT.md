# Month 2 Week 1（任务 2.1-2.8）交付复核

覆盖 Day 21-28 的所有仓库化里程碑：Clip Repository 接口/实现/Mock、ClipperDialog 重构 & 单测、Video Repository 接口/实现/Mock。以下内容逐项列出源码与测试的精确行号，方便审核核验。

---

## 任务 2.1：创建 IClipRepository 接口

- `src/shared/repositories/IClipRepository.ts:1-54`  
  - 定义 `FragmentConfig`/`ClipData`/`ClipResult` 类型，并给出 `getFragmentConfig() / setFragmentConfig() / getTemplateConfig()` 等接口，作为 Content Script 与仓库层的契约基础。

## 任务 2.2：实现 ChromeClipRepository

- `src/infrastructure/repositories/ChromeClipRepository.ts:1-68`  
  - 通过 `IOptionsRepository` 读写 `fragmentClipper`/`templates`，通过 `IMessagingRepository` 发送 `clip` 消息；失败时返回结构化 `ClipResult`，并提供配置订阅回调。

## 任务 2.3：实现 MockClipRepository（测试）

- `tests/utils/repositories/MockClipRepository.ts:1-79`  
  - 内存化实现可追踪 `sentClips`、动态调整 `mockClipResult`，并暴露 `reset()` 与订阅模拟逻辑，支持所有 Clipper/Options 单测。

## 任务 2.4：重构 ClipperDialog（依赖注入 + 订阅）

- `src/content/clipper/components/dialog.ts:12-817`  
  - 构造函数改用 `createClipperDialogDependencies()` 注入 `storage/runtime/errorHandler/clipRepo`，`show()` 初始化 fragment 配置并调用 `clipRepo.onConfigChange()` 订阅，`remove()/destroy()` 保证取消订阅及 UI 清理。
- `src/content/clipper/components/dialogDependencies.ts:1-24`  
  - 新建依赖工厂，统一从平台服务与 DI 容器解析仓库与错误处理器。
- `src/content/clipper/components/dialogFactory.ts:1-60`  
  - 对外暴露 `createClipperDialog()`/`createTestClipperDialog()`，确保所有入口都走标准依赖注入。
- `src/content/clipper/presentation/clipperDialogPrompt.ts:1-36`  
  - Prompt Gateway 改为调用 `createClipperDialog()`，消除对 `new ClipperDialog()` 的直接依赖。
- `src/content/clipper/shared/clipperDialogHost.ts:13-70`  
  - 全局宿主同样改用工厂函数创建实例，避免绕过 DI。

## 任务 2.5：补充 ClipperDialog 单元测试

- `tests/unit/content/clipperDialog.test.ts:1-354`  
  - 使用 `MockClipRepository` 验证 UI 初始化、订阅与销毁行为：`show()` 会注册监听，`destroy()` 释放，配置变更能实时更新快捷键状态。
- `tests/unit/content/clipperDialogKeyboardShortcuts.test.ts:1-400`  
  - 所有快捷键用例均注入 `MockClipRepository`，覆盖默认启用/禁用、双击 Enter 激活、Cmd/Alt+Enter 提交、Escape 取消等交互路径。
- `tests/setup/globalSetup.ts:5-115`  
  - 测试环境启动时注册四个 Mock Repository，确保 Vitest 解析依赖时拥有剪藏/视频仓库的内存实现。

## 任务 2.6：创建 IVideoRepository 接口

- `src/shared/repositories/IVideoRepository.ts:1-47`  
  - 定义 `VideoClipData` 结构与 `IVideoRepository` 方法集合，覆盖视频配置读取、浮层位置保存/读取、剪藏发送与配置订阅。

## 任务 2.7：实现 ChromeVideoRepository

- `src/infrastructure/repositories/ChromeVideoRepository.ts:1-67`  
  - 借助 `IOptionsRepository` 持久化 `video.promptPosition`，通过 `IMessagingRepository` 发送 `videoClip` 消息，并向外暴露配置订阅。
- `src/shared/types/options.ts:45-80`  
  - 扩充 `VideoOptions`，新增 `promptPosition?: { x; y }` 字段以承载浮层坐标。
- `src/shared/repositories/IMessagingRepository.ts:1-42`  
  - 消息联合类型新增 `videoClip` 分支，并重用 `VideoClipData`，保证 messaging 层类型安全。

## 任务 2.8：实现 MockVideoRepository（测试）

- `tests/utils/repositories/MockVideoRepository.ts:1-86`  
  - 内存实现记录 `sentClips`、支持 `setMockVideoConfig()`/`setMockResult()` 与 `reset()`，并提供配置订阅能力，方便 Video Prompt/Panel 单测。
- `tests/utils/repositories/index.ts:1-5`  
  - 导出 `MockVideoRepository`，统一测试辅助入口。

---

## 验证

- **类型检查**：`npm run typecheck`
- **剪藏相关单元测试**：`npm run test:unit -- tests/unit/content/clipper`

以上命令均在最新代码上执行通过，确认任务 2.1-2.8 的实现与测试满足 `REPO-MONTH2-EXECUTION-PLAN.md` 的验收标准。***

# Month 2 Week 1（任务 2.9-2.14）交付复核

覆盖 Day 29-35 的视频浮层与 Reader 仓库化阶段：Video Prompt 依赖注入、Repo 集成测试、Reader Repository + Session 重构与单测。以下条目逐一给出源码/测试行号，方便审核核对。

---

## 任务 2.9：重构 Video Prompt（依赖注入 + 仓库化）

- `src/content/video/prompt.ts:1-640`  
  - 重写 Prompt 生命周期：通过 `getVideoPromptDependencies()` 注入 `videoRepo/runtime/storage`，初始化时 `getVideoRepository()` 拉取配置、浮层状态，并在保存位置时调用仓库；`setupVideoElements()`/`evaluatePrompt()` 只依赖仓库回传的配置，完全移除对 `chrome.storage` 的直接读写。
- `src/content/video/videoPromptDependencies.ts:1-24`  
  - 新建依赖工厂（生产/测试可替换），默认解析仓库、runtime、storage，配合 Prompt 中的 `__setVideoPromptDependenciesForTests()`，支撑后续 Repo 单测。

## 任务 2.10：补充 Video Prompt 仓库集成用例

- `tests/unit/content/videoPromptRepository.test.ts:1-140`  
  - 构造 `MockVideoRepository`，验证 `savePromptPosition()`、`getPromptPosition()` 以及 `setupVideoConfigListener()` 三条路径均调用仓库，且监听回调会正确更新 Prompt 状态并在 cleanup 时注销订阅。
- `tests/unit/content/videoPromptPosition.test.ts:1-130`  
  - 抽离的 Prompt 工具集（clamp/drag bounding/side snapping）补足 10 条单测，确保所有位置信息在 Repo 返回的坐标基础上都有 deterministic 行为。

## 任务 2.11：创建 IReaderRepository 接口

- `src/shared/repositories/IReaderRepository.ts:1-50`  
  - 定义 `ReadingOptions/ReadingClipData/Highlight` 数据结构与 `getReadingConfig/sendReadingClip/onConfigChange` API，Reader 领域所有配置/导出操作从此走仓库抽象层。
- `src/shared/di/tokens.ts:14-46`, `src/shared/di/serviceRegistry.ts:180-241`  
  - 将 `IReaderRepository` 注册到 DI token 与仓库容器映射，保证 Content Script 可以统一解析 Reader 仓库实现。

## 任务 2.12：实现 ChromeReaderRepository + MockReaderRepository

- `src/infrastructure/repositories/ChromeReaderRepository.ts:1-48`  
  - Chrome 实现通过 `IOptionsRepository` 读取 `readingSession` 区域并订阅变化，调用 `IMessagingRepository` 发送 `readingClip` 消息，失败时返回结构化 `ClipResult`。
- `tests/utils/repositories/MockReaderRepository.ts:1-87`  
  - 测试用内存仓库，记录 `sentClips`、允许设置 mock config/result，并暴露 `reset()`/`setMockConfig()`，供 Reader 单测快速注入状态。
- `tests/setup/globalSetup.ts:100-137`  
  - Test Harness 启动阶段注册 `MockReaderRepository`，并在每个用例 before/after 中重置，确保 Reader 相关测试不再依赖真实平台服务。

## 任务 2.13：重构 ReaderSession（仓库化剪藏 + 高亮控制器）

- `src/content/reader/session.ts:1-424`  
  - 构造函数改为注入 `ReaderSessionDependencies`，移除对 `getPlatformServices()` 的硬编码；`initializeReadingConfig()` 通过仓库异步获取并订阅配置，`finish()` 使用 `readerRepository.sendReadingClip()` 发送剪藏结果；`destroy()` 清理 repo 订阅与全局状态。
- `src/content/reader/highlightController.ts:1-134`, `src/content/reader/sessionDom.ts:1-49`, `src/content/reader/sessionExportUtils.ts:1-30`, `src/content/reader/sessionDependencies.ts:1-24`  
  - 新增高亮控制器管理全部 DOM/Panel 交互、键盘事件与剪藏 payload 生成逻辑，ReaderSession 只负责 orchestration；依赖工厂统一解析 options/storage/reader repo。
- `src/content/reader/environmentController.ts:1-159`  
  - 精简为只订阅语言与 fragment 配置，Reader 配置的订阅交给仓库层，避免重复监听。

## 任务 2.14：补充 ReaderSession 单元测试

- `tests/unit/content/reader/ReaderSession.test.ts:1-214`  
  - 利用新的测试钩子模拟 Repo 回传配置/高亮：覆盖 initialize 订阅、finish 发送、无高亮时的 hint、destroy 取消订阅 + unwrap highlight 等 5 条核心用例。
- `tests/unit/content/readerSessionModifiers.test.ts:145-197`  
  - 调整断言使用 `__testHighlights`，与新的高亮控制器保持一致，确认自动选区逻辑仍生效。

---

## 验证

- **Video Prompt 单测**：`npm run test:unit -- tests/unit/content/videoPromptRepository.test.ts tests/unit/content/videoPromptPosition.test.ts`
- **Reader 领域单测**：`npm run test:unit -- tests/unit/content/reader`
- **类型检查**：`npm run typecheck`

所有命令均在最新代码运行并通过，确认任务 2.9-2.14 达到 `REPO-MONTH2-EXECUTION-PLAN.md` 的验收标准。
