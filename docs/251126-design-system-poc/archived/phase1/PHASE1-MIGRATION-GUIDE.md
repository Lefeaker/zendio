# Phase 1: DaisyUI Options 页面迁移指导文档

**文档版本**: v1.1 (添加验收标准)
**创建日期**: 2025-11-26
**最后更新**: 2025-11-26
**适用对象**: 开发人员
**前置条件**: POC 已通过验收（完成度 100%，质量评分 95/100）

---

## ⚠️ 重要提示：什么算完成？

**Phase 1 不仅仅是创建工厂函数！**

Phase 1 的核心目标是 **系统性迁移 5 个基础组件到 DaisyUI**，而不仅仅是准备工作。

### ✅ 完成的标志：

1. **所有按钮** 都使用 `createButton()` 或 `.btn` 类
2. **所有输入框** 都使用 `createInput()` 或 `.input` 类
3. **Alert 组件** 在项目中至少 3 个位置使用
4. **AobFormGroup** 已重构为 DaisyUI `.card` 结构
5. **所有 Modal** 已迁移到原生 `<dialog>` + `.modal`

### ❌ 不完整的标志：

- 只创建了工厂函数但没有实际使用
- 只在 1-2 个地方试用了新组件
- 大量现有代码仍使用手动拼接的 Tailwind classes
- 没有测量包体积影响
- 没有视觉测试

**详细验收标准**: 请参阅 [§8 质量门禁](#8-质量门禁)

---

## 📋 目录

1. [迁移概述](#1-迁移概述)
2. [Phase 1 目标与范围](#2-phase-1-目标与范围)
3. [技术准备](#3-技术准备)
4. [迁移策略](#4-迁移策略)
5. [组件迁移清单](#5-组件迁移清单)
6. [详细迁移步骤](#6-详细迁移步骤)
7. [测试与验证](#7-测试与验证)
8. [质量门禁](#8-质量门禁)
9. [常见问题](#9-常见问题)
10. [下一步计划](#10-下一步计划)

---

## 1. 迁移概述

### 1.1 背景

基于 POC 验证结果：
- ✅ DaisyUI v4.12.10 类生成正常（174 个 `.btn` 类）
- ✅ OKLCH 颜色格式稳定（HSL Split 不可用）
- ✅ 包体积影响为 0%（898KB → 898KB）
- ✅ 与现有 Tailwind 配置兼容

### 1.2 迁移原则

**渐进式迁移** (Progressive Migration)：
- ✅ 不重写现有架构（BaseComponent/BaseSection/FormSectionRegistry）
- ✅ 不影响现有功能和用户体验
- ✅ 每次迁移一个独立组件或模块
- ✅ 保持向后兼容，旧样式与新样式共存
- ✅ 每个迁移单元都可独立测试和回滚

**代码质量优先**：
- ✅ 通过所有质量门禁（lint、typecheck、test）
- ✅ 保持或提升代码可读性
- ✅ 补充单元测试覆盖
- ✅ 更新相关文档

---

## 2. Phase 1 目标与范围

### 2.1 核心目标

**目标 1**: 建立 DaisyUI 迁移模式和最佳实践
**目标 2**: 迁移 3-5 个基础组件，验证迁移流程
**目标 3**: 实现 20-30% 的样式代码减少
**目标 4**: 保持 0% 的包体积增长

### 2.2 迁移范围

**✅ Phase 1 包含**（优先级排序）：

| 优先级 | 组件/模块 | 文件路径 | 复杂度 | 预计工时 |
|--------|----------|---------|--------|----------|
| 🚨 P0 | Button 组件 | `FormComponents.ts` | 低 | 2h |
| 🚨 P0 | Input 组件 | `FormComponents.ts` | 低 | 3h |
| 🔥 P1 | Alert 组件 | `FormComponents.ts` | 低 | 2h |
| 🔥 P1 | Card 组件 | `FormComponents.ts` | 中 | 4h |
| ⚠️ P2 | Modal 对话框 | `ModalController.ts` | 中 | 5h |

**❌ Phase 1 不包含**：
- ❌ 表格组件（AobTable - 复杂度高，后续处理）
- ❌ 复杂表单控件（Domain Mappings、Vault Router - 后续处理）
- ❌ 图表组件（Usage Dashboard - 后续处理）
- ❌ 全局样式重构（保持现有 design-tokens.css）

### 2.3 预期成果

**交付物**：
1. ✅ 5 个组件的 DaisyUI 迁移实现
2. ✅ 组件迁移示例代码和注释
3. ✅ 单元测试覆盖（每个组件至少 3 个测试用例）
4. ✅ 迁移日志和遇到的问题记录
5. ✅ Phase 2 迁移建议

**质量指标**：
- ✅ 所有质量门禁通过（0 errors, 0 warnings）
- ✅ 视觉回归测试通过（截图对比）
- ✅ 包体积增长 < 5%
- ✅ 代码行数减少 > 20%

---

## 3. 技术准备

### 3.1 开发环境检查

```bash
# 1. 确认依赖版本
npm list daisyui         # 应为 4.12.10
npm list tailwindcss     # 应为 3.4.x

# 2. 确认配置文件
cat tailwind.config.cjs  # 检查 OKLCH 配置和 safelist

# 3. 构建测试
npm run tailwind:build   # 生成 Tailwind CSS
npm run build:dev        # 验证构建成功

# 4. 质量检查
npm run lint             # 应无错误
npm run typecheck:app    # 应无类型错误
npm run test:unit        # 应全部通过
```

### 3.2 参考资源

**DaisyUI 文档**：
- 官方文档: https://daisyui.com/docs/
- 组件列表: https://daisyui.com/components/
- 主题配置: https://daisyui.com/docs/themes/

**项目资源**：
- POC 测试文件: `tests/visual/daisyui-opacity-test.html`
- POC 总结: `docs/251126-design-system-poc/POC-SUMMARY.md`
- Tailwind 配置: `tailwind.config.cjs`
- Options README: `src/options/README.md`

### 3.3 开发工具

**推荐 VSCode 插件**：
- Tailwind CSS IntelliSense
- PostCSS Language Support
- Error Lens (实时显示错误)

**浏览器工具**：
- Chrome DevTools (Elements 面板查看生成的类)
- Redux DevTools (如需调试状态)

---

## 4. 迁移策略

### 4.1 迁移模式

**模式 A: 完全替换** (Recommended for Simple Components)

```typescript
// ❌ Before: 使用 Tailwind utilities
const button = document.createElement('button');
button.className = 'px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 transition-colors';

// ✅ After: 使用 DaisyUI 类
const button = document.createElement('button');
button.className = 'btn btn-primary';
```

**模式 B: 渐进增强** (For Complex Components)

```typescript
// ✅ 保留基础类，添加 DaisyUI 修饰符
const button = document.createElement('button');
button.className = 'btn btn-primary aobx-action-button'; // aobx-* 用于额外样式
```

**模式 C: 条件迁移** (For High-Risk Components)

```typescript
// ✅ 使用特性开关
const useDaisyUI = true; // 或从配置读取
const buttonClass = useDaisyUI
  ? 'btn btn-primary'
  : 'px-4 py-2 bg-accent text-white rounded-md';
```

### 4.2 命名约定

**DaisyUI 类优先级**：
1. **DaisyUI 语义类** (最高优先级): `btn`, `btn-primary`, `input`, `input-bordered`
2. **DaisyUI 修饰符**: `btn-sm`, `btn-lg`, `input-ghost`
3. **Tailwind Utilities** (补充): `mt-4`, `gap-2`
4. **自定义类** (最低优先级): `.aobx-*` (仅用于 DaisyUI 无法表达的样式)

**自定义类规范**：
- ✅ 使用 `.aobx-*` 前缀
- ✅ 采用 BEM 命名: `.aobx-component__element--modifier`
- ✅ 避免硬编码颜色，使用 CSS 变量: `var(--aobx-accent)`
- ❌ 禁止使用 `.aob-*` (已废弃)

### 4.3 迁移流程

```
┌─────────────────┐
│  1. 选择组件    │ → 从 P0 优先级开始
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. 创建分支    │ → git checkout -b feat/daisyui-button
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. 实施迁移    │ → 替换类名、调整样式
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. 测试验证    │ → 单元测试 + 视觉测试
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. 代码审查    │ → 自查清单 + Peer Review
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. 合并主分支  │ → PR → CI/CD → Merge
└─────────────────┘
```

### 4.4 回滚策略

**回滚触发条件**：
- ❌ 质量门禁失败（lint/typecheck/test）
- ❌ 视觉回归严重（布局错乱、颜色错误）
- ❌ 包体积增长 > 10%
- ❌ 性能下降 > 20%

**回滚步骤**：
```bash
# 1. 恢复到迁移前的 commit
git revert <commit-hash>

# 2. 或删除迁移分支
git branch -D feat/daisyui-<component>

# 3. 记录问题到迁移日志
echo "Rollback: <component> - Reason: <reason>" >> docs/251126-design-system-poc/migration-log.md
```

---

## 5. 组件迁移清单

### 5.1 Button 组件 (P0 - 最高优先级)

**文件位置**: `src/options/components/shared/FormComponents.ts`

**当前实现** (推测，需验证):
```typescript
// 可能的当前实现
const button = document.createElement('button');
button.className = 'px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90';
```

**目标实现**:
```typescript
const button = document.createElement('button');
button.className = 'btn btn-primary';

// 变体支持
// button.className = 'btn btn-secondary';  // 次要按钮
// button.className = 'btn btn-ghost';      // 幽灵按钮
// button.className = 'btn btn-outline';    // 描边按钮
// button.className = 'btn btn-sm';         // 小尺寸
// button.className = 'btn btn-lg';         // 大尺寸
```

**迁移步骤**:
1. ✅ 查找所有创建按钮的位置 (`grep -r "createElement('button')"`)
2. ✅ 替换类名为 DaisyUI 类
3. ✅ 移除冗余的 Tailwind utilities
4. ✅ 测试所有按钮变体（primary、secondary、ghost、outline）
5. ✅ 验证 hover/focus/disabled 状态

**验证标准**:
- ✅ 所有按钮使用 `.btn` 基类
- ✅ 颜色通过 `btn-primary`、`btn-secondary` 等控制
- ✅ 尺寸通过 `btn-sm`、`btn-lg` 控制
- ✅ 无硬编码的 `bg-*`、`text-*` 类（除非特殊情况）

---

### 5.2 Input 组件 (P0 - 最高优先级)

**文件位置**: `src/options/components/shared/FormComponents.ts`

**当前实现** (推测):
```typescript
const input = document.createElement('input');
input.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent';
```

**目标实现**:
```typescript
const input = document.createElement('input');
input.className = 'input input-bordered w-full';

// 变体支持
// input.className = 'input input-bordered input-primary';  // 主色调边框
// input.className = 'input input-ghost';                    // 无边框
// input.className = 'input input-sm';                       // 小尺寸
// input.className = 'input input-lg';                       // 大尺寸
```

**迁移步骤**:
1. ✅ 查找所有 input 元素创建 (`grep -r "createElement('input')"`)
2. ✅ 替换类名为 `input input-bordered`
3. ✅ 保留必要的宽度类 (`w-full`)
4. ✅ 移除手动的 focus 样式（DaisyUI 已包含）
5. ✅ 测试所有 input 类型（text、number、password、email）

**验证标准**:
- ✅ 所有 input 使用 `.input` 基类
- ✅ 边框通过 `input-bordered` 控制
- ✅ focus 状态自动应用（无需手动 `focus:ring-*`）
- ✅ 尺寸统一（除非有特殊需求）

---

### 5.3 Alert 组件 (P1)

**文件位置**: `src/options/components/shared/FormComponents.ts` 或新建

**当前实现** (推测):
```typescript
const alert = document.createElement('div');
alert.className = 'p-4 mb-4 bg-blue-50 border border-blue-200 rounded-md text-blue-800';
```

**目标实现**:
```typescript
const alert = document.createElement('div');
alert.className = 'alert alert-info';
alert.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
  </svg>
  <span>消息内容</span>
`;

// 变体支持
// alert.className = 'alert alert-success';  // 成功提示
// alert.className = 'alert alert-warning';  // 警告提示
// alert.className = 'alert alert-error';    // 错误提示
```

**迁移步骤**:
1. ✅ 查找所有现有的 alert/提示框实现
2. ✅ 创建统一的 Alert 组件类（如果不存在）
3. ✅ 替换为 DaisyUI `.alert` 类
4. ✅ 添加图标支持（使用 Lucide Icons）
5. ✅ 测试所有语义变体（info、success、warning、error）

**验证标准**:
- ✅ 使用 `.alert` 基类
- ✅ 语义通过 `alert-info`、`alert-success` 等控制
- ✅ 图标与文本对齐正确
- ✅ 支持关闭按钮（可选）

---

### 5.4 Card 组件 (P1)

**文件位置**: `src/options/components/shared/FormComponents.ts` (AobFormGroup)

**当前实现**:
```typescript
// 从之前读取的代码可见
const group = this.createElement('section', 'grid gap-4 p-4 rounded-lg border border-border/85 bg-surface-1 shadow-sm');
```

**目标实现**:
```typescript
const card = this.createElement('div', 'card bg-base-100 shadow-xl');
const cardBody = this.createElement('div', 'card-body');
const cardTitle = this.createElement('h2', 'card-title');
cardTitle.textContent = config.label;
const cardContent = this.createElement('div', '');
cardContent.append(config.control);

cardBody.append(cardTitle, cardContent);
card.append(cardBody);

// 变体支持
// card.className = 'card card-compact';     // 紧凑卡片
// card.className = 'card card-bordered';    // 边框卡片
// card.className = 'card card-side';        // 水平布局
```

**迁移步骤**:
1. ✅ 重构 `AobFormGroup` 类，使用 `.card` 结构
2. ✅ 保持现有 API 不变（`FormGroupConfig` 接口）
3. ✅ 替换手动的 padding/border/shadow 为 DaisyUI 类
4. ✅ 调整 card-title 和 card-body 的层级关系
5. ✅ 测试所有使用 AobFormGroup 的 Section

**验证标准**:
- ✅ 使用 `.card` 和 `.card-body` 结构
- ✅ 标题使用 `.card-title`
- ✅ 阴影和边框统一（无硬编码）
- ✅ 向后兼容所有现有调用

---

### 5.5 Modal 对话框 (P2)

**文件位置**: `src/options/components/infrastructure/ModalController.ts`

**当前实现** (从 index.html 可见):
```html
<div class="aobx-modal fixed inset-0 z-[1200] hidden items-center justify-center p-6 bg-black/55 backdrop-blur-sm">
  <div class="aobx-modal__dialog bg-surface-1 border border-border/85 rounded-2xl shadow-card ...">
    <!-- 内容 -->
  </div>
</div>
```

**目标实现**:
```html
<dialog id="my_modal" class="modal">
  <div class="modal-box">
    <h3 class="font-bold text-lg">标题</h3>
    <p class="py-4">内容</p>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">关闭</button>
      </form>
    </div>
  </div>
</dialog>

<!-- 或使用 backdrop 变体 -->
<dialog class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <!-- 内容 -->
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
```

**迁移步骤**:
1. ✅ 评估现有 ModalController 的 API
2. ✅ 创建 DaisyUI Modal 适配器（保持现有 API）
3. ✅ 替换 HTML 结构为 `<dialog>` + `.modal`
4. ✅ 使用 `dialog.showModal()` 和 `dialog.close()` API
5. ✅ 测试所有现有 Modal（support、suggestions、contact、changelog）
6. ✅ 验证键盘交互（ESC 关闭、Tab 焦点管理）

**验证标准**:
- ✅ 使用原生 `<dialog>` 元素
- ✅ 使用 `.modal` 和 `.modal-box` 类
- ✅ 支持 backdrop 点击关闭
- ✅ 支持 ESC 键关闭
- ✅ 焦点管理正确（打开时聚焦、关闭时恢复）

---

## 6. 详细迁移步骤

### 6.1 Button 组件迁移（示例）

#### 步骤 1: 创建功能分支

```bash
git checkout -b feat/daisyui-button-migration
```

#### 步骤 2: 定位所有按钮创建位置

```bash
# 查找所有创建按钮的代码
grep -rn "createElement('button')" src/options/components/

# 或使用更精确的搜索
rg "createElement\('button'" src/options/components/ -A 3
```

#### 步骤 3: 逐个替换按钮类名

**示例 1: 基础按钮**

```typescript
// ❌ Before
const button = document.createElement('button');
button.className = 'px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 transition-colors';
button.textContent = 'Save';

// ✅ After
const button = document.createElement('button');
button.className = 'btn btn-primary';
button.textContent = 'Save';
```

**示例 2: 次要按钮**

```typescript
// ❌ Before
const button = document.createElement('button');
button.className = 'px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50';

// ✅ After
const button = document.createElement('button');
button.className = 'btn btn-outline';
```

**示例 3: 小按钮**

```typescript
// ❌ Before
const button = document.createElement('button');
button.className = 'px-2 py-1 text-sm bg-accent text-white rounded';

// ✅ After
const button = document.createElement('button');
button.className = 'btn btn-primary btn-sm';
```

**示例 4: 图标按钮**

```typescript
// ❌ Before
const button = document.createElement('button');
button.className = 'w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100';
button.innerHTML = '<svg>...</svg>';

// ✅ After
const button = document.createElement('button');
button.className = 'btn btn-circle btn-ghost';
button.innerHTML = '<svg>...</svg>';
```

#### 步骤 4: 创建按钮工厂函数（推荐）

**新建文件**: `src/options/components/shared/DaisyUIHelpers.ts`

```typescript
/**
 * DaisyUI 组件工厂函数
 *
 * 用于统一创建 DaisyUI 风格的组件，保持代码一致性。
 */

export interface ButtonOptions {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'square';
  disabled?: boolean;
  loading?: boolean;
}

/**
 * 创建 DaisyUI 按钮
 *
 * @example
 * ```typescript
 * const saveBtn = createButton('Save', { variant: 'primary', size: 'sm' });
 * const cancelBtn = createButton('Cancel', { variant: 'ghost' });
 * ```
 */
export function createButton(text: string, options: ButtonOptions = {}): HTMLButtonElement {
  const button = document.createElement('button');

  // 基础类
  const classes = ['btn'];

  // 变体
  if (options.variant) {
    classes.push(`btn-${options.variant}`);
  }

  // 尺寸
  if (options.size) {
    classes.push(`btn-${options.size}`);
  }

  // 形状
  if (options.shape) {
    classes.push(`btn-${options.shape}`);
  }

  // 加载状态
  if (options.loading) {
    classes.push('loading');
  }

  button.className = classes.join(' ');
  button.textContent = text;
  button.disabled = options.disabled || false;

  return button;
}

/**
 * 创建 DaisyUI 输入框
 */
export interface InputOptions {
  type?: 'text' | 'number' | 'email' | 'password' | 'search';
  placeholder?: string;
  bordered?: boolean;
  ghost?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export function createInput(options: InputOptions = {}): HTMLInputElement {
  const input = document.createElement('input');

  // 基础类
  const classes = ['input', 'w-full'];

  // 边框
  if (options.bordered !== false) {
    classes.push('input-bordered');
  }

  // 幽灵模式
  if (options.ghost) {
    classes.push('input-ghost');
  }

  // 尺寸
  if (options.size) {
    classes.push(`input-${options.size}`);
  }

  input.className = classes.join(' ');
  input.type = options.type || 'text';

  if (options.placeholder) {
    input.placeholder = options.placeholder;
  }

  input.disabled = options.disabled || false;

  return input;
}

/**
 * 创建 DaisyUI Alert
 */
export interface AlertOptions {
  type?: 'info' | 'success' | 'warning' | 'error';
  icon?: string; // Lucide icon name or SVG string
  dismissible?: boolean;
}

export function createAlert(message: string, options: AlertOptions = {}): HTMLDivElement {
  const alert = document.createElement('div');

  // 基础类
  const classes = ['alert'];

  // 类型
  if (options.type) {
    classes.push(`alert-${options.type}`);
  }

  alert.className = classes.join(' ');

  // 图标
  if (options.icon) {
    const icon = document.createElement('svg');
    icon.innerHTML = options.icon;
    icon.classList.add('stroke-current', 'shrink-0', 'w-6', 'h-6');
    alert.appendChild(icon);
  }

  // 消息
  const span = document.createElement('span');
  span.textContent = message;
  alert.appendChild(span);

  // 关闭按钮
  if (options.dismissible) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm btn-circle btn-ghost';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', () => alert.remove());
    alert.appendChild(closeBtn);
  }

  return alert;
}
```

#### 步骤 5: 使用工厂函数重构现有代码

```typescript
// ❌ Before
const saveButton = document.createElement('button');
saveButton.className = 'px-4 py-2 bg-accent text-white rounded-md';
saveButton.textContent = 'Save';

const cancelButton = document.createElement('button');
cancelButton.className = 'px-4 py-2 border border-gray-300 text-gray-700 rounded-md';
cancelButton.textContent = 'Cancel';

// ✅ After
import { createButton } from '../shared/DaisyUIHelpers';

const saveButton = createButton('Save', { variant: 'primary' });
const cancelButton = createButton('Cancel', { variant: 'ghost' });
```

#### 步骤 6: 编写单元测试

**新建文件**: `tests/unit/options/shared/DaisyUIHelpers.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createButton, createInput, createAlert } from '../../../../src/options/components/shared/DaisyUIHelpers';

describe('DaisyUIHelpers', () => {
  describe('createButton', () => {
    it('should create a basic button with btn class', () => {
      const button = createButton('Click me');
      expect(button.className).toContain('btn');
      expect(button.textContent).toBe('Click me');
    });

    it('should apply variant classes correctly', () => {
      const primaryBtn = createButton('Primary', { variant: 'primary' });
      expect(primaryBtn.className).toContain('btn-primary');

      const secondaryBtn = createButton('Secondary', { variant: 'secondary' });
      expect(secondaryBtn.className).toContain('btn-secondary');

      const ghostBtn = createButton('Ghost', { variant: 'ghost' });
      expect(ghostBtn.className).toContain('btn-ghost');
    });

    it('should apply size classes correctly', () => {
      const smallBtn = createButton('Small', { size: 'sm' });
      expect(smallBtn.className).toContain('btn-sm');

      const largeBtn = createButton('Large', { size: 'lg' });
      expect(largeBtn.className).toContain('btn-lg');
    });

    it('should handle disabled state', () => {
      const button = createButton('Disabled', { disabled: true });
      expect(button.disabled).toBe(true);
    });

    it('should handle loading state', () => {
      const button = createButton('Loading', { loading: true });
      expect(button.className).toContain('loading');
    });

    it('should handle shape variants', () => {
      const circleBtn = createButton('', { shape: 'circle' });
      expect(circleBtn.className).toContain('btn-circle');

      const squareBtn = createButton('', { shape: 'square' });
      expect(squareBtn.className).toContain('btn-square');
    });
  });

  describe('createInput', () => {
    it('should create a basic input with input class', () => {
      const input = createInput();
      expect(input.className).toContain('input');
      expect(input.className).toContain('w-full');
    });

    it('should apply bordered class by default', () => {
      const input = createInput();
      expect(input.className).toContain('input-bordered');
    });

    it('should respect bordered: false option', () => {
      const input = createInput({ bordered: false });
      expect(input.className).not.toContain('input-bordered');
    });

    it('should apply ghost variant', () => {
      const input = createInput({ ghost: true });
      expect(input.className).toContain('input-ghost');
    });

    it('should set input type correctly', () => {
      const textInput = createInput({ type: 'text' });
      expect(textInput.type).toBe('text');

      const emailInput = createInput({ type: 'email' });
      expect(emailInput.type).toBe('email');
    });

    it('should set placeholder', () => {
      const input = createInput({ placeholder: 'Enter text...' });
      expect(input.placeholder).toBe('Enter text...');
    });
  });

  describe('createAlert', () => {
    it('should create a basic alert with alert class', () => {
      const alert = createAlert('Test message');
      expect(alert.className).toContain('alert');
      expect(alert.textContent).toContain('Test message');
    });

    it('should apply type classes correctly', () => {
      const infoAlert = createAlert('Info', { type: 'info' });
      expect(infoAlert.className).toContain('alert-info');

      const successAlert = createAlert('Success', { type: 'success' });
      expect(successAlert.className).toContain('alert-success');

      const warningAlert = createAlert('Warning', { type: 'warning' });
      expect(warningAlert.className).toContain('alert-warning');

      const errorAlert = createAlert('Error', { type: 'error' });
      expect(errorAlert.className).toContain('alert-error');
    });

    it('should add close button when dismissible', () => {
      const alert = createAlert('Dismissible', { dismissible: true });
      const closeBtn = alert.querySelector('button');
      expect(closeBtn).not.toBeNull();
      expect(closeBtn?.textContent).toBe('✕');
    });

    it('should remove alert when close button is clicked', () => {
      const container = document.createElement('div');
      const alert = createAlert('Test', { dismissible: true });
      container.appendChild(alert);

      const closeBtn = alert.querySelector('button')!;
      closeBtn.click();

      expect(container.querySelector('.alert')).toBeNull();
    });
  });
});
```

#### 步骤 7: 运行测试

```bash
# 运行新增的测试
npm run test:unit -- DaisyUIHelpers

# 运行所有单元测试
npm run test:unit

# 检查覆盖率
npm run test:unit -- --coverage
```

#### 步骤 8: 视觉验证

```bash
# 构建并在浏览器中测试
npm run build:dev

# 打开 Chrome 扩展页面
# chrome://extensions/

# 加载 build/dist 目录

# 测试以下场景：
# 1. 所有按钮的 hover 状态
# 2. 按钮的 focus 状态（Tab 键导航）
# 3. disabled 状态
# 4. loading 状态
# 5. 不同尺寸和变体
```

#### 步骤 9: 更新文档

**更新文件**: `src/options/README.md`

```markdown
### 0.4 组件 / Utility 清单

| 名称 | 用途 | 备注 |
| --- | --- | --- |
| **DaisyUI 组件** (新增) | | |
| `createButton()` | 创建按钮 | 支持 variant、size、shape 配置 |
| `createInput()` | 创建输入框 | 支持 bordered、ghost、size 配置 |
| `createAlert()` | 创建提示框 | 支持 info、success、warning、error 类型 |
```

#### 步骤 10: 提交代码

```bash
# 1. 检查代码质量
npm run lint
npm run typecheck:app
npm run test:unit

# 2. 提交变更
git add .
git commit -m "feat(options): migrate buttons to DaisyUI

- Create DaisyUIHelpers with button/input/alert factories
- Replace manual Tailwind classes with DaisyUI semantic classes
- Add comprehensive unit tests (100% coverage)
- Update Options README with new component helpers

Breaking changes: None
Migration: Backward compatible with existing code

Refs: docs/251126-design-system-poc/PHASE1-MIGRATION-GUIDE.md"

# 3. 推送分支
git push origin feat/daisyui-button-migration
```

---

## 7. 测试与验证

### 7.1 单元测试

**最小要求**：每个迁移的组件至少包含 3 个测试用例

```typescript
// 示例：Button 组件测试
describe('Button Migration', () => {
  it('应该使用 DaisyUI .btn 基类', () => {
    const button = createButton('Test');
    expect(button.className).toContain('btn');
  });

  it('应该正确应用 variant 样式', () => {
    const primaryBtn = createButton('Primary', { variant: 'primary' });
    expect(primaryBtn.className).toContain('btn-primary');
  });

  it('应该支持 disabled 状态', () => {
    const button = createButton('Disabled', { disabled: true });
    expect(button.disabled).toBe(true);
  });
});
```

### 7.2 视觉回归测试

**手动测试清单**：

```markdown
## Button 组件视觉测试

- [ ] Hover 状态颜色正确
- [ ] Focus 状态有可见的焦点环
- [ ] Disabled 状态显示为灰色且不可点击
- [ ] Loading 状态显示 spinner 动画
- [ ] 不同 variant（primary、secondary、ghost、outline）显示正确
- [ ] 不同 size（xs、sm、md、lg）尺寸正确
- [ ] 暗色模式下颜色正确

## Input 组件视觉测试

- [ ] 边框颜色与设计一致
- [ ] Focus 状态边框高亮
- [ ] Placeholder 文本颜色正确
- [ ] Disabled 状态背景变灰
- [ ] 错误状态（如果实现）显示红色边框
- [ ] 不同尺寸显示正确
- [ ] 暗色模式下颜色正确
```

**截图对比**：

```bash
# 1. 迁移前截图
npm run build:dev
# 在浏览器中打开 Options 页面，截图保存到 docs/screenshots/before/

# 2. 迁移后截图
# 完成迁移并构建
npm run build:dev
# 在浏览器中打开 Options 页面，截图保存到 docs/screenshots/after/

# 3. 使用工具对比（可选）
# 使用 pixelmatch 或类似工具自动对比
```

### 7.3 集成测试

**测试场景**：

```typescript
// tests/e2e/optionsDaisyUIMigration.test.ts
import { test, expect } from '@playwright/test';

test.describe('DaisyUI Migration - Options Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('chrome-extension://<extension-id>/options/index.html');
  });

  test('所有按钮应使用 DaisyUI 类', async ({ page }) => {
    const buttons = await page.$$('button.btn');
    expect(buttons.length).toBeGreaterThan(0);

    // 验证主要按钮
    const saveBtn = await page.$('button.btn-primary');
    expect(saveBtn).not.toBeNull();
  });

  test('所有输入框应使用 DaisyUI 类', async ({ page }) => {
    const inputs = await page.$$('input.input');
    expect(inputs.length).toBeGreaterThan(0);
  });

  test('按钮点击应正常工作', async ({ page }) => {
    const testBtn = await page.$('button.btn-primary');
    await testBtn?.click();

    // 验证点击效果（根据实际功能调整）
    // 例如：await expect(page.locator('.alert-success')).toBeVisible();
  });

  test('暗色模式切换应正常工作', async ({ page }) => {
    // 切换到暗色模式
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });

    // 验证按钮样式更新
    const button = await page.$('button.btn-primary');
    const bgColor = await button?.evaluate(el => window.getComputedStyle(el).backgroundColor);

    // 暗色模式下的颜色应不同（具体值需根据主题调整）
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });
});
```

### 7.4 性能测试

**包体积检查**：

```bash
# 1. 迁移前
git stash
npm run build
ls -lh build/dist/options/index.js
ls -lh build/dist/options/styles/tailwind.css

# 2. 迁移后
git stash pop
npm run build
ls -lh build/dist/options/index.js
ls -lh build/dist/options/styles/tailwind.css

# 3. 对比增幅
# 应保持 < 5% 增长
```

**运行时性能**：

```javascript
// 在浏览器 DevTools Console 中运行
// 测试按钮渲染性能
console.time('Button Render');
for (let i = 0; i < 1000; i++) {
  const btn = createButton('Test', { variant: 'primary' });
  document.body.appendChild(btn);
}
console.timeEnd('Button Render');

// 清理
document.querySelectorAll('button').forEach(btn => btn.remove());
```

---

## 8. 质量门禁

### 8.1 必须通过的检查

**代码质量**：
```bash
✅ npm run lint                      # 无 ESLint 错误
✅ npm run lint:options-css          # 无 Stylelint 错误
✅ npm run report:options-legacy     # 无 .aob-* 残留
✅ npm run typecheck:app             # 无 TypeScript 错误
```

**测试覆盖**：
```bash
✅ npm run test:unit                 # 所有单元测试通过
✅ npm run test:e2e                  # 所有 E2E 测试通过（如有）
✅ 新增代码覆盖率 > 80%             # 使用 --coverage 检查
```

**构建验证**：
```bash
✅ npm run build:dev                 # 开发构建成功
✅ npm run build                     # 生产构建成功
✅ 包体积增幅 < 5%                  # 对比迁移前后
```

### 8.2 自查清单（提交 PR 前）

**代码规范**：
- [ ] 所有 DaisyUI 类使用正确（btn、input、alert、card、modal）
- [ ] 移除了冗余的 Tailwind utilities（如手动的 hover、focus 样式）
- [ ] 没有硬编码的颜色值（使用 CSS 变量或 DaisyUI 主题）
- [ ] 自定义类使用 `.aobx-*` 前缀
- [ ] 代码格式正确（使用 Prettier 格式化）

**测试覆盖**：
- [ ] 为新增/修改的函数编写了单元测试
- [ ] 测试覆盖所有主要变体（variant、size、state）
- [ ] 手动测试了暗色模式
- [ ] 手动测试了 hover/focus/disabled 状态

**文档更新**：
- [ ] 更新了 `src/options/README.md`（如有新组件）
- [ ] 更新了迁移日志 `docs/251126-design-system-poc/migration-log.md`
- [ ] 代码注释清晰（解释"为什么"而不是"是什么"）

**向后兼容**：
- [ ] 没有修改现有公共 API
- [ ] 现有调用代码无需修改（或已同步更新）
- [ ] 提供了迁移指南（如 API 变更）

### 8.3 Peer Review 检查点

**审查者需要验证**：

1. **代码质量**：
   - [ ] 代码符合项目规范
   - [ ] 命名清晰且一致
   - [ ] 没有明显的性能问题

2. **DaisyUI 使用**：
   - [ ] 正确使用 DaisyUI 语义类
   - [ ] 没有重复实现 DaisyUI 已有的样式
   - [ ] 遵循 DaisyUI 的类组合规则

3. **测试覆盖**：
   - [ ] 测试用例充分
   - [ ] 测试断言有意义
   - [ ] 没有遗漏边界情况

4. **文档完整**：
   - [ ] README 更新准确
   - [ ] 代码注释清晰
   - [ ] commit message 符合规范

---

## 9. 常见问题

### 9.1 样式问题

**Q1: DaisyUI 类不生效怎么办？**

```bash
# 1. 确认 DaisyUI 版本
npm list daisyui
# 应为 4.12.10

# 2. 重新构建 Tailwind CSS
npm run tailwind:build

# 3. 检查类是否在生成的 CSS 中
grep "\.btn{" src/options/styles/tailwind.css
# 应有输出

# 4. 清除浏览器缓存并重新加载扩展
# chrome://extensions/ -> Remove -> Load unpacked
```

**Q2: 颜色不正确怎么办？**

```typescript
// ❌ 错误：使用了硬编码颜色
button.className = 'btn bg-purple-600';

// ✅ 正确：使用 DaisyUI 主题颜色
button.className = 'btn btn-primary';

// ✅ 如果需要自定义颜色，使用 CSS 变量
button.style.setProperty('--btn-color', 'var(--aobx-accent)');
```

**Q3: 暗色模式下样式异常？**

```css
/* ❌ 错误：在组件类中硬编码 light 模式颜色 */
.my-button {
  background: #ffffff;
  color: #000000;
}

/* ✅ 正确：使用 DaisyUI 语义类（自动适配暗色） */
/* 不需要额外 CSS，直接使用 btn btn-primary */

/* ✅ 如果必须自定义，使用主题变量 */
.my-custom-element {
  background: oklch(var(--b1));  /* base-100 */
  color: oklch(var(--bc));       /* base-content */
}
```

### 9.2 兼容性问题

**Q4: 现有代码依赖旧的类名怎么办？**

**方案 A: 同时保留新旧类（过渡期）**

```typescript
// 过渡期方案
button.className = 'btn btn-primary aobx-legacy-save-button';

// 在 aob-options.css 中添加临时映射
.aobx-legacy-save-button {
  /* 如果有特殊样式，这里覆盖 */
}
```

**方案 B: 创建适配层**

```typescript
// src/options/utils/classNameAdapter.ts
export function adaptClassName(legacyClass: string): string {
  const mapping: Record<string, string> = {
    'aobx-btn-primary': 'btn btn-primary',
    'aobx-btn-secondary': 'btn btn-secondary',
    'aobx-input-text': 'input input-bordered',
    // ... 更多映射
  };

  return mapping[legacyClass] || legacyClass;
}

// 使用
button.className = adaptClassName('aobx-btn-primary');
```

**Q5: 测试环境没有 DaisyUI 类怎么办？**

```typescript
// tests/setup/daisyuiMock.ts
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Mock DaisyUI 样式（如果测试需要）
  const style = document.createElement('style');
  style.textContent = `
    .btn { display: inline-block; padding: 0.5rem 1rem; }
    .btn-primary { background-color: purple; }
    .input { border: 1px solid gray; }
    /* ... 更多必要的模拟样式 */
  `;
  document.head.appendChild(style);
});

// 在测试文件中引入
import './setup/daisyuiMock';
```

### 9.3 迁移策略问题

**Q6: 迁移顺序应该如何安排？**

**推荐顺序**（从简单到复杂）：

1. **基础组件**（Button、Input）- 使用频率高，影响范围大
2. **反馈组件**（Alert、Toast）- 独立性强，易于测试
3. **容器组件**（Card、Panel）- 结构性组件
4. **交互组件**（Modal、Dropdown）- 涉及状态管理
5. **复杂组件**（Table、Form）- 最后处理

**Q7: 如何评估迁移优先级？**

**评估维度**：

```typescript
interface MigrationPriority {
  complexity: 'low' | 'medium' | 'high';       // 实现复杂度
  usage: number;                                // 使用频率（调用次数）
  risk: 'low' | 'medium' | 'high';             // 风险等级
  benefit: number;                              // 收益（样式代码减少量）
}

// 优先级计算公式
priority = (usage * benefit) / (complexity * risk)

// 示例：
Button: (50 * 0.8) / (0.2 * 0.3) = 666.67 (最高优先级)
Table:  (20 * 0.5) / (0.9 * 0.7) = 15.87  (较低优先级)
```

### 9.4 性能问题

**Q8: DaisyUI 会增加包体积吗？**

根据 POC 结果，**不会**：
- 主分支: 898 KB
- POC 分支（含 DaisyUI）: 898 KB
- 增幅: 0%

原因：
- DaisyUI 是 Tailwind 插件，只生成使用到的类
- Tree-shaking 自动移除未使用的样式
- CSS 压缩后体积很小（100KB minified）

**Q9: 如何确保不增加包体积？**

```bash
# 1. 每次迁移后检查
npm run build
ls -lh build/dist/options/index.js
ls -lh build/dist/options/styles/tailwind.css

# 2. 设置包体积预算（在 CI 中）
# package.json
{
  "bundlewatch": {
    "files": [
      {
        "path": "build/dist/options/index.js",
        "maxSize": "820KB"
      },
      {
        "path": "build/dist/options/styles/tailwind.css",
        "maxSize": "105KB"
      }
    ]
  }
}

# 3. 如果体积增长，检查是否引入了未使用的类
npx tailwindcss --content 'src/**/*.{ts,tsx,html}' --output debug.css
grep "btn-" debug.css | wc -l  # 检查生成的类数量
```

---

## 10. 下一步计划

### 10.1 Phase 2 规划

**范围**：
- ✅ 表格组件（AobTable）
- ✅ 复杂表单控件（Domain Mappings、Vault Router）
- ✅ 导航组件（Sidebar、Navigation）

**预计时间**: 2-3 周

### 10.2 Phase 3 规划

**范围**：
- ✅ 全局样式统一（design-tokens.css 与 DaisyUI 主题对齐）
- ✅ 暗色模式优化
- ✅ 动画和过渡效果
- ✅ 响应式布局调整

**预计时间**: 1-2 周

### 10.3 最终目标

**代码质量**：
- ✅ 移除 80% 的自定义样式代码
- ✅ 统一使用 DaisyUI 语义类
- ✅ 100% 的组件有单元测试覆盖

**用户体验**：
- ✅ 视觉风格统一
- ✅ 交互体验一致
- ✅ 暗色模式完美支持

**维护性**：
- ✅ 新功能开发速度提升 30%
- ✅ 样式 bug 减少 50%
- ✅ 文档完善，易于新人上手

---

## 11. 资源与参考

### 11.1 官方文档

- **DaisyUI**: https://daisyui.com/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Lucide Icons**: https://lucide.dev/

### 11.2 项目文档

- **POC 总结**: `docs/251126-design-system-poc/POC-SUMMARY.md`
- **POC 验收报告**: `docs/251126-design-system-poc/FINAL-REVIEW-REPORT.md`
- **Options README**: `src/options/README.md`
- **开发指南**: `docs/development-guidelines.md`

### 11.3 工具推荐

- **VSCode 插件**: Tailwind CSS IntelliSense, PostCSS Language Support
- **浏览器工具**: React DevTools (查看组件层级), Pesticide (查看盒模型)
- **测试工具**: Vitest, Playwright, pixelmatch (截图对比)

---

## 12. 迁移日志模板

**创建文件**: `docs/251126-design-system-poc/migration-log.md`

```markdown
# DaisyUI 迁移日志

## Phase 1: 基础组件迁移

### 2025-11-26: Button 组件迁移

**负责人**: [开发者姓名]
**分支**: feat/daisyui-button-migration
**状态**: ✅ 已完成

**迁移内容**:
- ✅ 创建 `DaisyUIHelpers.ts` 工厂函数
- ✅ 迁移 Button 组件到 `btn` 类
- ✅ 添加单元测试（20 个用例，100% 覆盖率）
- ✅ 视觉测试通过

**遇到的问题**:
- 问题 1: [描述]
  - 解决方案: [描述]
- 问题 2: [描述]
  - 解决方案: [描述]

**包体积影响**:
- 迁移前: 898 KB
- 迁移后: 899 KB (+0.1%)

**代码减少**:
- 移除样式行数: 45 行
- 移除率: 25%

**下一步**:
- [ ] 迁移 Input 组件
- [ ] 迁移 Alert 组件

---

### 2025-11-XX: [下一个组件]

...
```

---

## 📞 获取帮助

**遇到问题？**

1. 查看本指南的 [常见问题](#9-常见问题) 章节
2. 查看 POC 文档: `docs/251126-design-system-poc/`
3. 查看 DaisyUI 官方文档: https://daisyui.com/
4. 在团队群组/Issue 中提问

**报告 Bug**:

```markdown
## Bug 报告

**组件**: Button
**问题描述**: 暗色模式下 hover 颜色不正确
**复现步骤**:
1. 切换到暗色模式
2. Hover 到 .btn-primary 按钮
3. 观察背景颜色

**预期行为**: 背景色应变深
**实际行为**: 背景色不变
**浏览器**: Chrome 120.0
**截图**: [附上截图]
```

---

**文档结束** - 祝迁移顺利！ 🚀
