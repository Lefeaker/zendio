# `getPlatformServices()` 残留清单

> **更新日期**：2026-03-15
> **目标**：基于当前仓库真值区分允许保留的 composition root 调用与仍需继续治理的跨层调用
> **Phase 0 审计基线**：`npm run audit:deps:report` 使用 `.dependency-cruiser.cjs` 以只读报告模式输出循环依赖与跨层依赖告警；CI 仅收集报告，不阻塞主线
> **Allowlist 审计基线**：`npm run audit:platform-services:report` 校验 `getPlatformServices()` 非测试命中是否仍严格限定在 4 个允许文件内；CI 以报告模式收集，不阻塞主线
> **执行口径**：本文件只记录平台边界审计真值，不单独决定下一批次；批次顺序以 `DEBT-IMPLEMENTATION-ROADMAP.md` 为准

## 当前结论

- `src/background/pipelines/clipPipeline.ts` 已无 `getPlatformServices()` 访问。
- `src/background/listeners/runtimeMessages.ts` 已改为显式注入 `messaging` / `tabs` / `runtime` 依赖。
- `src/background/listeners/contextMenus.ts` 已改为显式注入 listener 依赖与 `IOptionsRepository`。
- `src/options/bootstrap.ts` 已退出 `getPlatformServices()`，legacy bootstrap 改为显式注入 `StorageService`。
- `src/shared/errors/analytics/analyticsConfig.template.ts` 已改成显式注入模板，不再自行拉取平台存储。
- `src/background/index.ts` 保留 `getPlatformServices()`，但仅作为 background composition root。
- 当前 `src/` 内非测试残留已收敛到 4 处，其中 1 处为 `src/platform/services.ts` 定义本身，其余 3 处位于 composition root；`chrome.tabs.create` 直连已清零。
- `getPlatformServices()` allowlist 已落成自动审计脚本：`npm run audit:platform-services:report`
- `src/background/bootstrap.ts` 与 `src/content/bootstrap.ts` 已改为显式接收 `StorageService`，不再在 bootstrap 内部拉取平台 locator。
- `src/options/index.ts` 保留 `getPlatformServices()`，但仅作为 options composition root 负责向 `app/bootstrap.ts` 注入 `storage`。
- `PlatformServices.optionsRepository` 已退役；content/background 与 Options UI 主链统一改走 `IOptionsRepository`。
- content 侧 legacy `OptionsRepository` residual list 已进一步收敛：`src/content/index.ts` 不再预配置 `fragmentConfig` / `aiChatExtractor` 默认仓储入口；`src/content/video/sessionDependencies.ts`、`src/content/reader/sessionDependencies.ts`、`src/content/clipper/services/selectionController.ts` 继续作为显式注入消费者保留。
- `runtimeMessages.ts` 的 analytics usage 行为回归已修复，对应定向测试已恢复通过。
- 当前新的风险点已从默认依赖残留转为 allowlist 维持与测试稳定性：
  - `tests/unit/background/bootstrap.test.ts` 的 hoisted mock 初始化顺序问题已修复
  - 默认 storage / module-level mutable default 残留已清零，后续重点是防止回流

## 当前允许保留的位置

| 文件 | 用途 | 结论 |
| --- | --- | --- |
| `src/background/index.ts` | background composition root，组装 runtime/message/context-menu 依赖 | 允许保留 |
| `src/content/index.ts` | content runtime 装配 | 允许保留 |
| `src/options/index.ts` | options composition root，向 app bootstrap 注入 platform storage | 允许保留 |
| `src/platform/services.ts` | 平台服务定义与默认装配入口 | 允许保留 |

## Legacy repository residual inventory

这些命中不属于 `getPlatformServices()` allowlist，但属于本轮必须继续追踪的 repository 双轨残留：

| 文件 | 当前入口 | 约束 |
| --- | --- | --- |
| `src/content/index.ts` | content composition root 从 `PlatformServices.optionsRepository` 装配依赖 | 已完成；当前改为直接解析 `IOptionsRepository` |
| `src/content/video/sessionDependencies.ts` | video session 依赖工厂接收 legacy repository | 允许保留，仓储选择必须停留在依赖工厂 |
| `src/content/reader/sessionDependencies.ts` | reader session 依赖工厂接收 legacy repository | 允许保留，仓储选择必须停留在依赖工厂 |
| `src/content/clipper/services/selectionController.ts` | clipper 依赖对象显式接收 legacy repository | 允许保留，业务流程不得自行拉取平台 locator |
| `src/content/clipper/services/fragmentConfig.ts` | 仅接受显式传入 repository；无 repository 时回退静态默认配置 | 已收口，禁止回流 |
| `src/content/extractors/aiChatExtractor.ts` | 仅接受显式传入 repository/provider；无依赖时回退空选项 provider | 已收口，禁止回流 |

## 搜索基线

### `src/` 内残留 `getPlatformServices()`

命令：

```bash
rg -n "getPlatformServices\\(" src -g '!**/*.test.*'
```

```text
src/content/index.ts:42:  const platform = getPlatformServices();
src/platform/services.ts:52:export function getPlatformServices(): PlatformServices {
src/options/index.ts:6:  storage: getPlatformServices().storage
src/background/index.ts:20:const platformServices = getPlatformServices();
```

### `src/` 内残留 `getPlatformServices()` allowlist 审计

命令：

```bash
npm run audit:platform-services:report
```

当前结论：

```text
Allowlist files expected: 4
Files with usages found: 4
Unexpected files: 0
Missing allowlist files: 0
```

### `src/` 内残留 `chrome.tabs.create`

命令：

```bash
rg -n "chrome\\.tabs\\.create" src
```

```text
无
```

## 当前验收证据

### P0-2 定向验证命令

```bash
npx vitest run --config vitest.unit.config.ts \
  tests/unit/background/bootstrap.test.ts \
  tests/unit/content/bootstrap.test.ts \
  tests/unit/options/bootstrap.test.ts \
  tests/unit/options/optionsBootstrapDependencies.test.ts \
  tests/unit/shared/errors/analyticsConfig.test.ts
```

### 补充残留检查

```bash
rg -n "getPlatformServices\\(" src -g '!**/*.test.*'
npm run audit:platform-services:report
```

### 当前结果

- `src/background/bootstrap.ts`: 已退出 locator
- `src/content/bootstrap.ts`: 已退出 locator
- 允许残留仅剩 `background/index.ts`、`content/index.ts`、`options/index.ts` 与 `platform/services.ts`
- 当前 allowlist 已可区分 composition root 命中与跨层回流
- `npx vitest run --config vitest.unit.config.ts tests/unit/options/bootstrap.test.ts` 已通过，`options/index.ts -> app/bootstrap.ts` 的 storage 注入链当前稳定
- `npx vitest run --config vitest.unit.config.ts tests/unit/background/runtimeMessages.test.ts` 已通过，analytics usage 回归已关闭
- `npx vitest run --config vitest.unit.config.ts tests/unit/content/aiChatExtractor.test.ts tests/unit/content/fragmentConfig.test.ts tests/unit/content/keyboardShortcutsIntegration.test.ts` 已通过，content 默认 options bridge 与模块级 mutable default 已清零
- `npx vitest run --config vitest.unit.config.ts tests/unit/background/bootstrap.test.ts` 已通过

### 历史 B-12 定向验证命令

```bash
npx vitest run --config vitest.unit.config.ts \
  tests/unit/background/clipPipeline.test.ts \
  tests/unit/background/runtimeMessages.test.ts \
  tests/unit/background/contextMenus.test.ts
```

### 本轮补充说明

- `clipPipeline.test.ts`：通过
- `contextMenus.test.ts`：通过
- `runtimeMessages.test.ts`：通过
- `background/bootstrap.test.ts`：通过
- 结论：B-12 的平台边界收口、默认依赖清理与 analytics 回归均已关闭；当前剩余项转为 allowlist 维持与后续结构治理

## 分层口径

1. 允许：bootstrap、composition root、入口装配层。
2. 不允许：listener 业务逻辑、pipeline、service、shared、UI 组件、presenter、依赖工厂、模板示例自取平台服务。
3. 后续验收：新代码不得把 `getPlatformServices()` 再带回 listener / pipeline / service / shared / UI 主链。
