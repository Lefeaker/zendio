# Phase 3: DaisyUI 迁移指南（暗色模式与全局优化）

**文档版本**: v1.0
**创建日期**: 2025-11-27
**Phase**: Phase 3 - Dark Mode & Global Optimization
**预计工期**: 1-2 周
**难度**: 🔥🔥🔥 中高

---

## 📋 目录

1. [概述](#概述)
2. [Phase 3 目标](#phase-3-目标)
3. [准备工作](#准备工作)
4. [迁移清单](#迁移清单)
5. [详细实施步骤](#详细实施步骤)
6. [质量门禁](#质量门禁)
7. [验收标准](#验收标准)
8. [常见问题](#常见问题)
9. [附录](#附录)

---

## 概述

### Phase 1 & Phase 2 回顾

✅ **Phase 1 完成**（2025-11-26）:
- Button, Input, Checkbox, Select, Textarea, Alert, Card 组件迁移
- 3 个工厂函数（createButton, createInput, createAlert）
- 包体积影响: +0.27% (+2 KB)
- 质量评分: 96.5/100 (A+)

✅ **Phase 2 完成**（2025-11-27）:
- Stats 组件迁移
- Table 主题变量优化（13 处更新）
- 包体积影响: 0% (0 KB)
- 质量评分: 90/100 (A-)

### Phase 3 目标

Phase 3 聚焦于**暗色模式支持**和**全局样式统一**，完善整个设计系统：

1. **暗色模式支持**: 启用 DaisyUI dark theme，创建主题切换器
2. **全局样式统一**: 审查并替换所有剩余的自定义颜色类
3. **视觉回归测试**: 补充 Phase 2 测试，建立 baseline 截图库
4. **性能优化**: CSS 加载优化，减少未使用样式
5. **Modal 迁移**: 可选任务，迁移现有 Modal 到 DaisyUI
6. **组件文档**: 可选任务，建立组件使用指南

**核心原则**:
- 暗色模式无闪烁（主题切换平滑）
- 全局颜色一致性（统一使用 DaisyUI 主题变量）
- 零破坏性变更（所有测试必须通过）
- 包体积控制（总增幅 < 5%）

---

## Phase 3 目标

### 主要目标

| 目标 | 描述 | 优先级 |
|------|------|--------|
| **暗色模式支持** | 启用 dark theme，创建主题切换器 | P0 |
| **全局样式统一** | 替换所有自定义颜色为 DaisyUI 主题变量 | P0 |
| **视觉测试补充** | 建立完整的视觉 baseline | P1 |
| **性能优化** | CSS 加载优化，tree-shaking 验证 | P1 |
| **Modal 现代化** | 迁移到 DaisyUI dialog（可选）| P2 |
| **组件文档** | 建立组件库文档（可选）| P2 |

### 成功指标

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| **暗色模式可用性** | 100% 可用 | 手动测试所有页面 |
| **颜色一致性** | 100% 使用 DaisyUI 变量 | grep 搜索自定义颜色 |
| **视觉测试覆盖** | ≥ 15 张截图 | screenshots/ 目录 |
| **单元测试通过率** | 100% | `npm run test:unit` |
| **包体积增长** | < 5% | Bundle size report |
| **性能提升** | CSS 减少 10%+ | PurgeCSS 优化 |

---

## 准备工作

### 开始前检查清单

- [ ] ✅ Phase 1 和 Phase 2 已通过验收（100% 完成）
- [ ] ✅ 单元测试全部通过（537/537）
- [ ] ✅ 开发环境正常（Node.js, npm, DaisyUI 4.12.10）
- [ ] 📋 阅读 Phase 1 和 Phase 2 迁移日志
- [ ] 📋 创建 Phase 3 工作分支（`git checkout -b feat/phase3-dark-mode`）
- [ ] 📋 备份当前亮色主题截图（作为 baseline）

### 环境验证

```bash
# 1. 确认依赖版本
npm list daisyui tailwindcss
# 期望: daisyui@4.12.10, tailwindcss@3.4.18

# 2. 运行测试 baseline
npm run test:unit
# 期望: 537/537 通过

# 3. 构建 baseline
npm run build:dev -- --skip-checks
du -sh dist/
# 记录当前包体积作为 Phase 3 baseline

# 4. 创建 Phase 3 baseline 截图
mkdir -p docs/screenshots/phase3/baseline
# 手动截图保存到此目录
```

---

## 迁移清单

### Phase 3.1: 暗色模式支持（Week 1）

#### 任务 3.1.1: 启用 DaisyUI 暗色主题

**优先级**: 🚨 P0
**预计工时**: 1 小时
**文件**: `tailwind.config.cjs`

**步骤**:

1. **修改 Tailwind 配置**:
```javascript
// tailwind.config.cjs
module.exports = {
  content: [
    './src/**/*.{html,ts,js}',
    './tests/**/*.{html,ts,js}'
  ],
  theme: {
    extend: {
      // 保持现有自定义配置
    }
  },
  plugins: [
    require('daisyui')
  ],
  daisyui: {
    themes: [
      'light',  // 默认亮色主题
      'dark',   // 🆕 新增暗色主题
      // 可选：自定义主题
      // {
      //   'aob-light': { ... },
      //   'aob-dark': { ... }
      // }
    ],
    // 暗色模式优先级
    darkTheme: 'dark',
    // 设置默认主题
    base: true,
    styled: true,
    utils: true,
  }
};
```

2. **验证主题 CSS 生成**:
```bash
# 重新构建
npm run build:dev -- --skip-checks

# 检查暗色主题 CSS
grep -n "\[data-theme=dark\]" dist/styles/components.css | head -10
# 期望: 找到多处 [data-theme=dark] 规则

# 测量 CSS 大小
ls -lh dist/styles/components.css
# 预期: 增加约 2-3 KB（暗色主题样式）
```

3. **测试暗色主题**:
```html
<!-- 临时测试：在 Options 页面手动添加 -->
<html data-theme="dark">
  <!-- 页面内容 -->
</html>
```

**验收标准**:
- [ ] ✅ Tailwind 配置正确
- [ ] ✅ 暗色主题 CSS 已生成
- [ ] ✅ 手动切换 `data-theme="dark"` 后页面变暗

---

#### 任务 3.1.2: 创建主题切换器

**优先级**: 🚨 P0
**预计工时**: 3 小时
**文件**: `src/options/components/shared/ThemeSwitcher.ts`

**步骤**:

1. **创建 ThemeSwitcher 类**:

```typescript
// src/options/components/shared/ThemeSwitcher.ts

/**
 * Theme Switcher Component
 *
 * 管理亮色/暗色主题切换，支持：
 * - 用户手动切换
 * - 本地存储持久化
 * - 系统主题检测（可选）
 *
 * @example
 * const switcher = new ThemeSwitcher(container);
 * switcher.init();
 */
export class ThemeSwitcher {
  private toggle: HTMLInputElement | null = null;
  private currentTheme: 'light' | 'dark' = 'light';
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * 初始化主题切换器
   * 1. 读取保存的主题偏好
   * 2. 创建 UI 控件
   * 3. 应用主题
   */
  init(): void {
    this.currentTheme = this.loadTheme();
    this.createUI();
    this.applyTheme(this.currentTheme, false);
  }

  /**
   * 创建主题切换 UI
   */
  private createUI(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2';

    // 月亮图标（暗色模式）
    const moonIcon = document.createElement('span');
    moonIcon.textContent = '🌙';
    moonIcon.className = 'text-lg';
    moonIcon.setAttribute('aria-hidden', 'true');

    // DaisyUI Toggle 开关
    this.toggle = document.createElement('input');
    this.toggle.type = 'checkbox';
    this.toggle.className = 'toggle toggle-primary';
    this.toggle.checked = this.currentTheme === 'dark';
    this.toggle.setAttribute('aria-label', 'Toggle dark mode');

    // 太阳图标（亮色模式）
    const sunIcon = document.createElement('span');
    sunIcon.textContent = '☀️';
    sunIcon.className = 'text-lg';
    sunIcon.setAttribute('aria-hidden', 'true');

    // 标签文本
    const label = document.createElement('label');
    label.className = 'flex items-center gap-2 cursor-pointer select-none';
    label.append(moonIcon, this.toggle, sunIcon);

    // 提示文本
    const hint = document.createElement('span');
    hint.className = 'text-sm text-base-content/60 ml-2';
    hint.textContent = this.currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
    hint.id = 'theme-hint';

    wrapper.append(label, hint);
    this.container.replaceChildren(wrapper);

    // 绑定事件
    this.toggle.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      const theme = checked ? 'dark' : 'light';
      this.applyTheme(theme, true);
      this.saveTheme(theme);

      // 更新提示文本
      hint.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    });
  }

  /**
   * 应用主题到页面
   * @param theme - 主题名称
   * @param animate - 是否显示切换动画
   */
  private applyTheme(theme: 'light' | 'dark', animate: boolean): void {
    const html = document.documentElement;

    // 可选：添加切换动画
    if (animate) {
      html.classList.add('theme-transitioning');
      setTimeout(() => {
        html.classList.remove('theme-transitioning');
      }, 300);
    }

    // 设置 data-theme 属性
    html.setAttribute('data-theme', theme);
    this.currentTheme = theme;

    // 触发自定义事件（供其他组件监听）
    window.dispatchEvent(new CustomEvent('theme-changed', {
      detail: { theme }
    }));
  }

  /**
   * 保存主题偏好到 localStorage
   */
  private saveTheme(theme: 'light' | 'dark'): void {
    try {
      localStorage.setItem('aob-theme', theme);
    } catch (error) {
      console.warn('[ThemeSwitcher] Failed to save theme preference:', error);
    }
  }

  /**
   * 读取主题偏好
   * 优先级：localStorage > 系统偏好 > 默认 light
   */
  private loadTheme(): 'light' | 'dark' {
    try {
      // 1. 读取 localStorage
      const saved = localStorage.getItem('aob-theme');
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }

      // 2. 检测系统偏好（可选）
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    } catch (error) {
      console.warn('[ThemeSwitcher] Failed to load theme preference:', error);
      return 'light';
    }
  }

  /**
   * 销毁主题切换器
   */
  destroy(): void {
    this.toggle = null;
    this.container.replaceChildren();
  }
}
```

2. **添加主题切换动画（可选）**:

```css
/* src/styles/components.css */

/* 主题切换动画 */
html.theme-transitioning,
html.theme-transitioning *,
html.theme-transitioning *::before,
html.theme-transitioning *::after {
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease !important;
}
```

3. **集成到 Options 页面**:

```typescript
// src/options/app/bootstrap.ts
import { ThemeSwitcher } from '../components/shared/ThemeSwitcher';

// 在页面初始化时创建主题切换器
export function initializeOptionsPage(): void {
  // ... 现有初始化代码

  // 创建主题切换器
  const themeContainer = document.getElementById('theme-switcher');
  if (themeContainer) {
    const themeSwitcher = new ThemeSwitcher(themeContainer);
    themeSwitcher.init();
  }
}
```

4. **更新 Options HTML**:

```html
<!-- src/options/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>AiiinOB Options</title>
  <link rel="stylesheet" href="../styles/components.css">
</head>
<body>
  <!-- 主题切换器容器 -->
  <div class="fixed top-4 right-4 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg p-3">
    <div id="theme-switcher"></div>
  </div>

  <!-- 页面内容 -->
  <div id="app"></div>

  <script type="module" src="./app/bootstrap.ts"></script>
</body>
</html>
```

5. **测试主题切换**:

```bash
# 1. 构建
npm run build:dev -- --skip-checks

# 2. 在浏览器中测试
# - 打开 Options 页面
# - 点击主题切换开关
# - 验证页面立即切换主题
# - 刷新页面，验证主题保持不变

# 3. 测试 localStorage
# 在浏览器控制台：
localStorage.getItem('aob-theme')
# 期望: 'dark' 或 'light'
```

**验收标准**:
- [ ] ✅ ThemeSwitcher 类已创建
- [ ] ✅ 主题切换器 UI 正确显示
- [ ] ✅ 点击切换开关，页面立即切换主题
- [ ] ✅ 主题偏好持久化（刷新页面后保持）
- [ ] ✅ 切换动画平滑（可选）
- [ ] ✅ 单元测试通过

---

#### 任务 3.1.3: 暗色模式适配

**优先级**: 🚨 P0
**预计工时**: 4 小时
**范围**: 全局搜索并修复暗色模式问题

**步骤**:

1. **搜索硬编码颜色**:

```bash
# 搜索所有硬编码颜色类
grep -rn "bg-white\|bg-gray-\|text-black\|text-gray-\|border-gray-" src/ --include="*.ts" --include="*.html" > hardcoded-colors.txt

# 统计数量
wc -l hardcoded-colors.txt

# 如果 > 20 处，需要系统性替换
```

2. **颜色替换映射表**:

| 硬编码颜色 | DaisyUI 主题变量 | 用途 |
|-----------|-----------------|------|
| `bg-white` | `bg-base-100` | 主背景 |
| `bg-gray-50` | `bg-base-200` | 次级背景 |
| `bg-gray-100` | `bg-base-200` | 次级背景 |
| `bg-gray-200` | `bg-base-300` | 三级背景 |
| `text-black` | `text-base-content` | 主文本 |
| `text-gray-500` | `text-base-content/60` | 次级文本 |
| `text-gray-600` | `text-base-content/70` | 次级文本 |
| `text-gray-700` | `text-base-content/80` | 强调文本 |
| `border-gray-200` | `border-base-300` | 边框 |
| `border-gray-300` | `border-base-300` | 边框 |

3. **批量替换（使用脚本）**:

```bash
# 创建替换脚本
cat > scripts/replace-hardcoded-colors.sh << 'EOF'
#!/bin/bash

# 替换背景色
find src/ -type f \( -name "*.ts" -o -name "*.html" \) -exec sed -i '' \
  -e 's/bg-white/bg-base-100/g' \
  -e 's/bg-gray-50/bg-base-200/g' \
  -e 's/bg-gray-100/bg-base-200/g' \
  -e 's/bg-gray-200/bg-base-300/g' \
  {} +

# 替换文本色
find src/ -type f \( -name "*.ts" -o -name "*.html" \) -exec sed -i '' \
  -e 's/text-black/text-base-content/g' \
  -e 's/text-gray-500/text-base-content\/60/g' \
  -e 's/text-gray-600/text-base-content\/70/g' \
  -e 's/text-gray-700/text-base-content\/80/g' \
  {} +

# 替换边框色
find src/ -type f \( -name "*.ts" -o -name "*.html" \) -exec sed -i '' \
  -e 's/border-gray-200/border-base-300/g' \
  -e 's/border-gray-300/border-base-300/g' \
  {} +

echo "颜色替换完成！"
EOF

chmod +x scripts/replace-hardcoded-colors.sh

# 运行替换（⚠️ 先备份代码！）
git stash  # 保存当前修改
./scripts/replace-hardcoded-colors.sh

# 检查替换结果
git diff | less
```

4. **手动审查特殊情况**:

```bash
# 搜索可能需要特殊处理的颜色
grep -rn "rgb\|rgba\|#[0-9a-fA-F]\{3,6\}" src/ --include="*.ts" | grep -i "color\|background\|border"

# 逐个审查并替换
```

5. **测试暗色模式所有页面**:

测试清单：
- [ ] Options 主页面
- [ ] 各个 Section（Classifier, AI, Routing, etc.）
- [ ] YAML Config Table
- [ ] Usage Dashboard
- [ ] Modal 对话框（如有）
- [ ] Alert 消息
- [ ] Button hover/focus 状态
- [ ] Input focus 状态

6. **常见问题修复**:

**问题 1: 边框在暗色模式不可见**
```typescript
// Before
element.className = 'border border-gray-300';

// After
element.className = 'border border-base-300';
```

**问题 2: 文本对比度不足**
```typescript
// Before
element.className = 'text-gray-500';  // 暗色模式下太暗

// After
element.className = 'text-base-content/60';  // DaisyUI 自动调整
```

**问题 3: 自定义阴影颜色**
```typescript
// Before
element.className = 'shadow-lg shadow-gray-200';

// After
element.className = 'shadow-lg';  // DaisyUI shadow 自动适配
```

**问题 4: SVG 图标颜色**
```typescript
// Before
svg.setAttribute('fill', '#000000');

// After
svg.classList.add('fill-base-content');
// 或使用 currentColor
svg.setAttribute('fill', 'currentColor');
```

**验收标准**:
- [ ] ✅ 所有硬编码颜色已替换
- [ ] ✅ 所有页面在暗色模式下可读
- [ ] ✅ 文本对比度符合 WCAG AA 标准（对比度 ≥ 4.5:1）
- [ ] ✅ 边框和分隔线在暗色模式下可见
- [ ] ✅ Hover/focus 状态清晰可见
- [ ] ✅ 单元测试通过（537/537）

---

### Phase 3.2: 全局样式统一（Week 1）

#### 任务 3.2.1: 审查剩余自定义颜色

**优先级**: 🚨 P0
**预计工时**: 2 小时

**步骤**:

1. **创建审查脚本**:

```bash
# scripts/audit-custom-colors.sh
#!/bin/bash

echo "🔍 审查自定义颜色类..."

# 搜索所有自定义颜色
echo -e "\n📋 Background colors:"
grep -rn "bg-surface-\|bg-card\|bg-popover" src/ --include="*.ts" | wc -l

echo -e "\n📋 Text colors:"
grep -rn "text-text\|text-muted\|text-foreground" src/ --include="*.ts" | wc -l

echo -e "\n📋 Border colors:"
grep -rn "border-border\|border-input" src/ --include="*.ts" | wc -l

echo -e "\n📋 Hard-coded hex colors:"
grep -rn "#[0-9a-fA-F]\{3,6\}" src/ --include="*.ts" --include="*.css" | grep -v "// " | wc -l

echo -e "\n✅ 审查完成"
```

2. **生成替换清单**:

```bash
# 运行审查
bash scripts/audit-custom-colors.sh > custom-colors-audit.txt

# 查看结果
cat custom-colors-audit.txt
```

3. **创建替换映射**:

创建文件: `docs/251126-design-system-poc/color-migration-map.md`

```markdown
# 颜色迁移映射表

## Phase 3 自定义颜色 → DaisyUI 主题变量

### 背景色
| 自定义类 | DaisyUI 类 | 使用场景 |
|---------|-----------|---------|
| `bg-surface-0` | `bg-base-100` | 主背景 |
| `bg-surface-1` | `bg-base-200` | 卡片背景 |
| `bg-surface-2` | `bg-base-200` | 次级背景 |
| `bg-surface-3` | `bg-base-300` | 三级背景 |
| `bg-card` | `bg-base-100` | 卡片 |
| `bg-popover` | `bg-base-100` | 弹出层 |

### 文本色
| 自定义类 | DaisyUI 类 | 使用场景 |
|---------|-----------|---------|
| `text-text` | `text-base-content` | 主文本 |
| `text-text-muted` | `text-base-content/60` | 次级文本 |
| `text-foreground` | `text-base-content` | 前景文本 |
| `text-muted-foreground` | `text-base-content/60` | 弱化文本 |

### 边框色
| 自定义类 | DaisyUI 类 | 使用场景 |
|---------|-----------|---------|
| `border-border` | `border-base-300` | 边框 |
| `border-input` | `border-base-300` | 输入框边框 |

### 特殊颜色
| 场景 | 自定义类 | DaisyUI 类 |
|------|---------|-----------|
| 成功 | `text-green-600` | `text-success` |
| 错误 | `text-red-600` | `text-error` |
| 警告 | `text-yellow-600` | `text-warning` |
| 信息 | `text-blue-600` | `text-info` |
```

**验收标准**:
- [ ] ✅ 审查脚本已创建
- [ ] ✅ 替换清单已生成
- [ ] ✅ 替换映射表已创建

---

#### 任务 3.2.2: 系统性替换剩余颜色

**优先级**: 🚨 P0
**预计工时**: 3 小时

**步骤**:

1. **批量替换背景色**:

```bash
# 替换 bg-surface-* 系列
find src/ -type f -name "*.ts" -exec sed -i '' \
  -e 's/bg-surface-0/bg-base-100/g' \
  -e 's/bg-surface-1/bg-base-200/g' \
  -e 's/bg-surface-2/bg-base-200/g' \
  -e 's/bg-surface-3/bg-base-300/g' \
  -e 's/bg-card/bg-base-100/g' \
  -e 's/bg-popover/bg-base-100/g' \
  {} +

# 验证替换
grep -rn "bg-surface-\|bg-card\|bg-popover" src/ --include="*.ts" | wc -l
# 期望: 0
```

2. **批量替换文本色**:

```bash
find src/ -type f -name "*.ts" -exec sed -i '' \
  -e 's/text-text\([^-]\|$\)/text-base-content\1/g' \
  -e 's/text-text-muted/text-base-content\/60/g' \
  -e 's/text-foreground\([^-]\|$\)/text-base-content\1/g' \
  -e 's/text-muted-foreground/text-base-content\/60/g' \
  {} +

# 验证
grep -rn "text-text\|text-muted\|text-foreground" src/ --include="*.ts" | grep -v "text-base-content" | wc -l
# 期望: 0
```

3. **批量替换边框色**:

```bash
find src/ -type f -name "*.ts" -exec sed -i '' \
  -e 's/border-border\([^-]\|$\)/border-base-300\1/g' \
  -e 's/border-input/border-base-300/g' \
  {} +

# 验证
grep -rn "border-border\|border-input" src/ --include="*.ts" | wc -l
# 期望: 0
```

4. **替换特殊颜色**:

```bash
find src/ -type f -name "*.ts" -exec sed -i '' \
  -e 's/text-green-600/text-success/g' \
  -e 's/text-red-600/text-error/g' \
  -e 's/text-yellow-600/text-warning/g' \
  -e 's/text-blue-600/text-info/g' \
  -e 's/bg-green-100/bg-success\/10/g' \
  -e 's/bg-red-100/bg-error\/10/g' \
  -e 's/bg-yellow-100/bg-warning\/10/g' \
  -e 's/bg-blue-100/bg-info\/10/g' \
  {} +
```

5. **手动审查复杂情况**:

```bash
# 搜索可能遗漏的自定义颜色
grep -rn "color-mix\|hsl(\|rgb(" src/ --include="*.ts" --include="*.css"

# 逐个审查并手动替换
```

6. **更新 CSS 变量定义**（如有）:

```css
/* src/styles/design-tokens.css */

/* ⚠️ 移除或注释掉自定义颜色变量 */
/*
:root {
  --surface-0: ...;  // ❌ 移除
  --surface-1: ...;  // ❌ 移除
  --text: ...;       // ❌ 移除
  --text-muted: ...; // ❌ 移除
  --border: ...;     // ❌ 移除
}
*/

/* ✅ 改用 DaisyUI 主题变量（无需定义，DaisyUI 自动提供） */
```

7. **运行测试验证**:

```bash
# 运行单元测试
npm run test:unit
# 期望: 537/537 通过

# 构建验证
npm run build:dev -- --skip-checks

# 手动测试
# 1. 打开 Options 页面（亮色模式）
# 2. 切换到暗色模式
# 3. 检查所有组件显示正常
```

**验收标准**:
- [ ] ✅ 所有 `bg-surface-*` 已替换为 `bg-base-*`
- [ ] ✅ 所有 `text-text*` 已替换为 `text-base-content*`
- [ ] ✅ 所有 `border-border*` 已替换为 `border-base-300`
- [ ] ✅ 特殊颜色已替换为 DaisyUI 语义类
- [ ] ✅ CSS 变量定义已清理
- [ ] ✅ 单元测试通过（537/537）
- [ ] ✅ 亮色/暗色模式都正常显示

---

### Phase 3.3: 视觉回归测试（Week 1-2）

#### 任务 3.3.1: 建立视觉 Baseline

**优先级**: 🔥 P1
**预计工时**: 2 小时

**步骤**:

1. **创建截图目录结构**:

```bash
mkdir -p docs/screenshots/phase3/{light,dark,comparison}
```

2. **定义测试清单**:

创建文件: `docs/251126-design-system-poc/PHASE3-VISUAL-TEST-CHECKLIST.md`

```markdown
# Phase 3 视觉回归测试清单

## 测试环境
- 浏览器: Chrome 最新版
- 分辨率: 1920x1080
- 缩放: 100%

## 亮色模式测试 (Light Mode)

### Options 页面
- [ ] Options 主页面全景
- [ ] Theme Switcher 组件
- [ ] Navigation 侧边栏
- [ ] Usage Dashboard (Stats)
- [ ] YAML Config Table
- [ ] Classifier Section
- [ ] AI Section
- [ ] Routing Section
- [ ] Rest Section
- [ ] Fragment Section
- [ ] Video Section
- [ ] Deep Research Section
- [ ] Templates Section
- [ ] Privacy Settings

### 组件状态
- [ ] Button (default, hover, focus, disabled)
- [ ] Input (default, focus, error)
- [ ] Checkbox (unchecked, checked, disabled)
- [ ] Select (default, open, focus)
- [ ] Alert (info, success, warning, error)
- [ ] Card (default, hover)
- [ ] Stats (4 metrics)
- [ ] Toggle Switch (off, on)

## 暗色模式测试 (Dark Mode)

重复上述所有测试项（共约 30 张截图）

## 对比测试

- [ ] 主题切换动画流畅
- [ ] 颜色对比度符合 WCAG AA
- [ ] 文本清晰可读
- [ ] 边框和分隔线可见
- [ ] Icon 颜色正确
- [ ] Hover/Focus 状态清晰

**总计**: 约 60 张截图（30 亮色 + 30 暗色）
```

3. **执行截图（手动）**:

```bash
# 1. 切换到亮色模式
# 2. 按照清单逐项截图
# 3. 保存到 docs/screenshots/phase3/light/

# 文件命名规范:
# - 01-options-main.png
# - 02-theme-switcher.png
# - 03-usage-dashboard.png
# - ...

# 4. 切换到暗色模式
# 5. 重复截图
# 6. 保存到 docs/screenshots/phase3/dark/
```

4. **创建对比图（可选）**:

```bash
# 使用 ImageMagick 创建并排对比图
for light in docs/screenshots/phase3/light/*.png; do
  filename=$(basename "$light")
  dark="docs/screenshots/phase3/dark/$filename"
  output="docs/screenshots/phase3/comparison/$filename"

  # 横向拼接
  convert "$light" "$dark" +append "$output"
done
```

5. **创建视觉测试报告**:

```markdown
# Phase 3 视觉测试报告

**测试日期**: YYYY-MM-DD
**测试人**: Your Name

## 测试结果

| 测试项 | 亮色模式 | 暗色模式 | 对比度 | 状态 |
|--------|---------|---------|--------|------|
| Options 主页面 | ✅ | ✅ | 4.8:1 | 通过 |
| Theme Switcher | ✅ | ✅ | 5.2:1 | 通过 |
| Usage Dashboard | ✅ | ✅ | 4.5:1 | 通过 |
| YAML Config Table | ✅ | ⚠️ | 3.9:1 | 需优化 |
| ... | ... | ... | ... | ... |

## 发现的问题

### 1. YAML Config Table 边框对比度不足
- **位置**: yamlConfigTable.ts
- **问题**: 暗色模式下边框几乎不可见
- **建议**: 增加边框不透明度

### 2. Button hover 状态不明显
- **位置**: 多个 Section
- **问题**: hover 背景色变化太微妙
- **建议**: 调整 hover 样式

## 截图清单

- [x] 60/60 张截图已完成
- [x] 30/30 张对比图已生成

**存储位置**: `docs/screenshots/phase3/`
```

**验收标准**:
- [ ] ✅ 截图清单已创建
- [ ] ✅ 亮色模式 30 张截图已完成
- [ ] ✅ 暗色模式 30 张截图已完成
- [ ] ✅ 对比图已生成（可选）
- [ ] ✅ 视觉测试报告已创建
- [ ] ✅ 发现的问题已记录

---

#### 任务 3.3.2: 修复视觉问题

**优先级**: 🔥 P1
**预计工时**: 2 小时

**步骤**:

根据视觉测试报告，逐个修复发现的问题。

**常见问题及修复方法**:

1. **边框对比度不足**:
```typescript
// Before
element.className = 'border border-base-300';

// After (增加不透明度)
element.className = 'border border-base-300/80';
```

2. **Hover 状态不明显**:
```typescript
// Before
button.className = 'hover:bg-base-200';

// After (增强对比)
button.className = 'hover:bg-base-300 hover:border-base-content/20';
```

3. **文本对比度不足**:
```typescript
// Before
text.className = 'text-base-content/40';  // 对比度太低

// After
text.className = 'text-base-content/60';  // 提升到 WCAG AA 标准
```

4. **Icon 颜色不适配**:
```typescript
// Before
svg.setAttribute('fill', '#6b7280');

// After
svg.classList.add('fill-base-content/60');
```

**验收标准**:
- [ ] ✅ 所有发现的问题已修复
- [ ] ✅ 对比度符合 WCAG AA 标准（≥ 4.5:1）
- [ ] ✅ 重新截图验证修复效果
- [ ] ✅ 单元测试通过

---

### Phase 3.4: 性能优化（Week 2，可选 P1）

#### 任务 3.4.1: CSS 优化

**优先级**: 🔥 P1（建议完成）
**预计工时**: 2 小时

**步骤**:

1. **分析 CSS 体积**:

```bash
# 测量当前 CSS 大小
ls -lh dist/styles/*.css

# 分析 CSS 内容
npx tailwindcss-bundle-analyzer dist/styles/components.css
```

2. **优化 Tailwind purge 配置**:

```javascript
// tailwind.config.cjs
module.exports = {
  content: [
    './src/**/*.{html,ts,js}',
    './tests/**/*.{html,ts,js}',
    // 添加更精确的匹配
    '!./src/**/*.test.ts',
    '!./tests/**/*.test.ts'
  ],
  // 启用 JIT 模式（如未启用）
  mode: 'jit',
  // ...
};
```

3. **移除未使用的 DaisyUI 组件**:

```javascript
// tailwind.config.cjs
module.exports = {
  // ...
  daisyui: {
    themes: ['light', 'dark'],
    // 仅包含使用的组件（可选）
    components: [
      'button',
      'input',
      'checkbox',
      'select',
      'textarea',
      'alert',
      'card',
      'stats',
      'toggle',
      'badge',
      // 移除未使用的组件
      // 'modal',
      // 'tabs',
      // 'radio',
    ],
  },
};
```

4. **测量优化效果**:

```bash
# 重新构建
npm run build:dev -- --skip-checks

# 对比 CSS 大小
ls -lh dist/styles/*.css

# 期望: 减少 10-20% 体积
```

**验收标准**:
- [ ] ✅ CSS 体积减少 ≥ 10%
- [ ] ✅ 构建时间无明显增加
- [ ] ✅ 所有功能正常

---

#### 任务 3.4.2: 加载性能优化

**优先级**: ⚠️ P2（可选）
**预计工时**: 2 小时

**步骤**:

1. **CSS 拆分（可选）**:

如果 CSS 文件 > 30 KB，考虑拆分：

```javascript
// vite.config.ts (如使用 Vite)
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'daisyui-components': ['daisyui'],
        },
      },
    },
  },
};
```

2. **Lazy loading 主题（可选）**:

```typescript
// 仅在切换暗色模式时加载暗色主题 CSS
async function loadDarkTheme(): Promise<void> {
  if (!document.getElementById('dark-theme-css')) {
    const link = document.createElement('link');
    link.id = 'dark-theme-css';
    link.rel = 'stylesheet';
    link.href = '/styles/dark-theme.css';
    document.head.append(link);
  }
}
```

**验收标准**:
- [ ] ✅ 首次加载时间减少（可选）
- [ ] ✅ CSS 拆分正常工作（可选）
- [ ] ✅ 所有功能正常

---

### Phase 3.5: Modal 迁移（Week 2+，可选 P2）

#### 任务 3.5.1: 评估现有 Modal

**优先级**: ⚠️ P2（可选）
**预计工时**: 2 小时

**步骤**:

1. **搜索所有 Modal 使用**:

```bash
grep -rn "modal\|dialog\|popup" src/ --include="*.ts" > modal-usage.txt
cat modal-usage.txt
```

2. **列出 Modal 清单**:

```markdown
## 现有 Modal 清单

1. **Support Prompt** (`src/content/ui/supportPrompt.ts`)
   - 用途: 支持提示
   - 复杂度: 低
   - 建议: 迁移

2. **Confirm Dialog** (`src/options/components/confirmDialog.ts`)
   - 用途: 确认对话框
   - 复杂度: 中
   - 建议: 迁移

3. **其他 Modal** (如有)
   - ...

**总计**: X 个 Modal
**建议迁移**: Y 个
**建议保留**: Z 个
```

3. **决策矩阵**:

| Modal | 使用频率 | 复杂度 | 迁移价值 | 决策 |
|-------|---------|--------|---------|------|
| Support Prompt | 低 | 低 | 中 | ✅ 迁移 |
| Confirm Dialog | 高 | 中 | 高 | ✅ 迁移 |
| ... | ... | ... | ... | ... |

**验收标准**:
- [ ] ✅ Modal 清单已创建
- [ ] ✅ 迁移决策已制定
- [ ] ✅ 评估报告已创建

---

#### 任务 3.5.2: 创建 DaisyUI Modal 适配器（如决定迁移）

**优先级**: ⚠️ P2（可选）
**预计工时**: 4 小时

**实现**: 参考 Phase 2 指南中的 DaisyUI Modal 实现（`PHASE2-MIGRATION-GUIDE.md` Line 1100-1194）

**验收标准**:
- [ ] ✅ DaisyUIModal 类已创建
- [ ] ✅ 单元测试已编写（10+ 测试）
- [ ] ✅ E2E 测试已编写（2+ 测试）
- [ ] ✅ 示例文档已创建

---

### Phase 3.6: 组件文档（Week 2+，可选 P2）

#### 任务 3.6.1: 创建组件使用指南

**优先级**: ⚠️ P2（可选）
**预计工时**: 3 小时

**步骤**:

1. **创建组件文档目录**:

```bash
mkdir -p docs/components/{button,input,alert,stats,theme-switcher}
```

2. **编写组件文档模板**:

```markdown
<!-- docs/components/button/README.md -->

# Button 组件

## 概述

Button 组件使用 DaisyUI 样式系统，支持多种变体、尺寸和状态。

## 使用方法

### 工厂函数

```typescript
import { createButton } from '../shared/DaisyUIHelpers';

// 基础按钮
const button = createButton('Click Me', {
  variant: 'primary',
  size: 'md'
});

// 带图标的按钮
const iconButton = createButton('Download', {
  variant: 'secondary',
  size: 'sm',
  className: 'gap-2'
});
```

### 直接使用类

```html
<button class="btn btn-primary">Click Me</button>
<button class="btn btn-secondary btn-sm">Small Button</button>
```

## API

### ButtonOptions

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `variant` | `'primary' \| 'secondary' \| 'accent' \| 'ghost' \| 'outline' \| 'danger'` | `'primary'` | 按钮变体 |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg'` | `'md'` | 按钮尺寸 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `loading` | `boolean` | `false` | 是否显示加载状态 |
| `className` | `string` | `undefined` | 自定义类名 |

## 示例

### 不同变体

```typescript
const primary = createButton('Primary', { variant: 'primary' });
const secondary = createButton('Secondary', { variant: 'secondary' });
const danger = createButton('Delete', { variant: 'danger' });
```

### 不同尺寸

```typescript
const xs = createButton('XS', { size: 'xs' });
const sm = createButton('SM', { size: 'sm' });
const md = createButton('MD', { size: 'md' });
const lg = createButton('LG', { size: 'lg' });
```

### 禁用和加载状态

```typescript
const disabled = createButton('Disabled', { disabled: true });
const loading = createButton('Loading', { loading: true });
```

## 暗色模式

Button 组件自动适配暗色模式，无需额外配置。

## 最佳实践

1. 使用工厂函数创建动态按钮
2. 直接使用类创建静态按钮
3. 使用语义化的 variant（primary, secondary, danger）
4. 避免使用 `!important` 覆盖样式
5. 使用 `className` 选项添加自定义样式

## 相关组件

- [Input](../input/README.md)
- [Alert](../alert/README.md)

## 参考

- [DaisyUI Button 文档](https://daisyui.com/components/button/)
- [工厂函数源码](../../../src/options/components/shared/DaisyUIHelpers.ts)
```

3. **为所有主要组件创建文档**:

- [ ] Button
- [ ] Input
- [ ] Alert
- [ ] Card
- [ ] Stats
- [ ] ThemeSwitcher
- [ ] Toggle
- [ ] Badge（如使用）

4. **创建组件库索引**:

```markdown
<!-- docs/components/README.md -->

# AiiinOB 组件库

## 概述

本文档包含所有 DaisyUI 组件的使用指南。

## 组件列表

### 表单组件
- [Button](./button/README.md) - 按钮组件
- [Input](./input/README.md) - 输入框组件
- [Checkbox](./checkbox/README.md) - 复选框组件
- [Select](./select/README.md) - 下拉选择组件
- [Textarea](./textarea/README.md) - 文本域组件
- [Toggle](./toggle/README.md) - 开关组件

### 反馈组件
- [Alert](./alert/README.md) - 警告框组件

### 数据展示
- [Card](./card/README.md) - 卡片组件
- [Stats](./stats/README.md) - 统计数据组件

### 主题
- [ThemeSwitcher](./theme-switcher/README.md) - 主题切换器

## 设计原则

1. **统一性**: 所有组件使用 DaisyUI 样式系统
2. **可访问性**: 符合 WCAG AA 标准
3. **暗色模式**: 自动适配亮色/暗色主题
4. **响应式**: 支持不同屏幕尺寸
5. **易用性**: 提供工厂函数简化创建

## 快速开始

```typescript
import { createButton, createInput, createAlert } from '../shared/DaisyUIHelpers';

// 创建按钮
const button = createButton('Click Me', { variant: 'primary' });

// 创建输入框
const input = createInput({ type: 'text', placeholder: 'Enter text' });

// 创建警告框
const alert = createAlert('Operation successful', { type: 'success' });
```

## 主题配置

详见 [Theme Switcher 文档](./theme-switcher/README.md)

## 贡献指南

添加新组件时，请：
1. 创建工厂函数（如适用）
2. 编写单元测试
3. 创建组件文档
4. 更新本索引文件
```

**验收标准**:
- [ ] ✅ 组件文档模板已创建
- [ ] ✅ 至少 5 个主要组件文档已完成
- [ ] ✅ 组件库索引已创建
- [ ] ✅ 代码示例可运行

---

## 质量门禁

### 每次提交前检查

```bash
# 1. Lint 检查
npm run lint
# 期望: 无新增警告

# 2. 单元测试
npm run test:unit
# 期望: 537/537 通过

# 3. 构建验证
npm run build:dev -- --skip-checks
# 期望: 构建成功

# 4. 包体积检查
du -sh dist/
ls -lh dist/styles/*.css
# 期望: 总增长 < 5%
```

### 暗色模式检查

```bash
# 手动测试清单
# 1. 切换到暗色模式
# 2. 检查所有页面/组件
# 3. 验证文本可读性
# 4. 验证边框可见性
# 5. 验证 hover/focus 状态
# 6. 刷新页面，验证主题保持
```

### 视觉测试检查

- [ ] ✅ 亮色模式 30 张截图
- [ ] ✅ 暗色模式 30 张截图
- [ ] ✅ 对比图已生成
- [ ] ✅ 视觉问题已修复

---

## 验收标准

### P0 必须达成（阻塞发布）

| 标准 | 目标值 | 验证方法 | 状态 |
|------|--------|----------|------|
| **暗色主题启用** | 100% | Tailwind 配置检查 | ⏸️ |
| **主题切换器** | 100% 可用 | 手动测试 | ⏸️ |
| **颜色一致性** | 100% DaisyUI | grep 搜索 | ⏸️ |
| **暗色模式适配** | 100% 可用 | 视觉测试 | ⏸️ |
| **单元测试** | 100% 通过 | `npm run test:unit` | ⏸️ |
| **包体积增长** | < 5% | Bundle size report | ⏸️ |

### P1 建议达成（不阻塞发布）

| 标准 | 目标值 | 验证方法 | 状态 |
|------|--------|----------|------|
| **视觉 Baseline** | 60+ 截图 | screenshots/ 目录 | ⏸️ |
| **CSS 优化** | 减少 10%+ | 包体积对比 | ⏸️ |
| **视觉问题修复** | 0 个阻塞问题 | 视觉测试报告 | ⏸️ |

### P2 可选特性

| 标准 | 目标值 | 验证方法 | 状态 |
|------|--------|----------|------|
| **Modal 迁移** | 2+ Modal | 代码审查 | ⏸️ |
| **组件文档** | 5+ 组件 | docs/components/ | ⏸️ |

---

## 验收流程

### 开发者自验

**步骤 1: 功能验证** (30 分钟)

```bash
# 1. 启动开发服务器
npm run dev

# 2. 打开 Options 页面
# 3. 测试主题切换器
# 4. 测试所有页面在两种主题下
# 5. 验证主题持久化
```

**步骤 2: 颜色一致性验证** (15 分钟)

```bash
# 搜索剩余的自定义颜色
grep -rn "bg-surface-\|text-text\|border-border" src/ --include="*.ts"
# 期望: 0 结果

# 搜索硬编码颜色
grep -rn "bg-white\|bg-gray-\|text-black\|text-gray-" src/ --include="*.ts"
# 期望: 0 结果或极少
```

**步骤 3: 视觉测试验证** (60 分钟)

```bash
# 执行截图清单
# 保存到 docs/screenshots/phase3/
# 创建视觉测试报告
```

**步骤 4: 性能验证** (15 分钟)

```bash
# 构建并测量
npm run build:dev -- --skip-checks
du -sh dist/
ls -lh dist/styles/*.css

# 对比 Phase 2 baseline
# 计算增长百分比
```

**步骤 5: 创建自验报告** (20 分钟)

```markdown
# Phase 3 开发者自验报告

**验收日期**: YYYY-MM-DD
**开发者**: Your Name
**分支**: feat/phase3-dark-mode

## ✅ P0 任务完成情况

- [x] 暗色主题已启用
- [x] 主题切换器已创建
- [x] 暗色模式适配完成
- [x] 全局颜色已统一
- [x] 单元测试全部通过（XXX/XXX）
- [x] 包体积增长 < 5% (+X.XX KB, +X.XX%)

## ✅ P1 任务完成情况

- [x] 视觉 baseline 已建立（60+ 截图）
- [x] CSS 优化完成（减少 X%)
- [x] 视觉问题已修复

## ⏸️ P2 任务（可选）

- [ ] Modal 迁移（2/X 完成）
- [ ] 组件文档（5/X 完成）

## 📊 质量指标

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 暗色模式可用性 | 100% | XX% | ✅/❌ |
| 颜色一致性 | 100% | XX% | ✅/❌ |
| 单元测试通过率 | 100% | XX% | ✅/❌ |
| 包体积增长 | < 5% | +X.XX% | ✅/❌ |

## 🐛 已知问题

（列出任何未解决的问题）

## 📝 备注

（其他说明）
```

---

### 审核者验证

**审核清单**:
- [ ] 阅读开发者自验报告
- [ ] 拉取 Phase 3 分支并构建
- [ ] 运行全量测试（单元 + E2E）
- [ ] 手动测试主题切换器
- [ ] 手动测试暗色模式所有页面
- [ ] 审查代码质量（遵循 Phase 1/2 模式）
- [ ] 验证包体积增长在 5% 以内
- [ ] 检查视觉测试完整性
- [ ] 验证文档更新

**审核报告模板**: `docs/251126-design-system-poc/PHASE3-AUDIT-REPORT.md`

---

## 常见问题 (FAQ)

### Q1: 暗色模式切换时页面闪烁怎么办？

**A**: 添加主题切换动画：

```css
/* src/styles/components.css */
html.theme-transitioning * {
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease !important;
}
```

```typescript
// ThemeSwitcher.ts
html.classList.add('theme-transitioning');
setTimeout(() => {
  html.classList.remove('theme-transitioning');
}, 300);
```

---

### Q2: 如何检测系统主题偏好？

**A**: 使用 `matchMedia` API：

```typescript
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const defaultTheme = prefersDark ? 'dark' : 'light';

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('aob-theme')) {
    // 只在用户未设置偏好时跟随系统
    applyTheme(e.matches ? 'dark' : 'light');
  }
});
```

---

### Q3: 如何确保对比度符合 WCAG AA 标准？

**A**: 使用在线工具测试：
- https://webaim.org/resources/contrastchecker/
- 或浏览器 DevTools 的对比度检查器

目标：文本对比度 ≥ 4.5:1

---

### Q4: DaisyUI 主题变量有哪些？

**A**: 主要变量：
- `bg-base-100` - 主背景
- `bg-base-200` - 次级背景
- `bg-base-300` - 三级背景
- `text-base-content` - 主文本
- `text-base-content/60` - 次级文本（60% 不透明度）
- `border-base-300` - 边框

完整列表: https://daisyui.com/docs/colors/

---

### Q5: 如何处理自定义 SVG icon 颜色？

**A**: 使用 `currentColor` 或 DaisyUI 类：

```typescript
// 方法 1: currentColor（推荐）
svg.setAttribute('fill', 'currentColor');
svg.classList.add('text-base-content');

// 方法 2: DaisyUI 类
svg.classList.add('fill-base-content');
```

---

### Q6: 包体积超过 5% 怎么办？

**A**: 优化措施：
1. 检查是否引入了未使用的 DaisyUI 组件
2. 优化 Tailwind purge 配置
3. 移除未使用的主题（只保留 light 和 dark）
4. 考虑 CSS 拆分（lazy loading）

---

### Q7: 是否需要先完成 Modal 迁移？

**A**: **否**。Modal 迁移为 P2 可选任务，不阻塞 Phase 3 完成。建议优先完成 P0 和 P1 任务。

---

## 时间估算

### 分阶段工时

| 阶段 | 任务 | 工时 | 周次 |
|------|------|------|------|
| **Phase 3.1** | 暗色模式支持 | 8h | Week 1 |
| **Phase 3.2** | 全局样式统一 | 5h | Week 1 |
| **Phase 3.3** | 视觉回归测试 | 4h | Week 1-2 |
| **P0+P1 小计** | - | **17h** | **~2 天** |
| | | | |
| **Phase 3.4** | 性能优化（可选）| 4h | Week 2 |
| **P1 小计** | - | **4h** | **~0.5 天** |
| | | | |
| **Phase 3.5** | Modal 迁移（可选）| 15h | Week 2+ |
| **Phase 3.6** | 组件文档（可选）| 4h | Week 2+ |
| **P2 小计** | - | **19h** | **~2.5 天** |
| | | | |
| **总计（P0+P1）** | - | **21h** | **~3 天** |
| **总计（含 P2）** | - | **40h** | **~5 天** |

### 推荐排期

**快速路径（P0 only）**: 2 个工作日
```
Day 1:
  - 启用暗色主题（1h）
  - 创建主题切换器（3h）
  - 暗色模式适配（4h）

Day 2:
  - 全局样式统一（5h）
  - 视觉 baseline（2h）
  - 文档 + 自验（1h）
```

**推荐路径（P0+P1）**: 3 个工作日
```
Day 1: 暗色模式支持（8h）
Day 2: 全局样式统一（5h）+ 视觉测试开始（3h）
Day 3: 视觉测试完成（2h）+ 性能优化（4h）+ 文档（2h）
```

**完整路径（P0+P1+P2）**: 5-6 个工作日
```
Week 1 (Day 1-3): P0+P1 任务
Week 2 (Day 4-6): P2 可选任务（Modal + 组件文档）
```

---

## 附录

### A. DaisyUI 主题变量速查表

| DaisyUI 类 | CSS 变量 | 用途 | 亮色值示例 | 暗色值示例 |
|-----------|---------|------|-----------|-----------|
| `bg-base-100` | `--b1` | 主背景 | `#ffffff` | `#1d232a` |
| `bg-base-200` | `--b2` | 次级背景 | `#f2f2f2` | `#191e24` |
| `bg-base-300` | `--b3` | 三级背景 | `#e5e6e6` | `#15191e` |
| `text-base-content` | `--bc` | 主文本 | `#1f2937` | `#a6adba` |
| `border-base-300` | `--b3` | 边框 | `#e5e6e6` | `#15191e` |
| `bg-primary` | `--p` | 主色 | `#570df8` | `#661ae6` |
| `text-primary` | `--p` | 主色文本 | `#570df8` | `#661ae6` |
| `bg-success` | `--su` | 成功色 | `#36d399` | `#36d399` |
| `text-success` | `--su` | 成功文本 | `#36d399` | `#36d399` |
| `bg-error` | `--er` | 错误色 | `#f87272` | `#f87272` |
| `text-error` | `--er` | 错误文本 | `#f87272` | `#f87272` |

### B. 主题切换器单元测试模板

```typescript
// tests/unit/shared/themeSwitcher.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThemeSwitcher } from '../../../src/options/components/shared/ThemeSwitcher';

describe('ThemeSwitcher', () => {
  let container: HTMLElement;
  let switcher: ThemeSwitcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    localStorage.clear();
  });

  afterEach(() => {
    switcher?.destroy();
    container.remove();
  });

  it('should initialize with light theme by default', () => {
    switcher = new ThemeSwitcher(container);
    switcher.init();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('should create theme switcher UI', () => {
    switcher = new ThemeSwitcher(container);
    switcher.init();

    const toggle = container.querySelector('input[type="checkbox"]');
    expect(toggle).toBeTruthy();
    expect(toggle?.classList.contains('toggle')).toBe(true);
  });

  it('should switch to dark theme when toggle is checked', () => {
    switcher = new ThemeSwitcher(container);
    switcher.init();

    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    toggle!.checked = true;
    toggle!.dispatchEvent(new Event('change'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should save theme preference to localStorage', () => {
    switcher = new ThemeSwitcher(container);
    switcher.init();

    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    toggle!.checked = true;
    toggle!.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('aob-theme')).toBe('dark');
  });

  it('should load saved theme preference', () => {
    localStorage.setItem('aob-theme', 'dark');

    switcher = new ThemeSwitcher(container);
    switcher.init();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(toggle?.checked).toBe(true);
  });

  it('should emit theme-changed event', () => {
    switcher = new ThemeSwitcher(container);
    switcher.init();

    let eventDetail: any = null;
    window.addEventListener('theme-changed', (e: any) => {
      eventDetail = e.detail;
    });

    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    toggle!.checked = true;
    toggle!.dispatchEvent(new Event('change'));

    expect(eventDetail).toEqual({ theme: 'dark' });
  });
});
```

### C. 视觉测试自动化脚本（可选）

```javascript
// scripts/visual-regression-test.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const screenshotDir = path.join(__dirname, '../docs/screenshots/phase3');
const urls = [
  { name: '01-options-main', path: '/options/index.html' },
  { name: '02-theme-switcher', path: '/options/index.html', selector: '#theme-switcher' },
  { name: '03-usage-dashboard', path: '/options/index.html', selector: '#usageDashboard' },
  // ... 添加更多测试页面
];

async function captureScreenshots() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  for (const theme of ['light', 'dark']) {
    console.log(`📸 Capturing ${theme} mode screenshots...`);
    const themeDir = path.join(screenshotDir, theme);
    fs.mkdirSync(themeDir, { recursive: true });

    // 设置主题
    await page.evaluateOnNewDocument((theme) => {
      localStorage.setItem('aob-theme', theme);
    }, theme);

    for (const url of urls) {
      await page.goto(`http://localhost:5173${url.path}`);
      await page.waitForSelector(url.selector || 'body');

      const screenshotPath = path.join(themeDir, `${url.name}.png`);
      if (url.selector) {
        const element = await page.$(url.selector);
        await element.screenshot({ path: screenshotPath });
      } else {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

      console.log(`  ✅ ${url.name}.png`);
    }
  }

  await browser.close();
  console.log('🎉 Screenshots captured!');
}

captureScreenshots().catch(console.error);
```

---

## 完成标志

当以下所有条件满足时，Phase 3 可视为完成：

### P0 必须项（阻塞发布）

- [ ] ✅ DaisyUI 暗色主题已启用（Tailwind 配置）
- [ ] ✅ ThemeSwitcher 类已创建并集成
- [ ] ✅ 主题切换器 UI 正确显示和工作
- [ ] ✅ 主题偏好持久化（localStorage）
- [ ] ✅ 所有硬编码颜色已替换为 DaisyUI 主题变量
- [ ] ✅ 所有页面在暗色模式下可用
- [ ] ✅ 文本对比度符合 WCAG AA 标准（≥ 4.5:1）
- [ ] ✅ 所有单元测试通过（537+ / 537+）
- [ ] ✅ 包体积增长 < 5%
- [ ] ✅ 创建 Phase 3 包体积报告（`phase3-bundle-size.md`）
- [ ] ✅ 更新 `migration-log.md` 记录 Phase 3 完成

### P1 建议项（不阻塞发布）

- [ ] ✅ 亮色模式 30 张截图已完成
- [ ] ✅ 暗色模式 30 张截图已完成
- [ ] ✅ 视觉对比图已生成（可选）
- [ ] ✅ 视觉测试报告已创建
- [ ] ✅ 发现的视觉问题已修复
- [ ] ✅ CSS 优化完成（减少 10%+ 体积）
- [ ] ✅ 创建开发者自验报告（`PHASE3-SELF-CHECK.md`）
- [ ] ✅ 通过审核者审核（`PHASE3-AUDIT-REPORT.md`）

### P2 可选项（后续迭代）

- [ ] ⏸️ Modal 迁移（2+ Modal 实例）
- [ ] ⏸️ 组件文档（5+ 组件文档）

---

## 支持和反馈

### 遇到问题？

1. **查阅文档**: 优先查阅本指南和 Phase 1/2 文档
2. **搜索代码**: 参考 Phase 1/2 的实现
3. **运行测试**: 确保测试环境正常
4. **询问团队**: 在团队协作工具中提问

### 提交反馈

如本指南有不清晰或遗漏的地方，请：
- 创建 Issue 标记为 `daisyui-migration` + `phase-3`
- 在团队协作工具中讨论

---

**文档结束**

**版本**: v1.0
**最后更新**: 2025-11-27
**下次审查**: Phase 3 启动后

**祝迁移顺利！ 🚀**
