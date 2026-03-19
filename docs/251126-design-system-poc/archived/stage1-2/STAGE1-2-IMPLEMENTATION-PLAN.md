# 阶段 1-2 实施计划（Design System Completion）

**创建日期**: 2025-11-28
**目标**: 完成建议书 `design-system-suggestion-revised.md` 的阶段 1 和阶段 2 剩余任务
**预计工时**: 24-32 小时（3-4 个工作日）

---

## 📊 当前状态

| 阶段 | 完成度 | 阻塞提交 |
|------|--------|----------|
| 阶段 0：POC | ✅ 100% | 否 |
| **阶段 1：基础组件** | ❌ 0% | **是** |
| **阶段 2：Shadow DOM** | ⚠️ 86% (6/7) | **是** |
| 阶段 3：渐进替换 | - 未规划 | 否 |

---

## 🎯 总体目标

完成以下关键任务，使设计系统达到**可提交状态**：

1. ✅ DaisyUI 主题配置（已有 allinob 主题）
2. ❌ 封装 5 个基础组件（Button, Input, Card, Badge, Alert）
3. ❌ 封装 DaisyDialog 通用组件
4. ❌ 单元测试覆盖（每个组件 ≥ 3 个测试）
5. ❌ Options 页面试点（连接测试区域）
6. ❌ 组件使用文档

---

## 📅 Day 1: 基础组件封装（DaisyButton + DaisyInput）

### 预计工时：6-8 小时

### 任务清单

#### Task 1.1: DaisyButton 组件 ⏱️ 2.5-3h

**文件**: `src/options/components/shared/DaisyButton.ts`

**要求**（建议书 line 330-402）:
- 继承 `BaseComponent<ButtonProps>`
- 支持 3 变体: `primary | secondary | ghost | error`
- 支持 3 尺寸: `sm | md | lg`
- 集成 Lucide Icons（`iconName?: keyof typeof icons`）
- 无障碍性：`ariaLabel`, `disabled`
- 事件绑定：`onClick`

**实现要点**:
```typescript
import { BaseComponent } from './BaseComponent';
import { icons } from 'lucide';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'error';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconName?: keyof typeof icons;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: (e: MouseEvent) => void;
}

export class DaisyButton extends BaseComponent<ButtonProps> {
  constructor(container: HTMLElement, private props: ButtonProps) {
    super(container);
  }

  render(): HTMLElement {
    const btn = this.createElement('button');

    // DaisyUI 类名映射
    const variantClass = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      error: 'btn-error'
    }[this.props.variant || 'primary'];

    const sizeClass = {
      sm: 'btn-sm',
      md: '',
      lg: 'btn-lg'
    }[this.props.size || 'md'];

    btn.className = `btn ${variantClass} ${sizeClass} gap-2`;

    // 图标处理
    if (this.props.iconName) {
      const iconSvg = icons[this.props.iconName].toSvg({
        size: 16,
        class: 'inline-block',
        'stroke-width': 2
      });
      const iconWrapper = document.createElement('span');
      iconWrapper.innerHTML = iconSvg;
      btn.appendChild(iconWrapper);
    }

    btn.appendChild(document.createTextNode(this.props.label));

    // 无障碍性
    if (this.props.ariaLabel) {
      btn.setAttribute('aria-label', this.props.ariaLabel);
    }
    if (this.props.disabled) {
      btn.disabled = true;
    }

    // 事件绑定
    if (this.props.onClick) {
      btn.addEventListener('click', this.props.onClick);
    }

    return btn;
  }
}
```

**验收标准**:
- [ ] 支持 3 × 3 = 9 种变体组合
- [ ] Lucide Icons 正确渲染
- [ ] 无障碍性属性正确设置
- [ ] TypeScript 类型安全

---

#### Task 1.2: DaisyButton 单元测试 ⏱️ 1.5-2h

**文件**: `tests/unit/options/shared/DaisyButton.test.ts`

**测试用例**（建议书 line 734-774）:
1. ✅ 渲染正确的 DaisyUI 类名
2. ✅ 处理 click 事件
3. ✅ 渲染图标（当提供 iconName）
4. ✅ 支持 disabled 状态
5. ✅ 正确设置 aria-label

**实现模板**:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { DaisyButton } from '@/options/components/shared/DaisyButton';

describe('DaisyButton', () => {
  it('should render with correct DaisyUI classes', () => {
    const container = document.createElement('div');
    const button = new DaisyButton(container, {
      label: 'Test',
      variant: 'primary',
      size: 'sm'
    });

    const element = button.render();
    expect(element.className).toContain('btn');
    expect(element.className).toContain('btn-primary');
    expect(element.className).toContain('btn-sm');
  });

  it('should handle click events', () => {
    const container = document.createElement('div');
    const onClick = vi.fn();
    const button = new DaisyButton(container, {
      label: 'Test',
      onClick
    });

    const element = button.render();
    element.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('should render icon when iconName is provided', () => {
    const container = document.createElement('div');
    const button = new DaisyButton(container, {
      label: 'Test',
      iconName: 'Save'
    });

    const element = button.render();
    const icon = element.querySelector('svg');
    expect(icon).toBeTruthy();
  });

  it('should apply disabled state', () => {
    const container = document.createElement('div');
    const button = new DaisyButton(container, {
      label: 'Test',
      disabled: true
    });

    const element = button.render() as HTMLButtonElement;
    expect(element.disabled).toBe(true);
  });

  it('should set aria-label', () => {
    const container = document.createElement('div');
    const button = new DaisyButton(container, {
      label: 'Save',
      ariaLabel: 'Save to vault'
    });

    const element = button.render();
    expect(element.getAttribute('aria-label')).toBe('Save to vault');
  });
});
```

---

#### Task 1.3: DaisyInput 组件 ⏱️ 2-2.5h

**文件**: `src/options/components/shared/DaisyInput.ts`

**要求**:
- 支持类型: `text | password | number | email | url`
- 支持尺寸: `sm | md | lg`
- 支持状态: `normal | bordered | ghost`
- 属性: `placeholder`, `value`, `disabled`, `required`
- 事件: `onChange`, `onBlur`

**实现要点**:
```typescript
import { BaseComponent } from './BaseComponent';

export type InputType = 'text' | 'password' | 'number' | 'email' | 'url';
export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'normal' | 'bordered' | 'ghost';

interface InputProps {
  type?: InputType;
  size?: InputSize;
  variant?: InputVariant;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  onChange?: (value: string, e: Event) => void;
  onBlur?: (value: string, e: Event) => void;
}

export class DaisyInput extends BaseComponent<InputProps> {
  constructor(container: HTMLElement, private props: InputProps) {
    super(container);
  }

  render(): HTMLElement {
    const input = this.createElement('input');

    input.type = this.props.type || 'text';

    const variantClass = {
      normal: 'input',
      bordered: 'input-bordered',
      ghost: 'input-ghost'
    }[this.props.variant || 'bordered'];

    const sizeClass = {
      sm: 'input-sm',
      md: '',
      lg: 'input-lg'
    }[this.props.size || 'md'];

    input.className = `input ${variantClass} ${sizeClass}`;

    if (this.props.placeholder) {
      input.placeholder = this.props.placeholder;
    }
    if (this.props.value) {
      input.value = this.props.value;
    }
    if (this.props.disabled) {
      input.disabled = true;
    }
    if (this.props.required) {
      input.required = true;
    }
    if (this.props.ariaLabel) {
      input.setAttribute('aria-label', this.props.ariaLabel);
    }

    // 事件绑定
    if (this.props.onChange) {
      input.addEventListener('input', (e) => {
        this.props.onChange?.((e.target as HTMLInputElement).value, e);
      });
    }
    if (this.props.onBlur) {
      input.addEventListener('blur', (e) => {
        this.props.onBlur?.((e.target as HTMLInputElement).value, e);
      });
    }

    return input;
  }
}
```

---

#### Task 1.4: DaisyInput 单元测试 ⏱️ 1-1.5h

**文件**: `tests/unit/options/shared/DaisyInput.test.ts`

**测试用例**:
1. ✅ 渲染正确的 DaisyUI 类名
2. ✅ 支持不同 input 类型
3. ✅ 处理 onChange 事件
4. ✅ 处理 onBlur 事件
5. ✅ 支持 disabled 和 required 状态

---

### Day 1 验收标准

- [ ] DaisyButton 组件实现 + 5 个单元测试通过
- [ ] DaisyInput 组件实现 + 5 个单元测试通过
- [ ] TypeScript typecheck 0 errors
- [ ] Lint 0 warnings

---

## 📅 Day 2: 容器组件（DaisyCard + DaisyBadge + DaisyAlert）

### 预计工时：6-8 小时

### 任务清单

#### Task 2.1: DaisyCard 组件 ⏱️ 1.5-2h

**文件**: `src/options/components/shared/DaisyCard.ts`

**要求**:
- 基础容器组件
- 支持变体: `normal | compact | side`
- 支持 `title`, `actions` 插槽
- 可选图片区域

**实现要点**:
```typescript
import { BaseComponent } from './BaseComponent';

export type CardVariant = 'normal' | 'compact' | 'side';

interface CardProps {
  variant?: CardVariant;
  title?: string;
  image?: string;
  body: HTMLElement | string;
  actions?: HTMLElement[];
}

export class DaisyCard extends BaseComponent<CardProps> {
  constructor(container: HTMLElement, private props: CardProps) {
    super(container);
  }

  render(): HTMLElement {
    const card = this.createElement('div');

    const variantClass = {
      normal: 'card',
      compact: 'card-compact',
      side: 'card-side'
    }[this.props.variant || 'normal'];

    card.className = `card bg-base-100 shadow-xl ${variantClass}`;

    if (this.props.image) {
      const figure = this.createElement('figure');
      const img = this.createElement('img');
      img.src = this.props.image;
      img.alt = this.props.title || 'Card image';
      figure.appendChild(img);
      card.appendChild(figure);
    }

    const cardBody = this.createElement('div', 'card-body');

    if (this.props.title) {
      const title = this.createElement('h2', 'card-title');
      title.textContent = this.props.title;
      cardBody.appendChild(title);
    }

    if (typeof this.props.body === 'string') {
      const p = this.createElement('p');
      p.textContent = this.props.body;
      cardBody.appendChild(p);
    } else {
      cardBody.appendChild(this.props.body);
    }

    if (this.props.actions && this.props.actions.length > 0) {
      const actionsDiv = this.createElement('div', 'card-actions justify-end');
      this.props.actions.forEach(action => actionsDiv.appendChild(action));
      cardBody.appendChild(actionsDiv);
    }

    card.appendChild(cardBody);
    return card;
  }
}
```

---

#### Task 2.2: DaisyCard 单元测试 ⏱️ 1-1.5h

**文件**: `tests/unit/options/shared/DaisyCard.test.ts`

**测试用例**:
1. ✅ 渲染基础卡片
2. ✅ 渲染标题和内容
3. ✅ 渲染图片（当提供时）
4. ✅ 渲染 actions
5. ✅ 支持不同变体

---

#### Task 2.3: DaisyBadge 组件 ⏱️ 1-1.5h

**文件**: `src/options/components/shared/DaisyBadge.ts`

**要求**:
- 支持变体: `default | primary | secondary | accent | ghost`
- 支持尺寸: `sm | md | lg`
- 可选前缀图标

**实现要点**:
```typescript
import { BaseComponent } from './BaseComponent';
import { icons } from 'lucide';

export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'accent' | 'ghost';
export type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  iconName?: keyof typeof icons;
}

export class DaisyBadge extends BaseComponent<BadgeProps> {
  constructor(container: HTMLElement, private props: BadgeProps) {
    super(container);
  }

  render(): HTMLElement {
    const badge = this.createElement('span');

    const variantClass = {
      default: '',
      primary: 'badge-primary',
      secondary: 'badge-secondary',
      accent: 'badge-accent',
      ghost: 'badge-ghost'
    }[this.props.variant || 'default'];

    const sizeClass = {
      sm: 'badge-sm',
      md: '',
      lg: 'badge-lg'
    }[this.props.size || 'md'];

    badge.className = `badge ${variantClass} ${sizeClass} gap-1`;

    if (this.props.iconName) {
      const iconSvg = icons[this.props.iconName].toSvg({
        size: 12,
        class: 'inline-block',
        'stroke-width': 2
      });
      const iconWrapper = document.createElement('span');
      iconWrapper.innerHTML = iconSvg;
      badge.appendChild(iconWrapper);
    }

    badge.appendChild(document.createTextNode(this.props.label));
    return badge;
  }
}
```

---

#### Task 2.4: DaisyBadge 单元测试 ⏱️ 0.5-1h

**文件**: `tests/unit/options/shared/DaisyBadge.test.ts`

---

#### Task 2.5: DaisyAlert 组件 ⏱️ 1.5-2h

**文件**: `src/options/components/shared/DaisyAlert.ts`

**要求**:
- 支持类型: `info | success | warning | error`
- 可选关闭按钮
- 支持自定义图标

**实现要点**:
```typescript
import { BaseComponent } from './BaseComponent';
import { icons } from 'lucide';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  type: AlertType;
  message: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export class DaisyAlert extends BaseComponent<AlertProps> {
  constructor(container: HTMLElement, private props: AlertProps) {
    super(container);
  }

  render(): HTMLElement {
    const alert = this.createElement('div');

    const typeClass = {
      info: 'alert-info',
      success: 'alert-success',
      warning: 'alert-warning',
      error: 'alert-error'
    }[this.props.type];

    alert.className = `alert ${typeClass}`;

    // 图标映射
    const iconMap = {
      info: 'Info',
      success: 'CheckCircle',
      warning: 'AlertTriangle',
      error: 'XCircle'
    };

    const iconName = iconMap[this.props.type];
    const iconSvg = icons[iconName as keyof typeof icons].toSvg({
      size: 20,
      'stroke-width': 2
    });
    const iconWrapper = document.createElement('span');
    iconWrapper.innerHTML = iconSvg;
    alert.appendChild(iconWrapper);

    const message = this.createElement('span');
    message.textContent = this.props.message;
    alert.appendChild(message);

    if (this.props.dismissible) {
      const closeBtn = this.createElement('button', 'btn btn-sm btn-ghost btn-circle');
      closeBtn.innerHTML = icons.X.toSvg({ size: 16 });
      closeBtn.addEventListener('click', () => {
        this.props.onDismiss?.();
        alert.remove();
      });
      alert.appendChild(closeBtn);
    }

    return alert;
  }
}
```

---

#### Task 2.6: DaisyAlert 单元测试 ⏱️ 1-1.5h

**文件**: `tests/unit/options/shared/DaisyAlert.test.ts`

---

### Day 2 验收标准

- [ ] DaisyCard 组件实现 + 5 个单元测试通过
- [ ] DaisyBadge 组件实现 + 3 个单元测试通过
- [ ] DaisyAlert 组件实现 + 4 个单元测试通过
- [ ] TypeScript typecheck 0 errors
- [ ] 所有单元测试通过（累计 ~20 个测试）

---

## 📅 Day 3: DaisyDialog + Options 页面试点

### 预计工时：6-8 小时

### 任务清单

#### Task 3.1: DaisyDialog 通用组件 ⏱️ 4-5h

**文件**: `src/options/components/shared/DaisyDialog.ts`

**要求**（建议书 line 911）:
- 基于 ClipperDialog 抽象
- 支持 Shadow DOM
- 集成 FocusTrapController
- 支持 DaisyUI 样式

**实现要点**:
```typescript
import { FocusTrapController } from '../../../content/shared/focusTrap';
import { clipperStyleSheetManager } from '../../../content/clipper/shared/styleSheetManager';

export interface DialogProps {
  title: string;
  body: HTMLElement | string;
  footer?: HTMLElement;
  onClose?: () => void;
}

export class DaisyDialog extends HTMLElement {
  private focusTrap: FocusTrapController | null = null;
  private props: DialogProps;

  constructor(props: DialogProps) {
    super();
    this.props = props;
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // 注入样式
    clipperStyleSheetManager.initialize();
    clipperStyleSheetManager.applyTo(this.shadowRoot!);

    this.render();

    // 激活焦点陷阱
    const dialogContent = this.shadowRoot!.querySelector('.modal-box') as HTMLElement;
    if (dialogContent) {
      this.focusTrap = new FocusTrapController(dialogContent, {
        initialFocus: 'button:first-of-type',
        escapeDeactivates: true,
        clickOutsideDeactivates: true,
        onDeactivate: () => this.close()
      });
      this.focusTrap.activate();
    }
  }

  disconnectedCallback() {
    this.focusTrap?.deactivate();
  }

  private render() {
    this.shadowRoot!.innerHTML = `
      <div class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-bold text-lg">${this.props.title}</h3>
          <div class="py-4">
            ${typeof this.props.body === 'string' ? this.props.body : ''}
          </div>
          <div class="modal-action">
            <button class="btn btn-ghost" data-action="close">Close</button>
          </div>
        </div>
      </div>
    `;

    if (typeof this.props.body !== 'string') {
      const bodyContainer = this.shadowRoot!.querySelector('.py-4');
      bodyContainer?.replaceChildren(this.props.body);
    }

    if (this.props.footer) {
      const actionContainer = this.shadowRoot!.querySelector('.modal-action');
      actionContainer?.replaceChildren(this.props.footer);
    }

    // 绑定关闭按钮
    const closeBtn = this.shadowRoot!.querySelector('[data-action="close"]');
    closeBtn?.addEventListener('click', () => this.close());
  }

  private close() {
    this.props.onClose?.();
    this.remove();
  }
}

customElements.define('daisy-dialog', DaisyDialog);
```

---

#### Task 3.2: DaisyDialog 单元测试 ⏱️ 1-1.5h

**文件**: `tests/unit/options/shared/DaisyDialog.test.ts`

**测试用例**:
1. ✅ Shadow DOM 正确创建
2. ✅ 样式正确注入
3. ✅ 焦点陷阱激活
4. ✅ 关闭按钮功能
5. ✅ onClose 回调触发

---

#### Task 3.3: Options 页面试点 ⏱️ 2-3h

**目标**: 在 Options 页面"连接测试"区域使用新组件

**文件**: `src/options/components/sections/RestSection.ts`

**改造任务**:
1. 导入 DaisyButton 替换原有按钮
2. 导入 DaisyAlert 显示测试结果
3. 验证样式正常
4. 验证功能正常

**示例**:
```typescript
import { DaisyButton } from '../shared/DaisyButton';
import { DaisyAlert } from '../shared/DaisyAlert';

// 替换测试按钮
const testButton = new DaisyButton(container, {
  label: 'Test Connection',
  variant: 'primary',
  size: 'sm',
  iconName: 'Wifi',
  onClick: () => this.runConnectionTest()
});

container.appendChild(testButton.render());

// 显示测试结果
const showResult = (success: boolean, message: string) => {
  const alert = new DaisyAlert(resultContainer, {
    type: success ? 'success' : 'error',
    message,
    dismissible: true
  });
  resultContainer.appendChild(alert.render());
};
```

---

### Day 3 验收标准

- [ ] DaisyDialog 组件实现 + 5 个单元测试通过
- [ ] Options 页面"连接测试"区域使用新组件
- [ ] 样式正常，功能正常
- [ ] TypeScript typecheck 0 errors
- [ ] 所有单元测试通过（累计 ~25 个测试）

---

## 📅 Day 4: 文档 + 验收 + 提交准备

### 预计工时：4-6 小时

### 任务清单

#### Task 4.1: 组件使用文档 ⏱️ 2-3h

**文件**: `docs/251126-design-system-poc/COMPONENT-API-REFERENCE.md`

**内容**:
- 每个组件的 API 文档
- 使用示例
- 最佳实践
- 常见问题

**模板**:
```markdown
# 组件 API 参考

## DaisyButton

### 基本用法

\`\`\`typescript
import { DaisyButton } from '@/options/components/shared/DaisyButton';

const button = new DaisyButton(container, {
  label: 'Save',
  variant: 'primary',
  size: 'sm',
  iconName: 'Save',
  onClick: () => console.log('Saved')
});

container.appendChild(button.render());
\`\`\`

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| label | string | - | 按钮文本（必需） |
| variant | ButtonVariant | 'primary' | 变体样式 |
| size | ButtonSize | 'md' | 尺寸 |
| iconName | keyof typeof icons | - | Lucide 图标名称 |
| disabled | boolean | false | 是否禁用 |
| ariaLabel | string | - | 无障碍标签 |
| onClick | (e: MouseEvent) => void | - | 点击事件 |

### 变体

- `primary`: 主要操作（紫色）
- `secondary`: 次要操作
- `ghost`: 轻量按钮
- `error`: 危险操作（红色）

### 尺寸

- `sm`: 小型（高度 32px）
- `md`: 中型（高度 40px）
- `lg`: 大型（高度 48px）

### 最佳实践

1. **使用 ariaLabel**：对于仅图标按钮，必须提供 ariaLabel
2. **避免嵌套点击**：不要在 button 内部嵌套其他可点击元素
3. **状态管理**：disabled 状态时，自动阻止点击事件

### 示例：图标按钮

\`\`\`typescript
const closeButton = new DaisyButton(container, {
  label: '',
  variant: 'ghost',
  size: 'sm',
  iconName: 'X',
  ariaLabel: 'Close dialog'
});
\`\`\`
```

---

#### Task 4.2: 包体积验证 ⏱️ 0.5-1h

**目标**: 验证增加量 < 30KB（建议书 line 899）

```bash
# 构建并测量
npm run build
ls -lh dist/options/index.js
ls -lh dist/options/styles/tailwind.css

# 对比基线
# 目标：总增幅 < 30KB (gzipped)
```

---

#### Task 4.3: 最终质量检查 ⏱️ 1-1.5h

**检查清单**:

```bash
# 1. 单元测试
npm run test:unit
# 期望：~562 tests (537 原有 + 25 新增)

# 2. E2E 测试
npm run test:e2e
# 期望：24/24 通过

# 3. TypeCheck
npm run typecheck
# 期望：0 errors

# 4. Lint
npm run lint:warnings-guard
# 期望：0 warnings

# 5. i18n
npm run i18n:lint
# 期望：100% 覆盖
```

---

#### Task 4.4: 创建阶段 1-2 完成报告 ⏱️ 1h

**文件**: `docs/251126-design-system-poc/STAGE1-2-COMPLETION-REPORT.md`

**内容**:
- 完成度总结
- 质量指标
- 包体积影响
- 遗留问题
- 下一步建议

---

### Day 4 验收标准

- [ ] 组件 API 文档完整
- [ ] 包体积增加 < 30KB
- [ ] 所有测试通过
- [ ] 质量检查通过
- [ ] 完成报告撰写

---

## 🎯 最终验收标准

### P0 - 必需完成

- [ ] ✅ 5 个基础组件实现（Button, Input, Card, Badge, Alert）
- [ ] ✅ 1 个通用组件实现（DaisyDialog）
- [ ] ✅ 单元测试覆盖（≥ 25 个测试，全部通过）
- [ ] ✅ Options 页面试点（连接测试区域）
- [ ] ✅ 组件 API 文档
- [ ] ✅ 包体积 < 30KB 增加
- [ ] ✅ TypeCheck 0 errors
- [ ] ✅ Lint 0 warnings
- [ ] ✅ E2E 测试全通过

### P1 - 推荐完成

- [ ] ⚠️ 视觉回归测试（Playwright）
- [ ] ⚠️ 无障碍性测试（axe-core）
- [ ] ⚠️ 组件 Storybook 演示

---

## 📊 工时分解

| Day | 任务 | 预计工时 | 累计 |
|-----|------|----------|------|
| Day 1 | DaisyButton + DaisyInput | 6-8h | 6-8h |
| Day 2 | DaisyCard + DaisyBadge + DaisyAlert | 6-8h | 12-16h |
| Day 3 | DaisyDialog + Options 试点 | 6-8h | 18-24h |
| Day 4 | 文档 + 验收 + 提交准备 | 4-6h | 22-30h |

**总计**: 22-30 小时（3-4 个工作日）

---

## 🚀 开始执行

### 立即行动（Day 1 - Task 1.1）

1. 创建 `src/options/components/shared/DaisyButton.ts`
2. 实现 DaisyButton 组件
3. 运行 `npm run typecheck` 验证
4. 创建单元测试文件
5. 运行 `npm run test:unit` 验证

---

**计划创建日期**: 2025-11-28
**预计完成日期**: 2025-12-02
**责任人**: 开发团队 + Claude Code
**审核人**: Linus（你）
