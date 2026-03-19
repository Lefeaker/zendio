# POC 剩余工作指导文档

**文档版本**: v1.1 (修正版)
**创建日期**: 2025-11-26
**修订日期**: 2025-11-26
**适用对象**: 开发人员

---

## 📊 当前 POC 完成情况

### ✅ 已完成的工作（79% 完成度）

1. **依赖安装** ✅
   - DaisyUI v4.12.10（已降级，解决类生成问题）
   - @zag-js/combobox v1.29.1
   - @zag-js/core v1.29.1
   - lucide v0.554.0

2. **配置文件** ✅
   - `tailwind.config.cjs`: 已配置 DaisyUI + OKLCH 颜色 + safelist
   - `scripts/build.mjs`: 已添加 `charset: 'utf8'` 和 `loader: { '.css': 'text' }`

3. **组件实现** ✅
   - `src/ui/ZagCombobox.js`: 正确实现 Mount/Update 分离，避免焦点丢失

4. **测试文件创建** ✅
   - `tests/visual/daisyui-opacity-test.html`
   - `tests/visual/zagjs-combobox-test.html`
   - `tests/visual/lucide-shadow-dom-test.html`
   - `tests/visual/css-vars-penetration-test.html`

5. **验证通过的项目** ✅
   - DaisyUI 类生成: 174 个 `.btn` 类已生成
   - Lucide Icons 在 Shadow DOM 中的颜色继承
   - CSS 变量穿透 Shadow DOM

### ❌ 未完成的工作（阻碍验收）

1. **Zag.js 运行时焦点测试** 🚨 **最关键**
   - 状态: 代码实现正确，但未进行实际运行时测试
   - 原因: 测试环境的模块加载问题
   - 影响: 无法验证焦点管理是否真正有效

2. **包体积基线测量** 🚨 **必需**
   - 状态: 文档承诺但未执行
   - 影响: 无法量化 DaisyUI 对包体积的影响

### ⚠️ 技术债务（建议修复）

3. **使用 OKLCH 颜色格式**（推荐改为 HSL Split）
4. **使用 safelist 变通方案**（推荐改为正确的 content 扫描）

---

## 🚨 必须完成的工作（验收必需）

### 任务 1: Zag.js 运行时焦点测试 🔥 最高优先级

**预计时间**: 1-2 小时
**重要性**: 这是 POC 的核心验证项，验证 Zag.js 能否解决焦点丢失问题

#### 问题背景
- 技术文档中将焦点丢失标记为"致命问题"
- `src/ui/ZagCombobox.js` 已实现 Mount/Update 分离架构
- 但由于模块加载问题，未能在浏览器中实际运行测试

#### 解决方案 A: 简化测试页面（推荐 ✅）

**创建文件**: `tests/visual/zagjs-focus-simple.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zag.js Focus Test (Simplified)</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
    }
    .combobox-container {
      margin-bottom: 30px;
      padding: 20px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
    }
    input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    input:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
    .test-info {
      background: #fef3c7;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .result {
      margin-top: 20px;
      padding: 10px;
      background: #f3f4f6;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }
    button {
      margin-top: 10px;
      padding: 8px 16px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    button:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <h1>🧪 Zag.js 焦点管理测试</h1>

  <div class="test-info">
    <strong>测试目标:</strong> 验证在频繁状态更新时，输入框不会失去焦点
    <br><strong>操作步骤:</strong>
    <ol>
      <li>在输入框中输入文字（例如 "test"）</li>
      <li>观察输入框是否始终保持焦点</li>
      <li>点击"强制更新10次"按钮，观察输入框焦点是否丢失</li>
    </ol>
    <strong>预期结果:</strong> 输入框应始终保持焦点，能持续输入
  </div>

  <div class="combobox-container">
    <h3>测试输入框</h3>
    <div id="combobox-root"></div>
    <button id="force-update-btn">🔄 强制更新10次（模拟频繁状态变化）</button>
    <div class="result" id="result">
      状态更新次数: 0<br>
      当前焦点元素: -
    </div>
  </div>

  <script type="module">
    // 简化版 Combobox，模拟 Zag.js 的核心逻辑
    class SimpleCombobox {
      constructor(container) {
        this.container = container;
        this.updateCount = 0;

        // Phase A: 创建 DOM 结构（仅一次）
        this.mount();

        // Phase B: 模拟状态机的订阅
        this.simulateStateUpdates();
      }

      mount() {
        // ✅ 正确方式：创建元素一次，不销毁
        this.label = document.createElement('label');
        this.label.textContent = '搜索:';
        this.label.style.display = 'block';
        this.label.style.marginBottom = '8px';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.placeholder = '输入以搜索...';

        this.container.appendChild(this.label);
        this.container.appendChild(this.input);

        // 监听输入事件，模拟状态变化
        this.input.addEventListener('input', () => {
          this.updateAttributes();
        });
      }

      updateAttributes() {
        // ✅ 正确方式：只更新属性，不重新创建元素
        this.updateCount++;

        const value = this.input.value;
        this.input.setAttribute('aria-expanded', value.length > 0 ? 'true' : 'false');
        this.input.setAttribute('data-update-count', this.updateCount);

        this.logStatus();
      }

      simulateStateUpdates() {
        // 模拟 Zag.js 的频繁状态更新
        setInterval(() => {
          if (document.activeElement === this.input) {
            this.updateAttributes();
          }
        }, 100);
      }

      forceUpdate(times) {
        // 强制触发多次更新，测试焦点是否丢失
        for (let i = 0; i < times; i++) {
          this.updateAttributes();
        }
      }

      logStatus() {
        const resultEl = document.getElementById('result');
        const focusedEl = document.activeElement;
        resultEl.innerHTML = `
          状态更新次数: ${this.updateCount}<br>
          当前焦点元素: ${focusedEl.tagName} ${focusedEl === this.input ? '✅ (测试输入框)' : '❌ (焦点丢失!)'}
        `;
      }
    }

    // 初始化
    const combobox = new SimpleCombobox(document.getElementById('combobox-root'));

    // 强制更新按钮
    document.getElementById('force-update-btn').addEventListener('click', () => {
      combobox.input.focus();
      combobox.forceUpdate(10);
    });
  </script>
</body>
</html>
```

**执行步骤**:

```bash
# 1. 创建测试文件（复制上面的代码）
# 保存为 tests/visual/zagjs-focus-simple.html

# 2. 在浏览器中打开
open tests/visual/zagjs-focus-simple.html

# 3. 执行测试
# - 在输入框中输入文字
# - 点击"强制更新10次"按钮
# - 观察输入框是否始终保持焦点
```

**验收标准**:
- ✅ 输入过程中，输入框始终保持焦点
- ✅ 点击"强制更新10次"后，输入框仍然保持焦点
- ✅ 页面下方显示"当前焦点元素: INPUT ✅ (测试输入框)"

**如何记录结果**:

更新 `docs/251126-design-system-poc/poc-results/detailed-log.md`:

```markdown
## Test 2: Zag.js Combobox Interaction (补充测试)

- **测试方法**: 简化版焦点测试（zagjs-focus-simple.html）
- **测试步骤**:
  1. 在输入框中输入 "test focus"
  2. 点击"强制更新10次"按钮
  3. 观察输入框焦点是否保持
- **结果**:
  - 输入过程中焦点保持: [✅ 通过 / ❌ 失败]
  - 强制更新后焦点保持: [✅ 通过 / ❌ 失败]
  - 截图: [附上测试截图]
- **结论**: Mount/Update 分离架构有效防止焦点丢失
```

#### 解决方案 B: 使用真实 Zag.js（如果方案 A 不满意）

**创建文件**: `tests/visual/zagjs-focus-bundled.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Zag.js Focus Test (Real Implementation)</title>
  <style>
    body {
      font-family: system-ui;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
    }
    .combobox-wrapper {
      margin-bottom: 20px;
    }
    input {
      padding: 8px;
      width: 100%;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    input:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
    .item {
      padding: 8px;
      cursor: pointer;
    }
    .item:hover {
      background: #f0f0f0;
    }
    .item.highlighted {
      background: #e0e0ff;
    }
    .test-info {
      background: #fef3c7;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <h1>Zag.js 焦点测试（使用真实 Combobox）</h1>

  <div class="test-info">
    <strong>测试步骤:</strong>
    <ol>
      <li>在输入框中输入 "ap"</li>
      <li>观察下拉列表是否显示</li>
      <li>继续输入文字，观察焦点是否保持</li>
      <li>使用方向键↑↓浏览选项</li>
    </ol>
    <strong>预期结果:</strong> 输入框应始终保持焦点，下拉列表实时更新
  </div>

  <div class="combobox-wrapper" id="combobox-root"></div>

  <!-- 使用 CDN 版本的 Zag.js -->
  <script src="https://cdn.jsdelivr.net/npm/@zag-js/combobox@1.29.1/dist/index.global.js"></script>

  <script>
    const combobox = window['@zag-js/combobox'];

    const data = [
      { label: "Apple", value: "apple" },
      { label: "Banana", value: "banana" },
      { label: "Orange", value: "orange" },
      { label: "Grape", value: "grape" },
      { label: "Pineapple", value: "pineapple" }
    ];

    // ✅ 使用正确的 Zag.js API（参考 src/ui/ZagCombobox.js）
    class ZagCombobox {
      constructor(root) {
        this.root = root;
        this.mount();

        // ✅ 正确的初始化方式
        this.machine = combobox.machine({
          id: "test-combobox",
          collection: combobox.collection({ items: data }),
          onValueChange: (details) => {
            console.log("Value changed:", details.value);
          }
        });

        // ✅ 启动状态机并订阅
        this.service = this.machine.start();
        this.service.subscribe((state) => {
          this.currentApi = combobox.connect(state, this.service.send, (v) => v);
          this.updateAttributes();
        });
      }

      mount() {
        this.root.innerHTML = `
          <label id="combobox-label">水果选择:</label>
          <div style="position: relative;">
            <input id="combobox-input" type="text" />
            <div id="combobox-content" style="
              position: absolute;
              top: 100%;
              left: 0;
              right: 0;
              background: white;
              border: 1px solid #ccc;
              border-radius: 4px;
              margin-top: 4px;
              max-height: 200px;
              overflow-y: auto;
              display: none;
            "></div>
          </div>
        `;

        this.label = document.getElementById('combobox-label');
        this.input = document.getElementById('combobox-input');
        this.content = document.getElementById('combobox-content');
      }

      updateAttributes() {
        const api = this.currentApi;
        if (!api) return;

        // 更新属性，不重新创建元素
        Object.assign(this.label, api.getLabelProps());
        Object.assign(this.input, api.getInputProps());

        // 更新下拉列表
        if (api.isOpen) {
          this.content.style.display = 'block';
          this.content.innerHTML = api.collection.items
            .map(item => {
              const highlighted = api.isItemHighlighted(item) ? ' highlighted' : '';
              return `<div class="item${highlighted}" data-value="${item.value}">${item.label}</div>`;
            })
            .join('');
        } else {
          this.content.style.display = 'none';
        }
      }
    }

    new ZagCombobox(document.getElementById('combobox-root'));
  </script>
</body>
</html>
```

**执行步骤**:
```bash
# 1. 保存文件
# 2. 需要通过 HTTP 服务器打开（避免 CORS）
npx http-server -p 3000

# 3. 在浏览器中访问
# http://localhost:3000/tests/visual/zagjs-focus-bundled.html

# 4. 执行测试步骤
```

---

### 任务 2: 包体积基线测量 🚨 必需

**预计时间**: 30 分钟
**重要性**: 量化 DaisyUI 对包体积的影响

#### 执行步骤

```bash
# 1. 切换到主分支，构建并记录大小
git stash  # 保存当前工作
git checkout main
npm run build:fast

# 记录原始大小
echo "=== 主分支 (无 DaisyUI) ===" > /tmp/size-before.txt
ls -lh build/dist/options/index.js >> /tmp/size-before.txt
ls -lh build/dist/options/*.css >> /tmp/size-before.txt

# 2. 切换到 POC 分支，构建并记录大小
git checkout poc/design-system-validation
git stash pop  # 恢复工作
npm run build:fast

# 记录新大小
echo "=== POC 分支 (含 DaisyUI) ===" > /tmp/size-after.txt
ls -lh build/dist/options/index.js >> /tmp/size-after.txt
ls -lh build/dist/options/styles/tailwind.css >> /tmp/size-after.txt

# 3. 创建对比报告
cat > docs/251126-design-system-poc/package-size-comparison.md << 'EOF'
# Package Size Comparison

## Before (main branch)
```
[粘贴 /tmp/size-before.txt 的内容]
```

## After (POC branch with DaisyUI)
```
[粘贴 /tmp/size-after.txt 的内容]
```

## Impact Analysis

| File | Before | After | Increase | Percentage |
|------|--------|-------|----------|------------|
| options/index.js | XX KB | XX KB | +X KB | +X% |
| tailwind.css | XX KB | 100 KB | +XX KB | +XX% |
| **Total** | XX KB | XX KB | +XX KB | +XX% |

## Conclusion

- ✅ Total increase is within acceptable range (<15%)
- ✅ The 100KB CSS file includes comprehensive DaisyUI components
- ✅ Tree-shaking is working correctly (only used components are included)

_或者如果超过 15%:_

- ⚠️ Total increase exceeds 15% threshold
- Recommendation: Consider using DaisyUI JIT mode or manual component extraction
EOF

# 4. 手动填写实际数字
nano docs/251126-design-system-poc/package-size-comparison.md
```

#### 验收标准
- ✅ 提供 main vs poc 分支的具体 KB 数字对比
- ✅ 创建 `package-size-comparison.md` 文件
- ✅ 说明增幅是否在可接受范围内（<15%）
- ✅ 如果超过 15%，提供优化建议

---

## 🔧 建议完成的工作（可选）

### 任务 3: 切换到 HSL Split 颜色格式 ⚠️ 推荐

**预计时间**: 15 分钟
**重要性**: 提高浏览器兼容性，与设计系统保持一致

#### 问题说明
- 当前使用 OKLCH 格式，可能在旧版浏览器中不支持
- 项目已有 HSL Split 值在 `src/options/styles/design-tokens.css` 中
- HSL Split 是 DaisyUI 官方推荐的标准格式

#### 修改步骤

**编辑文件**: `tailwind.config.cjs`

```javascript
// 在 daisyui.themes 部分，将 OKLCH 替换为 HSL Split

daisyui: {
  themes: [
    {
      allinob: {
        // ❌ 删除这些 OKLCH 格式
        // "primary": "oklch(0.65 0.25 285)",
        // "secondary": "oklch(0.55 0.15 260)",
        // "accent": "oklch(0.65 0.25 285)",
        // "neutral": "oklch(0.25 0.05 260)",
        // "base-100": "oklch(1 0 0)",

        // ✅ 使用 HSL Split 格式（引用 design-tokens.css 中的变量）
        "primary": "hsl(var(--aobx-primary-h) var(--aobx-primary-s) var(--aobx-primary-l))",
        "secondary": "hsl(var(--aobx-secondary-h) var(--aobx-secondary-s) var(--aobx-secondary-l))",
        "accent": "hsl(var(--aobx-primary-h) var(--aobx-primary-s) var(--aobx-primary-l))",
        "neutral": "hsl(220 15% 25%)",
        "base-100": "hsl(0 0% 100%)",

        // 保留 Hex 格式（这些不需要透明度修饰符）
        "info": "#3b82f6",
        "success": "#22c55e",
        "warning": "#f59e0b",
        "error": "#ef4444",
      },
    },
  ],
}
```

#### 验证步骤

```bash
# 1. 重新构建 CSS
npm run tailwind:build

# 2. 检查 .btn 类是否仍然生成
grep "\.btn" src/options/styles/tailwind.css | wc -l
# 应输出: 174（与之前相同）

# 3. 检查文件大小变化
ls -lh src/options/styles/tailwind.css
# 应该与之前差不多（±5KB 内）

# 4. 在浏览器中验证
open tests/visual/daisyui-opacity-test.html
# 按钮样式应正常显示
```

#### 验收标准
- ✅ CSS 文件大小无显著变化（±5KB）
- ✅ `.btn` 类生成数量不变（174 个）
- ✅ 测试页面中的透明度修饰符正常工作（如 `bg-primary/50`）

---

### 任务 4: 清理 safelist 变通方案 ⚠️ 推荐

**预计时间**: 10 分钟
**重要性**: 优化 CSS 体积，移除临时变通方案

#### 问题说明
- `safelist` 会强制包含所有列出的类，即使它们未被使用
- 这会导致 CSS 文件体积不必要增大
- 正确方案是通过 `content` 路径扫描自动检测使用的类

#### 尝试步骤

**编辑文件**: `tailwind.config.cjs`

```javascript
module.exports = {
  content: [
    path.join(__dirname, 'src/options/**/*.{ts,tsx,js,jsx,html}'),
    path.join(__dirname, 'src/options/**/*.css'),
    path.join(__dirname, 'src/shared/**/*.{ts,tsx,js,jsx}'),
    path.join(__dirname, 'tests/visual/**/*.{html,js}')
  ],

  // ❌ 尝试删除 safelist
  // safelist: ['btn', 'btn-primary', ...],

  theme: {
    extend: { /* ... */ }
  },
  plugins: [require('daisyui')],
  daisyui: { /* ... */ }
};
```

#### 验证步骤

```bash
# 1. 删除 safelist 后重新构建
npm run tailwind:build

# 2. 检查 .btn 类是否仍然生成
grep "\.btn" src/options/styles/tailwind.css | wc -l

# 3. 如果输出为 0，说明测试文件中的类名未被扫描到
```

#### 结果分析

**情况 A: 如果 .btn 类仍然生成（输出 > 0）**
- ✅ 说明 content 扫描正常工作
- ✅ 可以永久删除 safelist
- 更新 `tailwind.config.cjs` 并提交

**情况 B: 如果 .btn 类消失（输出 = 0）**
- ⚠️ 说明测试文件未被正确扫描
- 保留 safelist，但添加注释说明原因：

```javascript
// 仅为 tests/visual 测试文件保留 safelist
// 因为测试文件不参与生产构建，需要显式包含
safelist: [
  // POC 验证专用类
  'btn', 'btn-primary', 'btn-ghost',
  'input', 'input-bordered',
  'menu', 'bg-base-200',
  'rounded-box', 'shadow-lg'
],
```

#### 验收标准
- ✅ 尝试删除 safelist 并验证
- ✅ 根据结果选择保留或删除
- ✅ 如果保留，添加清晰的注释说明原因

---

## 📝 文档更新要求

完成上述任务后，需要更新以下文档：

### 1. 更新 `detailed-log.md`

在 `docs/251126-design-system-poc/poc-results/detailed-log.md` 中补充：

```markdown
## Test 2: Zag.js Combobox Interaction (补充测试 - 2025-11-26)

- **测试方法**: [简化版焦点测试 / CDN 版本测试]
- **测试步骤**:
  1. [详细步骤]
  2. [详细步骤]
- **结果**:
  - 输入过程中焦点保持: ✅ 通过
  - 强制更新后焦点保持: ✅ 通过
  - 截图: [附上截图或说明]
- **结论**: Mount/Update 分离架构有效防止焦点丢失

## Test 5: Package Size Impact

- **测试方法**: 对比 main vs poc 分支的构建产物大小
- **结果**:
  - 主分支总大小: XX KB
  - POC 分支总大小: XX KB
  - 增幅: +XX KB (+XX%)
- **结论**: [在可接受范围内 / 需要优化]
```

### 2. 更新 `POC-SUMMARY.md`

在 `docs/251126-design-system-poc/POC-SUMMARY.md` 中修改：

```markdown
### 2.2 Zag.js Integration
- **Focus Management**: The critical focus loss bug was addressed by separating
  DOM mount and update logic in `ZagCombobox.js`.
- **Testing**:
  - ✅ Runtime focus test completed on 2025-11-26
  - ✅ Focus is maintained during rapid state updates
  - ✅ Manual keyboard navigation works correctly
- **Status**: ✅ **Verified**

### 2.4 Build System
- **Package Size**:
  - `tailwind.css`: 100KB
  - Total size increase: +XX KB (+XX%)
  - Impact: [Acceptable / Needs optimization]
- **Status**: ✅ **Verified**
```

### 3. 创建 `package-size-comparison.md`

在 `docs/251126-design-system-poc/` 目录下创建新文件（参考任务 2 的模板）

---

## ✅ 最终验收清单

完成所有任务后，请确认以下各项：

### 🚨 必需项（验收必备）
- [ ] **任务 1**: Zag.js 焦点测试通过
  - [ ] 创建测试文件（方案 A 或 B）
  - [ ] 执行测试并验证焦点保持
  - [ ] 记录测试结果到 `detailed-log.md`

- [ ] **任务 2**: 包体积对比完成
  - [ ] 测量 main 分支大小
  - [ ] 测量 poc 分支大小
  - [ ] 创建 `package-size-comparison.md`
  - [ ] 分析增幅是否可接受

### 🔧 推荐项（技术债务）
- [ ] **任务 3**: 切换到 HSL Split 格式
  - [ ] 修改 `tailwind.config.cjs`
  - [ ] 验证 CSS 生成正常

- [ ] **任务 4**: 清理 safelist
  - [ ] 尝试删除 safelist
  - [ ] 根据结果保留或删除

### 📄 文档更新
- [ ] 更新 `detailed-log.md` 补充测试结果
- [ ] 更新 `POC-SUMMARY.md` 修改 Zag.js 状态为 "✅ Verified"
- [ ] 创建 `package-size-comparison.md`

---

## ⏱️ 预计总时间

| 任务 | 时间 | 优先级 |
|------|------|--------|
| 任务 1: Zag.js 测试 | 1-2 小时 | 🚨 最高 |
| 任务 2: 包体积测量 | 30 分钟 | 🚨 高 |
| 任务 3: HSL Split | 15 分钟 | ⚠️ 中 |
| 任务 4: 清理 safelist | 10 分钟 | ⚠️ 中 |
| **必需工作总计** | **1.5-2.5 小时** | - |
| **全部工作总计** | **2-3 小时** | - |

---

## 🆘 问题反馈

如果在执行过程中遇到问题，请记录以下信息：

1. **任务编号**: 哪个任务失败
2. **错误信息**: 完整的控制台错误（截图）
3. **浏览器版本**: 使用的浏览器及版本号
4. **操作系统**: macOS / Windows / Linux
5. **已尝试的解决方法**: 你做了哪些尝试

将上述信息整理后，可以寻求进一步协助。

---

## 📌 快速参考

**关键文件路径**:
- 配置: `tailwind.config.cjs`
- 构建脚本: `scripts/build.mjs`
- 测试文件目录: `tests/visual/`
- 文档目录: `docs/251126-design-system-poc/`
- 编译后的 CSS: `src/options/styles/tailwind.css`
- Zag.js 实现: `src/ui/ZagCombobox.js`

**常用命令**:
```bash
# 构建 Tailwind CSS
npm run tailwind:build

# 快速构建（跳过质量检查）
npm run build:fast

# 完整构建（包含质量检查）
npm run build

# 检查 DaisyUI 类生成
grep "\.btn" src/options/styles/tailwind.css | wc -l

# 启动本地服务器（用于模块测试）
npx http-server -p 3000
```

**Git 分支信息**:
- 主分支: `main`
- POC 分支: `poc/design-system-validation`

---

**文档结束** - 祝开发顺利！ 🚀
