# Options Module Overview

> 正式 `options` 主线已经收口到 `schema shell + schema runtime + leaf widgets`。这份文档只描述当前正式真值，不再记录已退役的 `BaseSection / FormSectionRegistry / LegacySectionWidget` 主线。

---

## 0. 正式入口

正式页面启动链固定为：

- `src/options/index.ts`
- `src/options/runtimeEntry.ts`
- `src/options/app/bootstrap.ts`
- `src/options/app/productionSchemaShell.ts`

对应职责：

- `index.ts`：薄启动壳，只负责按页面入口动态加载 runtime。
- `runtimeEntry.ts`：准备平台服务与仓库注册，然后启动页面。
- `app/bootstrap.ts`：初始化 i18n、controller、actions、schema shell 挂载。
- `app/productionSchemaShell.ts`：正式 UI 外壳，负责 sidebar、panel/resource routing、scroll sync、widget flush/save。

兼容说明：

- `src/options/bootstrap.ts` 仍保留，但仅用于旧测试或兼容依赖初始化，不属于正式页面主启动链。
- `src/options/components/layout/*`、`src/options/components/sections/*`、`src/options/components/formSections/*` 是兼容/历史测试代码，不再是正式开发入口。

---

## 1. 目录与职责

```text
src/options/
├── app/                # 正式启动、shell、actions、controller
├── schema/             # 正式 settings/resource schema 与文案 descriptor
├── schema-runtime/     # renderer、binding、store、action runtime
├── widgets/            # 正式 leaf widgets
├── components/         # 兼容代码与仍被 leaf widget 复用的局部控制器
├── services/           # persistence / transfer / diagnostics 等服务
├── state/              # optionsStore 与相关 store
├── styles/             # options tailwind 输入与产物
└── utils/              # 辅助工具
```

正式真值路径：

- 页面结构与 IA：`src/options/schema/*`
- 渲染与交互合同：`src/options/schema-runtime/*`
- 复杂设置块：`src/options/widgets/*`
- 页面挂载与保存链：`src/options/app/*`

兼容路径：

- `src/options/components/sections/*`
- `src/options/components/layout/*`
- `src/options/components/formSections/*`

这些兼容路径可以继续存在于仓库中，但不应再承载正式主线功能。

---

## 2. 正式运行时模型

### 2.1 页面组织

- top-level navigation、panel、resource modal/page 全部由 schema registry 决定。
- `createSettingsSchemas()` 与 `createResourceSchemas()` 是正式页面结构真值。
- 资源正文来自 schema/content/message catalog，不再来自 `index.html` 静态正文 DOM。

### 2.2 状态与保存链

- `IOptionsRepository` 是正式主读写/订阅合同。
- `optionsStore` 负责 normalize、缓存与订阅分发。
- `chromeOptionsPersistence` 只是 `OptionsController` 使用的持久化适配器，不再代表另一条 UI 主链。
- widget 改动通过 `runtime.notifyDirty()` 标记脏状态。
- `productionSchemaShell` 会在 autosave、切 panel、打开/关闭 resource 前 flush 当前挂载 widget 的 draft。
- `OptionsController.saveSnapshot()` 是正式保存落点。

### 2.3 Leaf Widget 合同

复杂块通过 widget contract 挂载到 schema 节点：

- `mount(container, props, runtime)`
- `update(props, runtime)`
- `destroy()`
- `collect()`
- `applySnapshot(snapshot)`

规则：

- widget 可以复杂，但必须服从 schema shell 的状态与保存链。
- widget 不得重新定义自己的正式页面导航、正式资源路由或独立主保存逻辑。

### 2.4 Resource Modal / Page

- resource 打开方式由 schema resource 的 `openMode` 决定。
- `Onboarding` 是 standalone page。
- `Support / Suggestions / Contact / Changelog` 是 resource modal。
- `src/options/index.html` 只保留 schema shell 挂载根；不要再把 legacy modal host 或用户可见正文写回 HTML。

### 2.5 Preview Is The Visual Truth

- Stitch Secondary 的正式视觉真值来自 `src/options/preview/*`。
- 冻结后的预览产物位于 `future/options-component-preview/options-preview-stitch-secondary.html`。
- 生产 options / onboarding / resource modal 的验真由以下测试共同保护：
  - `tests/visual/options.stitch-secondary.shell.spec.ts`
  - `tests/visual/preview.runtime.alignment.spec.ts`
  - `tests/visual/preview.task-success.layout.spec.ts`

开发规则：

1. 如果你要调整正式 options / onboarding / resource modal 的视觉结构，先对照 preview。
2. 不要把 preview 当成“灵感来源”；这里它是生产视觉合同。
3. 如果 production 需要偏离 preview，必须先更新 preview truth 和对应 visual guard，再改 production。

---

## 3. 开发入口选择

| 需求                                   | 正式入口                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- |
| 调整 settings IA、group、resource 组织 | `src/options/schema/*`                                                 |
| 修改 schema runtime 行为               | `src/options/schema-runtime/*`                                         |
| 修改复杂设置块交互                     | `src/options/widgets/*`                                                |
| 修改页面启动/挂载/保存链               | `src/options/app/*`                                                    |
| 修改 options 专属复用控制器            | `src/options/components/controls/*`                                    |
| 修改兼容或历史测试夹具                 | `src/options/components/sections/*`、`src/options/components/layout/*` |

决策原则：

1. 简单设置优先做成 schema-native row/field/notice。
2. 复杂局部交互落到 `widgets/*`。
3. 只有在某个控制器被多个正式 widget 复用，且它本身不是页面 owner 时，才考虑放进 `components/controls/*`。
4. 不要在 `components/layout/*` 或 `components/sections/*` 上继续扩展正式功能。

---

## 4. 正式开发规则

### 4.1 必须遵守

- 新 settings 页面组织只能从 `schema/*` 进入。
- 新复杂设置块必须实现 widget contract。
- 正式主线路径中禁止重新引入：
  - `BaseSection`
  - `FormSectionRegistry`
  - `LegacySectionWidget`
- 文案必须通过正式 i18n message key 进入，不要把用户可见整句正文写回 schema 组装层或 HTML。
- 自动保存统一走 schema shell save 链，不要在 widget 内部创建另一条正式主保存逻辑。

### 4.2 允许保留的兼容代码

- 旧 section / layout / form registry 文件可以继续存在于仓库，服务于历史测试或兼容。
- 但这些文件的存在不代表它们是新增功能入口。

### 4.3 Helper 放置规则

- 如果 helper 仍然只服务某个正式 widget，优先放到 `widgets/shared/*`。
- 如果 helper 是稳定的领域组件，优先放到 `src/ui/domains/*`。
- 不要把新的正式 helper 再放回 `components/sections/*`。

---

## 5. 样式与 UI 约束

- Token 真值源：`src/styles/design-tokens.css`
- Options 样式产物：`src/options/styles/tailwind.css`
- 全局 utility 产物：`src/styles/global.tailwind.css`
- DOM 类名继续使用 `.aobx-*`

规则：

- 不新增 `.aob-*` 旧命名
- 不在正式 UI 中回退到旧 section 时代的样式组织
- 新样式优先使用现有 token、Tailwind utility 和 schema/widget 现有类体系

---

## 6. 必跑命令

常规改动：

```bash
npm run quality
npm run verify:preflight
npm run acceptance:stitch-secondary
npm run audit:options-mainline:report
npm run test:unit
```

改动 options 主线时，至少补充：

```bash
npx vitest run tests/unit/options/bootstrap.test.ts \
  tests/unit/options/productionSchemaShell.test.ts \
  tests/unit/options/optionsController.test.ts \
  tests/unit/options/optionsFormAdapter.test.ts
```

如果改了 widget：

```bash
npx vitest run tests/unit/options/nativeLeafWidgets.test.ts
```

如果改了 i18n/schema 文案：

```bash
npm run i18n:lint
npm run validate:i18n:budgets
npx vitest run tests/unit/options/schemaI18nParity.test.ts
```

如果改了 options shell、resource modal、onboarding，或任何 Stitch Secondary 视觉合同：

```bash
npm run preview:freeze-check
npm run visual:test:stitch-secondary
npm run visual:test
```

---

## 7. 常见问题

### 自动保存没有生效

优先检查：

- widget 是否调用了 `runtime.notifyDirty()`
- widget 的 `collect()` 是否返回了正确 draft
- `productionSchemaShell` 的 flush/save 是否覆盖到当前场景
- `OptionsController.saveSnapshot()` 是否被调用

不要再去排查 `markPendingAutoSave(sectionId)` 或 legacy section hook，除非你正在处理兼容测试。

### 导航或 panel 对不上

优先检查：

- `schema/registry.ts` 中的 panel id 与 sidebar item 是否一致
- `productionSchemaShell.ts` 中的 active panel / resource 切换逻辑
- schema view 的 `id`、resource `openMode`、action id 是否匹配

不要再把 `MainContent.sectionDefinitions` 当成正式排查入口。

### Resource modal 内容不对

优先检查：

- `schema/registry.ts` 的 resource schema
- `schema/content.ts` 与 message key
- `index.html` 是否只保留 schema shell 挂载根，而没有回流 legacy modal host 或静态正文

### 文案没有切换

优先检查：

- message key 是否已进入正式 locale
- schema/content descriptor 是否引用了正确 key
- widget `update()` 是否正确处理了 `messages`

---

## 8. 相关文档

- 正式工程入口：[AiiinOB/docs/engineering-entrypoints.md](/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/docs/engineering-entrypoints.md)
- Source of Truth 索引：[AiiinOB/docs/source-of-truth-index.md](/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/docs/source-of-truth-index.md)
- Legacy leaf 退出计划：[AiiinOB/docs/options-legacy-leaf-exit-plan-2026-04-17.md](/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/docs/options-legacy-leaf-exit-plan-2026-04-17.md)
