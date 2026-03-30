# Options 页面样式自定义指南

## 📋 样式系统架构

Options 页面使用了**分层样式系统**，从底层到顶层分别是：

```
Design Tokens (CSS 变量)
         ↓
  Tailwind 配置 (主题扩展)
         ↓
 Tailwind Utilities (工具类)
         ↓
  自定义组件类 (.aobx-*)
         ↓
   组件 HTML (使用工具类)
```

---

## 🎨 样式调整层级

### **1️⃣ 调整设计令牌（最推荐）**

**文件位置**：`src/styles/design-tokens.css`

兼容说明：

- `src/options/styles/design-tokens.css` 已删除，不再保留 legacy wrapper
- 真正需要修改的 token 真值文件只有 `src/styles/design-tokens.css`

**适用场景**：

- 修改颜色主题（背景、文字、边框、主色调）
- 调整间距系统（padding、margin、gap）
- 修改圆角大小
- 调整字体大小和行高

**示例**：修改主色调和背景色

```css
:root {
  /* 修改主色调（紫色 → 蓝色） */
  --aobx-accent: hsl(217 91% 60%); /* 原来是 hsl(257 86% 63%) */

  /* 修改背景色（更亮） */
  --aobx-surface-0: hsl(220 12% 98%); /* 原来是 97% */
  --aobx-surface-1: hsl(220 12% 96%); /* 原来是 95% */

  /* 修改圆角（更圆润） */
  --aobx-radius-lg: 24px; /* 原来是 18px */
  --aobx-radius-md: 16px; /* 原来是 12px */

  /* 修改间距（更宽松） */
  --aobx-space-4: 20px; /* 原来是 16px */
  --aobx-space-6: 32px; /* 原来是 24px */
}

/* 深色模式自定义 */
html[data-theme='dark'] {
  --aobx-surface-0: hsl(220 8% 8%); /* 更深的背景 */
  --aobx-surface-1: hsl(220 8% 10%);
  --aobx-text: hsl(0 0% 95%); /* 更亮的文字 */
}
```

**修改后需要**：重新构建开发产物

```bash
npm run build:dev
```

---

### **2️⃣ 调整 Tailwind 主题扩展**

**文件位置**：`tailwind.config.cjs`

**适用场景**：

- 添加新的 Tailwind utility 类
- 扩展颜色、间距、字体等选项
- 自定义断点（响应式）

**示例**：添加新的颜色和间距

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        accent: 'var(--aobx-accent)',
        'accent-soft': 'var(--aobx-accent-soft)',

        // 新增：自定义语义色
        info: 'hsl(200 90% 50%)',
        'success-bright': 'hsl(140 80% 50%)'
      },

      spacing: {
        // 新增：特殊间距
        18: '72px',
        22: '88px'
      },

      // 新增：自定义断点
      screens: {
        xs: '480px',
        xxl: '1600px'
      }
    }
  }
};
```

**修改后需要**：重新构建 Tailwind

```bash
npm run tailwind:build
```

---

### **3️⃣ 添加自定义组件类**

**文件位置**：`src/options/styles/tailwind.input.css`

**适用场景**：

- 创建可复用的组件样式
- 封装复杂的样式组合
- 定义通用的 UI 模式

**示例**：添加新的组件类

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  /* 现有组件 */
  .aobx-card {
    @apply rounded-lg border border-[color:var(--aobx-border)] bg-[color:var(--aobx-surface-0)] p-4;
  }

  .aobx-btn--primary {
    @apply rounded-md bg-[color:var(--aobx-accent)] px-3 py-2 font-semibold text-white;
  }

  /* 新增：次要按钮样式 */
  .aobx-btn--secondary {
    @apply rounded-md border border-border bg-surface-1 px-3 py-2 font-medium text-text
           hover:bg-surface-2 transition-colors;
  }

  /* 新增：警告卡片样式 */
  .aobx-card--warning {
    @apply aobx-card border-l-4 border-l-[color:var(--aobx-status-warning)]
           bg-[color:color-mix(in_srgb,var(--aobx-status-warning)_8%,transparent)];
  }

  /* 新增：输入框样式 */
  .aobx-input {
    @apply w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-text
           focus:outline-none focus:ring-2 focus:ring-accent transition-colors;
  }
}
```

**修改后需要**：重新构建 Tailwind

```bash
npm run tailwind:build
```

---

### **4️⃣ 直接修改组件 HTML**

**文件位置**：`src/options/components/**/*.ts`

**适用场景**：

- 调整单个组件的样式
- 临时快速修改
- 不影响全局的小调整

**示例**：修改按钮样式

```typescript
// 在组件文件中，例如 src/options/components/sections/UsageSection.ts

// 原来的代码
button.className = 'px-3 py-2 bg-accent text-white rounded-md';

// 修改为更大、更圆润的按钮
button.className =
  'px-4 py-3 bg-accent text-white rounded-lg text-base font-semibold shadow-lg hover:scale-105 transition-transform';
```

**修改后需要**：重新构建项目

```bash
npm run build:dev
```

---

## 🔧 常见样式调整场景

### 场景 1：修改主题颜色

**目标**：将紫色主题改为蓝绿色渐变

**步骤**：

1. 编辑 `src/styles/design-tokens.css`：

```css
:root {
  --aobx-accent: hsl(180 80% 50%); /* 青绿色 */
  --aobx-accent-soft: hsl(180 60% 75%);
}
```

2. 重新构建：

```bash
npm run build:dev
```

---

### 场景 2：增加整体间距

**目标**：让界面更加宽松透气

**步骤**：

1. 编辑 `src/styles/design-tokens.css`：

```css
:root {
  --aobx-space-2: 10px; /* 原来是 8px */
  --aobx-space-3: 14px; /* 原来是 12px */
  --aobx-space-4: 20px; /* 原来是 16px */
  --aobx-space-6: 28px; /* 原来是 24px */
}
```

2. 重新构建：

```bash
npm run build:dev
```

---

### 场景 3：修改卡片样式

**目标**：让卡片有阴影、更圆润

**方式 A**：修改组件类（影响所有卡片）

编辑 `src/options/styles/tailwind.input.css`：

```css
@layer components {
  .aobx-card {
    @apply rounded-2xl border border-[color:var(--aobx-border)]
           bg-[color:var(--aobx-surface-0)] p-6 shadow-lg;
  }
}
```

**方式 B**：只修改设计令牌（推荐）

编辑 `src/styles/design-tokens.css`：

```css
:root {
  --aobx-radius-lg: 24px; /* 更圆润 */
  --aobx-shadow-card: 0 4px 12px rgba(0, 0, 0, 0.08); /* 添加阴影 */
}
```

然后在 Tailwind input 中使用：

```css
.aobx-card {
  @apply rounded-lg border border-[color:var(--aobx-border)]
         bg-[color:var(--aobx-surface-0)] p-4;
  box-shadow: var(--aobx-shadow-card); /* 使用令牌 */
}
```

---

### 场景 4：修改深色模式

**目标**：深色模式下使用更深的背景

**步骤**：

编辑 `src/styles/design-tokens.css`：

```css
html[data-theme='dark'] {
  --aobx-surface-0: hsl(220 8% 6%); /* 更深 */
  --aobx-surface-1: hsl(220 8% 8%); /* 更深 */
  --aobx-surface-2: hsl(220 8% 12%); /* 更深 */
  --aobx-border: hsl(220 8% 20%); /* 更暗的边框 */
}
```

---

## 📦 完整开发流程

### 日常开发

```bash
# 终端 1：监听代码变化
npm run dev

# 终端 2：监听样式变化（如果需要修改 Tailwind）
npm run tailwind:watch
```

### 修改样式后

```bash
# 如果只修改了 design-tokens.css
npm run build:dev

# 如果修改了组件 HTML/TS
npm run build:dev
```

---

## 🎯 样式调整优先级建议

按照以下优先级进行样式调整：

1. **首选**：修改 `design-tokens.css`（最灵活、易维护）
2. **次选**：修改 `tailwind.config.cjs`（添加新的工具类）
3. **备选**：修改 `tailwind.input.css`（添加自定义组件类）
4. **最后**：直接修改组件 HTML（仅限特殊情况）

---

## 🛠️ 调试技巧

### 1. 检查 CSS 变量是否生效

在浏览器开发者工具中：

```javascript
// 在 Console 中运行
getComputedStyle(document.documentElement).getPropertyValue('--aobx-accent');
// 应该返回: "hsl(257 86% 63%)"
```

### 2. 检查 Tailwind 类是否存在

在浏览器开发者工具中检查元素，查看 `class` 属性是否被正确解析为 CSS 规则。

如果没有样式：

- 检查 `build/dist/options/styles/tailwind.css` 是否包含该类
- 重新构建 Tailwind

### 3. 清除浏览器缓存

样式不更新时，强制刷新：

- Chrome/Edge: `Ctrl/Cmd + Shift + R`
- 或在 DevTools 中勾选 "Disable cache"

---

## 📚 参考资源

- **Tailwind 官方文档**: https://tailwindcss.com/docs
- **CSS Variables (MDN)**: https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties
- **HSL 颜色**: https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/hsl

---

## ⚠️ 注意事项

1. **始终通过 design-tokens 定义颜色**，不要硬编码颜色值
2. **修改后务必重新构建** Tailwind CSS
3. **保持深色模式和浅色模式的一致性**
4. **使用语义化的变量名**，便于后期维护

---

**最后更新**：2025-11-25
