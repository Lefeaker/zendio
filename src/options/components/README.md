# Options Components Directory

> `src/options/components/` 已不再承载正式 options 页面主线。正式页面结构在 `src/options/schema/*`，正式复杂块在 `src/options/widgets/*`，正式页面挂载在 `src/options/app/productionSchemaShell.ts`。

---

## 0. 这层目录现在的定位

`src/options/components/` 现在只承担三类职责：

1. options 专属、但仍被正式 widget 复用的局部控制器
2. 兼容/历史测试代码
3. 尚未完全迁入 `widgets/shared/*` 或 `src/ui/domains/*` 的局部辅助模块

这意味着：

- 这里不再是正式页面 layout 的 owner
- 这里不再是正式 settings section 的 owner
- 这里不再是正式 form registry 的 owner

---

## 1. 子目录说明

```text
src/options/components/
├── controls/        # 仍被正式 widget 复用的 options 专属控制器
├── infrastructure/  # 局部基础设施与兼容 helper
├── layout/          # legacy 页面布局，仅供兼容/历史测试
├── sections/        # legacy section 与历史 helper，仅供兼容/历史测试
└── formSections/    # legacy FormSectionRegistry，仅供兼容/历史测试
```

### `controls/`

用途：

- 放置仍被正式 widget 复用的 options 专属控制器
- 例如：list editor、连接测试、域名映射控制器、vault 路由控制器

允许：

- 局部表单逻辑
- 局部 DOM 控制
- 不拥有页面级路由与主保存链

不允许：

- 重新成为页面 owner
- 直接定义正式 sidebar/panel/resource 结构

### `infrastructure/`

用途：

- 放置局部基础设施或兼容 helper

当前约束：

- 如果某个基础设施只服务 legacy 流程，就保持兼容定位，不要再扩展为正式主线能力
- `ModalController.ts` 不再代表正式 resource modal 组织；正式 resource 的结构与正文以 schema registry 为准

### `layout/`

用途：

- 保留旧 `OptionsApp / MainContent / Sidebar / Navigation` 等布局实现

状态：

- 已降级为 legacy 兼容/历史测试代码
- 不再是正式页面布局入口

### `sections/`

用途：

- 保留旧 `BaseSection` 子类与历史 helper

状态：

- 已降级为 legacy 兼容/历史测试代码
- 不再是新增功能入口

### `formSections/`

用途：

- 保留旧 `FormSectionRegistry`

状态：

- 正式 schema shell 不再依赖它
- 不得再把它重新接回正式主线路径

---

## 2. 现在应该去哪里改代码

| 需求                                     | 正式入口                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 改 settings IA、group、resource          | `src/options/schema/*`                                                                                          |
| 改 schema runtime 渲染/绑定/action       | `src/options/schema-runtime/*`                                                                                  |
| 改复杂设置块交互                         | `src/options/widgets/*`                                                                                         |
| 改正式页面挂载、保存链、resource routing | `src/options/app/*`                                                                                             |
| 改 options 专属复用控制器                | `src/options/components/controls/*`                                                                             |
| 改兼容/历史测试夹具                      | `src/options/components/layout/*`、`src/options/components/sections/*`、`src/options/components/formSections/*` |

明确禁止：

- 不要再把“修改正式页面布局”指向 `components/layout/*`
- 不要再把“新增正式设置模块”指向 `components/sections/*`
- 不要为了追视觉把正式 Stitch Secondary 合同改回 `components/*`

### 2.1 Preview Truth Reminder

- `src/options/preview/*` 是正式 options / onboarding / resource modal 的视觉真值，不是 legacy 目录里的任意组件。
- 如果一个视觉需求来自 `tests/visual/options.stitch-secondary.shell.spec.ts` 或 `npm run acceptance:stitch-secondary`，默认应该去查：
  - `src/options/schema/*`
  - `src/options/app/productionSchemaShell.ts`
  - `src/options/widgets/*`
- 不要通过修改 `components/layout/*` 或 `components/sections/*` 去“补齐” preview 对齐问题。

---

## 3. 正式开发规则

### 3.1 不得新增的东西

在正式主线路径中，不得新增或重新引入：

- `BaseSection`
- `FormSectionRegistry`
- `LegacySectionWidget`
- 基于旧 section 的页面 owner

### 3.2 什么时候可以改 `components/*`

只有以下情况才应该改这里：

- 某个正式 widget 仍复用这里的控制器
- 你在修 legacy 兼容测试
- 你在做兼容清理，把 helper 从 legacy 目录迁出

### 3.3 什么时候应该迁出

如果一个 helper：

- 只被某个正式 widget 使用
- 已经不服务 legacy section

那么优先迁到：

- `src/options/widgets/shared/*`

如果一个 helper：

- 已经成为稳定的领域组件
- 不再局限于 options/components

那么优先迁到：

- `src/ui/domains/*`

---

## 4. 当前目录的真实口径

### 仍可能被正式主线引用的目录

- `controls/`
- `infrastructure/` 中的少量 helper

### 不应再被视为正式入口的目录

- `layout/`
- `sections/`
- `formSections/`

这三类目录即使还存在，也不代表可以继续往里面追加正式功能。

---

## 5. Review Checklist

如果 PR 改到了 `src/options/components/*`，review 时至少检查：

1. 这次改动是不是本来应该落到 `schema/*` 或 `widgets/*`
2. 有没有把正式主线重新引回 `layout/` 或 `sections/`
3. 有没有新增 `BaseSection` / `FormSectionRegistry` 依赖
4. 如果是 helper，是否应该迁到 `widgets/shared/*` 或 `src/ui/domains/*`
5. 如果改到 `ModalController.ts`，是否错误地把它当成正式 resource modal 真值

---

## 6. 相关文档

- 正式 options 模块说明：[AiiinOB/src/options/README.md](/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/src/options/README.md)
- 工程命令与正式入口：[AiiinOB/docs/engineering-entrypoints.md](/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/docs/engineering-entrypoints.md)
- Source of Truth 索引：[AiiinOB/docs/source-of-truth-index.md](/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/docs/source-of-truth-index.md)
