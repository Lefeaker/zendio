# 设计系统实施技术细节补充 | Technical Implementation Details

> **版本**：v1.0
> **更新日期**：2025-11-25
> **关联文档**：`design-system-suggestion-revised.md`

> **重要性**：⚠️ **必读** - 这些细节直接影响实施成败

---

## 📋 目录

1. [DaisyUI 颜色配置陷阱](#1-daisyui-颜色配置陷阱)
2. [Zag.js 响应式问题](#2-zagjs-响应式问题)
3. [Shadow DOM 与 Lucide Icons](#3-shadow-dom-与-lucide-icons)
4. [CSS 变量穿透性确认](#4-css-变量穿透性确认)
5. [构建流程验证](#5-构建流程验证)

---

## 1. DaisyUI 颜色配置陷阱

### ⚠️ 问题描述

在 `tailwind.config.cjs` 中直接写 `hsl(257 86% 63%)` 可能会导致 **Tailwind 的透明度修饰符失效**。

#### 示例：失效的透明度修饰符

```html
<!-- ❌ 可能不生效 -->
<div class="bg-primary/50">半透明背景</div>
<button class="btn btn-primary/80">80% 不透明度</button>
```

#### 原因

Tailwind 需要能够**解析颜色值**来注入透明度变量。直接写完整的 `hsl(...)` 字符串有时会阻断这个解析。

---

### ✅ 解决方案 A：使用 Tailwind 的颜色函数

```javascript
// tailwind.config.cjs
const plugin = require('tailwindcss/plugin');

module.exports = {
  theme: {
    extend: {
      colors: {
        // ✅ 使用分离的 HSL 值（推荐）
        primary: {
          DEFAULT: 'hsl(257 86% 63% / <alpha-value>)',
          hover: 'hsl(257 86% 70% / <alpha-value>)',
        },
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        allinob: {
          // ✅ 方案 1：使用 CSS 变量（支持透明度）
          "primary": "hsl(var(--aobx-primary-h) var(--aobx-primary-s) var(--aobx-primary-l) / <alpha-value>)",
          "base-100": "hsl(var(--aobx-surface-0-h) var(--aobx-surface-0-s) var(--aobx-surface-0-l) / <alpha-value>)",

          // ✅ 方案 2：使用 OKLCH（DaisyUI v4 推荐）
          // "primary": "oklch(0.65 0.25 285)",
          // "base-100": "oklch(0.97 0.01 265)",
        }
      }
    ]
  }
}
```

---

### 🔧 配套的 CSS 变量定义

如果使用方案 1（分离的 HSL 值），需要在 `design-tokens.css` 中定义：

```css
:root {
  /* ========================================
     HSL 分量（支持透明度修饰符）
     ======================================== */

  /* 主色调 */
  --aobx-primary-h: 257;
  --aobx-primary-s: 86%;
  --aobx-primary-l: 63%;
  --aobx-accent: hsl(var(--aobx-primary-h) var(--aobx-primary-s) var(--aobx-primary-l));

  /* 背景 */
  --aobx-surface-0-h: 220;
  --aobx-surface-0-s: 12%;
  --aobx-surface-0-l: 97%;
  --aobx-surface-0: hsl(var(--aobx-surface-0-h) var(--aobx-surface-0-s) var(--aobx-surface-0-l));
}

@media (prefers-color-scheme: dark) {
  :root {
    /* 深色模式只需修改亮度 */
    --aobx-surface-0-l: 11%;
    --aobx-surface-0: hsl(var(--aobx-surface-0-h) var(--aobx-surface-0-s) var(--aobx-surface-0-l));
  }
}
```

---

### 🧪 POC 验证清单

**必须验证**：

```html
<!-- 创建测试页面：tests/visual/daisyui-opacity-test.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>DaisyUI 透明度测试</title>
  <link rel="stylesheet" href="../../src/options/styles/tailwind.css">
</head>
<body class="p-8 bg-base-100">
  <h1 class="text-2xl font-bold mb-4">透明度修饰符测试</h1>

  <!-- 测试各种透明度 -->
  <div class="space-y-4">
    <div class="bg-primary/10 p-4 rounded">10% 主色背景</div>
    <div class="bg-primary/25 p-4 rounded">25% 主色背景</div>
    <div class="bg-primary/50 p-4 rounded">50% 主色背景</div>
    <div class="bg-primary/75 p-4 rounded">75% 主色背景</div>
    <div class="bg-primary p-4 rounded text-white">100% 主色背景</div>
  </div>

  <!-- 测试按钮 -->
  <div class="mt-8 space-x-2">
    <button class="btn btn-primary">默认按钮</button>
    <button class="btn btn-primary/80">80% 不透明度</button>
    <button class="btn btn-primary/60">60% 不透明度</button>
  </div>
</body>
</html>
```

**验证步骤**：

1. 运行 `npm run tailwind:build`
2. 在浏览器中打开测试页面
3. **检查**：每个 div 的背景透明度是否符合预期
4. **使用开发者工具**：检查 `bg-primary/50` 是否被正确编译为带 alpha 通道的颜色值

**预期结果**：

```css
/* ✅ 正确编译 */
.bg-primary\/50 {
  background-color: hsl(257 86% 63% / 0.5);
}

/* ❌ 错误编译（透明度失效） */
.bg-primary\/50 {
  background-color: hsl(257 86% 63%); /* 缺少 alpha 通道 */
}
```

---

### 🎯 推荐方案

**如果 POC 测试透明度修饰符失效**：

1. **首选**：采用分离的 HSL 变量（方案 1）
   - 优点：向后兼容，易于理解
   - 缺点：CSS 变量较多

2. **次选**：迁移到 OKLCH 颜色空间（方案 2）
   - 优点：DaisyUI v4 默认，色彩感知更准确
   - 缺点：学习曲线，需要颜色转换工具

---

## 2. Zag.js 响应式问题

### 🚨 **致命陷阱：焦点丢失 Bug**

**⚠️ 警告**：原始示例代码中存在一个**致命的逻辑错误**，会导致用户无法正常输入。

#### 问题场景

1. 用户在输入框键入 "a"
2. 状态机触发状态更新
3. `subscribe` 回调执行 `updateDOM()`
4. `this.container.innerHTML = ''` 销毁了整个 DOM 树，**包括用户正在输入的 input 元素**
5. 代码重新创建了一个新的 input
6. **结果：焦点丢失，用户无法继续输入 "b"**

---

### ⚠️ 问题描述

原文档的 Zag.js 示例代码有两个问题：
1. **漏掉了状态订阅**（导致 DOM 不更新）
2. **使用 `innerHTML = ''` 清空容器**（导致焦点丢失）

#### 问题根源

Zag.js 是**状态机**。当用户交互（如点击下拉菜单或键入文字）时：
1. 状态机状态改变（`isOpen: true`、`inputValue: "a"`）
2. ⚠️ **原生 DOM 不会自己重绘**
3. 需要手动订阅状态变化并**精确更新 DOM 属性**（不能销毁重建）

---

### ❌ 错误示例 1：缺少状态订阅

```typescript
import * as combobox from '@zag-js/combobox';
import { useMachine, normalizeProps } from '@zag-js/core';

class CustomSelect {
  private machine = combobox.machine({ id: 'select-1' });
  private api = combobox.connect(this.machine.state, this.machine.send, normalizeProps);

  render(): HTMLElement {
    const container = document.createElement('div');

    // ❌ 问题 1：只渲染一次，不会响应状态变化
    container.innerHTML = `
      <label ${this.api.labelProps}>Choose a vault</label>
      <input ${this.api.inputProps} class="input input-bordered" />
      <ul ${this.api.contentProps} class="menu bg-base-200 rounded-box">
        ${this.renderOptions()}
      </ul>
    `;

    return container;
  }
}
```

**问题**：当用户点击输入框，`isOpen` 状态变为 `true`，但下拉菜单不会显示，因为 DOM 没有更新。

---

### ❌ 错误示例 2：使用 innerHTML 销毁元素

```typescript
class ZagCombobox {
  // ...

  private updateDOM() {
    const api = this.currentApi;
    if (!api) return;

    // ❌ 问题 2：致命错误！销毁了用户正在输入的 input 元素
    this.container.innerHTML = '';

    // 重新创建 input（但焦点已经丢失）
    const input = document.createElement('input');
    Object.assign(input, api.getInputProps());
    // ...
  }
}
```

**问题**：每次状态更新都会销毁 input 元素，导致焦点丢失，用户无法连续输入。

---

### ✅ 正确示例（分离 Mount 和 Update）

**核心原则**：将 **"创建 DOM（Mount）"** 和 **"更新 DOM（Update）"** 分离。

```typescript
import * as combobox from '@zag-js/combobox';

interface ComboboxProps {
  id: string;
  label: string;
  options: Array<{ label: string; value: string }>;
  onSelect?: (value: string) => void;
}

class ZagCombobox {
  private container: HTMLElement;
  private machine: any;
  private service: any;
  private currentApi: any;

  // ✅ 保存对关键元素的引用
  private labelEl: HTMLLabelElement;
  private inputEl: HTMLInputElement;
  private triggerEl: HTMLButtonElement;
  private contentEl: HTMLDivElement | null = null;
  private listEl: HTMLUListElement | null = null;

  constructor(private props: ComboboxProps) {
    // ✅ 阶段 A：创建静态 DOM 结构（只执行一次）
    this.initDOM();

    // ✅ 阶段 B：初始化状态机
    this.machine = combobox.machine({
      id: this.props.id,
      collection: combobox.collection({
        items: this.props.options,
      }),
      onValueChange: (details) => {
        this.props.onSelect?.(details.value[0]);
      },
    });

    // ✅ 阶段 C：订阅状态变化
    this.service = this.machine.start();
    this.service.subscribe((state: any) => {
      this.currentApi = combobox.connect(state, this.service.send, (v) => v);
      // ✅ 只更新属性，不销毁元素
      this.updateAttributes();
    });
  }

  // ✅ 阶段 A：创建静态结构（Mount）
  private initDOM() {
    this.container = document.createElement('div');
    this.container.className = 'relative';

    // 创建标签
    this.labelEl = document.createElement('label');
    this.labelEl.className = 'block text-sm font-medium mb-1';

    // 创建输入框（只创建一次，后续只更新属性）
    this.inputEl = document.createElement('input');
    this.inputEl.className = 'input input-bordered w-full pr-10';

    // 创建触发按钮
    this.triggerEl = document.createElement('button');
    this.triggerEl.type = 'button';
    this.triggerEl.className = 'absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm';

    // 组装 DOM 树
    const control = document.createElement('div');
    control.className = 'relative';
    control.appendChild(this.inputEl);
    control.appendChild(this.triggerEl);

    this.container.appendChild(this.labelEl);
    this.container.appendChild(control);
  }

  // ✅ 阶段 C：更新动态属性（Update）
  private updateAttributes() {
    const api = this.currentApi;
    if (!api) return;

    // 1. 更新标签属性
    this.applyProps(this.labelEl, api.getLabelProps());
    this.labelEl.textContent = this.props.label;

    // 2. 更新输入框属性（不销毁元素！）
    this.applyProps(this.inputEl, api.getInputProps());

    // 3. 更新触发按钮
    this.applyProps(this.triggerEl, api.getTriggerProps());
    this.triggerEl.innerHTML = api.isOpen ? '▲' : '▼';

    // 4. 处理下拉菜单的显隐
    if (api.isOpen) {
      if (!this.contentEl) {
        // 第一次打开，创建下拉菜单
        this.createDropdown(api);
      } else {
        // 已存在，只更新内容和高亮状态
        this.updateDropdown(api);
      }
    } else {
      if (this.contentEl) {
        // 关闭时移除下拉菜单
        this.contentEl.remove();
        this.contentEl = null;
        this.listEl = null;
      }
    }
  }

  // ✅ 创建下拉菜单（第一次打开时）
  private createDropdown(api: any) {
    this.contentEl = document.createElement('div');
    this.applyProps(this.contentEl, api.getPositionerProps());
    this.contentEl.className = 'absolute z-10 w-full mt-1';

    this.listEl = document.createElement('ul');
    this.applyProps(this.listEl, api.getContentProps());
    this.listEl.className = 'menu bg-base-200 rounded-box shadow-lg max-h-60 overflow-y-auto';

    // 渲染选项
    this.renderOptions(api);

    this.contentEl.appendChild(this.listEl);
    this.container.appendChild(this.contentEl);
  }

  // ✅ 更新下拉菜单（重新渲染选项，处理高亮）
  private updateDropdown(api: any) {
    if (!this.listEl) return;

    // 清空并重新渲染选项列表
    this.listEl.innerHTML = '';
    this.renderOptions(api);
  }

  // ✅ 渲染选项列表
  private renderOptions(api: any) {
    if (!this.listEl) return;

    this.props.options.forEach((option) => {
      const item = document.createElement('li');
      this.applyProps(item, api.getItemProps({ item: option }));

      const button = document.createElement('button');
      button.textContent = option.label;

      // 高亮当前选中项
      if (api.isItemHighlighted(option)) {
        button.className = 'active';
      }

      item.appendChild(button);
      this.listEl!.appendChild(item);
    });
  }

  // ✅ 辅助函数：将 Zag.js 的 props 对象应用到 HTMLElement
  // ⚡ 性能优化：使用脏检查（Dirty Check）避免不必要的 DOM 操作
  private applyProps(el: HTMLElement, props: any) {
    for (const key in props) {
      if (key === 'children') continue;

      const newValue = props[key];

      // 1. 处理事件监听器（Zag.js 会传递 onClick 等）
      // ⚠️ 注意：事件监听器不做脏检查，因为函数引用可能每次都不同
      if (key.startsWith('on') && typeof newValue === 'function') {
        const eventName = key.slice(2).toLowerCase();
        // TODO: 在生产环境中，可能需要移除旧的监听器再添加新的
        // 但 Zag.js 通常会保持函数引用稳定，所以暂时不处理
        el.addEventListener(eventName, newValue);
        continue;
      }

      // 2. 处理 Boolean 属性（disabled, checked, hidden 等）
      if (typeof newValue === 'boolean') {
        const currentValue = el.hasAttribute(key);
        if (newValue !== currentValue) {  // ✅ 脏检查：只在值改变时更新
          if (newValue) {
            el.setAttribute(key, '');
          } else {
            el.removeAttribute(key);
          }
        }
      }
      // 3. 处理 Properties（value, scrollTop, className 等）
      else if (key in el) {
        const currentValue = (el as any)[key];
        if (currentValue !== newValue) {  // ✅ 脏检查：只在值改变时更新
          (el as any)[key] = newValue;
        }
      }
      // 4. 处理 Attributes（aria-*, id, type, data-* 等）
      else {
        const currentAttr = el.getAttribute(key);
        const newAttr = String(newValue);
        if (currentAttr !== newAttr) {  // ✅ 脏检查：只在值改变时更新
          el.setAttribute(key, newAttr);
        }
      }
    }
  }

  // ✅ 初始渲染
  render(): HTMLElement {
    return this.container;
  }

  // ✅ 清理（组件销毁时调用）
  destroy() {
    this.service?.stop();
  }
}
```

---

### 🧪 POC 验证清单

**必须测试**：

```html
<!-- 创建测试页面：tests/visual/zagjs-combobox-test.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Zag.js Combobox 测试</title>
  <link rel="stylesheet" href="../../src/options/styles/tailwind.css">
</head>
<body class="p-8 bg-base-100">
  <h1 class="text-2xl font-bold mb-4">Zag.js 交互测试</h1>

  <div id="combobox-container"></div>

  <script type="module">
    import { ZagCombobox } from '../../src/ui/ZagCombobox.js';

    const combobox = new ZagCombobox({
      id: 'vault-select',
      label: '选择 Vault',
      options: [
        { label: 'Main Vault', value: 'main' },
        { label: 'Work Vault', value: 'work' },
        { label: 'Personal Vault', value: 'personal' },
      ],
      onSelect: (value) => {
        console.log('Selected:', value);
        alert(`You selected: ${value}`);
      }
    });

    document.getElementById('combobox-container').appendChild(combobox.render());
  </script>
</body>
</html>
```

**验证步骤**：

1. 点击输入框或下拉按钮
2. **检查**：下拉菜单是否显示
3. **🚨 焦点测试（关键）**：在输入框中连续键入 "main"
4. **检查**：是否能够连续输入所有字符，焦点不丢失
5. 使用键盘上下箭头
6. **检查**：高亮选项是否跟随移动
7. 按 Enter 选择
8. **检查**：`onSelect` 回调是否触发
9. 按 Esc 关闭
10. **检查**：下拉菜单是否消失

**⚠️ 如果焦点测试失败**（只能输入一个字符）：
- 检查代码中是否使用了 `innerHTML = ''` 清空容器
- 确认 input 元素是在 `initDOM()` 中创建，而不是在 `updateAttributes()` 中重新创建
- 使用开发者工具检查 input 元素的引用是否在每次状态更新后保持不变

---

### 🎯 最佳实践

1. **仅在复杂组件中使用 Zag.js**：
   - ✅ Combobox、Multi-select、Date Picker
   - ❌ Button、Input、Checkbox（过度工程化）

2. **封装成可复用组件**：
   - 将状态订阅逻辑封装在组件类中
   - 提供清晰的 Props 接口
   - 提供 `destroy()` 方法清理订阅

3. **性能优化**：
   - **分离 Mount 和 Update**：DOM 结构只创建一次，后续只更新属性
   - **脏检查（Dirty Check）**：在 `applyProps()` 中比较新旧值，只在值改变时更新 DOM
   - **避免 `innerHTML`**：不要每次状态变化都使用 `innerHTML` 重绘整个容器
   - **批量更新**：如果需要更新多个属性，考虑使用 `requestAnimationFrame` 批处理
   - **事件监听器管理**：如果函数引用不稳定，需要在添加新监听器前移除旧的（使用 `removeEventListener`）

4. **调试技巧**：
   - 在 `updateAttributes()` 中添加 `console.log`，观察状态变化频率
   - 使用 Chrome DevTools 的 Performance 面板，检测是否有不必要的重排（Reflow）
   - 在开发模式下，可以临时移除脏检查，对比性能差异

---

## 3. Shadow DOM 与 Lucide Icons

### ✅ 确认：文档方案正确

文档中使用的 `icons['Save'].toSvg()` 方法是**正确的**，它直接生成 SVG 字符串，不依赖全局 DOM 查询。

---

### ⚠️ 需要补充：确保颜色跟随

生成的 SVG 必须包含 `stroke="currentColor"`，这样图标颜色才会自动跟随文字颜色。

#### ✅ 完整的图标处理代码

```typescript
// src/options/components/shared/DaisyButton.ts
import { icons } from 'lucide';

export class DaisyButton extends BaseComponent {
  constructor(private props: ButtonProps) {
    super();
  }

  render(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = `btn ${this.getVariantClass()} ${this.getSizeClass()} gap-2`;

    // ✅ 安全且正确的图标处理
    if (this.props.iconName && this.props.iconName in icons) {
      const iconSvg = icons[this.props.iconName].toSvg({
        size: this.getIconSize(),
        class: 'inline-block flex-shrink-0',
        'stroke-width': 2,
        stroke: 'currentColor',  // ✅ 关键：跟随文字颜色
        fill: 'none',             // ✅ 确保是线条图标
      });

      const iconWrapper = document.createElement('span');
      iconWrapper.className = 'inline-flex items-center';
      iconWrapper.innerHTML = iconSvg;
      btn.appendChild(iconWrapper);
    }

    btn.appendChild(document.createTextNode(this.props.label));

    // 无障碍性
    if (this.props.ariaLabel) {
      btn.setAttribute('aria-label', this.props.ariaLabel);
    }

    if (this.props.onClick) {
      this.bind(btn, 'click', this.props.onClick);
    }

    return btn;
  }

  private getIconSize(): number {
    const sizeMap = { sm: 14, md: 16, lg: 18 };
    return sizeMap[this.props.size || 'md'];
  }

  private getVariantClass(): string {
    const variantMap = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      error: 'btn-error'
    };
    return variantMap[this.props.variant || 'primary'];
  }

  private getSizeClass(): string {
    const sizeMap = { sm: 'btn-sm', md: '', lg: 'btn-lg' };
    return sizeMap[this.props.size || 'md'];
  }
}
```

---

### 🧪 POC 验证清单

```html
<!-- 测试页面：tests/visual/lucide-shadow-dom-test.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Lucide Icons Shadow DOM 测试</title>
  <style>
    .test-container {
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .text-primary { color: hsl(257 86% 63%); }
    .text-secondary { color: hsl(220 12% 45%); }
    .text-error { color: hsl(0 65% 65%); }
  </style>
</head>
<body>
  <div class="test-container">
    <h1>Lucide Icons 颜色跟随测试</h1>

    <!-- 测试：图标颜色是否跟随文字颜色 -->
    <div class="text-primary">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
      主色图标（应该是紫色）
    </div>

    <div class="text-secondary">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
      次要色图标（应该是灰色）
    </div>

    <div class="text-error">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
      错误色图标（应该是红色）
    </div>
  </div>

  <!-- Shadow DOM 测试 -->
  <div id="shadow-host"></div>

  <script>
    const host = document.getElementById('shadow-host');
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        .shadow-content { color: hsl(257 86% 63%); padding: 1rem; }
      </style>
      <div class="shadow-content">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        Shadow DOM 中的图标（应该是紫色）
      </div>
    `;
  </script>
</body>
</html>
```

**验证**：所有图标的颜色应该与文字颜色一致。

---

## 4. CSS 变量穿透性确认

### ✅ 确认：架构正确

文档方案（CSS 变量在全局，组件样式通过 `adoptedStyleSheets` 注入）是**完全正确的**。

---

### 📚 技术原理

#### CSS 变量的继承规则

```
宿主页面 :root
  ↓ 继承
Shadow DOM :host
  ↓ 继承
Shadow DOM 内部元素
```

#### Tailwind 类名的隔离规则

```
宿主页面 <head>
  <style> .btn { ... } </style>
    ❌ 不会影响
Shadow DOM
  adoptedStyleSheets
    <style> .btn { ... } </style>  # 独立的样式
```

---

### 🧪 验证示例

```html
<!-- 测试页面：tests/visual/css-vars-penetration-test.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>CSS 变量穿透测试</title>
  <style>
    :root {
      --test-color: hsl(257 86% 63%);
      --test-size: 24px;
    }

    .host-btn {
      color: var(--test-color);
      font-size: var(--test-size);
      padding: 0.5rem 1rem;
      border: 2px solid currentColor;
      border-radius: 0.5rem;
    }
  </style>
</head>
<body class="p-8">
  <h1 class="text-2xl font-bold mb-4">CSS 变量穿透测试</h1>

  <!-- 宿主页面中的按钮 -->
  <button class="host-btn">宿主页面按钮</button>

  <!-- Shadow DOM -->
  <div id="shadow-host"></div>

  <script>
    const host = document.getElementById('shadow-host');
    const shadow = host.attachShadow({ mode: 'open' });

    // 注入样式（使用 CSS 变量）
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(`
      .shadow-btn {
        color: var(--test-color);         /* ✅ 继承自 :root */
        font-size: var(--test-size);      /* ✅ 继承自 :root */
        padding: 0.5rem 1rem;
        border: 2px solid currentColor;
        border-radius: 0.5rem;
        background: transparent;
        cursor: pointer;
      }

      .shadow-btn:hover {
        background: color-mix(in srgb, var(--test-color) 10%, transparent);
      }
    `);

    shadow.adoptedStyleSheets = [styleSheet];

    // 创建按钮
    shadow.innerHTML = `
      <button class="shadow-btn">Shadow DOM 按钮</button>
    `;
  </script>
</body>
</html>
```

**预期结果**：
- ✅ Shadow DOM 中的按钮颜色和大小与宿主页面按钮一致
- ✅ 两个按钮使用相同的 CSS 变量值

---

## 5. 构建流程验证

### ⚠️ 新增 POC 验证项

根据审查意见，需要在**阶段 0（POC 验证）**中增加以下验证项：

---

### 📦 验证：esbuild CSS 字符串加载

#### 问题描述

有时压缩工具会破坏 CSS 里的特殊字符（如 `<alpha-value>` 占位符）。

#### 验证步骤

```javascript
// esbuild.config.js（或 scripts/build.mjs 中）
import { build } from 'esbuild';

// 开发模式
await build({
  entryPoints: ['src/content/index.ts'],
  bundle: true,
  minify: false,  // ⚠️ 开发模式不压缩
  loader: {
    '.css': 'text',  // ✅ 将 CSS 作为字符串导入
  },
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  outdir: 'build/dev',
});

// 生产模式
await build({
  entryPoints: ['src/content/index.ts'],
  bundle: true,
  minify: true,  // ⚠️ 生产模式压缩
  loader: {
    '.css': 'text',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  outdir: 'build/prod',
});
```

---

#### 测试代码

```typescript
// src/content/test-css-import.ts
import tailwindCss from '../styles/generated-tailwind.css?inline';

console.log('=== Dev Mode ===');
console.log('CSS length:', tailwindCss.length);
console.log('Contains <alpha-value>:', tailwindCss.includes('<alpha-value>'));
console.log('Contains color-mix:', tailwindCss.includes('color-mix'));

// 尝试注入到 Shadow DOM
const testHost = document.createElement('div');
const testShadow = testHost.attachShadow({ mode: 'open' });

const sheet = new CSSStyleSheet();
try {
  sheet.replaceSync(tailwindCss);
  testShadow.adoptedStyleSheets = [sheet];
  console.log('✅ CSS 注入成功');
} catch (error) {
  console.error('❌ CSS 注入失败:', error);
}

// 测试样式是否生效
testShadow.innerHTML = `
  <div class="bg-primary/50 p-4 text-white">
    测试透明度修饰符
  </div>
`;
document.body.appendChild(testHost);
```

---

#### 验证清单

**开发模式 vs 生产模式对比**：

| 验证项 | Dev | Prod | 备注 |
|--------|-----|------|------|
| CSS 文件大小 | ~150KB | ~50KB | 压缩后减少 |
| 包含 `<alpha-value>` | ✅ | ✅ | 不应被破坏 |
| 包含 `color-mix` | ✅ | ✅ | 不应被破坏 |
| CSS 注入成功 | ✅ | ✅ | 不应报错 |
| 透明度修饰符生效 | ✅ | ✅ | 视觉检查 |
| 特殊字符未损坏 | ✅ | ✅ | 如 `calc()`、`var()` |

---

### 🔧 常见问题修复

#### 问题 1：`<alpha-value>` 被转义

**症状**：压缩后变成 `&lt;alpha-value&gt;`

**原因**：某些压缩工具错误地转义了尖括号

**解决**：
```javascript
// esbuild.config.js
{
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  // ✅ 禁用 HTML 转义
  charset: 'utf8',
}
```

---

#### 问题 2：CSS 变量被移除

**症状**：`var(--aobx-accent)` 在生产构建中消失

**原因**：PurgeCSS 错误地认为变量未使用

**解决**：
```javascript
// tailwind.config.cjs
{
  content: ['./src/**/*.{ts,html}'],
  safelist: [
    // ✅ 保护 CSS 变量
    { pattern: /^var\(--/ },
  ],
}
```

---

## 📝 更新后的 POC 验证清单

### 阶段 0：POC 验证（1 周）

**任务清单**：

- [ ] **DaisyUI 颜色配置**
  - [ ] 安装 DaisyUI
  - [ ] 配置自定义主题（分离的 HSL 值或 OKLCH）
  - [ ] 测试透明度修饰符（`bg-primary/50`）
  - [ ] 对比颜色与现有设计（误差 < 5%）

- [ ] **Zag.js 交互验证**
  - [ ] 安装 Zag.js 和 `@zag-js/combobox`
  - [ ] 创建测试 Combobox 组件
  - [ ] 验证状态订阅和 DOM 更新
  - [ ] **🚨 焦点测试（关键）**：连续输入多个字符，确认焦点不丢失
  - [ ] 测试键盘导航（上下箭头、Enter、Esc）

- [ ] **Shadow DOM 样式注入**
  - [ ] 验证 `adoptedStyleSheets` 兼容性（Chrome 73+）
  - [ ] 测试 CSS 变量穿透
  - [ ] 测试 Lucide Icons 颜色跟随

- [ ] **构建流程验证**（⭐ 新增）
  - [ ] 配置 esbuild CSS 字符串加载
  - [ ] 对比 dev 和 prod 模式的输出
  - [ ] 验证特殊字符未损坏（`<alpha-value>`、`color-mix`）
  - [ ] 测试压缩后的 CSS 在 Shadow DOM 中正常工作

- [ ] **包体积监控**
  - [ ] 测量基线包体积（~120KB）
  - [ ] 测量引入 DaisyUI + Zag.js + Lucide 后的体积
  - [ ] 确认增量 < 30KB（gzipped）

---

## 🎯 验收标准

**POC 通过条件**（全部满足）：

1. ✅ DaisyUI 透明度修饰符（`/50`、`/75`）正常工作
2. ✅ Zag.js Combobox 支持完整的键盘导航，**且焦点不丢失**
3. ✅ Shadow DOM 中样式隔离且 CSS 变量正确继承
4. ✅ Lucide Icons 颜色自动跟随文字颜色
5. ✅ Dev 和 Prod 构建的 CSS 字符串功能一致
6. ✅ 包体积增加 < 30KB

**如果任何一项不通过**：

- 寻找替代方案（如使用 RGB 颜色代替 HSL）
- 调整构建配置
- 考虑降级策略（如放弃透明度修饰符）

---

## 💡 技术方案推荐

### DaisyUI 颜色方案选择

基于浏览器扩展的特殊需求，**强烈推荐使用方案 1（HSL 分离）**。

#### ✅ 推荐：方案 1 - HSL 分离

**优点**：
- ✅ 浏览器兼容性最佳（支持所有现代浏览器）
- ✅ 心智负担低，开发者容易理解
- ✅ 调试友好，可以直接在开发者工具中看到 HSL 值
- ✅ 与现有的 `--aobx-*` 变量体系一致

**缺点**：
- ❌ CSS 变量数量稍多（每个颜色需要 3 个变量）

**配置示例**：

```css
/* src/options/styles/design-tokens.css */
:root {
  /* 分离的 HSL 值 */
  --aobx-primary-h: 257;
  --aobx-primary-s: 86%;
  --aobx-primary-l: 63%;

  /* 完整颜色（向后兼容） */
  --aobx-accent: hsl(var(--aobx-primary-h) var(--aobx-primary-s) var(--aobx-primary-l));
}
```

```javascript
// tailwind.config.cjs
daisyui: {
  themes: [{
    allinob: {
      "primary": "hsl(var(--aobx-primary-h) var(--aobx-primary-s) var(--aobx-primary-l) / <alpha-value>)",
      // ↑ 支持透明度修饰符
    }
  }]
}
```

---

#### ⚠️ 不推荐：方案 2 - OKLCH

虽然 OKLCH 是 DaisyUI v4 的默认选择，但**不适合浏览器扩展**：

**缺点**：
- ❌ 老版本浏览器兼容性问题（用户可能长期不更新浏览器）
- ❌ 需要颜色转换工具（从 HSL 转换到 OKLCH）
- ❌ 学习曲线陡峭，团队成员需要额外培训
- ❌ 调试困难，开发者工具中显示的值不直观

**何时考虑 OKLCH**：
- 如果项目明确要求支持 Chrome 111+、Firefox 113+ 等最新浏览器
- 如果团队对 OKLCH 颜色空间有深入理解
- 如果需要在感知均匀性上做精细调整

**结论**：对于 All in Ob 项目，**使用 HSL 分离方案**是性价比最高的选择。

---

### esbuild 配置关键点

在 `scripts/build.mjs` 或 esbuild 配置中，**必须**包含以下关键配置：

```javascript
{
  minify: true,
  charset: 'utf8',  // ✅ 防止 <alpha-value> 被转义为 &lt;alpha-value&gt;
  loader: {
    '.css': 'text',  // ✅ 将 CSS 作为字符串导入（用于 Shadow DOM）
  },
}
```

**为什么这很重要**：
- 如果缺少 `charset: 'utf8'`，压缩工具可能会对特殊字符进行 HTML 转义
- 如果缺少 `loader: { '.css': 'text' }`，无法在 Content Scripts 中使用 `adoptedStyleSheets`

---

## 📚 参考资源

### DaisyUI
- [Colors - DaisyUI](https://daisyui.com/docs/colors/)
- [Themes - DaisyUI](https://daisyui.com/docs/themes/)
- [OKLCH Color Space](https://oklch.com/)

### Zag.js
- [Combobox - Zag.js](https://zagjs.com/components/react/combobox)
- [Architecture - Zag.js](https://zagjs.com/overview/architecture)

### Shadow DOM
- [Using shadow DOM - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
- [Constructable Stylesheets](https://web.dev/constructable-stylesheets/)

### Lucide Icons
- [Lucide - Icon library](https://lucide.dev/)
- [Usage - Lucide](https://lucide.dev/guide/installation)

---

**文档版本**：v1.2（性能优化）
**最后更新**：2025-11-26
**维护者**：项目技术团队

**v1.2 更新内容**：
- ⚡ 为 `applyProps()` 添加脏检查（Dirty Check）优化
- ✅ 完善性能优化最佳实践说明
- ✅ 新增调试技巧指导

**v1.1 更新内容**：
- 🚨 修正 Zag.js 致命的焦点丢失 Bug
- ✅ 添加"分离 Mount 和 Update"的正确实现方式
- ✅ 新增 DaisyUI 颜色方案推荐（HSL 分离 vs OKLCH）
- ✅ 强化 esbuild 配置关键点说明
- ✅ 更新 POC 验证清单，增加焦点测试
