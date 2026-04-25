# Options 组件目录说明

> 开发须知：所有 Options/Clipper 样式与组件改动都要先跑完 `docs/options-pre-251120-checklist.md`，并在 PR 中附上 `tmp/tailwind-baseline/` 日志；Tailwind 迁移细节参考 `docs/251126-design-system-poc/archived/tailwind-migration/251120/1-options-style-baseline-validation-guide.md`、`docs/clipper-tailwind-migration-plan.md`。

## 目录结构

```
src/options/components/
├── controls/        # 可复用的业务控制组件
├── sections/        # Options 页面的各个配置区块
├── layout/          # Options 页面布局组件
│   ├── OptionsApp.ts      # 根容器
│   ├── Navigation.ts      # 左侧导航
│   └── MainContent.ts     # 右侧内容区
├── infrastructure/  # Options 专属基础设施与列表编辑器
└── formSections/    # 表单区块管理器
    └── formSectionManager.ts

src/ui/
├── foundation/      # BaseComponent、tokens、icons、a11y、style-host
├── primitives/      # button / input / select / checkbox / dialog / card / table ...
├── patterns/        # section-shell / confirm-flow / form-components ...
├── hosts/           # options / content / shadow
└── domains/         # vault-router / yaml-config / privacy / reading / video / theme
```

## app/ 目录（应用层）

```
src/options/app/
├── bootstrap.ts              # Options 页面启动入口
├── optionsController.ts      # Options 状态管理控制器
├── optionsActions.ts         # 用户操作处理（保存、重置等）
├── i18nContext.ts            # 国际化上下文
└── experimentalShell.ts      # 实验性功能外壳
```

**职责**：

- 协调 layout/ 和 sections/ 的渲染
- 管理全局状态（optionsStore）
- 处理用户操作（保存、重置、导入/导出）

## 如何查找代码？

| 需求                           | 位置                                       |
| ------------------------------ | ------------------------------------------ |
| 修改某个 Section 的 UI         | `src/options/components/sections/`         |
| 添加新的可复用基础组件         | `src/ui/primitives/` 或 `src/ui/patterns/` |
| 修改页面布局（导航、主内容区） | `src/options/components/layout/`           |
| 修改启动逻辑                   | `src/options/app/bootstrap.ts`             |
| 修改保存/重置逻辑              | `src/options/app/optionsActions.ts`        |
| 添加新的配置项                 | `src/shared/types/options.ts`              |

本目录按功能职责划分为以下子目录，便于定位组件类型与依赖：

- `layout/`  
  包含页面框架与导航相关组件，例如 `OptionsApp`、`MainContent`、`Sidebar`、`NavigationController` 等，负责整体布局、Section 挂载和导航高亮。

- `controls/`  
  可在多个 Section 复用的控件与业务控制器，如 `domainMappings.ts`、`vaultRouterController.ts` 等，通常负责具体表单或交互逻辑。

- `sections/`  
  选项页面的具体 Section 组件以及关联的工具文件（例如 `usageDashboard.utils.ts`）。每个 Section 继承 `BaseSection`，封装对应设置区域的渲染与状态处理。

- `infrastructure/`  
  页面级的基础设施模块，目前包含 `ModalController.ts`，用于管理模态框的生命周期。

- `formSections/`  
  表单 Section 统一注册与快照应用的基础设施，例如 `formSectionManager.ts`。

- `src/ui/`
  正式基础 UI 入口，新增业务代码必须优先复用：
  - `src/ui/primitives/*`: button / input / select / checkbox / textarea / toggle / badge / alert / dialog / layout / table / card / radio-group
  - `src/ui/patterns/*`: section-shell / setting-row / form-components / list-editor / confirm-flow
  - `src/ui/domains/*`: vault-router / yaml-config / privacy / reading / video / theme

## DaisyUI 迁移状态

本项目正在进行 DaisyUI 设计系统迁移，详细计划和进度见 `docs/251126-design-system-poc/migration-log.md`。

### 当前统一口径

- 新增基础控件必须优先使用 `src/ui/primitives/*`。
- 新增组合结构必须优先使用 `src/ui/patterns/*`。
- Theme switcher 现位于 `src/ui/domains/theme/ThemeSwitcher.ts`。
- DomainMappings list editor 现位于 `src/options/components/infrastructure/listBuilder.ts`。
- Token 真值源固定为 `src/styles/design-tokens.css`；`src/options/styles/design-tokens.css` 已删除。

### Phase 2 (✅ 已完成)

- ✅ **Stats 组件**: `UsageSection.ts` 已迁移到 DaisyUI `.stats`, `.stat`, `.stat-title`, `.stat-value`（Line 126-172）
- ✅ **Table 组件优化**: YAML config 表格实现已迁移到 `src/ui/domains/yaml-config/*`，继续使用 DaisyUI 主题变量（`bg-base-*`, `border-base-*`, `text-base-content/*`）
- ✅ **包体积影响**: 0% 增长
- ✅ **测试覆盖**: 537/537 通过

### 组件使用指南

**使用基础组件类**（推荐）:

```typescript
import { createOptionsButtonElement } from '../../../ui/primitives/button';
import { createInputElement } from '../../../ui/primitives/input';
import { createCheckboxElement } from '../../../ui/primitives/checkbox';

// 创建按钮
const saveHost = document.createElement('div');
const saveBtn = new DaisyButton(saveHost).render({ label: '保存', variant: 'primary', size: 'sm' });

// 创建输入框
const inputHost = document.createElement('div');
const emailInput = new DaisyInput(inputHost).render({
  type: 'email',
  placeholder: '输入邮箱',
  size: 'sm'
});

// 创建复选框
const checkboxHost = document.createElement('div');
const enabledInput = new DaisyCheckbox(checkboxHost).render({ label: '启用' });
```

**DOM-heavy 场景**（如表格行、对话框 footer）:

```typescript
import { createDaisyButtonElement } from '../shared/DaisyButton';

const saveButton = createDaisyButtonElement({
  label: '保存',
  variant: 'primary',
  size: 'sm'
});
```

### 迁移标记规范

所有 DaisyUI 迁移代码应添加清晰的标记注释：

```typescript
// ✅ Phase 1 DaisyUI migration: 使用 .checkbox 基类
checkbox.className = 'checkbox checkbox-accent w-[18px] h-[18px]';

// ✅ Phase 2 DaisyUI migration: 使用 .stats 容器
const stats = this.createElement('div', 'stats shadow w-full');

// ✅ Phase 2 DaisyUI migration: 使用 DaisyUI 主题变量
header.className = 'bg-base-200 border-b border-base-300';
```

其他单文件（如 `optionsFormAdapter.ts`、`messages.ts`、`sectionRegistry.ts` 等）仍位于根目录，供多个子系统直接引用。无论放置在哪个子目录，DOM 命名都必须使用 `.aobx-*` 前缀，并在提交前执行：

```bash
npm run lint:options-css
npm run report:options-legacy
npm run tailwind:build      # 若改动需要产出 Tailwind utility
```

## 阶段 3 迁移规范（Stage 3 Migration Guidelines）

### 迁移原则

1. **渐进式迁移**：先处理简单 Section，复杂组件按清单延后。
2. **保持功能不变**：迁移前后交互、事件、状态存储完全一致。
3. **统一代码风格**：Daisy 组件调用方式、参数命名、容器写法保持一致。
4. **添加迁移标记**：所有完成迁移的代码行添加 `✅ Stage 3 Week X` 注释。

### 迁移优先级

- **P1（简单）**：只含按钮/输入等基础控件，如 Language、Privacy、Transfer。
- **P2（中等）**：包含业务逻辑或测试组件，如 Rest、Routing、Fragment、Video。
- **P3（复杂）**：自带编辑器或图表，如 Reading、Templates、Classifier、Usage。
- **P4（延后）**：依赖 Zag.js 或重构的组件（YamlConfig 表格、VaultRouter 下拉、路由表编辑器等），挪到 Stage 3 月度 3。

### 迁移步骤（通用流程）

#### Step 1：阅读旧代码

```typescript
// Before
const button = document.createElement('button');
button.className = 'px-4 py-2 bg-accent text-white rounded-md';
button.textContent = 'Save';
button.addEventListener('click', () => this.save());
```

#### Step 2：导入 DaisyUI 组件

```typescript
import { DaisyButton } from '../shared/DaisyButton';
```

#### Step 3：渲染 Daisy 组件

```typescript
// ✅ Stage 3 Week 3: Migrated to DaisyButton
const buttonHost = document.createElement('div');
const saveButton = new DaisyButton(buttonHost);
const saveButtonEl = saveButton.render({
  label: 'Save',
  variant: 'primary',
  size: 'md',
  onClick: () => this.save()
});
container.append(saveButtonEl);
```

#### Step 4：添加迁移标记

```typescript
// ✅ Stage 3 Week 3: Migrated to DaisyButton (AiSection.ts line 123)
```

#### Step 5：测试功能

```bash
# 手动：打开 Options，触发原交互
# 自动：若有对应测试
npm run test:unit -- tests/unit/options/sections/AiSection.test.ts
```

### 代码模板

#### 模板 1：按钮

```typescript
// Before
const button = document.createElement('button');
button.className = 'btn btn-primary btn-sm';
button.textContent = 'Label';
button.addEventListener('click', handler);

// After
import { DaisyButton } from '../shared/DaisyButton';

// ✅ Stage 3 Week X: Migrated to DaisyButton
const btnHost = document.createElement('div');
const btn = new DaisyButton(btnHost);
const buttonEl = btn.render({
  label: 'Label',
  variant: 'primary',
  size: 'sm',
  onClick: handler
});
container.append(buttonEl);
```

#### 模板 2：输入框

```typescript
// Before
const input = document.createElement('input');
input.type = 'text';
input.className = 'input input-bordered w-full';
input.placeholder = 'Enter value';
input.addEventListener('input', (e) => this.handleChange((e.target as HTMLInputElement).value));

// After
import { DaisyInput } from '../shared/DaisyInput';

// ✅ Stage 3 Week X: Migrated to DaisyInput
const inputHost = document.createElement('div');
const daisyInput = new DaisyInput(inputHost);
const inputEl = daisyInput.render({
  type: 'text',
  placeholder: 'Enter value',
  variant: 'bordered',
  size: 'md',
  onChange: (value) => this.handleChange(value)
});
container.append(inputEl);
```

#### 模板 3：Alert

```typescript
// Before
const alert = document.createElement('div');
alert.className = 'alert alert-success';
alert.innerHTML = '<span>Success!</span>';

// After
import { DaisyAlert } from '../shared/DaisyAlert';

// ✅ Stage 3 Week X: Migrated to DaisyAlert
const alertHost = document.createElement('div');
const daisyAlert = new DaisyAlert(alertHost);
const alertEl = daisyAlert.render({
  type: 'success',
  message: 'Success!',
  description: 'Operation completed',
  dismissible: true,
  onDismiss: () => console.log('dismissed')
});
container.append(alertEl);
```

#### 模板 4：卡片容器

```typescript
// Before
const card = document.createElement('div');
card.className = 'card bg-base-100 shadow-xl';
const cardBody = document.createElement('div');
cardBody.className = 'card-body';
card.append(cardBody);

// After
import { DaisyCard } from '../../../ui/primitives/card';

// ✅ Stage 3 Week X: Migrated to DaisyCard
const cardHost = document.createElement('div');
const daisyCard = new DaisyCard(cardHost);
const cardEl = daisyCard.render({
  title: 'Card Title',
  body: 'Card content',
  actions: [button1, button2],
  variant: 'normal'
});
container.append(cardEl);
```

### 迁移标记格式

```
// ✅ Stage 3 Week X: Migrated to DaisyButton (File.ts line 120)
// ⏳ Stage 3 Week 3: Pending DaisySelect migration
```

确保注释紧挨着对应代码，`Week X` 取真实周次（Week3/Week4 等），必要时补充文件名与行号。

### 自查清单

- [ ] Daisy 组件是否正确导入？
- [ ] 是否添加 `✅ Stage 3 Week X` 或待迁移标记注释？
- [ ] 是否传入 `variant`、`size`、`onClick`/`onChange` 等关键属性？
- [ ] 事件处理逻辑是否保持不变？
- [ ] 是否完成手动验证？
- [ ] 若有单测，是否更新并通过？
- [ ] 是否清理旧的 DOM 构建代码？

### 常见错误

1. **忘记容器**：`new DaisyButton(null)` 会抛错，先 `document.createElement('div')`。
2. **混用旧新代码**：迁移后应删除 `document.createElement('button')` 旧逻辑。
3. **漏传事件**：若缺少 `onClick`/`onChange`，按钮或输入框将失效。
4. **直接 innerHTML**：不要再拼手写 HTML 字符串，应交给 Daisy 组件生成。
