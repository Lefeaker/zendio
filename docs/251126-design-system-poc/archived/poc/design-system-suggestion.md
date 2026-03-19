# 设计系统建议书 | Design System Suggestion

### 核心推荐： "Semantic Tailwind" + "Class-based Web Components Lite"

鉴于你不能使用 React/Vue，且已经有一套基于 `BaseComponent` 的类系统，强行引入 Web Components (如 Lit) 会增加构建复杂度和包体积。

我的建议是：**采用 DaisyUI (作为 CSS 抽象层) + Zag.js (作为逻辑层/可选) + 强化现有的 Class 组件架构。**

-----

### 1\. 技术选型建议 (The Stack)

| 模块 | 推荐方案 | 理由 |
| :--- | :--- | :--- |
| **样式架构** | **Tailwind CSS + [DaisyUI](https://daisyui.com/)** | DaisyUI 是纯 CSS 插件，它将冗长的 Tailwind 工具类（`px-4 py-2 bg-blue-500...`）封装为语义化类名（`btn btn-primary`）。这对**原生 JS 拼接 HTML 字符串**极其友好，大幅减少代码体积和阅读负担。 |
| **交互逻辑** | **原生 TS + [Zag.js](https://zagjs.com/) (按需)** | Zag.js 是基于状态机的 Headless UI 逻辑库，**框架无关**。对于复杂的组件（如下拉菜单、Tabs、Combobox），直接复用它的状态机逻辑，自己渲染 DOM，能确保 WCAG 无障碍标准。简单组件手写即可。 |
| **图标系统** | **[Lucide Icons](https://lucide.dev/)** | Obsidian 社区和现代 SaaS 的标配。风格统一，线条细腻，支持 Tree-shaking。 |
| **Shadow DOM 样式** | **Constructable Stylesheets** | 利用 Tailwind 编译出的 CSS 字符串，通过 `adoptedStyleSheets` 注入到 Shadow DOM，实现完美隔离且高性能。 |

-----

### 2\. 对你的核心问题的回答 (Q\&A)

#### Q1: 推荐哪种方案？

**推荐：Tailwind 原生语义化组件库 (Modified Option D)。**
不要去写几十行的 Tailwind class 拼贴画，也不要引入沉重的 Web Components 库。
使用 DaisyUI 可以让你写出类似这样的代码：

```typescript
// 你的 TS 组件
const button = document.createElement('button');
button.className = 'btn btn-primary btn-sm'; // 语义化，简洁
button.textContent = 'Save to Vault';
```

这完美契合你现有的 `ListBuilder` 和 `BaseComponent` 模式。

#### Q2: 如何平衡一致性和速度？

**策略：自底向上的 "Atomic" 迁移。**

1.  **第一步（基建）：** 配置 Tailwind + DaisyUI，重写 `design-tokens.css`。
2.  **第二步（核心）：** 封装 3 个最基础组件：`Button`, `Input`, `Card`。这三个组件覆盖了 80% 的 UI 场景。
3.  **第三步（替换）：** 在新功能中强制使用新组件，旧功能在修改 bug 时顺手替换。

#### Q3: 浏览器扩展 Shadow DOM 的特殊考量

**样式注入是关键。**
在 `Content Script` 中，你不能依赖 `<head>` 里的样式。你需要构建一个 `style-loader`：

1.  构建时：esbuild 将 Tailwind 输出为一个 CSS 字符串文件。
2.  运行时：

<!-- end list -->

```typescript
import tailwindCss from './styles/generated-tailwind.css?inline'; // esbuild loader

class ClipperDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  connectedCallback() {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(tailwindCss);
    this.shadowRoot.adoptedStyleSheets = [sheet]; // 性能极佳，无样式闪烁
  }
}
```

-----

### 3\. 设计令牌 (Design Tokens) 规范建议

目前的 `--aobx-*` 命名很好，防止冲突。建议按照 **CTI (Category-Type-Item)** 结构优化，并对齐 Obsidian 的 CSS 变量命名逻辑（为了让用户感到亲切）。

**建议结构：**

```css
:root {
  /* 语义化颜色 (Semantic Colors) - 引用基础色板 */
  --aobx-c-primary: var(--aobx-purple-600);
  --aobx-c-primary-hover: var(--aobx-purple-700);
  
  --aobx-c-bg-base: #ffffff;
  --aobx-c-bg-surface: #f9fafb;
  
  /* 借用 Obsidian 的术语 (让 Obsidian 用户无缝适应) */
  --aobx-interactive-accent: var(--aobx-c-primary);
  --aobx-text-normal: #374151;
  --aobx-text-muted: #9ca3af;

  /* 尺寸与圆角 */
  --aobx-radius-sm: 0.25rem;
  --aobx-radius-md: 0.5rem; /* 对应 Tailwind rounded-md */
}

[data-theme="dark"] {
  --aobx-c-bg-base: #1f2937;
  --aobx-text-normal: #e5e7eb;
}
```

**工具建议：** 既然已经在用 Tailwind，直接在 `tailwind.config.js` 中配置 `theme.extend` 映射这些变量即可，不需要引入 Style Dictionary 这种重型工具，除非你要生成 iOS/Android 原生代码。

-----

### 4\. 组件库架构设计 (src/ui)

建议将 UI 从业务逻辑中剥离，建立独立的内部库目录。

```
src/
├── ui/                     # 内部 UI 库
│   ├── base/               # 基础抽象类
│   │   ├── Component.ts    # 封装 addEventListener, cleanup 等
│   │   └── EventEmitter.ts
│   ├── tokens/
│   │   └── index.css       # 核心变量
│   ├── primitives/         # 原子组件 (纯 UI，无业务)
│   │   ├── button/
│   │   │   ├── button.ts   # 逻辑
│   │   │   └── button.css  # 如果 DaisyUI 不够用，需自定义
│   │   ├── input/
│   │   ├── dialog/         # 模态框基础
│   │   └── toast/
│   └── patterns/           # 复合组件 (带一定交互)
│       ├── form-group/
│       └── data-table/
└── ...
```

**组件编写示例 (Native TS):**

```typescript
// src/ui/primitives/button/Button.ts
import { BaseComponent } from '../../base/Component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string; // SVG string
  onClick?: (e: MouseEvent) => void;
}

export class Button extends BaseComponent {
  constructor(private props: ButtonProps) {
    super();
  }

  render(): HTMLElement {
    const btn = document.createElement('button');
    // 使用 DaisyUI 的类名 + Tailwind 工具类
    const variantClass = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-error'
    }[this.props.variant || 'primary'];

    const sizeClass = {
      sm: 'btn-sm',
      md: '',
      lg: 'btn-lg'
    }[this.props.size || 'md'];

    btn.className = `btn ${variantClass} ${sizeClass} gap-2`; 
    
    if (this.props.icon) {
        btn.innerHTML += this.props.icon; // 简单处理，生产环境需防 XSS
    }
    btn.appendChild(document.createTextNode(this.props.label));

    if (this.props.onClick) {
      this.bind(btn, 'click', this.props.onClick);
    }
    
    return btn;
  }
}
```

-----

### 5\. 无障碍性 (A11y) 改进路线

在原生 JS 中做 A11y 比较痛苦，容易遗漏。

1.  **P0 - 焦点管理 (Focus Trap):** 你的 ClipperDialog 是浮动的。打开时，Tab 键必须被限制在 Dialog 内部，不能跳回背后的网页。
      * *方案:* 使用 `tabbable` 或 `focus-trap` 微型库（npm install focus-trap）。
2.  **P1 - 键盘导航:** 自定义下拉菜单（Select）必须支持上下键选择，Enter 确认。
      * *方案:* 这就是为什么要用 **Zag.js** 的原因。对于复杂的 Select/Combobox，不要自己写键盘逻辑，连接 Zag 的状态机即可。
3.  **P1 - ARIA Label:** 所有只有图标的按钮（如“关闭”、“保存”图标按钮），必须强制要求传入 `aria-label`。

-----

### 6\. 实施路线图 (Roadmap)

#### 第一阶段：基础搭建 (Week 1-2)

1.  引入 `daisyui` 到 `tailwind.config.js`。
2.  配置 `daisyui` 主题，使其匹配 "All in Ob" 的紫色调（覆盖 Daisy 默认颜色）。
3.  设置 `src/ui` 目录结构。
4.  创建 `Button` 和 `Input` 组件，并在 **Options Page** 的一个小区域（如“连接测试”）进行试点替换。

#### 第二阶段：Shadow DOM 适配 (Week 3-4)

1.  调整 esbuild 配置，确保能输出纯 CSS 字符串供 Content Script 使用。
2.  重构 `ClipperDialog` 的外壳，使用 `adoptedStyleSheets` 注入样式。
3.  解决宿主样式冲突（Shadow DOM 会解决 99%，但要注意 z-index 和字体加载）。

#### 第三阶段：全面迁移 (Month 2+)

1.  逐步替换 Options Page 的 Sidebar、Form Group。
2.  引入 Zag.js 重构复杂的 `RoutingSection`（路由表编辑器）。

### 总结

对于 "All in Ob" 这样不想引入重型框架的项目，**Tailwind + DaisyUI** 是性价比最高的选择。它解决了“手写 CSS 慢”的问题，同时保持了代码是“原生 JS”的本质，没有引入 React 的运行时开销，非常适合浏览器扩展的轻量化需求。