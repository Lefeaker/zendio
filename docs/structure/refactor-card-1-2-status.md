# 卡片 1 & 2 完成情况检查

## 卡片 1 · Options 页面架构拆分

- 交付对照
  - `src/options/index.ts:1` 现已仅负责调用 `bootstrapPage`，入口文件成功收敛职责。
  - `src/options/app/bootstrap.ts:22` 把初始化、事件绑定与存储同步拆分到独立模块并串联组件/服务。
  - `src/options/state/optionsStore.ts:6` 与 `src/options/state/vaultRouterStore.ts:1` 承担新的状态抽象，其中后者已由 `tests/unit/vaultRouterStore.test.ts:1` 覆盖基本行为。
  - UI 模块已迁入 `src/options/components/`，例如 `src/options/components/vaultRouterSection.ts:1` 渲染多仓库表单并复用 store。
  - 工具函数集中在 `src/options/utils/index.ts:1`，符合计划中的 barrel 设计。
- 交付补充
  - 连接测试流程已抽象为 `src/options/services/connectionTester.ts:1` 并通过 `src/options/components/connectionTest.ts:1` 集成到主设置页，告别遗留的 `test-connection.*` 页面。
  - 新增 `src/shared/types/connection.ts:1` 同步前后台的连接测试返回类型，`src/background/pipelines/connectionTest.ts:1` 与 options 服务共享同一模型。
  - `tests/unit/optionsStore.test.ts:1` 与 `tests/unit/configTransfer.test.ts:1` 补齐了存储与配置迁移流程的单测覆盖。
  - 构建脚本 `scripts/build.mjs:7` 删除了旧的单页入口，保持输出目录与现有架构一致。
- 未完成/风险
  - 语言切换、诊断等事件仍集中由 `bootstrap.ts` 挂载，若未来引入子路由需评估拆分或懒加载策略。

## 卡片 2 · Background 剪藏管线模块化

- 交付对照
  - `src/background/index.ts:1` 仅保留监听器注册，入口模块简化到预期形态。
  - `src/background/listeners/contextMenus.ts:1` 与 `src/background/listeners/runtimeMessages.ts:1` 拆分了菜单与消息监听职责。
  - 核心业务封装在 `src/background/pipelines/clipPipeline.ts:1` 与 `src/background/pipelines/connectionTest.ts:16`，串起配置加载、分类、写入及通知链路。
  - 服务层拆分已落地：`src/background/services/vaultRouterService.ts:21`、`src/background/services/classificationService.ts:1`、`src/background/services/obsidianWriter.ts:1`，并辅以 `src/background/types/messages.ts:1` 统一消息类型。
  - 单元测试扩展至 `tests/unit/vaultRouterService.test.ts:1`、`tests/unit/classificationService.test.ts:1` 与 `tests/unit/connectionTestPipeline.test.ts:1`，覆盖路由选择、分类兜底与多候选 URL 回退逻辑。
  - 通知路径新增可注入适配器 `src/background/services/notifications.ts:7`，并通过 `tests/unit/notifications.test.ts:1` 覆盖成功与失败分支。
- 未完成/风险
  - 通知模块（`src/background/services/notifications.ts:1`）仍依赖真实 `chrome.notifications`，建议后续补充 smoke test 或轻量适配层。

## 结论与建议

- 卡片 1 与卡片 2 的核心交付现已对齐验收标准：连接测试流重用背景管线，模块单测补齐，背景 `any` 类型已收敛为显式接口。
- 后续关注点：
  1. 评估 Options 事件绑定在多页面/懒加载场景下的拆分策略，避免后续扩展时发生重复初始化。
  2. 为通知与高阶错误路径补齐最少量 smoke test，确保异步消息链路在未来重构中可回归。
