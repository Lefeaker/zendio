# Options Module Overview

> 摘要：选项页模块的目录结构、核心组件与开发流程。请在新增功能或重构前先阅读本指南，并遵循 `docs/development-guidelines.md` 中的相关约束。

---

## 0. 快速上手

### 0.0 Stitch Secondary 正式主链

- 正式 Options UI 启动链是 `src/options/index.ts -> src/options/app/bootstrap.ts -> src/options/app/productionStitchShell.ts`。
- `src/options/stitch/*` 是 preview 与 production 共享的 Stitch Secondary schema、renderer、class slots、content 与 CSS 真值。
- `src/options/components/layout/*`、`src/options/components/sections/*`、`src/options/components/formSections/*` 与旧 modal/controller 代码只保留为兼容测试资产；除兼容修复外，不要把它们重新接入生产启动链。
- Options 验收除通用 `quality` / `verify:preflight` 外，必须追加 `npm run verify:stitch-secondary`。

### 0.1 目录与入口

- `index.ts -> app/bootstrap.ts -> app/productionStitchShell.ts`：唯一正式入口，负责 I18n、Controller、Stitch Shell 初始化。
- `stitch/*`：Stitch Secondary 共享 UI 包，production 以 `future/options-component-preview 2/index.html` 的原始参考运行结果为视觉真值；`future/options-component-preview/options-preview-stitch-secondary.html` 仅作开发改稿对比输入。
- `components/layout/*`：旧 Shell 与主内容挂载，兼容测试可用，不再是页面主启动链。
- `components/sections/*`：旧设置面板与 leaf widget 适配资产，兼容测试可用；正式生产 UI 从 Stitch schema 渲染。
- `components/formSections/*`：旧 `FormSectionRegistry` 兼容层，不得重新接入正式启动链。
- `components/infrastructure/` 与 `components/services/`：选项页专属 Modal/UI 控件与配置传输服务。
- `utils/`：辅助方法（导入导出、transfer 等）；正式 Options 样式由 `stitch/styles/` 承载。

### 0.2 样式规范速览

- 样式入口固定为 `src/options/stitch/styles/stitch.css` 与 `src/options/stitch/styles/variants/stitch-secondary.css` 的静态产物链路。
- `src/options/styles/*` legacy 样式链路已退出正式构建；真实 token 真值源只有 `src/styles/design-tokens.css`。
- `.aobx-*` 采用 BEM 语义，优先复用 Token/Utility，例如 `.aobx-card`、`.aobx-alert` 等。
- 禁止新增 `.aob-*` 或内联颜色；Dark/Light 模式需同步维护。
- 需要实验性样式时，在 README / PR 中写明范围与回滚方式，并确保 `npm run report:options-legacy` 通过。
- Tailwind / DaisyUI 构建链路已退出主线；新增或修改样式必须落在 Stitch schema / renderer / `stitch/styles/`，不得恢复 Tailwind 配置、CLI 脚本或旧 CSS bridge。

### 0.3 必跑命令

```bash
npm run lint                 # Typescript + ESLint/Stylelint 基线
npm run lint:options-css     # 限定 Options CSS 的 Stylelint
npm run report:options-legacy # 确保无 `.aob-*` 遗留
npm run test:unit            # Section/Controller 的最小回归
npm run verify:stitch-secondary # Stitch Secondary 主链回归
```

如改动 I18n 或 CLI，请追加 `npm run validate:i18n:keys`、`npm run typecheck:tests`。

> 提示：Options 主 UI 与 content runtime 的 Clipper / Reader / Video 面板都走 Stitch runtime CSS；`clipper.tailwind.css` / `video.tailwind.css` 样式桥已退役。

### 0.4 组件 / Utility 清单

#### 基础组件优先级 (当前正式口径)

| 语义        | 首选入口                                  | 说明                                                                                     |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| 按钮        | `UiButton` / `createOptionsButtonElement` | 正式入口：`src/ui/primitives/button/index.ts`                                            |
| 输入框      | `UiInput` / `createInputElement`          | 正式入口：`src/ui/primitives/input/index.ts`                                             |
| 选择框      | `UiSelect` / `createSelectElement`        | 正式入口：`src/ui/primitives/select/index.ts`                                            |
| 复选框      | `UiCheckbox` / `createCheckboxElement`    | 正式入口：`src/ui/primitives/checkbox/index.ts`                                          |
| 表格/伪表格 | `DaisyTable`                              | 统一表头、行区与滚动容器                                                                 |
| 对话框      | `createDialogFrame` / `ShadowDialogHost`  | 正式入口：`src/ui/primitives/dialog/index.ts`、`src/ui/hosts/shadow/ShadowDialogHost.ts` |

DOM-heavy 场景如需直接拿到按钮元素，统一使用 `src/ui/primitives/button/index.ts` 导出的 `createOptionsButtonElement()`。

#### 传统组件类 (逐步迁移中)

| 名称                                                                 | 用途                           | 备注                                                                   |
| -------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `.aobx-card`                                                         | 卡片容器                       | 支持 light/dark，常用于 Section 外层                                   |
| `.aobx-card--muted / --outline / --accent-border / --neutral-border` | 卡片修饰符                     | 组合背景、描边、强调边框，供隐私提示、Domain 控件等复用                |
| `.aobx-alert`                                                        | 信息、成功、警告、错误提醒     | 通过修饰符控制语义                                                     |
| `.aobx-field-group`                                                  | 表单字段组                     | 统一 label/控件间距                                                    |
| `.aobx-table`                                                        | 数据表格                       | YAML/REST 等共享                                                       |
| `.aobx-table__filters / __sort-btn / __advanced-*`                   | 表格筛选、排序与 Advanced 面板 | 复用 `.aobx-chip-btn` 与 `.aobx-table`                                 |
| `.aobx-button-row`                                                   | 按钮行                         | 对齐间距、栅格                                                         |
| `.aobx-chip` / `.aobx-chip-btn`                                      | Tag/Chip                       | 过滤器或标签选择                                                       |
| `.aobx-domain__*`                                                    | YAML 域名覆盖编辑器            | 组合 `.aobx-card`、`.aobx-input`、`.aobx-btn`                          |
| `.aobx-highlight-button + --{theme}`                                 | 阅读高亮主题按钮               | 色板基于 `--aobx-highlight-*` Token，`ReadingSection` 和预览可直接复用 |
| `.aobx-hint-row` / `.aobx-hint-card` / `__code`                      | 示例提示块                     | 在 Fragment 等 Section 展示 markdown/code 提示                         |

更多组件抽象请参阅 `docs/options-style-refinement-plan.md`。

### 0.5 常见问题速览

- 懒加载/自动保存/I18n 等运行时问题详见 §6《常见问题》。
- 暗色模式不生效：检查是否复用 Token、Utility，并参考 `docs/options-style-validation-guide.md`。
- Stitch 样式异常：先确认 `src/options/stitch/styles/stitch.css` 与 `variants/stitch-secondary.css` 是否覆盖当前 surface，再检查构建产物中的静态 CSS 路径。

### 0.6 任务前置指南

- 在执行 Options/Stitch runtime 样式任务前，优先确认 `src/options/stitch/styles/stitch.css` 与 `variants/stitch-secondary.css` 是否已经覆盖对应 runtime surface；不要恢复 Options、Clipper 或 Video 的 Tailwind bridge。
- 旧 Tailwind 迁移材料只保留在归档文档中用于追溯，不再作为新开发指南或验收依据。

---

## 1. 目录结构

```
src/options/
├── app/
│   ├── bootstrap.ts          # 入口：初始化 I18n、Controller、Shell
│   ├── productionStitchShell.ts # 正式 Stitch Secondary production adapter
│   ├── optionsController.ts  # 控制器：持久化、自动保存、导入导出
│   └── optionsControllerContext.ts
├── stitch/                   # preview/production 共享的 Stitch Secondary 真值
├── components/
│   ├── layout/
│   │   ├── OptionsApp.ts     # 装配 Shell、Sidebar、MainContent
│   │   └── MainContent.ts    # Section 懒加载与挂载调度
│   ├── sections/             # 各设置面板（BaseSection 子类）
│   ├── formSections/         # FormSectionRegistry 及作用域绑定
│   ├── infrastructure/       # ModalController 等基础控件
│   └── services/             # 配置传输等选项页专用服务
└── utils/                     # 选项页工具（如 optionsTransfer.ts）
```

---

## 2. 生命周期与责任划分

1. **启动流程（`bootstrap.ts`）**

- `teardownMountedShell()` + `disposeCleanupHandlers()`：保证二次初始化时清理旧实例。
- `applyI18n()`：创建并挂载 `PageI18nController`。
- `initializeOptionsRuntime()`：实例化 `FormSectionRegistry`、`OptionsController` 并注册清理函数。
- `mountProductionStitchShell()`：挂载 Stitch Secondary Shell，实现导航、资源弹层、生产状态绑定与自动保存。
- `src/options/index.ts -> src/options/app/bootstrap.ts` 是唯一正式页面启动链；旧 `src/options/bootstrap.ts` 兼容入口已删除。
- `mountOptionsShell`、`OptionsApp`、`MainContent`、`Sidebar`、`FormSectionRegistry`、`ModalController` 不得重新进入正式页面启动链。
- `getPlatformServices` 只允许保留在 `src/options/index.ts` 这个 Options composition root；`src/options/app/bootstrap.ts` 必须保持为显式依赖注入入口。

2. **Options 主状态链（Phase 3 当前口径）**

- 长期合同：`IOptionsRepository` 是唯一主读写/订阅合同。
- 主状态适配：`optionsStore` 负责基于 `IOptionsRepository` 做 normalize、缓存与订阅分发。
- 兼容层：`chromeOptionsPersistence` 仅作为 `OptionsController` 仍在消费的适配器，不再被视为独立主链。
- 平台桥接：`PlatformServices.optionsRepository` 已退役；Options UI 与 content/background 主链统一不得再依赖该桥接。
- 主链职责：`ChromeOptionsRepository` 负责 `get/set/onChange` 与默认值合并，`optionsStore` 负责 normalize、缓存、迁移提示与对 Options UI 的订阅分发。
- 兼容职责：`ChromeSyncOptionsRepository` 仅保留 historical `load/save/snapshot/subscribe/reset` 语义，不再承担 normalize / merge 主链职责。
- 当前 residual consumers：legacy `OptionsRepository` 兼容语义仍主要保留在 `src/infrastructure/optionsRepository.ts` 及少量测试 / e2e 夹具中；content/background 正式代码已切回 `IOptionsRepository` 主合同。
- 退役路径：待 legacy `OptionsRepository` 测试 / 兼容夹具也完成收敛后，再评估删除 compatibility adapter 本体。
- 清理方向：Phase 3 接受前，不启动新的 Options 结构拆分；先收口这条主链定义。

3. **Section 生命周期**

- `render()`：使用传入容器渲染 DOM，仅绑定自身事件。
- `setMessages()`：接收最新文案，更新静态文本。
- `applySnapshot()` / `collectChanges()`：由 `FormSectionRegistry` 驱动，与 `OptionsController` 结合支持自动保存。
- `destroy()`：释放事件和子组件，放入 `registerCleanup()` 的回调会在页面卸载或热重启时执行。

4. **Helper/Controller**

- 诸如 `DomainMappingsController`、`YamlConfigTable` 必须实现 `render()` / `collect()` / `destroy()`，并在 Section 的 `destroy()` 中统一释放。

---

## 3. 开发规范速查

- **新增 Section**
  1. 继承 `BaseSection`，在构造函数中仅保存容器。
  2. 在 `render()` 中渲染结构并调用 `registerFormIntegration()` 注册到 `FormSectionRegistry`。
  3. 通过 `markPendingAutoSave(sectionId)` + `getOptionsController()?.scheduleAutoSave()` 触发自动保存。
  4. 使用 `this.messages` 设置静态文案；新增键需写入 `src/options/components/messages.ts` 并更新 `_locales`。
  5. 补充单测 `tests/unit/options/sections/<Section>.test.ts`，验证 `render/applySnapshot/collectChanges`。

- **多语言适配**
  - 文案统一由 `setMessages()` 或 `data-i18n` 驱动，参照 `docs/options-multilingual-adaptation-guide.md` 进行整改。
  - 切勿在 Section 内直接写死字符串或手动读取 `_locales`。

- **运行时清理**
  - 若创建了额外的定时器或全局事件，需使用 `registerCleanup()` 或 Section `destroy()` 手动释放。
  - 禁止绕过 `bootstrap.ts` 直接实例化 `OptionsController`、`FormSectionRegistry`。

---

## 4. 样式与命名约束（2025-11 更新）

- **唯一样式入口**：Options 页主要依赖 `src/options/stitch/styles/stitch.css` 与 `src/options/stitch/styles/variants/stitch-secondary.css` 的构建产物；`src/options/styles/*` legacy 样式链路已删除。
- **命名统一**：所有 DOM、控件、弹窗必须使用 `.aobx-*` 前缀（如 `.aobx-section__header`、`.aobx-btn`、`.aobx-input`、`.aobx-modal`）。新增功能严禁引入 `.aob-*` 类名。
- **CSS 编写准则**：
  - 正式 Options 与 content runtime 样式优先落在 Stitch schema / renderer / `stitch/styles/stitch.css`。
  - 不再新增或恢复模块级 legacy CSS；结构与视觉规则应优先落在 Stitch runtime CSS 或 token 链路。
  - 组件级样式优先靠 Token/Utility（如 `--aobx-space-*`、`.aobx-button-row`），避免复制粘贴局部颜色/间距。
  - 如需实验性样式，请放在局部容器，并在 PR 描述中说明范围与回滚方式。
- **开发流程建议**：
  1. 修改 DOM → 使用统一 helper 输出 `.aobx-*` 类。
  2. 在 Stitch schema / renderer / `stitch/styles/stitch.css` 中补齐对应规则。
  3. 执行 `npm run report:options-legacy && npm run lint:options-css`，确认没有 `.aob-*` 残留且命名符合 `.aobx-*` 规范；如命令输出命中需立刻处理。
  4. 运行 `npm run test:unit` 或必要的 UI 回归（可配合 `npm run build:dev` + `chrome://extensions` 刷新）。
  5. 若需要对照 Legacy → `.aobx-*` 的映射，可参见 `docs/options-css-naming-map.md`。
- **通用 Utility/组件清单**（与 §0.4 对应）：
  - `.aobx-card`: 标准卡片容器（背景、边框、阴影、圆角）。
  - `.aobx-alert`: 提示框，支持 `--info`, `--success`, `--warning`, `--error` 变体。
  - `.aobx-field-group`: 表单字段组容器。
  - `.aobx-table`: 标准表格样式。
  - `.aobx-button-row`: 行内按钮布局工具。
  - `.aobx-chip` / `.aobx-chip-btn`: Tag/Chip 控件样式。
  - **注意**: 尽量复用以上组件，减少手写重复样式，并保持 Stitch schema、renderer 与 CSS 真值一致。
- **历史背景/参考**：此次治理的阶段性记录已归档到 `trash/options-css-*`（Batch1/2/Legacy Removal 等）。如需了解迁移缘由，可查阅历史 PR 或 `trash/options-css-consolidation-guide.md`。
- **验证命令示例**：
  ```bash
  npm run report:options-legacy   # 需返回 “No legacy .aob-* classes detected”
  npm run lint:options-css        # 限定在 Options CSS 的 Stylelint 校验
  npm run test:unit               # 基本回归
  rg -n "aob-" src/options        # 手动确认未引入旧命名
  ```

---

## 5. 测试与工具

- **JSDOM Helper**：在 E2E/单测中使用 `tests/utils/domEnvironment.ts` 的 `withDomEnvironment()` / `createDomEnvironment()`，确保全局对象被正确覆写与还原。
- **WebExtension Mock**：调用 `installChromeMock()`、`installFirefoxMock()`（位于 `tests/utils/browserMocks.ts`）管理 `chrome`/`browser` API Mock；测试结束必须执行 `restore()`。
- **必跑命令**：
  ```bash
  npm run typecheck:tests
  npm run lint
  npm run test:unit
  npm run test:e2e
  ```
- **多语言校验**：若改动文案或 locale，追加执行 `npm run validate:i18n:keys`（若尚未创建，请按照多语言指南补充脚本）。

---

## 6. 常见问题

- **懒加载不起作用**：确认 `MainContent.sectionDefinitions` 中的 `load` 使用动态导入，并检查 `NavigationController` 是否在 `aob:sectionmounted` 事件后绑定监听。
- **自动保存未触发**：确认 Section 改动后调用了 `markPendingAutoSave(sectionId)`，且 `OptionsController` 的 `onSaveSuccess` 钩子没有被异常拦截。
- **文案未更新**：运行 `ensureDeclarativeI18nController()` 后调用 `section.setMessages(messages)`；对于静态模板应检查 `data-i18n` 是否配置正确。
- **暗色模式异常**：确认样式使用共享 Token（`--aobx-color-*` 等），并同时在 `.aobx-theme--dark` 下提供覆盖；禁止写入硬编码色值。
- **Stitch 样式未生效**：确认页面或 runtime surface 是否加载 `stitch.css` 与 `stitch-secondary.css`，并检查是否遗漏对应 schema slot 或 renderer class。

---

## 7. 维护流程与历史参考

- **文档更新责任**：凡是改动 Options DOM、样式、运行时或命令的 PR，作者必须同步更新本 README / 相关指南，并在 PR 模板勾选“文档已更新或无需更新”条目。
- **校验流程**：在提交 PR 前务必运行 `npm run lint`、`npm run lint:options-css`、`npm run report:options-legacy`；必要时附上 `npm run test:unit` 结果截图或日志。
- **定期复查**：Options 模块维护人（默认由当期版本负责人承担）需在每季度迭代结束后检查 README 是否覆盖最新规范，并同步核对 `docs/README.md` 与 `docs/engineering-entrypoints.md`。
- **历史资料**：有关 Batch1/Batch2/Legacy Removal 的阶段总结均已迁移至 `trash/options-css/`，若需追溯决策过程，请参阅 `docs/options-css-full-cleanup-guide.md` 与相关归档文档。
- **沟通渠道**：若发现 README 与实际实现不一致，请在 Issue/看板中 @Options 维护人，并把修复纳入后续文档刷新日志。

---

如有疑问，请先查阅 `docs/development-guidelines.md`、`docs/options-refactor-summary-2025.md` 和 `docs/options-multilingual-adaptation-guide.md`。若仍需帮助，可在团队文档或 Issue 中同步讨论。谢谢配合！
