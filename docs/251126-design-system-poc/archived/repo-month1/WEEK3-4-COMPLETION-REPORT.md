# Week 3-4 交付复核（Options Sections Repository 化）

覆盖 Week 3-4（Day 11-20）全部项目任务：Ai/Language/Privacy/Transfer/Rest/Routing/Fragment/Video/Templates/Usage/Classifier/Reading Section 的仓库化改造。以下列表逐条列出改动源码与测试的精确行号，方便审核核验。

---

## 任务 1.12：重构 AiSection

- `src/options/components/sections/AiSection.ts:1-260`  
  - 构造函数注入 `IOptionsRepository`，`renderWithState()` 内订阅仓库，`collectChanges()` 直接 `optionsRepo.set()` 持久化；`destroy()`/`dispose()` 统一释放仓库订阅、UI 事件与 timestamp 强制器。
- `tests/unit/options/sections/AiSection.test.ts:1-147`  
  - 使用 `MockOptionsRepository` 验证快照渲染、onChange 驱动 UI、`collect()` 触发仓库写入，以及 `destroy()` 后监听被清理。

## 任务 1.13：重构 LanguageSection

- `src/options/components/sections/LanguageSection.ts:1-194`  
  - 语言切换后通过 `optionsRepo.set()` 持久化 `languagePreference`，`subscribeToRepository()` 监听其他上下文改动并自动回填 UI。
- `tests/unit/options/sections/LanguageSection.test.ts:1-77`  
  - 覆盖“选择语言即调用 `changeLanguage` & repo 写入”与“仓库快照驱动 UI”两个核心路径。

## 任务 1.14-1.15：重构 PrivacySection 与 TransferSection

- `src/options/components/sections/PrivacySection.ts:1-130`  
  - `PrivacySettings` 控件持有最新快照，`persistConsent()` 通过仓库保存，`subscribeToRepository()` 自动应用其他上下文的 consent。
- `tests/unit/options/sections/PrivacySection.test.ts:1-260`  
  - 校验隐私弹窗逻辑、仓库写入、consent 变更订阅、销毁清理。
- `src/options/components/sections/TransferSection.ts:1-232`  
  - Copy/Import 成功后将 `transferLog` 写入仓库，`subscribeToRepository()` 把最新历史渲染到 DaisyAlert。
- `tests/unit/options/sections/TransferSection.test.ts:1-84`  
  - 验证 copy/import 流程触发仓库写入与历史消息渲染。

## 任务 1.16：重构 RestSection

- `src/options/components/sections/RestSection.ts:1-420`  
  - 默认/附加仓库表单通过 `optionsRepo.onChange()` 同步；`collectChanges()` 将 REST/VaultRouter 配置写入仓库，连接测试委托 `IMessagingRepository`；`destroy()` 清理 VaultStore/Repo 订阅与 FormRegistry。
- `tests/unit/options/sections/RestSection.test.ts:1-240`  
  - 涵盖快照渲染、collect 持久化、仓库驱动 UI 与连接测试消息发送。

## 任务 1.17-1.20：重构 Routing / Fragment / Video / Templates Section

- `src/options/components/sections/RoutingSection.ts:1-420`  
  - 构造期注入仓库；`subscribeToRepository()` 将存储快照反向应用到 VaultRouterController；`triggerAutoSave()` 通过 `markPendingAutoSave()` + 仓库写入实现统一持久化。
  - `tests/unit/options/sections/RoutingSection.test.ts:1-370`：验证事件触发、FormRegistry collect、仓库快照更新表格。
- `src/options/components/sections/FragmentSection.ts:1-420`  
  - 所有输入值都走仓库订阅/写入，`destroy()` 清理高亮注册和 repo 监听。
  - `tests/unit/options/sections/FragmentSection.test.ts:1-330`：覆盖 onChange 行为、仓库驱动 UI、collect 输出。
- `src/options/components/sections/VideoSection.ts:1-280`  
  - 浮动提示/文案输入均透过仓库读取与保存，FormRegistry collect 时立即 `optionsRepo.set()`。
  - `tests/unit/options/sections/VideoSection.test.ts:1-160`：测试 UI 交互触发自动保存、仓库快照刷新。
- `src/options/components/sections/TemplatesSection.ts:1-440`  
  - 模板 & DomainMappings 通过 `optionsRepo.onChange()` 自动应用，`collectChanges()` 内 `persistTemplates()` 写回仓库。
  - `tests/unit/options/sections/TemplatesSection.test.ts:1-320`：验证快照应用、collect/scheduleAutoSave、仓库驱动 UI。

## 任务 1.21：重构 UsageSection ⭐

- `src/options/components/sections/UsageSection.ts:1-520`  
  - 新增 `IOptionsRepository`/`IMessagingRepository` 注入，`subscribeToRepository()` 监听 `usageStats`，`handleClearUsage()` 仅调用仓库与 messaging；`destroy()` 释放订阅。
- `tests/unit/options/sections/UsageSection.test.ts:1-188`  
  - 覆盖快照渲染、仓库驱动 UI、清空统计时写仓库与发埋点、destroy 后不再响应。

## 任务 1.22-1.23：重构 ClassifierSection 与 ReadingSection

- `src/options/components/sections/ClassifierSection.ts:1-420`  
  - 重构后的 Section 仅依赖仓库提供/保存 classifier 配置；destroy 时清理 repo & sectionRegistry 订阅。
  - `tests/unit/options/sections/ClassifierSection.test.ts:1-187`：验证快照应用、collect/taxonomy fallback、仓库驱动 UI 与 destroy 后不再响应。
- `src/options/components/sections/ReadingSection.ts:1-400`  
  - 注入仓库、onChange 驱动导出模式/主题、collect 时 `persistReading()` 写入。
  - `tests/unit/options/sections/ReadingSection.test.ts:1-137`：验证交互持久化、默认回退、仓库更新及 destroy 行为。

---

## 验证

- **单元测试**：`npm run test:unit -- tests/unit/options/sections/AiSection.test.ts tests/unit/options/sections/LanguageSection.test.ts tests/unit/options/sections/PrivacySection.test.ts tests/unit/options/sections/TransferSection.test.ts tests/unit/options/sections/RestSection.test.ts tests/unit/options/sections/RoutingSection.test.ts tests/unit/options/sections/FragmentSection.test.ts tests/unit/options/sections/TemplatesSection.test.ts tests/unit/options/sections/VideoSection.test.ts tests/unit/options/sections/UsageSection.test.ts tests/unit/options/sections/ClassifierSection.test.ts tests/unit/options/sections/ReadingSection.test.ts`
- **类型检查**：`npm run typecheck`

所有命令均在最新代码上运行通过，确认 Week 3-4 的迁移任务（1.12-1.23）已经全部完成并满足 `REPO-MONTH1-EXECUTION-PLAN.md` 的验收标准。
