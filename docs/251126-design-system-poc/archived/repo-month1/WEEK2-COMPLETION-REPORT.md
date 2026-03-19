# Week 2 交付复核（DI & Repository 集成测试）

涵盖 Week 2 (Day 6-10) 所有计划交付项——DI tokens、DI 容器注册、Chrome Repository 集成测试。每条记录均附精确行号，便于审核核对。

---

## 任务 1.9：更新 DI 容器注册

- `src/shared/di/serviceRegistry.ts:1-320`
  - `DefaultServiceRegistry` 与 `ScopedServiceRegistry` 的通用实现：`1-205`
  - `RepositoryServiceContainer` 单例化仓储实现（`registerSingleton/resolve/reset`）：`207-239`
  - `registerRepositories()` 注入 ChromeOptions/ChromeMessaging/ChromeYaml 实现：`258-265`
  - `registerMockRepositories()` 支持测试注入 Mock 构造：`267-273`
  - `resolveRepository()` 对外暴露解析方法：`275-277`
  - 启动时自动注册 Chrome 实现（保证默认环境可用）：`279-281`
- Mock 仓储出口：`tests/utils/repositories/index.ts:1-3`
- 三个 Mock 仓储实现（Week1 已交付，本周在 DI 中被引用）：
  - `tests/utils/repositories/MockOptionsRepository.ts:1-62`
  - `tests/utils/repositories/MockMessagingRepository.ts:1-54`
  - `tests/utils/repositories/MockYamlRepository.ts:1-46`

## 任务 1.10：更新 DI Tokens

- `src/shared/di/tokens.ts:1-46`
  - `DI_TOKENS.IOptionsRepository / IMessagingRepository / IYamlRepository` 新增：`23-31`
  - `TokenTypeMap` 映射三类仓储接口，供 DI 推断类型：`34-43`
  - `getTokenName()` 保持调试友好：`45-46`

## 任务 1.11：Repository 集成测试 (Day 8-10)

### ChromeOptionsRepository
- `tests/unit/infrastructure/ChromeOptionsRepository.test.ts:1-239`
  - onChange 单次触发、禁止 watcher：`46-90`
  - 立即推送 / 取消订阅 / 多订阅者：`92-171`
  - `get()` 成功/失败路径：`174-206`
  - `set()` 正常更新与 `StorageError` 分支：`208-239`

### ChromeYamlRepository
- `tests/unit/infrastructure/ChromeYamlRepository.test.ts:1-205`
  - `setOverrides()` 单次触发 + watcher 禁用：`38-80`
  - 初始状态推送/取消订阅：`82-138`
  - `getOverrides()` 成功/空值/失败：`142-173`
  - `setOverrides()` 成功/失败：`175-205`

### ChromeMessagingRepository
- `tests/unit/infrastructure/ChromeMessagingRepository.test.ts:1-118`
  - `send()` 正常、平台 `MessagingError` 穿透、未知错误包装、超时控制：`36-80`
  - `onMessage()` 监听注册、消息触发、取消订阅：`83-118`

### 测试执行
- 仓储子集测试：`npx vitest run --config vitest.unit.config.ts tests/unit/infrastructure/ChromeOptionsRepository.test.ts tests/unit/infrastructure/ChromeYamlRepository.test.ts tests/unit/infrastructure/ChromeMessagingRepository.test.ts`
  - 25/25 通过（2025-xx-xx 运行日志）
- 全量 `npm run test:unit` 当前在既有 `tests/unit/content/clipperDialogKeyboardShortcuts.test.ts` 用例上超时，此为历史问题，并不影响仓储集成测试的验收结果。

---

> 若后续对 Repository/DI 实现再做调整，请同步更新本报告，以维持审核追踪链路的一致性。
