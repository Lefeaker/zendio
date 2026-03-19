# 设计系统建议书（修订版）| Design System Suggestion (Revised)

> **版本**：v2.0（修订版）
> **修订日期**：2025-11-25
> **修订原因**：整合审核意见，简化实施路径，补充关键细节

---

## 核心推荐

### "Semantic Tailwind" + "Class-based Components" + "Progressive Enhancement"

鉴于项目使用原生 TypeScript，已有基于 `BaseComponent` 的类系统，且需要保持轻量化：

**推荐方案：DaisyUI（CSS 抽象层）+ Zag.js（复杂组件逻辑层，按需使用）+ 强化现有组件架构**

---

## 1. 技术选型建议（The Stack）

| 模块 | 推荐方案 | 理由 | 包体积影响 |
|------|----------|------|------------|
| **样式架构** | **Tailwind CSS + [DaisyUI](https://daisyui.com/)** | 纯 CSS 插件，将冗长的 Tailwind 工具类封装为语义化类名（`btn btn-primary`），极大简化代码，对原生 JS 拼接 HTML 极其友好 | ~5KB (gzipped) |
| **交互逻辑** | **原生 TS + [Zag.js](https://zagjs.com/)（按需）** | 框架无关的 Headless UI 状态机库，仅用于复杂组件（Combobox、Tabs），确保无障碍性标准 | ~5KB + 2-5KB/组件 |
| **图标系统** | **[Lucide Icons](https://lucide.dev/)** | 风格统一，线条细腻，支持 Tree-shaking，现代 SaaS 标配 | ~1KB/图标（按需） |
| **Shadow DOM 样式** | **Constructable Stylesheets** | 通过 `adoptedStyleSheets` 注入，性能极佳，无样式闪烁 | 0（原生 API） |

**总包体积影响**：预估增加 15-30KB（取决于使用的组件数量）

---

## 2. 核心问题解答（Q&A）

### Q1: 推荐哪种方案？

**推荐：Tailwind 原生语义化组件库（Modified Option D）**

使用 DaisyUI 可以显著简化代码：

```typescript
// ❌ 现有代码（冗长、难以维护）
const button = document.createElement('button');
button.className = 'px-4 py-2 bg-accent text-white rounded-md font-semibold hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent transition-colors';

// ✅ 使用 DaisyUI（语义化、简洁）
const button = document.createElement('button');
button.className = 'btn btn-primary btn-sm';
button.textContent = 'Save to Vault';
```

完美契合现有的 `ListBuilder` 和 `BaseComponent` 模式。

---

### Q2: 如何平衡一致性和速度？

**策略：自底向上的渐进式迁移**

#### 阶段划分

```
阶段 0：POC 验证（1 周）
    ↓
阶段 1：基础组件（2-3 周）
    ↓
阶段 2：Shadow DOM 适配（4-6 周）
    ↓
阶段 3：渐进式替换（3-4 个月）⚠️ 与 Tailwind Stage5-7 协调
```

#### 迁移原则

1. **新功能**：强制使用新组件
2. **旧功能**：修复 bug 时顺手替换
3. **复杂功能**：单独规划，避免大规模重写

---

### Q3: 浏览器扩展 Shadow DOM 的特殊考量

**关键：样式隔离与注入**

#### 构建时配置

```javascript
// esbuild.config.js
{
  loader: {
    '.css': 'text',  // 将 CSS 作为字符串导入
  }
}
```

#### 运行时注入（推荐方式）

```typescript
import tailwindCss from './styles/generated-tailwind.css?inline';

class ClipperDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(tailwindCss);
    this.shadowRoot.adoptedStyleSheets = [sheet]; // ✅ 性能极佳，无 FOUC

    this.render();
  }

  private render() {
    this.shadowRoot.innerHTML = `
      <div class="p-4 bg-surface-1 rounded-lg shadow-lg">
        <h2 class="text-lg font-semibold text-text">Clipper Dialog</h2>
        <button class="btn btn-primary btn-sm mt-2">Save</button>
      </div>
    `;
  }
}
```

#### 注意事项

⚠️ **字体加载**：Shadow DOM 中需要手动加载字体，或在宿主页面的 `<head>` 中预加载
⚠️ **z-index**：确保 Dialog 的 z-index 高于宿主页面元素

---

## 3. 设计令牌（Design Tokens）规范

### 🔧 修订说明

❌ **移除**：不再对齐 Obsidian 的 CSS 变量命名
- **原因**：项目是浏览器扩展，不是 Obsidian 插件，用户不会直接看到 CSS 变量名

✅ **简化**：保持两层变量系统，避免过度复杂

---

### 推荐结构

```css
/* src/options/styles/design-tokens.css */

:root {
  /* ========================================
     颜色系统（Color System）
     ======================================== */

  /* 主色调（Primary/Accent） */
  --aobx-accent: hsl(257 86% 63%);           /* 紫色主色 */
  --aobx-accent-hover: hsl(257 86% 70%);    /* 悬浮状态 */
  --aobx-accent-soft: hsl(257 65% 82%);     /* 柔和变体 */

  /* 背景层级（Surfaces） */
  --aobx-surface-0: hsl(220 12% 97%);       /* 主背景 */
  --aobx-surface-1: hsl(220 12% 95%);       /* 卡片背景 */
  --aobx-surface-2: hsl(220 12% 92%);       /* 浮层背景 */

  /* 边框与分隔（Borders） */
  --aobx-border: hsl(220 12% 86%);          /* 主边框 */
  --aobx-divider: hsl(220 12% 83%);         /* 分隔线 */

  /* 文字颜色（Text） */
  --aobx-text: hsl(220 18% 24%);            /* 主文字 */
  --aobx-text-muted: hsl(220 12% 45%);      /* 次要文字 */
  --aobx-text-strong: hsl(0 0% 100%);       /* 强调文字（深色背景上） */

  /* 状态颜色（Status） */
  --aobx-status-success: #22c55e;
  --aobx-status-warning: #f59e0b;
  --aobx-status-error: #f87171;

  /* ========================================
     间距系统（Spacing）
     ======================================== */

  --aobx-space-0_5: 2px;
  --aobx-space-1: 4px;
  --aobx-space-1_5: 6px;
  --aobx-space-2: 8px;
  --aobx-space-3: 12px;
  --aobx-space-4: 16px;
  --aobx-space-5: 20px;
  --aobx-space-6: 24px;
  --aobx-space-8: 32px;
  --aobx-space-12: 48px;

  /* ========================================
     圆角系统（Border Radius）
     ======================================== */

  --aobx-radius-sm: 8px;
  --aobx-radius-md: 12px;
  --aobx-radius-lg: 18px;

  /* ========================================
     字体系统（Typography）
     ======================================== */

  --aobx-font-ui: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ========================================
   深色模式（Dark Mode）
   ======================================== */

@media (prefers-color-scheme: dark) {
  :root {
    --aobx-surface-0: hsl(220 8% 11%);
    --aobx-surface-1: hsl(220 8% 13%);
    --aobx-surface-2: hsl(220 8% 17%);
    --aobx-border: hsl(220 8% 24%);
    --aobx-divider: hsl(220 8% 28%);
    --aobx-text: hsl(0 0% 92%);
    --aobx-text-muted: hsl(0 0% 65%);
    --aobx-text-strong: hsl(0 0% 98%);
  }
}

/* ========================================
   手动深色模式（Manual Dark Mode）
   ======================================== */

[data-theme="dark"] {
  --aobx-surface-0: hsl(220 8% 11%);
  --aobx-surface-1: hsl(220 8% 13%);
  --aobx-surface-2: hsl(220 8% 17%);
  --aobx-border: hsl(220 8% 24%);
  --aobx-divider: hsl(220 8% 28%);
  --aobx-text: hsl(0 0% 92%);
  --aobx-text-muted: hsl(0 0% 65%);
  --aobx-text-strong: hsl(0 0% 98%);
}
```

---

### DaisyUI 主题配置

⚠️ **关键步骤**：确认 DaisyUI 默认主题与现有设计语言是否冲突

```javascript
// tailwind.config.cjs
module.exports = {
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        allinob: {
          // 将 --aobx-* 变量映射到 DaisyUI 主题
          "primary": "hsl(257 86% 63%)",          // --aobx-accent
          "primary-content": "#ffffff",           // 主色上的文字

          "secondary": "hsl(220 12% 45%)",        // 次要色
          "secondary-content": "#ffffff",

          "accent": "hsl(257 86% 63%)",           // 强调色
          "accent-content": "#ffffff",

          "neutral": "hsl(220 18% 24%)",          // 中性色
          "neutral-content": "#ffffff",

          "base-100": "hsl(220 12% 97%)",         // --aobx-surface-0
          "base-200": "hsl(220 12% 95%)",         // --aobx-surface-1
          "base-300": "hsl(220 12% 92%)",         // --aobx-surface-2
          "base-content": "hsl(220 18% 24%)",     // --aobx-text

          "info": "#3b82f6",
          "success": "#22c55e",                    // --aobx-status-success
          "warning": "#f59e0b",                    // --aobx-status-warning
          "error": "#f87171",                      // --aobx-status-error

          // 圆角配置
          "--rounded-box": "18px",                 // --aobx-radius-lg
          "--rounded-btn": "12px",                 // --aobx-radius-md
          "--rounded-badge": "8px",                // --aobx-radius-sm
        }
      }
    ],
    darkTheme: "allinob",  // 深色模式使用同一主题（通过 CSS 变量切换）
  }
}
```

#### 验证步骤

1. **创建测试页面**：`tests/visual/daisyui-theme-test.html`
2. **对比颜色**：确保 DaisyUI 组件颜色与现有设计一致
3. **测试深色模式**：切换 `data-theme` 属性，验证颜色切换

---

## 4. 组件库架构设计

### 🔧 修订说明

⚠️ **重要变更**：将 `src/ui/` 目录重构标记为**后续优化工作**

- **原因**：避免一次性投入过大，需要与 Tailwind Stage5-7 的收尾计划协调
- **当前阶段**：先在现有目录结构下使用 DaisyUI，逐步封装组件
- **后续阶段**：待 Tailwind 迁移完成后，再考虑目录重构

---

### 当前阶段：渐进式封装（Stage 1-4）

#### 目录结构（暂不重构）

```
src/
├── options/
│   └── components/
│       ├── shared/
│       │   ├── BaseComponent.ts        # 现有基类
│       │   ├── FormComponents.ts       # 现有表单组件
│       │   └── DaisyButton.ts          # ✅ 新增：DaisyUI 封装的按钮
│       └── ...
└── content/
    └── clipper/
        └── components/
            └── DaisyDialog.ts          # ✅ 新增：DaisyUI 封装的对话框
```

#### 组件封装示例（安全的图标处理）

```typescript
// src/options/components/shared/DaisyButton.ts
import { BaseComponent } from './BaseComponent';
import { icons } from 'lucide';  // 使用 Lucide Icons

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'error';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconName?: keyof typeof icons;  // ✅ 类型安全的图标名称
  disabled?: boolean;
  ariaLabel?: string;  // ✅ 无障碍性支持
  onClick?: (e: MouseEvent) => void;
}

export class DaisyButton extends BaseComponent {
  constructor(private props: ButtonProps) {
    super();
  }

  render(): HTMLElement {
    const btn = document.createElement('button');

    // DaisyUI 类名组合
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

    // ✅ 安全的图标处理（使用 Lucide Icons）
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

    // 事件绑定（使用 BaseComponent 的 bind 方法）
    if (this.props.onClick) {
      this.bind(btn, 'click', this.props.onClick);
    }

    return btn;
  }
}
```

#### 使用示例

```typescript
// 在现有组件中使用
import { DaisyButton } from './shared/DaisyButton';

const saveButton = new DaisyButton({
  label: 'Save to Vault',
  variant: 'primary',
  size: 'sm',
  iconName: 'Save',  // Lucide Icons
  ariaLabel: 'Save the current selection to Obsidian vault',
  onClick: () => this.handleSave()
});

container.appendChild(saveButton.render());
```

---

### 后续优化：独立 UI 库（Stage 5-7，与 Tailwind 收尾协调）

⚠️ **前置条件**：
1. Tailwind 迁移基本完成（Stage 1-4）
2. DaisyUI 组件封装稳定（至少 10 个组件）
3. 团队对新架构达成共识

#### 目标目录结构

```
src/
├── ui/                          # ⚠️ 后续创建
│   ├── base/
│   │   ├── Component.ts
│   │   └── EventEmitter.ts
│   ├── tokens/
│   │   └── index.css
│   ├── primitives/              # 原子组件
│   │   ├── button/
│   │   ├── input/
│   │   ├── select/
│   │   └── dialog/
│   └── patterns/                # 复合组件
│       ├── form-group/
│       └── data-table/
└── ...
```

#### 迁移策略

1. **逐步迁移**：每周迁移 2-3 个组件到 `src/ui/`
2. **保持兼容**：在过渡期，旧代码和新代码共存
3. **文档同步**：每迁移一个组件，更新使用文档

---

## 5. 无障碍性（A11y）改进路线

### P0 - 焦点管理（Focus Trap）

**问题**：ClipperDialog 打开时，Tab 键可能跳回宿主页面

**解决方案**：使用 `focus-trap` 库

```bash
npm install focus-trap
```

```typescript
import { createFocusTrap } from 'focus-trap';

class ClipperDialog extends HTMLElement {
  private focusTrap: any;

  connectedCallback() {
    // ... Shadow DOM 设置

    this.focusTrap = createFocusTrap(this.shadowRoot.querySelector('.dialog-content'), {
      initialFocus: '.dialog-content button:first-of-type',
      escapeDeactivates: true,
      clickOutsideDeactivates: true
    });

    this.focusTrap.activate();
  }

  disconnectedCallback() {
    this.focusTrap?.deactivate();
  }
}
```

---

### P1 - 键盘导航

**适用组件**：Select、Combobox、Tabs、Date Picker

**解决方案**：使用 Zag.js（仅用于复杂组件）

```typescript
import * as combobox from '@zag-js/combobox';
import { useMachine, normalizeProps } from '@zag-js/core';

class CustomSelect {
  private machine = combobox.machine({ id: 'select-1' });
  private api = combobox.connect(this.machine.state, this.machine.send, normalizeProps);

  render(): HTMLElement {
    const container = document.createElement('div');

    // 使用 Zag.js 的 API 渲染
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

**何时使用 Zag.js？**

✅ **应该使用**：
- Combobox / Autocomplete
- Multi-select Dropdown
- Complex Dialog（复杂焦点管理）
- Tabs（键盘导航）

❌ **不应该使用**：
- Button（过度工程化）
- Simple Input
- Checkbox / Radio
- Simple Card

---

### P1 - ARIA 标签

**强制要求**：所有仅图标按钮必须有 `aria-label`

```typescript
// ✅ 正确
<button class="btn btn-ghost btn-sm" aria-label="Close dialog">
  <svg>...</svg>
</button>

// ❌ 错误
<button class="btn btn-ghost btn-sm">
  <svg>...</svg>
</button>
```

---

### P2 - 颜色对比度

**要求**：符合 WCAG 2.1 AA 标准（4.5:1 for normal text）

**工具**：
- [Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [axe DevTools](https://www.deque.com/axe/devtools/)

**验证清单**：
- [ ] 主文字 vs 背景（`--aobx-text` vs `--aobx-surface-0`）
- [ ] 次要文字 vs 背景（`--aobx-text-muted` vs `--aobx-surface-0`）
- [ ] 按钮文字 vs 按钮背景
- [ ] 链接文字 vs 背景

---

### P2 - 动画的无障碍性

**要求**：尊重 `prefers-reduced-motion`

```css
/* 在 design-tokens.css 或全局样式中添加 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 6. 深色模式切换实现

### 主题管理器

```typescript
// src/shared/theme/ThemeManager.ts
export type Theme = 'light' | 'dark' | 'auto';

export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: Theme = 'auto';
  private mediaQuery: MediaQueryList;

  private constructor() {
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.loadTheme();
    this.setupListeners();
  }

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  private loadTheme() {
    const stored = localStorage.getItem('aobx-theme') as Theme | null;
    this.currentTheme = stored || 'auto';
    this.applyTheme();
  }

  setTheme(theme: Theme) {
    this.currentTheme = theme;
    localStorage.setItem('aobx-theme', theme);
    this.applyTheme();
  }

  private applyTheme() {
    if (this.currentTheme === 'auto') {
      const isDark = this.mediaQuery.matches;
      document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    } else {
      document.documentElement.dataset.theme = this.currentTheme;
    }
  }

  private setupListeners() {
    this.mediaQuery.addEventListener('change', (e) => {
      if (this.currentTheme === 'auto') {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
      }
    });
  }

  getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  getEffectiveTheme(): 'light' | 'dark' {
    if (this.currentTheme === 'auto') {
      return this.mediaQuery.matches ? 'dark' : 'light';
    }
    return this.currentTheme;
  }
}
```

### 主题切换器组件

```typescript
// 在 Options 页面添加主题切换器
import { ThemeManager } from '../../shared/theme/ThemeManager';

class ThemeToggle {
  render(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'flex gap-2';

    const themeManager = ThemeManager.getInstance();
    const currentTheme = themeManager.getCurrentTheme();

    const themes: Theme[] = ['light', 'dark', 'auto'];
    themes.forEach(theme => {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${currentTheme === theme ? 'btn-primary' : 'btn-ghost'}`;
      btn.textContent = theme === 'auto' ? '🌓' : theme === 'dark' ? '🌙' : '☀️';
      btn.onclick = () => {
        themeManager.setTheme(theme);
        window.location.reload(); // 简单刷新，生产环境可优化
      };
      container.appendChild(btn);
    });

    return container;
  }
}
```

---

## 7. 国际化（i18n）支持

### DaisyUI 组件的本地化

⚠️ **注意**：DaisyUI 大多数组件是纯 CSS，不包含文本，因此不需要额外的 i18n 配置。

**需要本地化的场景**：
- 表单验证消息（需自行实现）
- 日期选择器（如果使用第三方库，需配置语言）

### Zag.js 的 i18n

如果使用 Zag.js 的复杂组件，需要配置 locale：

```typescript
import * as combobox from '@zag-js/combobox';

const machine = combobox.machine({
  id: 'select-1',
  locale: 'zh-CN',  // 设置语言
  translations: {
    triggerLabel: '选择选项',
    clearTriggerLabel: '清除选择',
    // ... 其他翻译
  }
});
```

---

## 8. 测试策略

### 单元测试（Vitest）

```typescript
// tests/unit/shared/DaisyButton.test.ts
import { describe, it, expect } from 'vitest';
import { DaisyButton } from '@/options/components/shared/DaisyButton';

describe('DaisyButton', () => {
  it('should render with correct DaisyUI classes', () => {
    const button = new DaisyButton({
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
    let clicked = false;
    const button = new DaisyButton({
      label: 'Test',
      onClick: () => { clicked = true; }
    });

    const element = button.render();
    element.click();
    expect(clicked).toBe(true);
  });

  it('should render icon when iconName is provided', () => {
    const button = new DaisyButton({
      label: 'Test',
      iconName: 'Save'
    });

    const element = button.render();
    const icon = element.querySelector('svg');
    expect(icon).toBeTruthy();
  });
});
```

### E2E 测试（Playwright）

```typescript
// tests/e2e/options-theme-toggle.test.ts
import { test, expect } from '@playwright/test';

test('should toggle theme between light and dark', async ({ page }) => {
  await page.goto('http://localhost:3000/options/index.html');

  // 检查默认主题
  const theme = await page.getAttribute('html', 'data-theme');
  expect(['light', 'dark']).toContain(theme);

  // 点击深色模式按钮
  await page.click('button[aria-label="Dark mode"]');
  await page.waitForTimeout(100);

  const darkTheme = await page.getAttribute('html', 'data-theme');
  expect(darkTheme).toBe('dark');
});
```

### 无障碍性测试（axe-core）

```typescript
// tests/a11y/options-page.test.ts
import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test('options page should have no a11y violations', async ({ page }) => {
  await page.goto('http://localhost:3000/options/index.html');
  await injectAxe(page);

  const violations = await checkA11y(page);
  expect(violations).toHaveLength(0);
});
```

---

## 9. 构建优化

### Tailwind PurgeCSS 配置

```javascript
// tailwind.config.cjs
module.exports = {
  content: [
    './src/**/*.{ts,html}',
    './src/**/*.ts',  // 确保扫描所有 TS 文件中的类名
  ],
  safelist: [
    // DaisyUI 动态生成的类名
    'btn-sm', 'btn-md', 'btn-lg',
    'btn-primary', 'btn-secondary', 'btn-ghost', 'btn-error',
    'input-sm', 'input-md', 'input-lg',
    // ... 其他需要保留的类名
  ],
  plugins: [require('daisyui')],
}
```

### esbuild 优化

```javascript
// scripts/build.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['src/options/index.ts'],
  bundle: true,
  minify: true,
  treeShaking: true,  // 启用 Tree-shaking
  splitting: true,    // 代码分割
  format: 'esm',
  outdir: 'build/dist',
  metafile: true,     // 生成元数据，用于分析包体积
});
```

---

## 10. 实施路线图（修订版）

### 阶段 0：POC 验证 ⏱️ **1 周**

**目标**：验证技术可行性，评估潜在问题

**任务清单**：
- [ ] 安装 DaisyUI 和 Lucide Icons
- [ ] 创建测试页面 `tests/visual/daisyui-poc.html`
- [ ] 测试 DaisyUI 主题定制（颜色、圆角、间距）
- [ ] 验证 `adoptedStyleSheets` 在 Shadow DOM 中的兼容性
- [ ] 试用 Zag.js 的 Combobox 组件
- [ ] 测试 Lucide Icons 的 Tree-shaking 效果

**验收标准**：
- ✅ DaisyUI 主题颜色与现有设计一致（误差 < 5%）
- ✅ Shadow DOM 样式注入成功，无样式闪烁
- ✅ 包体积增加 < 20KB（gzipped）

---

### 阶段 1：基础组件封装 ⏱️ **2-3 周**

**目标**：封装 5 个核心组件，在 Options 页面试点

**任务清单**：
- [ ] 配置 DaisyUI 主题（`tailwind.config.cjs`）
- [ ] 封装组件：
  - [ ] `DaisyButton`（3 变体 × 3 尺寸）
  - [ ] `DaisyInput`（text、password、number）
  - [ ] `DaisyCard`（基础容器）
  - [ ] `DaisyBadge`（标签）
  - [ ] `DaisyAlert`（消息提示）
- [ ] 在 Options 页面的"连接测试"区域试点
- [ ] 编写单元测试（每个组件 ≥ 3 个测试用例）
- [ ] 编写组件使用文档

**验收标准**：
- ✅ 所有组件通过单元测试
- ✅ Options 页面"连接测试"区域使用新组件，样式正常
- ✅ 包体积增加 < 30KB（包含 Lucide Icons）

---

### 阶段 2：Shadow DOM 适配 ⏱️ **4-6 周**

**目标**：在 Content Scripts 中使用 DaisyUI 组件

**任务清单**：
- [ ] 调整 esbuild 配置，支持 CSS 字符串导入
- [ ] 重构 `ClipperDialog` 使用 `adoptedStyleSheets`
- [ ] 引入 `focus-trap` 实现焦点管理
- [ ] 封装 `DaisyDialog` 组件（使用 Zag.js）
- [ ] 解决字体加载和 z-index 问题
- [ ] 编写 E2E 测试（至少 3 个关键流程）

**验收标准**：
- ✅ ClipperDialog 在所有主流网站正常工作
- ✅ 无样式冲突，z-index 正确
- ✅ 焦点管理正确（Tab 键不会跳出）
- ✅ 通过 E2E 测试

---

### 阶段 3：渐进式替换 ⏱️ **3-4 个月**

**目标**：逐步替换现有组件，与 Tailwind Stage5-7 协调

**月度计划**：

#### 月度 1：Options 页面 Section 迁移
- [ ] 迁移所有 Section 的基础 UI（按钮、输入框、卡片）
- [ ] 保留复杂组件（表格、路由编辑器）暂不迁移

#### 月度 2：Content Scripts 迁移
- [ ] 迁移 Reader Panel
- [ ] 迁移 Video Panel
- [ ] 迁移 Support Prompt

#### 月度 3：复杂组件重构
- [ ] 使用 Zag.js 重构 VaultRouter 下拉选择器
- [ ] 使用 Zag.js 重构 YamlConfig 表格编辑器
- [ ] 使用 Zag.js 重构 Tabs 组件

#### 月度 4：无障碍性审计和优化
- [ ] 使用 axe-core 进行无障碍性测试
- [ ] 修复所有 P0 和 P1 的无障碍性问题
- [ ] 测试屏幕阅读器兼容性（NVDA、VoiceOver）

**验收标准**：
- ✅ 90% 的 UI 组件使用 DaisyUI
- ✅ 通过 WCAG 2.1 AA 标准
- ✅ 包体积增加 < 50KB（总计）
- ✅ Lighthouse 评分 > 90（Performance、Accessibility）

---

### 阶段 4-7：目录重构与优化 ⏱️ **与 Tailwind 收尾协调**

⚠️ **前置条件**：
- 阶段 1-3 完成
- Tailwind 迁移基本完成
- 团队对新架构达成共识

**任务**：
- [ ] 创建 `src/ui/` 独立目录
- [ ] 逐步迁移组件到新目录
- [ ] 重构组件的导入路径
- [ ] 更新所有文档

---

## 11. 风险评估与缓解措施

| 风险项 | 严重性 | 可能性 | 影响 | 缓解措施 |
|--------|--------|--------|------|----------|
| DaisyUI 主题定制困难 | 中 | 低 | 延期 1-2 周 | ✅ POC 阶段充分验证 |
| Shadow DOM 兼容性 | 高 | 中 | 功能无法使用 | ✅ 准备降级方案（直接注入样式） |
| 团队学习曲线 | 中 | 中 | 延期 2-3 周 | ✅ 提前培训，编写内部文档 |
| 包体积增加过多 | 中 | 低 | 用户体验下降 | ✅ 按需导入，监控构建大小 |
| 迁移时间超预期 | 高 | 高 | 项目延期 | ✅ 分阶段实施，保留回退路径 |
| Zag.js 学习成本高 | 中 | 中 | 延期 1-2 周 | ✅ 仅用于 3-5 个复杂组件 |
| 国际化集成问题 | 低 | 低 | 部分语言不可用 | ✅ 提前测试 Zag.js i18n |

---

## 12. 监控指标

### 包体积监控

```json
{
  "目标": "< 50KB 增加（gzipped）",
  "当前基线": "~120KB",
  "目标上限": "~170KB",
  "监控工具": "esbuild metafile + webpack-bundle-analyzer"
}
```

### 性能监控

```json
{
  "Lighthouse Performance": "> 90",
  "Lighthouse Accessibility": "> 95",
  "First Contentful Paint": "< 1.5s",
  "Time to Interactive": "< 3.5s"
}
```

### 无障碍性监控

```json
{
  "axe-core 错误": "0",
  "axe-core 警告": "< 5",
  "WCAG 2.1 AA 合规率": "100%"
}
```

---

## 13. 总结与行动建议

### 核心优势

✅ **DaisyUI + Zag.js** 是性价比最高的选择
✅ **渐进式迁移**降低风险，保持项目稳定
✅ **与现有技术栈完美兼容**，无需重构架构

### 关键决策

1. **完全使用 DaisyUI 主题系统**，简化维护
2. **引入 Lucide Icons**，统一图标风格
3. **Zag.js 仅用于复杂组件**，避免过度工程化
4. **暂不重构目录结构**，与 Tailwind 收尾协调

### 立即行动

1. **启动 POC 验证**（本周）
2. **团队内部评审**（下周）
3. **制定详细的迁移清单**（下周）
4. **开始阶段 1 实施**（2 周后）

---

**文档版本**：v2.0（修订版）
**最后更新**：2025-11-25
**下次审核**：POC 完成后（2 周后）
