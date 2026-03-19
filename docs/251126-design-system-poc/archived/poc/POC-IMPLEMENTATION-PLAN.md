# 设计系统 POC 实施计划 | Design System POC Implementation Plan

> **文档类型**：实施手册（可独立执行）
> **预计耗时**：1-2 天
> **执行者**：任何熟悉 Node.js 和浏览器开发的工程师
> **创建日期**：2025-11-26
> **版本**：v1.0

---

## 📋 目标概述

本 POC 旨在验证以下技术方案的可行性：

1. **DaisyUI** - Tailwind 组件库是否能正确配置和使用透明度修饰符
2. **Zag.js** - 状态机库是否能正确处理交互且不丢失焦点
3. **Lucide Icons** - 图标库在 Shadow DOM 中是否能正确继承颜色
4. **CSS Variables** - 设计令牌是否能穿透 Shadow DOM 边界
5. **构建流程** - esbuild 能否正确处理 CSS 字符串注入

**验收标准**：所有 5 个验证项必须通过，才能继续进行设计系统的完整实施。

---

## 🛠️ 前置条件

### 1. 环境要求

- **Node.js**：v18+ 或 v20+（建议使用项目当前版本）
- **npm**：v8+
- **浏览器**：Chrome 90+ 或 Firefox 90+（用于测试）
- **代码编辑器**：VS Code 或任何支持 TypeScript 的编辑器

### 2. 验证当前环境

```bash
# 1. 确认当前在项目根目录
pwd
# 预期输出：/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB

# 2. 确认 Node.js 版本
node --version
# 预期：v18.x 或 v20.x

# 3. 确认 npm 版本
npm --version
# 预期：8.x 或更高

# 4. 确认当前 Git 状态
git status
# 确保工作区干净或已提交所有更改
```

### 3. 创建备份分支

```bash
# 创建专门的 POC 分支
git checkout -b poc/design-system-validation

# 如果你想在当前分支操作，至少创建一个备份标签
git tag poc-start-backup
```

---

## 📦 Step 1: 安装依赖（预计 5-10 分钟）

### 1.1 安装 DaisyUI

```bash
npm install -D daisyui@latest
```

**预期输出**：
```
added 1 package, and audited XXX packages in Xs
```

**验证安装**：
```bash
npm list daisyui
# 应该显示：daisyui@4.x.x
```

### 1.2 安装 Lucide Icons

```bash
npm install lucide@latest
```

**预期输出**：
```
added 1 package, and audited XXX packages in Xs
```

**验证安装**：
```bash
npm list lucide
# 应该显示：lucide@0.x.x
```

### 1.3 安装 Zag.js

```bash
npm install @zag-js/combobox@latest @zag-js/core@latest
```

**预期输出**：
```
added 2 packages, and audited XXX packages in Xs
```

**验证安装**：
```bash
npm list @zag-js/combobox @zag-js/core
# 应该显示：
# @zag-js/combobox@0.x.x
# @zag-js/core@0.x.x
```

### 1.4 记录包体积基线

```bash
# 安装依赖前的体积（如果你创建了备份分支，可以切换回去测量）
npm run build
ls -lh dist/

# 记录以下文件大小：
# - background.js
# - content.js
# - options.html + options.js + options.css
```

**创建测量记录文件**（稍后会用到）：

```bash
cat > /tmp/poc-package-size.txt << 'EOF'
=== 包体积测量记录 ===

## 基线（安装依赖前）
- background.js: ___ KB
- content.js: ___ KB
- options.js: ___ KB
- options.css: ___ KB

## 安装依赖后
- background.js: ___ KB
- content.js: ___ KB
- options.js: ___ KB
- options.css: ___ KB

## 增量
- 总增加: ___ KB
- 是否符合 <30KB 目标: [ ] 是 [ ] 否
EOF
```

---

## ⚙️ Step 2: 配置 DaisyUI（预计 10-15 分钟）

### 2.1 修改 `tailwind.config.cjs`

找到项目中的 `tailwind.config.cjs` 文件（如果有多个，先修改 Options 页面使用的那个）。

**需要添加的配置**：

```javascript
// tailwind.config.cjs
module.exports = {
  // ... 现有配置 ...

  plugins: [
    require('daisyui'),  // ✅ 添加这一行
  ],

  daisyui: {
    themes: [
      {
        allinob: {
          // ✅ 关键：使用分离的 HSL 值
          "primary": "hsl(var(--aobx-primary-h) var(--aobx-primary-s) var(--aobx-primary-l) / <alpha-value>)",
          "secondary": "hsl(var(--aobx-secondary-h) var(--aobx-secondary-s) var(--aobx-secondary-l) / <alpha-value>)",
          "accent": "hsl(var(--aobx-accent-h) var(--aobx-accent-s) var(--aobx-accent-l) / <alpha-value>)",
          "neutral": "hsl(var(--aobx-neutral-h) var(--aobx-neutral-s) var(--aobx-neutral-l) / <alpha-value>)",
          "base-100": "hsl(var(--aobx-surface-0-h) var(--aobx-surface-0-s) var(--aobx-surface-0-l) / <alpha-value>)",
          "info": "#3b82f6",
          "success": "#22c55e",
          "warning": "#f59e0b",
          "error": "#ef4444",
        },
      },
    ],
    darkTheme: "allinob",  // 使用自定义主题
    base: true,
    styled: true,
    utils: true,
    logs: true,
  },
};
```

### 2.2 修改 `src/options/styles/design-tokens.css`

在现有设计令牌文件中**添加**分离的 HSL 值（如果已经存在完整的 HSL 格式，需要拆分）：

```css
/* src/options/styles/design-tokens.css */
:root {
  /* ✅ 新增：分离的 HSL 值（用于 DaisyUI 透明度修饰符） */
  --aobx-primary-h: 257;
  --aobx-primary-s: 86%;
  --aobx-primary-l: 63%;

  --aobx-secondary-h: 220;
  --aobx-secondary-s: 15%;
  --aobx-secondary-l: 50%;

  --aobx-accent-h: 257;
  --aobx-accent-s: 86%;
  --aobx-accent-l: 63%;

  --aobx-neutral-h: 220;
  --aobx-neutral-s: 15%;
  --aobx-neutral-l: 20%;

  --aobx-surface-0-h: 0;
  --aobx-surface-0-s: 0%;
  --aobx-surface-0-l: 100%;

  /* 保留现有的完整格式（用于非 DaisyUI 场景） */
  --aobx-accent: hsl(257 86% 63%);
  --aobx-surface-0: hsl(0 0% 100%);
  /* ... 其他现有变量 ... */
}
```

**⚠️ 注意**：如果现有 CSS 变量已经在使用，确保不要删除它们，只需**添加**分离的 HSL 值即可。

### 2.3 验证配置

```bash
# 重新构建项目
npm run build

# 检查构建输出是否包含 DaisyUI 类
grep -r "\.btn" dist/options.css
# 应该能看到 .btn、.btn-primary 等类
```

---

## 🧪 Step 3: 执行测试（预计 30-60 分钟）

### 3.1 测试环境准备

有两种方式运行测试：

**方式 1：直接在浏览器打开（简单）**

```bash
# macOS
open tests/visual/daisyui-opacity-test.html

# Linux
xdg-open tests/visual/daisyui-opacity-test.html

# Windows
start tests/visual/daisyui-opacity-test.html
```

**方式 2：通过本地服务器（推荐）**

```bash
# 启动本地服务器
npx http-server -p 3000

# 在浏览器访问：
# http://localhost:3000/tests/visual/daisyui-opacity-test.html
```

---

### 3.2 测试 1: DaisyUI 透明度修饰符

**测试文件**：`tests/visual/daisyui-opacity-test.html`

**测试目标**：验证 DaisyUI 的透明度修饰符（如 `bg-primary/50`）是否正常工作。

#### 执行步骤

1. **打开测试页面**
   ```bash
   open tests/visual/daisyui-opacity-test.html
   # 或通过 http://localhost:3000/tests/visual/daisyui-opacity-test.html
   ```

2. **视觉检查**
   - 页面应该显示多个颜色方块，从 100% 不透明到 10% 透明
   - 每个方块应该清晰显示不同的透明度层次
   - 悬停时应该有平滑的颜色过渡

3. **预期结果**
   - ✅ 所有透明度修饰符（`/10`、`/25`、`/50`、`/75`）都能正常显示
   - ✅ 颜色与设计令牌中定义的颜色一致
   - ✅ 透明度呈现平滑渐变，没有突变或断层

4. **失败场景识别**
   - ❌ 所有方块都是 100% 不透明（透明度失效）
   - ❌ 颜色显示为黑色或默认颜色（CSS 变量未传递）
   - ❌ 控制台有 CSS 解析错误

5. **记录结果**
   ```bash
   # 在结果记录文件中填写
   cat >> /tmp/poc-test-results.txt << 'EOF'

   === 测试 1: DaisyUI 透明度修饰符 ===
   状态: [ ] 通过 [ ] 失败

   视觉检查:
   - 透明度层次是否清晰: [ ] 是 [ ] 否
   - 颜色是否正确: [ ] 是 [ ] 否
   - 悬停效果是否正常: [ ] 是 [ ] 否

   控制台错误: (如有)


   截图路径: (如果失败，建议截图)

   EOF
   ```

---

### 3.3 测试 2: Zag.js 交互和焦点

**测试文件**：`tests/visual/zagjs-combobox-test.html`

**测试目标**：验证 Zag.js 的状态管理和 DOM 更新是否正确，**特别是焦点不丢失**。

#### 执行步骤

1. **打开测试页面**
   ```bash
   open tests/visual/zagjs-combobox-test.html
   ```

2. **焦点测试（🚨 关键）**
   - 点击 Combobox 输入框
   - **快速连续**输入多个字符，例如 "main"
   - 观察输入是否流畅

3. **预期结果**
   - ✅ 能够流畅输入多个字符，焦点不会丢失
   - ✅ 下拉列表能够根据输入实时过滤选项
   - ✅ 使用上下箭头键可以导航选项
   - ✅ 按 Enter 可以选中当前高亮选项
   - ✅ 按 Esc 可以关闭下拉列表

4. **失败场景识别（🚨 致命）**
   - ❌ 输入第二个字符后焦点丢失（需要重新点击才能继续输入）
   - ❌ 输入后下拉列表不更新
   - ❌ 键盘导航不工作
   - ❌ 控制台有 JavaScript 错误

5. **详细焦点测试步骤**
   ```
   1. 点击输入框
   2. 输入 "m" → 检查焦点是否仍在输入框
   3. 输入 "a" → 检查焦点是否仍在输入框
   4. 输入 "i" → 检查焦点是否仍在输入框
   5. 输入 "n" → 检查焦点是否仍在输入框

   预期：4 次输入后，输入框显示 "main"，焦点始终在输入框中
   ```

6. **记录结果**
   ```bash
   cat >> /tmp/poc-test-results.txt << 'EOF'

   === 测试 2: Zag.js 焦点和交互 ===
   状态: [ ] 通过 [ ] 失败

   焦点测试（关键）:
   - 能否连续输入多个字符: [ ] 是 [ ] 否
   - 输入过程中焦点是否丢失: [ ] 从未丢失 [ ] 偶尔丢失 [ ] 总是丢失

   功能测试:
   - 下拉列表是否实时过滤: [ ] 是 [ ] 否
   - 键盘导航（上下箭头）: [ ] 正常 [ ] 异常
   - Enter 选中选项: [ ] 正常 [ ] 异常
   - Esc 关闭列表: [ ] 正常 [ ] 异常

   控制台错误: (如有)


   EOF
   ```

---

### 3.4 测试 3: Lucide Icons 颜色继承

**测试文件**：`tests/visual/lucide-shadow-dom-test.html`

**测试目标**：验证 Lucide Icons 在 Shadow DOM 中是否能正确继承文字颜色。

#### 执行步骤

1. **打开测试页面**
   ```bash
   open tests/visual/lucide-shadow-dom-test.html
   ```

2. **视觉检查**
   - 页面显示多个图标行，每行有不同的颜色（主色、成功色、错误色等）
   - 每个图标的颜色应该与其旁边的文字颜色一致

3. **预期结果**
   - ✅ 主色图标是紫色（#8b5cf6）
   - ✅ 成功色图标是绿色（#22c55e）
   - ✅ 错误色图标是红色（#ef4444）
   - ✅ Shadow DOM 中的图标颜色也正确显示
   - ✅ 错误示例中的图标颜色不匹配（用于对比）

4. **使用开发者工具验证**
   ```
   1. 右键点击任一图标 → 检查元素
   2. 查看 <svg> 标签的 stroke 属性
      预期：stroke="currentColor"
   3. 查看 Computed 样式中的 stroke 颜色
   4. 对比父元素的 color 属性
      预期：两者颜色值完全一致
   ```

5. **点击"运行自动检测"按钮**
   - 页面会自动检测所有图标的颜色
   - 输出应该显示所有测试项为 "✓ 正确匹配"

6. **记录结果**
   ```bash
   cat >> /tmp/poc-test-results.txt << 'EOF'

   === 测试 3: Lucide Icons 颜色继承 ===
   状态: [ ] 通过 [ ] 失败

   视觉检查:
   - 主色图标是否为紫色: [ ] 是 [ ] 否
   - 成功色图标是否为绿色: [ ] 是 [ ] 否
   - 错误色图标是否为红色: [ ] 是 [ ] 否
   - Shadow DOM 中图标颜色是否正确: [ ] 是 [ ] 否

   自动检测输出:
   - 所有测试项是否为 "✓": [ ] 是 [ ] 否

   开发者工具验证:
   - stroke 属性是否为 currentColor: [ ] 是 [ ] 否
   - 计算后的颜色是否匹配父元素: [ ] 是 [ ] 否

   EOF
   ```

---

### 3.5 测试 4: CSS 变量穿透

**测试文件**：`tests/visual/css-vars-penetration-test.html`

**测试目标**：验证 CSS 变量是否能从宿主页面穿透到 Shadow DOM 内部。

#### 执行步骤

1. **打开测试页面**
   ```bash
   open tests/visual/css-vars-penetration-test.html
   ```

2. **视觉检查**
   - 页面显示多个按钮：宿主页面按钮 + 多个 Shadow DOM 按钮
   - 所有按钮的颜色、大小、圆角、内边距应该完全一致

3. **预期结果**
   - ✅ 所有按钮（宿主 + Shadow DOM）的外观一致
   - ✅ Shadow DOM #1（基础）按钮正常显示
   - ✅ Shadow DOM #2（adoptedStyleSheets）按钮正常显示
   - ✅ Shadow DOM #3（嵌套）按钮正常显示

4. **点击"运行自动检测"按钮**
   - 页面会自动比较所有按钮的计算样式
   - 输出应该显示：
     - 颜色 ✓
     - 字体大小 ✓
     - 内边距 ✓
     - 圆角 ✓
     - 状态：✓ 完全匹配

5. **CSS 变量存在性检查**
   - 自动检测输出的第二部分会列出所有 CSS 变量
   - 每个变量后应该显示 "✓" 而不是 "(未定义) ✗"

6. **记录结果**
   ```bash
   cat >> /tmp/poc-test-results.txt << 'EOF'

   === 测试 4: CSS 变量穿透 ===
   状态: [ ] 通过 [ ] 失败

   视觉检查:
   - 所有按钮外观是否一致: [ ] 是 [ ] 否
   - Shadow DOM #1 是否正常: [ ] 是 [ ] 否
   - Shadow DOM #2 (adoptedStyleSheets) 是否正常: [ ] 是 [ ] 否
   - Shadow DOM #3 (嵌套) 是否正常: [ ] 是 [ ] 否

   自动检测输出:
   - Shadow DOM #1: [ ] 完全匹配 [ ] 存在差异
   - Shadow DOM #2: [ ] 完全匹配 [ ] 存在差异
   - Shadow DOM #3: [ ] 完全匹配 [ ] 存在差异

   CSS 变量检查:
   - 所有变量是否定义: [ ] 是 [ ] 否
   - 哪些变量未定义: (如有)


   EOF
   ```

---

### 3.6 测试 5: 构建流程验证

**测试目标**：验证 esbuild 是否能正确处理 CSS 字符串，特别是 `<alpha-value>` 占位符。

#### 执行步骤

1. **检查 esbuild 配置**

找到项目中的构建配置文件（通常是 `scripts/build.mjs` 或 `esbuild.config.js`）。

**必需的配置**：
```javascript
{
  minify: true,
  charset: 'utf8',  // ✅ 关键：防止 <alpha-value> 被转义
  loader: {
    '.css': 'text',  // ✅ 关键：将 CSS 作为字符串导入
  },
}
```

2. **验证 dev 模式构建**

```bash
# 运行开发模式构建
npm run build:dev

# 检查生成的 CSS 文件
cat dist/options.css | grep -A 2 "alpha-value"
# 应该能找到 <alpha-value> 字符串，而不是被转义的版本（如 &lt;alpha-value&gt;）

# 检查 color-mix 函数
cat dist/options.css | grep "color-mix"
# 应该能找到完整的 color-mix(in srgb, ...) 函数
```

3. **验证 prod 模式构建**

```bash
# 运行生产模式构建
npm run build

# 再次检查
cat dist/options.css | grep -A 2 "alpha-value"
cat dist/options.css | grep "color-mix"

# 对比 dev 和 prod 的输出
diff <(grep "alpha-value" dist-dev/options.css) <(grep "alpha-value" dist/options.css)
# 应该没有差异或差异极小（仅压缩程度不同）
```

4. **测试实际加载**

```bash
# 启动开发服务器（如果项目有）
npm run dev

# 或者直接在浏览器打开 options 页面
open dist/options.html

# 检查页面是否正常显示
# 检查控制台是否有 CSS 解析错误
```

5. **记录结果**

```bash
cat >> /tmp/poc-test-results.txt << 'EOF'

=== 测试 5: 构建流程验证 ===
状态: [ ] 通过 [ ] 失败

esbuild 配置检查:
- 是否包含 charset: 'utf8': [ ] 是 [ ] 否
- 是否包含 loader: { '.css': 'text' }: [ ] 是 [ ] 否

dev 模式验证:
- <alpha-value> 是否未被转义: [ ] 是 [ ] 否
- color-mix() 是否完整: [ ] 是 [ ] 否

prod 模式验证:
- <alpha-value> 是否未被转义: [ ] 是 [ ] 否
- color-mix() 是否完整: [ ] 是 [ ] 否
- dev 和 prod 输出是否一致: [ ] 是 [ ] 否

实际加载测试:
- options 页面是否正常显示: [ ] 是 [ ] 否
- 控制台是否有错误: [ ] 无错误 [ ] 有错误

错误信息: (如有)


EOF
```

---

## 📊 Step 4: 汇总结果（预计 15 分钟）

### 4.1 填写完整的验收清单

创建最终的验收报告：

```bash
cat > /tmp/poc-final-report.txt << 'EOF'
========================================
设计系统 POC 验收报告
========================================

执行日期: ___________
执行人: ___________

----------------------------------------
1. DaisyUI 透明度修饰符
----------------------------------------
状态: [ ] ✅ 通过 [ ] ❌ 失败

详细结果:
- 透明度修饰符（/50、/75）是否正常: [ ] 是 [ ] 否
- 颜色是否与设计令牌一致: [ ] 是 [ ] 否
- 误差是否 < 5%: [ ] 是 [ ] 否

失败原因（如适用）:


----------------------------------------
2. Zag.js 交互验证
----------------------------------------
状态: [ ] ✅ 通过 [ ] ❌ 失败

详细结果:
- 连续输入字符时焦点是否保持: [ ] 是 [ ] 否 [🚨 关键]
- 下拉列表是否实时更新: [ ] 是 [ ] 否
- 键盘导航是否正常: [ ] 是 [ ] 否
- Enter 选中功能是否正常: [ ] 是 [ ] 否
- Esc 关闭功能是否正常: [ ] 是 [ ] 否

失败原因（如适用）:


----------------------------------------
3. Shadow DOM + Lucide Icons
----------------------------------------
状态: [ ] ✅ 通过 [ ] ❌ 失败

详细结果:
- 图标颜色是否自动跟随文字: [ ] 是 [ ] 否
- Shadow DOM 中图标是否正常: [ ] 是 [ ] 否
- stroke="currentColor" 是否生效: [ ] 是 [ ] 否

失败原因（如适用）:


----------------------------------------
4. CSS 变量穿透
----------------------------------------
状态: [ ] ✅ 通过 [ ] ❌ 失败

详细结果:
- 所有 Shadow DOM 按钮是否外观一致: [ ] 是 [ ] 否
- adoptedStyleSheets 是否正常工作: [ ] 是 [ ] 否
- 嵌套 Shadow DOM 是否正常: [ ] 是 [ ] 否
- 所有 CSS 变量是否可访问: [ ] 是 [ ] 否

失败原因（如适用）:


----------------------------------------
5. 构建流程验证
----------------------------------------
状态: [ ] ✅ 通过 [ ] ❌ 失败

详细结果:
- <alpha-value> 是否未被转义: [ ] 是 [ ] 否
- color-mix() 是否完整: [ ] 是 [ ] 否
- dev 和 prod 输出是否一致: [ ] 是 [ ] 否

失败原因（如适用）:


----------------------------------------
6. 包体积监控
----------------------------------------
状态: [ ] ✅ 通过 (< 30KB) [ ] ❌ 失败 (> 30KB)

详细数据:
- 基线包体积: ___ KB (gzipped)
- 新增包体积: ___ KB (gzipped)
- 增量: ___ KB
- 主要增量来源: [ ] DaisyUI [ ] Zag.js [ ] Lucide [ ] 其他

========================================
最终结论
========================================

通过测试: ___/6

[ ] ✅ 所有测试通过 - 可以继续进行任务拆解和完整实施
[ ] ⚠️ 部分测试失败 - 需要调整方案或寻找替代方案
[ ] ❌ 多个测试失败 - 建议重新评估技术选型

下一步行动:


备注:


EOF

# 打开报告文件，填写结果
code /tmp/poc-final-report.txt
# 或
nano /tmp/poc-final-report.txt
```

### 4.2 创建截图证据

如果测试通过，建议截图保存证据：

```bash
# 创建截图目录
mkdir -p docs/251126-design-system-poc/poc-screenshots

# 截图命名规范：
# - test1-daisyui-opacity-pass.png
# - test2-zagjs-focus-pass.png
# - test3-lucide-icons-pass.png
# - test4-css-vars-pass.png
# - test5-build-output.png
```

---

## 🚨 故障排查指南

### 问题 1: DaisyUI 透明度修饰符不工作

**症状**：所有颜色都是 100% 不透明，`bg-primary/50` 不生效

**可能原因**：
1. CSS 变量格式错误（使用了完整的 `hsl(257 86% 63%)` 而不是分离值）
2. 缺少 `<alpha-value>` 占位符
3. Tailwind 配置未正确引用 CSS 变量

**排查步骤**：

```bash
# 1. 检查 design-tokens.css 是否有分离的 HSL 值
grep "primary-h" src/options/styles/design-tokens.css
# 应该能找到 --aobx-primary-h: 257;

# 2. 检查 tailwind.config.cjs 中的 daisyui 配置
grep -A 10 "daisyui:" tailwind.config.cjs
# 应该能看到 "primary": "hsl(var(--aobx-primary-h) ... / <alpha-value>)"

# 3. 检查生成的 CSS
grep "bg-primary" dist/options.css | head -5
# 应该能看到 rgba() 或带有透明度的颜色值
```

**解决方案**：
- 确保使用 HSL 分离值格式（参考 Step 2.2）
- 确保 `<alpha-value>` 占位符存在
- 重新构建：`npm run build`

---

### 问题 2: Zag.js 焦点丢失

**症状**：输入一个字符后，必须重新点击输入框才能继续输入

**可能原因**：
1. 测试页面使用了错误的实现方式（使用 `innerHTML = ''` 清空 DOM）
2. `updateDOM()` 函数在每次状态变化时重建整个结构

**排查步骤**：

```bash
# 检查测试文件中的实现
grep -A 20 "updateDOM" tests/visual/zagjs-combobox-test.html

# 如果看到以下代码，说明实现是错误的：
# this.container.innerHTML = '';  // ❌ 错误
```

**解决方案**：
- 打开 `docs/251126-design-system-poc/design-system-technical-details.md`
- 查看 §2 "Zag.js 响应式更新" 部分
- 使用正确的实现方式（Mount/Update 分离，保持元素引用）
- 如果测试文件本身有问题，需要重写测试文件

**紧急修复脚本**：

```javascript
// 在浏览器控制台运行以下代码，验证正确实现
const testFocus = () => {
  const input = document.querySelector('input');
  console.log('Initial focus:', document.activeElement === input);

  input.focus();
  input.value = 'm';
  input.dispatchEvent(new Event('input', { bubbles: true }));

  setTimeout(() => {
    console.log('After input "m":', document.activeElement === input);

    input.value = 'ma';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => {
      console.log('After input "ma":', document.activeElement === input);
      // 应该全部显示 true
    }, 100);
  }, 100);
};

testFocus();
```

---

### 问题 3: Lucide Icons 颜色不跟随

**症状**：图标颜色是黑色或固定颜色，不跟随文字颜色

**可能原因**：
1. SVG 的 `stroke` 属性不是 `currentColor`
2. SVG 使用了 `fill` 而不是 `stroke`

**排查步骤**：

```bash
# 检查测试文件中的 SVG 代码
grep -A 3 "<svg" tests/visual/lucide-shadow-dom-test.html | grep stroke

# 应该看到：stroke="currentColor"
```

**在浏览器中验证**：

```javascript
// 在浏览器控制台运行
const svg = document.querySelector('.icon-wrapper svg');
console.log('stroke attribute:', svg.getAttribute('stroke'));
// 应该输出：currentColor

const computedStroke = window.getComputedStyle(svg).stroke;
const parentColor = window.getComputedStyle(svg.closest('.color-row')).color;
console.log('Computed stroke:', computedStroke);
console.log('Parent color:', parentColor);
console.log('Match:', computedStroke === parentColor);
// Match 应该是 true
```

**解决方案**：
- 确保所有 SVG 图标都设置了 `stroke="currentColor"`
- 如果使用 Lucide 库，确保传递了正确的参数：
  ```javascript
  icons['Bookmark'].toSvg({
    stroke: 'currentColor',  // ✅
    fill: 'none',             // ✅
  })
  ```

---

### 问题 4: CSS 变量在 Shadow DOM 中为空

**症状**：Shadow DOM 中的元素无法获取 CSS 变量的值

**可能原因**：
1. CSS 变量名拼写错误
2. CSS 变量未在 `:root` 中定义
3. Shadow DOM 的样式注入方式错误

**排查步骤**：

```javascript
// 在浏览器控制台运行
const root = document.documentElement;
const rootStyles = window.getComputedStyle(root);
console.log('--aobx-accent:', rootStyles.getPropertyValue('--aobx-accent'));
// 应该输出颜色值，例如：hsl(257 86% 63%)

const shadowHost = document.getElementById('shadowHost1');
const shadowRoot = shadowHost.shadowRoot;
const shadowBtn = shadowRoot.querySelector('button');
const shadowStyles = window.getComputedStyle(shadowBtn);
console.log('Button color:', shadowStyles.color);
// 应该输出解析后的颜色值，例如：rgb(139, 92, 246)
```

**解决方案**：
- 确保 CSS 变量在 `src/options/styles/design-tokens.css` 的 `:root` 中定义
- 检查变量名是否一致（区分大小写）
- 确保 `design-tokens.css` 被正确加载到宿主页面

---

### 问题 5: 构建输出中 `<alpha-value>` 被转义

**症状**：生成的 CSS 中看到 `&lt;alpha-value&gt;` 而不是 `<alpha-value>`

**可能原因**：
1. esbuild 配置缺少 `charset: 'utf8'`
2. 使用了其他构建工具（如 webpack）且配置不正确

**排查步骤**：

```bash
# 检查构建配置文件
cat scripts/build.mjs | grep -A 5 -B 5 "charset"

# 应该看到：
# charset: 'utf8',
```

**解决方案**：

找到构建配置文件（`scripts/build.mjs` 或 `esbuild.config.js`），确保包含：

```javascript
// esbuild 配置
{
  minify: true,
  charset: 'utf8',  // ✅ 添加这一行
  loader: {
    '.css': 'text',  // ✅ 添加这一行
  },
}
```

然后重新构建：

```bash
npm run build
```

---

## 📝 提交 POC 结果

### 1. 整理所有产出文件

```bash
# 创建 POC 结果目录
mkdir -p docs/251126-design-system-poc/poc-results

# 复制结果文件
cp /tmp/poc-final-report.txt docs/251126-design-system-poc/poc-results/
cp /tmp/poc-test-results.txt docs/251126-design-system-poc/poc-results/
cp /tmp/poc-package-size.txt docs/251126-design-system-poc/poc-results/

# 如果有截图
cp -r ~/Desktop/poc-screenshots/* docs/251126-design-system-poc/poc-screenshots/
```

### 2. 提交到 Git

```bash
# 查看所有更改
git status

# 添加所有更改
git add .

# 创建提交
git commit -m "poc(design-system): Complete POC validation for DaisyUI + Zag.js + Lucide

- ✅ DaisyUI opacity modifiers working with HSL split format
- ✅ Zag.js state management without focus loss
- ✅ Lucide Icons color inheritance in Shadow DOM
- ✅ CSS variables penetration confirmed
- ✅ Build process validation passed
- 📦 Package size increase: XXX KB (within 30KB target)

All 6 POC tests passed. Ready for task breakdown and full implementation."

# 推送到远程（如果需要）
git push origin poc/design-system-validation
```

### 3. 创建汇报文档

```bash
cat > docs/251126-design-system-poc/POC-SUMMARY.md << 'EOF'
# 设计系统 POC 验证总结

## 执行概况

- **执行日期**：___________
- **执行人**：___________
- **耗时**：___ 小时
- **分支**：poc/design-system-validation

## 验证结果

| 测试项 | 状态 | 备注 |
|--------|------|------|
| DaisyUI 透明度修饰符 | ✅ / ❌ | |
| Zag.js 焦点管理 | ✅ / ❌ | |
| Lucide Icons 颜色继承 | ✅ / ❌ | |
| CSS 变量穿透 | ✅ / ❌ | |
| 构建流程验证 | ✅ / ❌ | |
| 包体积监控 | ✅ / ❌ | 增加 ___ KB |

**通过率**：___/6

## 关键发现

### 技术可行性
- (填写你的发现)

### 潜在风险
- (填写识别的风险)

### 建议调整
- (填写建议的调整方案)

## 下一步行动

- [ ] 向团队汇报 POC 结果
- [ ] 决策是否继续完整实施
- [ ] 如果通过，开始任务拆解
- [ ] 如果失败，评估替代方案

## 附件

- [完整测试结果](./poc-results/poc-test-results.txt)
- [最终验收报告](./poc-results/poc-final-report.txt)
- [包体积数据](./poc-results/poc-package-size.txt)
- [测试截图](./poc-screenshots/)

EOF

# 打开文件填写
code docs/251126-design-system-poc/POC-SUMMARY.md
```

---

## ✅ 验收标准（最终检查）

在提交结果前，确保以下所有项都已完成：

### 必须通过（6/6）

- [ ] ✅ DaisyUI 透明度修饰符（`/50`、`/75`）正常工作
- [ ] ✅ Zag.js Combobox 支持完整键盘导航，**且焦点不丢失**
- [ ] ✅ Shadow DOM 中样式隔离且 CSS 变量正确继承
- [ ] ✅ Lucide Icons 颜色自动跟随文字颜色
- [ ] ✅ Dev 和 Prod 构建的 CSS 字符串功能一致
- [ ] ✅ 包体积增加 < 30KB (gzipped)

### 文档完整性

- [ ] 已填写完整的 `poc-final-report.txt`
- [ ] 已记录所有测试结果到 `poc-test-results.txt`
- [ ] 已测量并记录包体积数据到 `poc-package-size.txt`
- [ ] 已创建 `POC-SUMMARY.md` 汇总文档
- [ ] 如果有失败项，已截图保存证据
- [ ] 已提交到 Git 并推送到远程（如适用）

---

## 🆘 需要帮助？

如果在执行过程中遇到无法解决的问题：

1. **查阅技术细节文档**
   - `docs/251126-design-system-poc/design-system-technical-details.md`
   - 特别是 §2（Zag.js 焦点问题）和 §1（DaisyUI 颜色配置）

2. **查看现有测试文件的源代码**
   - 测试文件本身包含完整的实现示例
   - 可以直接在浏览器中查看控制台输出

3. **联系技术负责人**
   - 提供详细的错误信息
   - 提供控制台截图
   - 提供 `poc-test-results.txt` 内容

4. **回滚方案**
   ```bash
   # 如果需要回滚所有更改
   git reset --hard poc-start-backup

   # 或切换回原分支
   git checkout main
   ```

---

**文档版本**：v1.0
**最后更新**：2025-11-26
**预计总耗时**：1-2 天（包括安装、配置、测试、记录）

祝顺利完成 POC 验证！🎉
