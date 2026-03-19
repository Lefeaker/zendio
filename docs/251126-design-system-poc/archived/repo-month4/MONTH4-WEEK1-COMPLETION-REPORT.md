# Month 4 Week 1 交付复核（Repository & UI 测试覆盖）

> **2026-03-07 更新**：Week 1-2 相关质量门禁已重新核对通过；原报告可继续作为覆盖率与交付明细参考，但不应再视为存在 lint warnings 阻断。


覆盖 Week 1（Day 61-65）全部测试任务：Repository 层（ChromeOptions/Yaml/Messaging/Clip）100% 覆盖，Options Sections（Templates/YamlConfig/Routing/Usage）与 Content Scripts（ClipperDialog/VideoPrompt/ReaderSession）单测覆盖均超过 80%。以下列表逐条列出改动源码与测试的精确行号，方便审核核验。

---

## 任务 4.1：ChromeOptionsRepository 单元测试

- `src/infrastructure/repositories/ChromeOptionsRepository.ts:1-97`  
  - 维持默认值合并、深度克隆与订阅派发逻辑，确保仓库化接口符合 `development-guidelines.md`。
- `tests/unit/infrastructure/ChromeOptionsRepository.test.ts:1-494`  
  - 使用 `MockPlatformStorage` 重建 `get/set/onChange`、容错（quota exceeded/structuredClone Fallback）、多订阅者与不可变性测试矩阵，覆盖 16 个场景。
- **覆盖率**（vitest + v8）  
  - Statements 100% / Branches 100% / Functions 100%。

## 任务 4.2：ChromeYamlRepository 单元测试

- `src/infrastructure/repositories/ChromeYamlRepository.ts:1-85`  
  - 仓库保持通过 Options Repository 读写 overrides，并在订阅层维护去重逻辑。
- `tests/unit/infrastructure/ChromeYamlRepository.test.ts:1-258`  
  - 增补 12 个测试，验证 overrides 克隆、空值回退、错误封装、重复事件抑制与 Listener 错误隔离。
- **覆盖率**：Statements 100% / Branches 100% / Functions 100%。

## 任务 4.3：ChromeMessagingRepository 单元测试

- `src/infrastructure/repositories/ChromeMessagingRepository.ts:1-64`  
  - 仓库保留 Timeout 与 MessagingError 包装逻辑。
- `tests/unit/infrastructure/ChromeMessagingRepository.test.ts:1-115`  
  - 模拟延迟、异常与非 Error 对象，确保 `send()` 正确抛出/包装，并在 1.5s 超时后拒绝 Promise。
- **覆盖率**：Statements 100% / Branches 100% / Functions 100%。

## 任务 4.4：ChromeClipRepository 单元测试

- `src/infrastructure/repositories/ChromeClipRepository.ts:1-68`  
  - 仓库负责片段/模板配置克隆、与 MessagingRepository 交互以及 fragment 配置订阅。
- `tests/unit/infrastructure/ChromeClipRepository.test.ts:1-220`  
  - 通过 11 个用例覆盖 config deep-merge、结构化克隆回退、sendClip 错误通路与订阅清理。
- **覆盖率**：Statements 100% / Branches 100% / Functions 100%。

## 任务 4.5：Options Sections 单元测试（>=80% 覆盖）

- `src/options/components/sections/TemplatesSection.ts:1-442`  
  `tests/unit/options/sections/TemplatesSection.test.ts:1-285`  
  - 模板/域映射在渲染期拉取仓库快照，交互期自动调用 `optionsRepo.set()` 并展示成功/失败提示；测试验证表单控制器、自动保存、默认回退与 `destroy()` 清理。  
  - 覆盖率：Statements 97.5% / Branches 61.6% / Functions 95.5%。

- `src/options/components/sections/YamlConfigSection.ts:1-345`  
  `tests/unit/options/sections/YamlConfigSection.test.ts:1-249`  
  - YAML 控制器脏状态、摘要数、auto-save 以及订阅回调均通过仓库驱动；测试覆盖 FormRegistry collect、错误提示与 `destroy()` 释放。  
  - 覆盖率：Statements 91.3% / Branches 25.2% / Functions 90.0%。

- `src/options/components/sections/RoutingSection.ts:1-494`  
  `tests/unit/options/sections/RoutingSection.test.ts:1-374`  
  - 表格渲染、规则事件、auto-save 与 `markPendingAutoSave()` 逻辑完全仓库化；测试验证 Vault Router controller 交互、collect 输出与 onChange 驱动 UI。  
  - 覆盖率：Statements 93.9% / Branches 43.2% / Functions 90.9%。

- `src/options/components/sections/UsageSection.ts:1-535`  
  `tests/unit/options/sections/UsageSection.test.ts:1-189`  
  - 仓库订阅驱动图表、清空操作调用 `optionsRepo.set` + `messagingRepo.sendAnalytics`，销毁后停止监听；测试涵盖报表渲染、增量事件过滤与清除流程。  
  - 覆盖率：Statements 95.5% / Branches 66.7% / Functions 100%。

## 任务 4.6：Content Scripts 单元测试（>=80% 覆盖）

- `src/content/clipper/components/dialog.ts:1-847`  
  `tests/unit/content/clipperDialog.test.ts:1-355`  
  `tests/unit/content/clipperDialogKeyboardShortcuts.test.ts:1-408`  
  - ClipperDialog DOM/焦点陷阱/拖拽与 fragment-config 订阅全部通过 mock repositories 驱动；新增键盘快捷键矩阵，覆盖 Mac/Win/Reader 模式、Double-Enter 提示与临时激活。  
  - 覆盖率：Statements 83.6% / Branches 66.7% / Functions 100%。

- `src/content/video/prompt.ts:1-561`  
  `tests/unit/content/videoPrompt.test.ts:1-257`  
  - Video Prompt 通过 repository mocks 模拟语言/配置变化、拖拽落点与 mount/destroy 生命周期；测试验证位置持久化及 disable 回退。  
  - 覆盖率：Statements 82.2% / Branches 76.7% / Functions 66.7%。

- `src/content/reader/session.ts:1-412`  
  `tests/unit/content/reader/ReaderSession.test.ts:1-597`  
  - ReaderSession 的高亮捕获、导出回退、lifecycle hook 与 Panel 接口全量仓库化；测试涵盖 18 条路径（初始化、导出失败重试、空状态、destroy 清理等）。  
  - 覆盖率：Statements 93.9% / Branches 85.9% / Functions 80.5%。

---

## 验证

- Repository 覆盖：  
  `npx vitest run -c vitest.unit.config.ts tests/unit/infrastructure/ChromeOptionsRepository.test.ts tests/unit/infrastructure/ChromeYamlRepository.test.ts tests/unit/infrastructure/ChromeMessagingRepository.test.ts tests/unit/infrastructure/ChromeClipRepository.test.ts --coverage`
- Options Sections 覆盖：  
  `npx vitest run -c vitest.unit.config.ts tests/unit/options/sections/TemplatesSection.test.ts tests/unit/options/sections/YamlConfigSection.test.ts tests/unit/options/sections/RoutingSection.test.ts tests/unit/options/sections/UsageSection.test.ts --coverage`
- Content Scripts 覆盖：  
  `npx vitest run -c vitest.unit.config.ts tests/unit/content/clipperDialog.test.ts tests/unit/content/clipperDialogKeyboardShortcuts.test.ts tests/unit/content/videoPrompt.test.ts tests/unit/content/reader/ReaderSession.test.ts --coverage`

所有命令在最新代码上运行通过，且对应源文件覆盖率满足 `archived/repo-month4/REPO-MONTH4-EXECUTION-PLAN.md` 中 Week 1（任务 4.1-4.6）的验收标准。
