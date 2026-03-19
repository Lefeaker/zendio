# Phase 1.5: DaisyUI 迁移清理指导文档

**文档版本**: v1.0
**创建日期**: 2025-11-26
**适用对象**: 开发人员
**前置条件**: Phase 1 已通过验收（75% 完成）
**预计工时**: 6-10 小时

---

## 📋 目录

1. [清理工作概述](#1-清理工作概述)
2. [优先级 P0: Input 组件 100% 迁移](#2-优先级-p0-input-组件-100-迁移)
3. [优先级 P0: 包体积正式报告](#3-优先级-p0-包体积正式报告)
4. [优先级 P0: 视觉回归测试](#4-优先级-p0-视觉回归测试)
5. [优先级 P1: Button 组件剩余迁移](#5-优先级-p1-button-组件剩余迁移)
6. [验收标准](#6-验收标准)
7. [常见问题](#7-常见问题)

---

## 1. 清理工作概述

### 1.1 为什么需要 Phase 1.5？

Phase 1 验收时发现：
- ✅ **Card 组件**: 100% 完成（优秀示例）
- ✅ **Alert 组件**: 200% 完成（超额完成）
- ⚠️ **Button 组件**: 60% 完成（剩余 12 处）
- ⚠️ **Input 组件**: 36% 完成（剩余 28 处）

**问题**:
- ❌ Input 使用频率最高，不统一影响最大
- ❌ 代码风格不一致（部分 DaisyUI，部分手动）
- ❌ 新开发者困惑（该用哪种方式？）
- ❌ Phase 2 复杂组件会混用两种写法

**目标**: 完成剩余工作，为 Phase 2 打好基础

### 1.2 工作范围

**必须完成（P0）** - 约 6-8 小时：
1. ✅ Input 组件 100% 迁移（28 处）- 4-6 小时
2. ✅ 创建包体积正式报告 - 15 分钟
3. ✅ 视觉回归测试 - 1-2 小时

**建议完成（P1）** - 约 2-3 小时：
4. ⏸️ Button 组件剩余迁移（12 处）- 2-3 小时

---

## 2. 优先级 P0: Input 组件 100% 迁移

### 2.1 剩余位置清单（28 处）

#### **文件 1: DeepResearchSection.ts**（1 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 73 | `const checkbox = document.createElement('input');` | checkbox | P0 |

#### **文件 2: RoutingSection.ts**（3 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 229 | `const enabledCheckbox = document.createElement('input');` | checkbox | P0 |
| 262 | `const patternInput = document.createElement('input');` | text | P0 |
| 285 | `const priorityInput = document.createElement('input');` | number | P0 |

#### **文件 3: ClassifierSection.ts**（2 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 147 | `const enableInput = document.createElement('input');` | checkbox | P0 |
| 216 | `const input = document.createElement('input');` | text | P0 |

#### **文件 4: RestSection.ts**（4 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 165 | `const enabledCheckbox = document.createElement('input');` | checkbox | P0 |
| 233 | `const input = document.createElement('input');` | text | P0 |
| 341 | `const enabledCheckbox = document.createElement('input');` | checkbox | P0 |
| 393 | `const input = document.createElement('input');` | password | P0 |

#### **文件 5: VideoSection.ts**（1 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 73 | `const checkbox = document.createElement('input');` | checkbox | P0 |

#### **文件 6: FragmentSection.ts**（3 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 184 | `const input = document.createElement('input');` | number | P0 |
| 210 | `const input = document.createElement('input');` | number | P0 |
| 243 | `const checkbox = document.createElement('input');` | checkbox | P0 |

#### **文件 7: AiSection.ts**（1 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 110 | `const checkbox = document.createElement('input');` | checkbox | P0 |

#### **文件 8: listBuilder.ts**（1 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 243 | `element = createElement('input');` | 动态 | P1 |

**说明**: listBuilder 是通用工具，可暂缓

#### **文件 9: yamlConfigTable.ts**（10 处）⭐ 最多

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 647 | `const nameInput = document.createElement('input');` | text | P0 |
| 701 | `const checkbox = document.createElement('input');` | checkbox | P0 |
| 820 | `const input = document.createElement('input');` | text | P0 |
| 878 | `const input = document.createElement('input');` | text | P0 |
| 903 | `const input = document.createElement('input');` | text | P0 |
| 1389 | `const domainInput = document.createElement('input');` | text | P0 |
| 1507 | `const checkbox = document.createElement('input');` | checkbox | P0 |
| 1545 | `const input = document.createElement('input');` | text | P0 |
| 1566 | `const input = document.createElement('input');` | text | P0 |
| 1588 | `const valuePathInput = document.createElement('input');` | text | P0 |

#### **文件 10: privacySettings.ts**（2 处）

| 行号 | 当前代码 | 类型 | 优先级 |
|------|---------|------|--------|
| 96 | `const input = document.createElement('input');` | checkbox | P0 |
| 183 | `const input = document.createElement('input');` | checkbox | P0 |

**总计**: **28 处**（排除 listBuilder.ts 通用工具为 **27 处必须迁移**）

---

### 2.2 迁移步骤（标准流程）

#### **步骤 1: 查看当前实现**

```typescript
// 示例：DeepResearchSection.ts:73
const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = 'w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent';
checkbox.checked = this.store.getState().options.deepResearch?.generateReports || false;
```

#### **步骤 2: 替换为 DaisyUI**

```typescript
// ✅ After: 使用 DaisyUI checkbox 类
const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = 'checkbox checkbox-accent';
checkbox.checked = this.store.getState().options.deepResearch?.generateReports || false;
```

#### **步骤 3: 类名映射表**

| 原始 Tailwind 类 | DaisyUI 等效 | 说明 |
|-----------------|--------------|------|
| `w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent` | `checkbox checkbox-accent` | Checkbox |
| `w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent` | `input input-bordered w-full` | Text Input |
| `w-full px-3 py-2 border border-gray-300 rounded-md` | `input input-bordered w-full` | Number/Password Input |
| `select w-full px-3 py-2 border border-gray-300 rounded-md` | `select select-bordered w-full` | Select (如有) |
| `textarea w-full px-3 py-2 border border-gray-300 rounded-md` | `textarea textarea-bordered w-full` | Textarea (如有) |

#### **步骤 4: 保留必要的自定义类**

某些情况需要保留特定的类：

```typescript
// ✅ 正确：保留 w-full、mt-2 等布局类
checkbox.className = 'checkbox checkbox-accent mt-2';

// ✅ 正确：Text input 需要 w-full
input.className = 'input input-bordered w-full';

// ❌ 错误：不要保留手动的 focus、hover 样式
// input.className = 'input input-bordered focus:ring-2'; // DaisyUI 已包含
```

---

### 2.3 分文件迁移计划

**推荐顺序**（从简单到复杂）：

#### **第 1 批: 独立 Section（1-2 小时）**

优先迁移独立性强的 Section：

1. ✅ **DeepResearchSection.ts** - 1 处（10 分钟）
2. ✅ **VideoSection.ts** - 1 处（10 分钟）
3. ✅ **AiSection.ts** - 1 处（10 分钟）
4. ✅ **FragmentSection.ts** - 3 处（30 分钟）
5. ✅ **ClassifierSection.ts** - 2 处（20 分钟）
6. ✅ **RoutingSection.ts** - 3 处（30 分钟）
7. ✅ **RestSection.ts** - 4 处（40 分钟）

**小计**: **15 处**，约 **2.5 小时**

#### **第 2 批: 复杂文件（2-3 小时）**

8. ✅ **yamlConfigTable.ts** - 10 处（2 小时）
   - 最复杂的文件
   - 建议分段迁移（每次 2-3 处）
   - 每段迁移后运行测试

9. ✅ **privacySettings.ts** - 2 处（30 分钟）

**小计**: **12 处**，约 **2.5 小时**

#### **第 3 批: 通用工具（可选，30 分钟）**

10. ⏸️ **listBuilder.ts** - 1 处（30 分钟）
    - 通用工具函数
    - 影响范围广，需额外测试
    - 可以暂缓，Phase 2 再处理

---

### 2.4 迁移示例（详细）

#### **示例 1: Checkbox 迁移**

**文件**: `src/options/components/sections/DeepResearchSection.ts:73`

```typescript
// ❌ Before
const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = 'w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent';
checkbox.checked = this.store.getState().options.deepResearch?.generateReports || false;
checkbox.id = 'generateReports';

// ✅ After
const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = 'checkbox checkbox-accent'; // 仅替换这一行
checkbox.checked = this.store.getState().options.deepResearch?.generateReports || false;
checkbox.id = 'generateReports';
```

**变化说明**:
- 移除: `w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent`
- 添加: `checkbox checkbox-accent`
- 保持: `type`, `checked`, `id` 等属性不变

---

#### **示例 2: Text Input 迁移**

**文件**: `src/options/components/sections/RoutingSection.ts:262`

```typescript
// ❌ Before
const patternInput = document.createElement('input');
patternInput.type = 'text';
patternInput.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent';
patternInput.placeholder = 'https://example.com/*';
patternInput.value = rule.pattern || '';

// ✅ After
const patternInput = document.createElement('input');
patternInput.type = 'text';
patternInput.className = 'input input-bordered w-full'; // 保留 w-full
patternInput.placeholder = 'https://example.com/*';
patternInput.value = rule.pattern || '';
```

**变化说明**:
- 移除: `px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent`
- 添加: `input input-bordered`
- **保留**: `w-full`（布局需要）

---

#### **示例 3: Number Input 迁移**

**文件**: `src/options/components/sections/RoutingSection.ts:285`

```typescript
// ❌ Before
const priorityInput = document.createElement('input');
priorityInput.type = 'number';
priorityInput.className = 'w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent';
priorityInput.value = String(rule.priority || 0);
priorityInput.min = '0';

// ✅ After
const priorityInput = document.createElement('input');
priorityInput.type = 'number';
priorityInput.className = 'input input-bordered w-20'; // 保留 w-20
priorityInput.value = String(rule.priority || 0);
priorityInput.min = '0';
```

**变化说明**:
- 移除: `px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent`
- 添加: `input input-bordered`
- **保留**: `w-20`（固定宽度）

---

#### **示例 4: Password Input 迁移**

**文件**: `src/options/components/sections/RestSection.ts:393`

```typescript
// ❌ Before
const input = document.createElement('input');
input.type = 'password';
input.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent';
input.placeholder = 'API Token';
input.value = vault.token || '';

// ✅ After
const input = document.createElement('input');
input.type = 'password';
input.className = 'input input-bordered w-full';
input.placeholder = 'API Token';
input.value = vault.token || '';
```

---

### 2.5 测试清单（每个文件迁移后）

#### **单元测试**:
```bash
# 运行所有单元测试
npm run test:unit

# 运行特定文件的测试（如果存在）
npm run test:unit -- DeepResearchSection
```

#### **手动测试**（浏览器中）:
1. ✅ Checkbox 可以正常勾选/取消勾选
2. ✅ Text Input 可以输入文字
3. ✅ Number Input 只能输入数字
4. ✅ Password Input 输入内容被隐藏
5. ✅ Focus 状态有边框高亮
6. ✅ Disabled 状态显示为灰色
7. ✅ 暗色模式下颜色正确

#### **视觉对比**:
- 截图对比迁移前后的外观
- 确保无明显差异

---

### 2.6 yamlConfigTable.ts 特别说明

**为什么这个文件最复杂？**
- ✅ 10 处 Input 创建（最多）
- ✅ 动态表格生成逻辑
- ✅ 多种 Input 类型（text、checkbox、number）
- ✅ 复杂的事件绑定

**建议分段迁移**:

#### **第 1 段: 行 647-903（5 处）**
```bash
# 迁移位置：
yamlConfigTable.ts:647  - nameInput (text)
yamlConfigTable.ts:701  - checkbox
yamlConfigTable.ts:820  - input (text)
yamlConfigTable.ts:878  - input (text)
yamlConfigTable.ts:903  - input (text)

# 测试：
npm run test:unit -- yamlConfigTable
```

#### **第 2 段: 行 1389-1588（5 处）**
```bash
# 迁移位置：
yamlConfigTable.ts:1389 - domainInput (text)
yamlConfigTable.ts:1507 - checkbox
yamlConfigTable.ts:1545 - input (text)
yamlConfigTable.ts:1566 - input (text)
yamlConfigTable.ts:1588 - valuePathInput (text)

# 测试：
npm run test:unit -- yamlConfigTable
```

---

### 2.7 完成标准

**Input 组件迁移完成的标志**:

1. ✅ 所有 27 处必须迁移位置已替换为 DaisyUI 类
2. ✅ 单元测试全部通过（535/535）
3. ✅ 手动测试所有 Input 类型正常工作
4. ✅ 视觉无明显差异
5. ✅ 暗色模式正常

**验证命令**:
```bash
# 检查是否还有遗漏（应该只剩下 DaisyUIHelpers.ts 和 listBuilder.ts）
grep -rn "createElement('input')" src/options/components/ --include="*.ts" | grep -v "DaisyUIHelpers" | grep -v "listBuilder" | wc -l
# 预期输出: 0
```

---

## 3. 优先级 P0: 包体积正式报告

### 3.1 创建报告文件

**文件路径**: `docs/251126-design-system-poc/phase1-bundle-size.md`

### 3.2 测量步骤

```bash
# 1. 切换到主分支（baseline）
git stash
git checkout main

# 2. 构建并测量
npm run build
ls -lh build/dist/options/index.js
ls -lh build/dist/options/styles/tailwind.css

# 记录数据：
# options/index.js: [SIZE]
# tailwind.css: [SIZE]

# 3. 切换回迁移分支
git checkout poc/design-system-validation
git stash pop

# 4. 构建并测量
npm run build
ls -lh build/dist/options/index.js
ls -lh build/dist/options/styles/tailwind.css

# 记录数据：
# options/index.js: [SIZE]
# tailwind.css: [SIZE]
```

### 3.3 报告模板

创建文件后填入实际数据（见下一步骤）

---

## 4. 优先级 P0: 视觉回归测试

### 4.1 测试范围

**必须测试的组件**:
1. ✅ Button（primary、secondary、ghost、outline）
2. ✅ Input（text、number、password、checkbox）
3. ✅ Alert（info、success、warning、error）
4. ✅ Card（AobFormGroup）

**必须测试的状态**:
1. ✅ Normal（正常状态）
2. ✅ Hover（鼠标悬停）
3. ✅ Focus（聚焦状态）
4. ✅ Disabled（禁用状态）
5. ✅ Dark Mode（暗色模式）

### 4.2 测试步骤

#### **步骤 1: 准备环境**

```bash
# 1. 构建扩展
npm run build:dev

# 2. 加载到浏览器
# Chrome: chrome://extensions/
# 启用开发者模式
# 点击 "Load unpacked"
# 选择 build/dist 目录
```

#### **步骤 2: 截图对比**

**创建截图目录**:
```bash
mkdir -p docs/screenshots/phase1.5
mkdir -p docs/screenshots/phase1.5/before
mkdir -p docs/screenshots/phase1.5/after
```

**截图清单**:

| 组件 | 状态 | 截图文件名 | 检查点 |
|------|------|-----------|--------|
| Button Primary | Normal | `button-primary-normal.png` | 颜色、尺寸、圆角 |
| Button Primary | Hover | `button-primary-hover.png` | hover 背景色变化 |
| Button Primary | Focus | `button-primary-focus.png` | focus 环可见 |
| Button Ghost | Normal | `button-ghost-normal.png` | 透明背景 |
| Input Text | Normal | `input-text-normal.png` | 边框、padding |
| Input Text | Focus | `input-text-focus.png` | focus 边框高亮 |
| Checkbox | Unchecked | `checkbox-unchecked.png` | 边框颜色 |
| Checkbox | Checked | `checkbox-checked.png` | 勾选样式 |
| Alert Info | Normal | `alert-info.png` | 蓝色背景、图标 |
| Alert Success | Normal | `alert-success.png` | 绿色背景、图标 |
| Card | Normal | `card-normal.png` | 阴影、圆角、padding |
| Dark Mode | All | `dark-mode-*.png` | 暗色主题 |

#### **步骤 3: 对比检查**

**手动对比**（每个截图）:
- [ ] 颜色是否一致？
- [ ] 尺寸是否一致？
- [ ] 间距是否一致？
- [ ] 圆角是否一致？
- [ ] 阴影是否一致？
- [ ] 字体是否一致？

**如有差异，记录到**: `docs/251126-design-system-poc/visual-regression-issues.md`

### 4.3 暗色模式测试

**切换方式**:

在 Options 页面，打开浏览器 DevTools Console，运行：

```javascript
// 切换到暗色模式
document.documentElement.setAttribute('data-theme', 'dark');

// 切换回亮色模式
document.documentElement.setAttribute('data-theme', 'light');
```

**检查清单**:
- [ ] Button 在暗色模式下可见（不是黑底黑字）
- [ ] Input 在暗色模式下可见
- [ ] Alert 在暗色模式下颜色正确
- [ ] Card 在暗色模式下背景正确

---

## 5. 优先级 P1: Button 组件剩余迁移

### 5.1 剩余位置清单（12 处）

| 文件 | 行号 | 变量名 | 用途 | 优先级 | 建议 |
|------|------|--------|------|--------|------|
| ReadingSection.ts | 134 | button | 主题选择器（圆形） | P3 | **暂缓**（特殊样式） |
| listBuilder.ts | 281 | button | 通用工具 | P2 | 可暂缓 |
| yamlConfigTable.ts | 175 | button | 表格操作按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 611 | button | 表格操作按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 722 | advancedButton | 高级设置按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 747 | moveUp | 上移按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 758 | moveDown | 下移按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 769 | actionButton | 操作按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 1267 | addButton | 添加按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 1426 | removeButton | 删除按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 1452 | addFieldButton | 添加字段按钮 | P1 | 建议迁移 |
| yamlConfigTable.ts | 1520 | removeButton | 删除按钮 | P1 | 建议迁移 |

**建议**:
- ✅ **迁移**: yamlConfigTable.ts 的 10 个按钮（约 2 小时）
- ⏸️ **暂缓**: ReadingSection.ts 主题选择器（特殊圆形按钮）
- ⏸️ **暂缓**: listBuilder.ts 通用工具（影响范围广）

### 5.2 迁移示例

#### **示例 1: 普通操作按钮**

**文件**: `yamlConfigTable.ts:1267`

```typescript
// ❌ Before
const addButton = document.createElement('button');
addButton.type = 'button';
addButton.className = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2';
addButton.textContent = 'Add Domain';

// ✅ After
const addButton = document.createElement('button');
addButton.type = 'button';
addButton.className = 'btn btn-primary btn-sm';
addButton.textContent = 'Add Domain';
```

#### **示例 2: 删除按钮（危险操作）**

**文件**: `yamlConfigTable.ts:1426`

```typescript
// ❌ Before
const removeButton = document.createElement('button');
removeButton.type = 'button';
removeButton.className = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-destructive/90 h-8 w-8 p-0';
removeButton.innerHTML = '×';

// ✅ After
const removeButton = document.createElement('button');
removeButton.type = 'button';
removeButton.className = 'btn btn-error btn-sm btn-circle';
removeButton.innerHTML = '×';
```

**说明**: 删除按钮使用 `btn-error` 表示危险操作，`btn-circle` 表示圆形

#### **示例 3: 上移/下移按钮**

**文件**: `yamlConfigTable.ts:747` & `yamlConfigTable.ts:758`

```typescript
// ❌ Before
const moveUp = document.createElement('button');
moveUp.className = 'inline-flex items-center justify-center rounded-md text-sm hover:bg-accent/90 h-8 w-8 p-0';
moveUp.innerHTML = '↑';

const moveDown = document.createElement('button');
moveDown.className = 'inline-flex items-center justify-center rounded-md text-sm hover:bg-accent/90 h-8 w-8 p-0';
moveDown.innerHTML = '↓';

// ✅ After
const moveUp = document.createElement('button');
moveUp.className = 'btn btn-ghost btn-sm btn-square';
moveUp.innerHTML = '↑';

const moveDown = document.createElement('button');
moveDown.className = 'btn btn-ghost btn-sm btn-square';
moveDown.innerHTML = '↓';
```

**说明**: 使用 `btn-ghost` 表示次要操作，`btn-square` 表示正方形

---

## 6. 验收标准

### 6.1 Phase 1.5 完成标准

#### **必须达成（P0）**:

1. ✅ **Input 组件 100% 迁移**
   ```bash
   # 验证命令（应输出 0 或 2）
   grep -rn "createElement('input')" src/options/components/ --include="*.ts" | grep -v "DaisyUIHelpers" | grep -v "listBuilder" | wc -l
   ```

2. ✅ **包体积报告已创建**
   ```bash
   # 验证文件存在
   ls -lh docs/251126-design-system-poc/phase1-bundle-size.md
   ```

3. ✅ **视觉回归测试已执行**
   ```bash
   # 验证截图存在（至少 12 张）
   ls docs/screenshots/phase1.5/after/ | wc -l
   ```

4. ✅ **所有单元测试通过**
   ```bash
   npm run test:unit
   # 预期: Test Files 99 passed (99), Tests 535+ passed
   ```

#### **建议达成（P1）**:

5. ⏸️ **Button 组件剩余迁移**
   ```bash
   # 验证命令（应输出 ≤ 2，排除 ReadingSection 和 listBuilder）
   grep -rn "createElement('button')" src/options/components/ --include="*.ts" | grep -v "DaisyUIHelpers" | grep -v "ReadingSection" | grep -v "listBuilder" | wc -l
   ```

---

### 6.2 质量门禁

**代码质量**:
```bash
✅ npm run lint                      # 无 ESLint 错误
✅ npm run typecheck:app             # 无 TypeScript 错误
✅ npm run test:unit                 # 所有测试通过
```

**构建验证**:
```bash
✅ npm run build:dev                 # 开发构建成功
✅ npm run build                     # 生产构建成功（或已知错误）
```

**文档更新**:
```bash
✅ migration-log.md 更新为 Phase 1.5
✅ phase1-bundle-size.md 已创建
✅ visual-regression-issues.md 已创建（如有问题）
```

---

### 6.3 自查清单（提交前）

**代码规范**:
- [ ] 所有 Input 使用 `.input input-bordered` 或 `.checkbox`
- [ ] 移除了冗余的 Tailwind utilities
- [ ] 保留了必要的布局类（`w-full`、`mt-2` 等）
- [ ] 没有硬编码的颜色值
- [ ] 代码格式正确（Prettier）

**测试覆盖**:
- [ ] 单元测试全部通过
- [ ] 手动测试所有迁移的 Input
- [ ] 视觉回归测试已执行
- [ ] 暗色模式已测试

**文档更新**:
- [ ] `migration-log.md` 已更新
- [ ] `phase1-bundle-size.md` 已创建
- [ ] 截图已保存到 `docs/screenshots/phase1.5/`

---

## 7. 常见问题

### Q1: Checkbox 使用 `checkbox` 还是 `input input-bordered`？

**答案**: 使用 `.checkbox`

```typescript
// ✅ 正确（Checkbox）
checkbox.className = 'checkbox checkbox-accent';

// ❌ 错误
checkbox.className = 'input input-bordered';
```

### Q2: 是否需要保留 `w-full`？

**答案**: Text Input 通常需要保留

```typescript
// ✅ 正确（保留 w-full）
input.className = 'input input-bordered w-full';

// ⚠️ 可能不正确（Input 宽度不够）
input.className = 'input input-bordered';
```

### Q3: Number Input 需要特殊处理吗？

**答案**: 不需要，与 Text Input 相同

```typescript
// ✅ 正确
priorityInput.className = 'input input-bordered w-20';
```

### Q4: 如何处理 focus 样式？

**答案**: DaisyUI 已包含，移除手动的 focus 类

```typescript
// ❌ 错误（冗余）
input.className = 'input input-bordered focus:ring-2 focus:ring-accent';

// ✅ 正确
input.className = 'input input-bordered';
```

### Q5: listBuilder.ts 是否必须迁移？

**答案**: 可以暂缓到 Phase 2

**理由**:
- 通用工具函数，影响范围广
- 需要更全面的测试
- 当前优先级是完成 Section 内的 Input

### Q6: ReadingSection.ts 的圆形主题选择器是否迁移？

**答案**: 暂缓，保持现有实现

**理由**:
- 特殊的圆形按钮设计
- 颜色块显示（非标准按钮）
- DaisyUI 的 `btn-circle` 可能不适用

### Q7: 迁移后如何验证无破坏性变更？

**验证步骤**:
1. ✅ 运行 `npm run test:unit`（所有测试通过）
2. ✅ 手动测试表单提交（数据保存正确）
3. ✅ 检查 Console 无错误
4. ✅ 视觉对比截图

---

## 📊 工作量估算

| 任务 | 预计工时 | 优先级 | 状态 |
|------|---------|--------|------|
| Input 组件迁移（27 处） | 4-6 小时 | P0 | ⏸️ 待开始 |
| 包体积报告 | 15 分钟 | P0 | ⏸️ 待开始 |
| 视觉回归测试 | 1-2 小时 | P0 | ⏸️ 待开始 |
| Button 组件迁移（10 处） | 2-3 小时 | P1 | ⏸️ 待开始 |
| **总计（P0）** | **6-8 小时** | - | - |
| **总计（P0+P1）** | **8-11 小时** | - | - |

---

## 🎯 下一步

完成 Phase 1.5 清理工作后：

1. ✅ 更新 `migration-log.md` 为 **100% 完成**
2. ✅ 创建最终验收报告
3. ✅ 开始 Phase 2 规划

---

**文档结束** - 祝清理工作顺利！ 🚀
