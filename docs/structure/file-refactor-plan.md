# 文件结构重构规划

本文档说明 All in Obsidian 项目拟新增的目录层级，以及现有大文件（或耦合度较高的模块）应如何拆分并迁移到这些目录中，以便后续逐步实施重构。

## 新增目录概览

```text
src/
  background/
    listeners/
    pipelines/
    services/
    types/
  content/
    clipper/
      components/
      services/
      utils/
    extractors/
    shared/
  options/
    app/
    components/
    services/
    state/
    utils/
  shared/
    config/
    constants/
    types/
docs/
  structure/
tests/
  unit/
  e2e/
  fixtures/
.github/
  workflows/
```

> 说明：上述空目录已创建，可作为后续迁移目标。第三方代码依旧放在 `src/third_party/` 下，但建议补充来源说明，而自研模块迁入上述结构。

## 拆分建议

### 1. Background（Service Worker）
- **现状文件**：`src/background/index.ts`
  - 负责安装事件、图标点击、右键菜单、消息路由、LLM 分类、写文件。
- **拆分方案**：
  - `src/background/listeners/`：
    - `contextMenus.ts` – 创建/响应右键菜单与图标点击。
    - `runtimeMessages.ts` – 统一注册 `chrome.runtime.onMessage` 入口。
  - `src/background/pipelines/`：
    - `clipPipeline.ts` – 封装剪藏流程（加载配置→路由→分类→写入→通知）。
    - `connectionTest.ts` – 处理 TEST_CONNECTION 请求逻辑。
  - `src/background/services/`：
    - `vaultRouterService.ts` – 对 `VaultRouter` 做包装，暴露选择、校验、迁移等函数。
    - `classificationService.ts` – 包装 `classify` 调用，引入异常兜底、超时等。
    - `obsidianWriter.ts` – 从 `sinks/obsidianRest.ts` 迁移，并拆分日志与错误处理。
  - `src/background/types/`：抽离剪藏 payload、rest 配置、通知数据等 TypeScript 类型，避免在多个文件直接引用 `any`。

### 2. Content Scripts
- **现状文件**：
  - `src/content/index.ts` – 主入口；
  - `src/content/clipper-dialog.ts` – UI + 状态；
  - `src/content/adapters/*.ts` – 页面提取逻辑；
  - `src/content/formatters/markdown.ts`。
- **拆分方案**：
  - `src/content/shared/`：放置通用工具，如 `detect.ts`、事件总线、消息常量。
  - `src/content/extractors/`：按类型划分（`articleExtractor.ts`、`aiChatExtractor.ts`、`selectionExtractor.ts`），替代现在的 `adapters` 目录。
  - `src/content/clipper/components/`：
    - `dialog.ts` – 纯 UI 组件。
    - `commentForm.ts` – 处理用户输入及校验。
  - `src/content/clipper/services/`：
    - `selectionController.ts` – 管理剪藏模式切换与与 background 通讯。
    - `contextCapture.ts` – 原 `extractClipperContent` 中的上下文截取逻辑。
  - `src/content/clipper/utils/`：
    - `textFragment.ts`、`timestamp.ts` 等纯函数。
  - `src/content/index.ts` 只保留入口、根据剪藏类型组装服务。

### 3. Options 页面
- **现状文件**：
  - `src/options/index.ts`（~950 行）：初始化、事件绑定、校验、导入导出、UI 更新；
  - `src/options/vault-manager.ts`、`test-connection.ts` 也包含 UI、存储操作。
- **拆分方案**：
  - `src/options/app/`：
    - `bootstrap.ts` – 初始化 i18n、加载配置。
    - `routing.ts` – 管理不同子页面（主设置/ Vault 管理 / 测试）的入口。
  - `src/options/components/`：按 UI 模块拆分，例如 `restForm.ts`、`templateForm.ts`、`vaultList.ts`。
  - `src/options/state/`：
    - `optionsStore.ts` – 统一读取/写入 `chrome.storage`，后期可迁到 `storage.local`。
    - `vaultRouterStore.ts` – 与多仓库数据交互。
  - `src/options/services/`：
    - `configTransfer.ts` – 处理导入/导出。
    - `validation.ts` – 校验 taxonomy、模板等。
    - `connectionTester.ts` – 合并 `test-connection.ts`、background 调用逻辑。
  - `src/options/utils/`：
    - 工具函数（防抖、表单序列化、消息提示等）。

### 4. Shared 模块
- `src/shared/constants/`：记录平台名称、默认模板、通知文案键等常量。
- `src/shared/config/`：保存默认配置、迁移器；`store.ts` 可拆成 `defaultOptions.ts` + `optionsMerger.ts`。
- `src/shared/types/`：统一定义 Options、ClipPayload、VaultConfig 等类型，供 background/content/options 公用，减少重复定义与 `any`。

### 5. 第三方代码
- 继续保留在 `src/third_party/`，但建议：
  - 在每个子目录增加 README 标明来源版本、修改点；
  - 若需要修改，请通过 wrapper 暴露接口，避免主逻辑直接依赖大文件内部实现。

### 6. 测试与 CI/CD
- `tests/unit/`：存放 Jest/Vitest 等单元测试，先补齐 `resolvePath`、`VaultRouter`、模板辅助函数等纯逻辑的测试。
- `tests/e2e/`：存放基于 Playwright/Puppeteer 的端到端脚本，用于验证剪藏流程、Options 页交互、Local REST API 写入。
- `tests/fixtures/`：维护测试所需的 HTML 片段、配置样例、mock 响应。
- `.github/workflows/`：建立 CI 流程（如 `ci.yml`）执行构建、lint、测试，并在 release 前运行冒烟脚本。
- 后续可视需求新增 `tests/utils/` 或 `scripts/ci/`，集中放置测试运行器、打包脚本。

## 迁移优先级建议
1. **Options 页面拆分**：先将状态管理与 UI 拆出，解决当前维护成本最高的痛点。
2. **Background 剪藏管线模块化**：便于增加失败重试、日志收集。
3. **Content Clipper 拆分**：解决 UI 注入与业务逻辑耦合问题。
4. **Shared 类型与常量抽离**：推动三端（background/content/options）共享模型。
5. **测试与 CI/CD 落地**：在上述模块拆分过程中补齐单元测试框架，并搭建基础流水线。

## 实施提示
- 拆分过程中，建议逐模块编写 tsconfig `paths` 或 barrel 文件，减少引用路径噪音。
- 每完成一块迁移，可在 `docs/structure/` 下增补迁移记录，确保团队成员了解最新落地位置。
- 先抽离纯函数与常量，再迁移具备副作用的模块，可降低回归风险。
- 在实现测试目录时，优先搭建基础脚手架（如 `pnpm test`/`npm run test:unit`），并将其纳入 CI 工作流。

