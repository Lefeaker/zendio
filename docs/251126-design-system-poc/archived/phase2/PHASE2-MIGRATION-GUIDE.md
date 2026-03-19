# Phase 2: DaisyUI 迁移指南（复杂组件）

**文档版本**: v1.0
**创建日期**: 2025-11-27
**Phase**: Phase 2 - Complex Components
**预计工期**: 2-3 周
**难度**: 🔥🔥🔥 中高

---

## 📋 目录

1. [概述](#概述)
2. [Phase 2 目标](#phase-2-目标)
3. [迁移范围](#迁移范围)
4. [准备工作](#准备工作)
5. [迁移清单](#迁移清单)
6. [详细迁移步骤](#详细迁移步骤)
7. [质量门禁](#质量门禁)
8. [验收标准](#验收标准)
9. [风险和注意事项](#风险和注意事项)
10. [参考资源](#参考资源)

---

## 概述

### Phase 1 回顾

✅ **已完成**（2025-11-27）:
- Button 组件（100% 工厂函数）
- Input 组件（100% DaisyUI 类）
- Checkbox 组件（100% DaisyUI 类）
- Select 组件（100% DaisyUI 类）
- Textarea 组件（100% DaisyUI 类）
- Alert 组件（6 处集成）
- Card 组件（AobFormGroup 迁移）

✅ **质量指标**:
- 单元测试: 537/537 通过 ✅
- 包体积影响: +0.27% (+2 KB) ✅
- 代码减少: ~70% 类名 ✅
- 完成度: 100% (P0+P1) ✅

### Phase 2 目标

Phase 2 聚焦于**复杂组件和高级功能**的 DaisyUI 迁移：

1. **复杂表单控件**: Radio、Toggle、Range、File Input、Rating
2. **数据展示组件**: Table、Badge、Stats、Progress
3. **导航组件**: Tabs、Breadcrumbs、Pagination
4. **Modal 对话框**: 可选（视团队决策）
5. **主题支持**: 暗色模式（可选）

**核心原则**:
- 保持向后兼容（API 接口不变）
- 零破坏性变更（所有测试必须通过）
- 包体积控制（总增幅 < 5%）
- 渐进式迁移（分批次、可回滚）

---

## Phase 2 目标

### 主要目标

| 目标 | 描述 | 优先级 |
|------|------|--------|
| **扩展 DaisyUI 覆盖率** | 从 55% 提升到 85%+ | P0 |
| **统一复杂组件样式** | Radio、Toggle、Range、Badge 等 | P0 |
| **优化数据展示** | Table、Stats 迁移到 DaisyUI | P1 |
| **改善导航体验** | Tabs、Breadcrumbs 统一 | P1 |
| **暗色模式支持** | 启用 DaisyUI dark theme | P2 |
| **Modal 现代化** | 迁移到 DaisyUI dialog（可选）| P2 |

### 成功指标

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| **组件迁移完成度** | ≥ 85% | DaisyUI 类使用率统计 |
| **单元测试通过率** | 100% | `npm run test:unit` |
| **包体积增长** | < 5% | Bundle size report |
| **代码可维护性** | 提升 60%+ | 类名减少率 |
| **视觉一致性** | 无回归 | Visual regression testing |
| **开发效率** | 提升 40%+ | 新组件创建时间 |

---

## 迁移范围

### P0: 必须完成（Week 1-2）

#### 1. 复杂表单控件

| 组件 | 当前状态 | 目标 | 位置 | 预计工时 |
|------|---------|------|------|---------|
| **Radio** | 手动 Tailwind | `.radio` | ClassifierSection, RoutingSection | 2h |
| **Toggle** | 手动 Tailwind | `.toggle` | PrivacySettings,各 Section | 3h |
| **Range** | 手动 Tailwind | `.range` | 未使用（可选） | 1h |
| **File Input** | 手动 Tailwind | `.file-input` | 未使用（可选） | 1h |

**总计**: ~7 小时

#### 2. 数据展示组件

| 组件 | 当前状态 | 目标 | 位置 | 预计工时 |
|------|---------|------|------|---------|
| **Badge** | 手动 Tailwind | `.badge` | UsageDashboard, 各 Section | 2h |
| **Stats** | 手动 Tailwind | `.stats` | UsageDashboard | 3h |
| **Progress** | 手动 Tailwind | `.progress` | ConnectionTest（可选） | 1h |
| **Table** | 部分 DaisyUI | `.table` 完整迁移 | yamlConfigTable（已部分完成） | 4h |

**总计**: ~10 小时

#### 3. 导航组件

| 组件 | 当前状态 | 目标 | 位置 | 预计工时 |
|------|---------|------|------|---------|
| **Tabs** | 手动实现 | `.tabs` | Options 主导航（如有） | 4h |
| **Breadcrumbs** | 手动实现 | `.breadcrumbs` | 未使用（可选） | 1h |
| **Pagination** | 手动实现 | `.pagination` | UsageDashboard（可选） | 2h |

**总计**: ~7 小时

**P0 总工时**: ~24 小时（3 个工作日）

---

### P1: 建议完成（Week 2-3）

#### 4. DaisyUI 工厂函数扩展

| 工厂函数 | 位置 | 目标 | 预计工时 |
|---------|------|------|---------|
| `createRadio()` | DaisyUIHelpers.ts | 创建 + 测试 | 2h |
| `createToggle()` | DaisyUIHelpers.ts | 创建 + 测试 | 2h |
| `createBadge()` | DaisyUIHelpers.ts | 创建 + 测试 | 1.5h |
| `createTabs()` | DaisyUIHelpers.ts | 创建 + 测试 | 3h |

**总计**: ~8.5 小时

#### 5. 视觉回归测试（补充 Phase 1.5）

| 任务 | 描述 | 预计工时 |
|------|------|---------|
| Phase 1 组件截图 | 执行 Phase 1.5 测试指南 | 1.5h |
| Phase 2 组件截图 | 新增 Radio、Toggle、Badge、Tabs 测试 | 2h |
| 对比分析 | 记录差异，创建报告 | 1h |

**总计**: ~4.5 小时

**P1 总工时**: ~13 小时（1.5 个工作日）

---

### P2: 可选特性（Week 3+）

#### 6. 暗色模式支持

| 任务 | 描述 | 预计工时 |
|------|------|---------|
| 启用 dark theme | 修改 tailwind.config.cjs | 0.5h |
| 主题切换器 | 创建 theme switcher 组件 | 3h |
| 暗色模式测试 | 所有组件在 dark mode 下测试 | 2h |
| 暗色模式适配 | 修复任何颜色对比度问题 | 2h |

**总计**: ~7.5 小时

#### 7. Modal 对话框迁移（可选）

| 任务 | 描述 | 预计工时 |
|------|------|---------|
| 评估现有 Modal | 分析 confirmDialog, supportPrompt 等 | 2h |
| 创建 DaisyUI Modal 适配器 | 保持向后兼容 | 4h |
| 迁移各个 Modal 实例 | 4 个 modal × 1.5h | 6h |
| Modal 测试 | 单元测试 + E2E 测试 | 3h |

**总计**: ~15 小时

**P2 总工时**: ~22.5 小时（3 个工作日）

---

## 准备工作

### 开始前检查清单

- [ ] ✅ Phase 1 和 Phase 1.5 已通过验收（100% 完成）
- [ ] ✅ 单元测试全部通过（537/537）
- [ ] ✅ 开发环境正常（Node.js, npm, DaisyUI 4.12.10）
- [ ] 📋 熟悉 Phase 1 迁移模式（阅读 `migration-log.md`）
- [ ] 📋 阅读 DaisyUI 官方文档（https://daisyui.com/components/）
- [ ] 📋 创建 Phase 2 工作分支（`git checkout -b feat/phase2-complex-components`）

### 环境验证

```bash
# 1. 确认依赖版本
npm list daisyui
# 期望: daisyui@4.12.10

npm list tailwindcss
# 期望: tailwindcss@3.4.18

# 2. 运行测试
npm run test:unit
# 期望: 537/537 通过

# 3. 构建验证
npm run build:dev -- --skip-checks
# 期望: 成功构建，无错误

# 4. 测量基线包体积
du -sh dist/
ls -lh dist/styles/*.css
# 记录当前值，作为 Phase 2 baseline
```

### 推荐工具

| 工具 | 用途 | 安装命令 |
|------|------|----------|
| **VS Code** | 代码编辑 | 已安装 |
| **Tailwind CSS IntelliSense** | 类名自动补全 | VS Code 插件 |
| **DaisyUI Theme Viewer** | 预览 DaisyUI 组件 | https://daisyui.com/theme-generator/ |
| **Chrome DevTools** | 视觉测试 | 浏览器内置 |

---

## 迁移清单

### Phase 2.1: 复杂表单控件（Week 1）

#### 任务 2.1.1: Radio 组件迁移

**优先级**: 🚨 P0
**预计工时**: 2 小时
**文件范围**:
- `src/options/components/sections/ClassifierSection.ts`
- `src/options/components/sections/RoutingSection.ts`

**步骤**:
1. 搜索现有 Radio 实现
   ```bash
   grep -rn "type=\"radio\"" src/options/components/ --include="*.ts"
   ```

2. 创建 `createRadio()` 工厂函数（可选）
   ```typescript
   // src/options/components/shared/DaisyUIHelpers.ts
   export function createRadio(name: string, options?: RadioOptions): HTMLInputElement {
     const radio = document.createElement('input');
     radio.type = 'radio';
     radio.name = name;
     radio.className = 'radio radio-accent';
     if (options?.value) radio.value = options.value;
     if (options?.checked) radio.checked = options.checked;
     if (options?.disabled) radio.disabled = options.disabled;
     return radio;
   }
   ```

3. 迁移模式
   ```typescript
   // Before (手动创建)
   const radio = document.createElement('input');
   radio.type = 'radio';
   radio.className = 'w-4 h-4 text-accent border-border focus:ring-accent';

   // After (DaisyUI)
   const radio = createRadio('groupName', {
     value: 'option1',
     checked: true
   });
   // 或直接使用类
   radio.className = 'radio radio-accent';
   ```

4. 添加单元测试
   ```typescript
   // tests/unit/shared/daisyUIHelpers.test.ts
   describe('createRadio', () => {
     it('should create radio with DaisyUI classes', () => {
       const radio = createRadio('test', { value: 'val1' });
       expect(radio.classList.contains('radio')).toBe(true);
       expect(radio.classList.contains('radio-accent')).toBe(true);
     });
   });
   ```

5. 验证测试通过
   ```bash
   npm run test:unit -- --grep "createRadio"
   ```

---

#### 任务 2.1.2: Toggle 组件迁移

**优先级**: 🚨 P0
**预计工时**: 3 小时
**文件范围**:
- `src/options/components/sections/PrivacySettingsComponent.ts`
- `src/options/components/sections/VideoSection.ts`
- `src/options/components/sections/DeepResearchSection.ts`
- 其他使用 toggle 样式的 checkbox

**步骤**:
1. 搜索 Toggle 候选位置
   ```bash
   # 查找可能用作 toggle 的 checkbox
   grep -rn "checkbox" src/options/components/ --include="*.ts" \
     | grep -E "(switch|toggle|enable|disable)"
   ```

2. 创建 `createToggle()` 工厂函数
   ```typescript
   // src/options/components/shared/DaisyUIHelpers.ts
   export interface ToggleOptions {
     checked?: boolean;
     disabled?: boolean;
     size?: 'xs' | 'sm' | 'md' | 'lg';
     color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error';
     className?: string;
   }

   export function createToggle(options?: ToggleOptions): HTMLInputElement {
     const toggle = document.createElement('input');
     toggle.type = 'checkbox';

     let className = 'toggle';
     if (options?.color) className += ` toggle-${options.color}`;
     if (options?.size) className += ` toggle-${options.size}`;
     if (options?.className) className += ` ${options.className}`;

     toggle.className = className;
     if (options?.checked) toggle.checked = options.checked;
     if (options?.disabled) toggle.disabled = options.disabled;

     return toggle;
   }
   ```

3. 迁移示例
   ```typescript
   // Before
   const enableCheckbox = document.createElement('input');
   enableCheckbox.type = 'checkbox';
   enableCheckbox.className = 'w-11 h-6 rounded-full bg-surface-2 border-2 border-border...';

   // After
   const enableToggle = createToggle({
     color: 'accent',
     size: 'md',
     checked: initialValue
   });
   ```

4. 测试
   ```bash
   npm run test:unit -- --grep "createToggle"
   npm run test:unit  # 全量测试
   ```

---

#### 任务 2.1.3: Range Slider 组件（可选）

**优先级**: ⚠️ P1（如项目中使用）
**预计工时**: 1 小时

**评估步骤**:
```bash
# 检查是否使用 range input
grep -rn "type=\"range\"" src/ --include="*.ts"

# 如无结果，可跳过此任务
```

**如需迁移**:
```typescript
// DaisyUI Range
<input type="range" min="0" max="100" value="50" class="range range-accent" />
```

---

#### 任务 2.1.4: File Input 组件（可选）

**优先级**: ⚠️ P1（如项目中使用）
**预计工时**: 1 小时

**评估步骤**:
```bash
# 检查是否使用 file input
grep -rn "type=\"file\"" src/ --include="*.ts"

# 如无结果，可跳过此任务
```

**如需迁移**:
```typescript
// DaisyUI File Input
<input type="file" class="file-input file-input-bordered w-full" />
```

---

### Phase 2.2: 数据展示组件（Week 1-2）

#### 任务 2.2.1: Badge 组件迁移

**优先级**: 🚨 P0
**预计工时**: 2 小时
**文件范围**:
- `src/options/components/sections/UsageDashboard.ts`
- `src/options/components/diagnostics.ts`
- 任何显示状态标签的位置

**步骤**:
1. 搜索 Badge 使用位置
   ```bash
   grep -rn "badge\|tag\|label\|status" src/options/components/ --include="*.ts" \
     | grep -i "class"
   ```

2. 创建 `createBadge()` 工厂函数
   ```typescript
   // src/options/components/shared/DaisyUIHelpers.ts
   export interface BadgeOptions {
     variant?: 'default' | 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error' | 'ghost' | 'outline';
     size?: 'xs' | 'sm' | 'md' | 'lg';
     className?: string;
   }

   export function createBadge(text: string, options?: BadgeOptions): HTMLSpanElement {
     const badge = document.createElement('span');

     let className = 'badge';
     if (options?.variant && options.variant !== 'default') {
       className += ` badge-${options.variant}`;
     }
     if (options?.size) className += ` badge-${options.size}`;
     if (options?.className) className += ` ${options.className}`;

     badge.className = className;
     badge.textContent = text;

     return badge;
   }
   ```

3. 迁移示例
   ```typescript
   // Before
   const statusBadge = document.createElement('span');
   statusBadge.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800';
   statusBadge.textContent = 'Active';

   // After
   const statusBadge = createBadge('Active', {
     variant: 'success',
     size: 'sm'
   });
   ```

4. 测试
   ```bash
   npm run test:unit -- --grep "createBadge"
   ```

---

#### 任务 2.2.2: Stats 组件迁移

**优先级**: 🔥 P1
**预计工时**: 3 小时
**文件范围**:
- `src/options/components/sections/UsageDashboard.ts`

**步骤**:
1. 检查当前 Stats 实现
   ```bash
   grep -rn "stats\|statistics\|metrics" src/options/components/ --include="*.ts"
   ```

2. 迁移到 DaisyUI Stats
   ```typescript
   // Before (手动 flex 布局)
   const statsContainer = document.createElement('div');
   statsContainer.className = 'grid grid-cols-3 gap-4';

   const statCard = document.createElement('div');
   statCard.className = 'bg-surface-1 p-4 rounded-lg border';

   // After (DaisyUI)
   const stats = document.createElement('div');
   stats.className = 'stats shadow';

   const stat = document.createElement('div');
   stat.className = 'stat';

   const statTitle = document.createElement('div');
   statTitle.className = 'stat-title';
   statTitle.textContent = 'Total Clips';

   const statValue = document.createElement('div');
   statValue.className = 'stat-value';
   statValue.textContent = '1,234';

   const statDesc = document.createElement('div');
   statDesc.className = 'stat-desc';
   statDesc.textContent = '↗︎ 12% since last week';

   stat.append(statTitle, statValue, statDesc);
   stats.append(stat);
   ```

3. 测试视觉效果
   - 在 Options 页面查看 Usage Dashboard
   - 确保数据对齐和间距正确

---

#### 任务 2.2.3: Progress 组件（可选）

**优先级**: ⚠️ P1
**预计工时**: 1 小时

**评估**:
```bash
# 检查是否使用进度条
grep -rn "progress\|percentage\|loading" src/options/components/ --include="*.ts"
```

**如需迁移**:
```typescript
// DaisyUI Progress
const progress = document.createElement('progress');
progress.className = 'progress progress-accent w-full';
progress.value = 70;
progress.max = 100;
```

---

#### 任务 2.2.4: Table 组件完整迁移

**优先级**: 🔥 P1
**预计工时**: 4 小时
**文件范围**:
- `src/options/components/controls/yamlConfigTable.ts` （已部分使用 DaisyUI grid）
- 其他可能的表格位置

**当前状态检查**:
```bash
# 查看 yamlConfigTable.ts 的当前类使用
grep -n "className\|classList" src/options/components/controls/yamlConfigTable.ts \
  | grep -i "grid\|table"
```

**分析**:
yamlConfigTable.ts 目前使用 CSS Grid 实现表格布局，而不是 HTML `<table>` 元素。需要评估：

1. **保持 Grid 布局** (推荐):
   - yamlConfigTable 的复杂交互（拖拽、折叠、动态行）适合 Grid
   - 只需优化现有类名，使用 DaisyUI utilities
   - 风险低，改动小

2. **迁移到 DaisyUI Table**:
   - 需要大规模重构（Grid → `<table>` 元素）
   - DaisyUI `.table` 可能不支持复杂交互
   - 风险高，工时长（8-10 小时）

**建议方案**: 保持 Grid 布局，优化类名

```typescript
// Current (Grid-based table)
header.className = 'grid grid-cols-[...] gap-2 p-3 bg-surface-2 border-b border-border';

// Optimized (use DaisyUI colors)
header.className = 'grid grid-cols-[...] gap-2 p-3 bg-base-200 border-b border-base-300';

// Apply DaisyUI theme variables
rowElement.className = 'grid grid-cols-[...] gap-2 p-3 items-center hover:bg-base-100 transition-colors border-b border-base-300 last:border-b-0';
```

**其他表格搜索**:
```bash
# 检查是否有其他表格实现
grep -rn "<table\|<thead\|<tbody\|<tr\|<td" src/options/components/ --include="*.ts"

# 如有，评估迁移到 DaisyUI .table
```

---

### Phase 2.3: 导航组件（Week 2）

#### 任务 2.3.1: Tabs 组件迁移

**优先级**: 🔥 P1
**预计工时**: 4 小时
**文件范围**:
- Options 页面主导航（如有使用 tab 切换）
- 任何内部 tab 组件

**评估步骤**:
```bash
# 搜索可能的 Tabs 实现
grep -rn "tab\|navigation\|nav-item" src/options/ --include="*.ts" \
  | grep -i "class"

# 检查 Options HTML 结构
cat src/options/index.html | grep -i "nav\|tab"
```

**如发现 Tabs 使用**:

1. 创建 `createTabs()` 工厂函数
   ```typescript
   // src/options/components/shared/DaisyUIHelpers.ts
   export interface TabsOptions {
     variant?: 'bordered' | 'lifted' | 'boxed';
     size?: 'xs' | 'sm' | 'md' | 'lg';
     className?: string;
   }

   export function createTabs(options?: TabsOptions): {
     container: HTMLDivElement;
     addTab: (label: string, active?: boolean) => HTMLAnchorElement;
   } {
     const container = document.createElement('div');

     let className = 'tabs';
     if (options?.variant) className += ` tabs-${options.variant}`;
     if (options?.size) className += ` tabs-${options.size}`;
     if (options?.className) className += ` ${options.className}`;

     container.className = className;
     container.setAttribute('role', 'tablist');

     const addTab = (label: string, active = false) => {
       const tab = document.createElement('a');
       tab.className = active ? 'tab tab-active' : 'tab';
       tab.textContent = label;
       tab.setAttribute('role', 'tab');
       container.append(tab);
       return tab;
     };

     return { container, addTab };
   }
   ```

2. 迁移示例
   ```typescript
   // Before (手动实现)
   const nav = document.createElement('nav');
   nav.className = 'flex border-b border-border';

   const tab1 = document.createElement('button');
   tab1.className = 'px-4 py-2 border-b-2 border-accent font-medium';

   // After (DaisyUI)
   const { container: tabs, addTab } = createTabs({ variant: 'lifted' });

   const generalTab = addTab('General', true);
   const advancedTab = addTab('Advanced');
   const aboutTab = addTab('About');

   generalTab.addEventListener('click', () => {
     // 切换逻辑
   });
   ```

3. 测试交互
   - 点击切换 tab
   - 验证 active 状态切换
   - 键盘导航（Arrow keys）

**如未发现 Tabs**: 跳过此任务，标记为"不适用"

---

#### 任务 2.3.2: Breadcrumbs 组件（可选）

**优先级**: ⚠️ P2
**预计工时**: 1 小时

**评估**:
```bash
# 检查面包屑导航使用
grep -rn "breadcrumb\|path\|route" src/options/ --include="*.ts"
```

**如未使用**: 跳过此任务

**如需要**:
```typescript
// DaisyUI Breadcrumbs
<div class="breadcrumbs text-sm">
  <ul>
    <li><a>Home</a></li>
    <li><a>Documents</a></li>
    <li>Add Document</li>
  </ul>
</div>
```

---

#### 任务 2.3.3: Pagination 组件（可选）

**优先级**: ⚠️ P2
**预计工时**: 2 小时

**评估**:
```bash
# 检查分页组件使用
grep -rn "pagination\|page\|next\|prev" src/options/components/ --include="*.ts"
```

**如在 UsageDashboard 使用**:
```typescript
// DaisyUI Pagination (using Join)
const pagination = document.createElement('div');
pagination.className = 'join';

const prevBtn = createButton('«', { variant: 'outline', size: 'sm' });
prevBtn.classList.add('join-item');

const page1Btn = createButton('1', { variant: 'primary', size: 'sm' });
page1Btn.classList.add('join-item');

const nextBtn = createButton('»', { variant: 'outline', size: 'sm' });
nextBtn.classList.add('join-item');

pagination.append(prevBtn, page1Btn, nextBtn);
```

---

### Phase 2.4: 工厂函数和测试（Week 2）

#### 任务 2.4.1: 扩展 DaisyUIHelpers.ts

**优先级**: 🔥 P1
**预计工时**: 3 小时

**新增工厂函数清单**:
- [x] `createButton()` - 已完成 (Phase 1)
- [x] `createInput()` - 已完成 (Phase 1)
- [x] `createAlert()` - 已完成 (Phase 1)
- [ ] `createRadio()` - Phase 2 新增
- [ ] `createToggle()` - Phase 2 新增
- [ ] `createBadge()` - Phase 2 新增
- [ ] `createTabs()` - Phase 2 新增

**步骤**:
1. 在 `src/options/components/shared/DaisyUIHelpers.ts` 中添加新函数
2. 为每个函数添加 JSDoc 注释
3. 导出所有新函数

```typescript
// DaisyUIHelpers.ts 示例结构
/**
 * Creates a DaisyUI Radio input element
 * @param name - Radio group name
 * @param options - Radio configuration options
 * @returns HTMLInputElement with DaisyUI classes
 * @example
 * const radio = createRadio('paymentMethod', {
 *   value: 'card',
 *   checked: true
 * });
 */
export function createRadio(name: string, options?: RadioOptions): HTMLInputElement {
  // 实现...
}
```

---

#### 任务 2.4.2: 单元测试

**优先级**: 🚨 P0
**预计工时**: 4 小时

**测试文件**: `tests/unit/shared/daisyUIHelpers.test.ts`

**测试清单**:
```typescript
describe('Phase 2 DaisyUI Helpers', () => {
  describe('createRadio', () => {
    it('should create radio with DaisyUI classes', () => { /* ... */ });
    it('should apply accent color', () => { /* ... */ });
    it('should handle checked state', () => { /* ... */ });
    it('should handle disabled state', () => { /* ... */ });
  });

  describe('createToggle', () => {
    it('should create toggle with correct classes', () => { /* ... */ });
    it('should apply color variants', () => { /* ... */ });
    it('should apply size modifiers', () => { /* ... */ });
    it('should handle custom className', () => { /* ... */ });
  });

  describe('createBadge', () => {
    it('should create badge with text', () => { /* ... */ });
    it('should apply variant classes', () => { /* ... */ });
    it('should apply size classes', () => { /* ... */ });
  });

  describe('createTabs', () => {
    it('should create tabs container', () => { /* ... */ });
    it('should add tabs dynamically', () => { /* ... */ });
    it('should mark active tab', () => { /* ... */ });
  });
});
```

**运行测试**:
```bash
# 运行新增测试
npm run test:unit -- --grep "Phase 2"

# 运行全量测试（必须 100% 通过）
npm run test:unit

# 预期结果: 所有测试通过（新增 ~16 个测试）
```

---

#### 任务 2.4.3: 更新组件文档

**优先级**: 🔥 P1
**预计工时**: 1 小时

**文件**: `src/options/components/README.md`

**更新内容**:
1. 在 "DaisyUI 组件工厂函数" 章节添加新函数
2. 更新组件使用示例
3. 添加 Phase 2 迁移完成标记

```markdown
## DaisyUI 组件工厂函数

### Phase 1 (已完成)
- `createButton()` - 创建按钮
- `createInput()` - 创建输入框
- `createAlert()` - 创建警告框

### Phase 2 (已完成)
- `createRadio()` - 创建单选按钮
- `createToggle()` - 创建开关
- `createBadge()` - 创建徽章
- `createTabs()` - 创建选项卡

### 使用示例

#### createToggle
\`\`\`typescript
import { createToggle } from '../shared/DaisyUIHelpers';

const darkModeToggle = createToggle({
  color: 'accent',
  size: 'md',
  checked: false
});
\`\`\`
```

---

### Phase 2.5: 暗色模式支持（Week 3，可选）

#### 任务 2.5.1: 启用 DaisyUI 暗色主题

**优先级**: ⚠️ P2（可选）
**预计工时**: 0.5 小时

**步骤**:
1. 修改 `tailwind.config.cjs`
   ```javascript
   module.exports = {
     // ...
     daisyui: {
       themes: [
         'light',  // 默认亮色主题
         'dark',   // 新增暗色主题
       ],
     },
   };
   ```

2. 重新构建
   ```bash
   npm run build:dev -- --skip-checks
   ```

3. 验证暗色主题 CSS 已生成
   ```bash
   grep -n "dark" dist/styles/components.css | head -10
   ```

---

#### 任务 2.5.2: 创建主题切换器

**优先级**: ⚠️ P2（可选）
**预计工时**: 3 小时

**文件**: `src/options/components/shared/ThemeSwitcher.ts`

**实现**:
```typescript
// ThemeSwitcher.ts
export class ThemeSwitcher {
  private toggle: HTMLInputElement;
  private currentTheme: 'light' | 'dark';

  constructor(container: HTMLElement) {
    this.currentTheme = this.loadTheme();
    this.toggle = this.createToggle();
    container.append(this.toggle);
    this.applyTheme(this.currentTheme);
  }

  private createToggle(): HTMLInputElement {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-2 cursor-pointer';

    const span = document.createElement('span');
    span.textContent = '🌙 Dark Mode';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle toggle-accent';
    toggle.checked = this.currentTheme === 'dark';

    toggle.addEventListener('change', (e) => {
      const theme = (e.target as HTMLInputElement).checked ? 'dark' : 'light';
      this.applyTheme(theme);
      this.saveTheme(theme);
    });

    label.append(span, toggle);
    return toggle;
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    document.documentElement.setAttribute('data-theme', theme);
    this.currentTheme = theme;
  }

  private saveTheme(theme: 'light' | 'dark'): void {
    localStorage.setItem('theme', theme);
  }

  private loadTheme(): 'light' | 'dark' {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  }
}
```

**集成到 Options 页面**:
```typescript
// src/options/app/bootstrap.ts
import { ThemeSwitcher } from '../components/shared/ThemeSwitcher';

// 在页面加载时初始化
const themeContainer = document.getElementById('theme-switcher');
if (themeContainer) {
  new ThemeSwitcher(themeContainer);
}
```

**HTML 修改**:
```html
<!-- src/options/index.html -->
<!-- 在页面顶部添加主题切换器容器 -->
<div id="theme-switcher" class="fixed top-4 right-4 z-50"></div>
```

---

#### 任务 2.5.3: 暗色模式测试

**优先级**: ⚠️ P2（可选）
**预计工时**: 2 小时

**测试清单**:
- [ ] 切换到暗色模式
- [ ] 验证所有 Button 在暗色模式下可见
- [ ] 验证所有 Input 边框在暗色模式下可见
- [ ] 验证所有 Alert 颜色对比度足够
- [ ] 验证所有 Badge 在暗色背景下可读
- [ ] 验证 Card 边框和阴影效果
- [ ] 验证主题切换持久化（刷新页面后保持）

**视觉截图**:
```bash
# 亮色模式截图
# 暗色模式截图
# 保存到 docs/screenshots/phase2/dark-mode/
```

---

#### 任务 2.5.4: 暗色模式适配

**优先级**: ⚠️ P2（可选）
**预计工时**: 2 小时

**常见问题修复**:

1. **自定义颜色不适配暗色**:
   ```typescript
   // Before (硬编码颜色)
   element.className = 'bg-white text-black';

   // After (使用 DaisyUI 主题变量)
   element.className = 'bg-base-100 text-base-content';
   ```

2. **边框在暗色模式不可见**:
   ```typescript
   // Before
   element.className = 'border border-gray-300';

   // After
   element.className = 'border border-base-300';
   ```

3. **文本对比度不足**:
   ```typescript
   // Before
   element.className = 'text-gray-500';

   // After
   element.className = 'text-base-content/60';  // 60% 不透明度
   ```

**全局颜色变量替换**:
```bash
# 搜索硬编码颜色
grep -rn "bg-white\|bg-gray-\|text-black\|text-gray-" src/options/ --include="*.ts"

# 逐一替换为 DaisyUI 主题变量
```

---

### Phase 2.6: Modal 迁移（Week 3+，可选）

#### 任务 2.6.1: 评估现有 Modal 实现

**优先级**: ⚠️ P2（可选）
**预计工时**: 2 小时

**评估范围**:
```bash
# 搜索所有 Modal 使用
grep -rn "modal\|dialog\|popup" src/ --include="*.ts"

# 列出关键文件
ls -lh src/content/ui/supportPrompt.ts
ls -lh src/options/components/shared/ModalController.ts  # 如有
```

**评估维度**:
| 维度 | 当前实现 | DaisyUI Modal | 迁移复杂度 |
|------|---------|--------------|-----------|
| **HTML 结构** | `<div>` 自定义 | `<dialog>` 元素 | 🔥🔥🔥 高 |
| **显示/隐藏** | class toggle | `showModal()` API | 🔥🔥 中 |
| **背景蒙层** | 手动实现 | 内置 `::backdrop` | 🔥 低 |
| **键盘交互** | 手动监听 ESC | 内置 ESC 关闭 | 🔥 低 |
| **焦点陷阱** | 手动实现 | 内置焦点管理 | 🔥 低 |
| **动画** | CSS transition | DaisyUI animation | 🔥 低 |

**决策建议**:
- **如 Modal 较少（< 3 个）**: 建议迁移，收益 > 成本
- **如 Modal 较多（≥ 3 个）**: 评估团队资源，可暂缓至 Phase 3
- **如 Modal 有复杂交互**: 建议保持现有实现，避免破坏性变更

---

#### 任务 2.6.2: 创建 DaisyUI Modal 适配器（如决定迁移）

**优先级**: ⚠️ P2（可选）
**预计工时**: 4 小时

**目标**: 创建向后兼容的 Modal 适配器，保持现有 API

**文件**: `src/options/components/shared/DaisyUIModal.ts`

**实现**:
```typescript
// DaisyUIModal.ts
export interface ModalOptions {
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
}

export class DaisyUIModal {
  private dialog: HTMLDialogElement;
  private content: HTMLDivElement;

  constructor(options: ModalOptions = {}) {
    this.dialog = this.createDialog(options);
    this.content = this.dialog.querySelector('.modal-box')!;
  }

  private createDialog(options: ModalOptions): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';

    const box = document.createElement('div');
    let boxClass = 'modal-box';
    if (options.size) boxClass += ` modal-${options.size}`;
    box.className = boxClass;

    if (options.title) {
      const title = document.createElement('h3');
      title.className = 'font-bold text-lg';
      title.textContent = options.title;
      box.append(title);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'py-4';
    box.append(contentDiv);

    const closeBtn = document.createElement('form');
    closeBtn.method = 'dialog';
    closeBtn.className = 'modal-action';
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Close';
    closeBtn.append(btn);
    box.append(closeBtn);

    dialog.append(box);

    // 背景点击关闭
    if (options.closeOnBackdrop !== false) {
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          this.close();
        }
      });
    }

    // ESC 关闭（默认启用）
    if (options.closeOnEsc !== false) {
      dialog.addEventListener('cancel', (e) => {
        // 允许默认行为（ESC 关闭）
      });
    }

    return dialog;
  }

  setContent(html: string | HTMLElement): void {
    if (typeof html === 'string') {
      this.content.innerHTML = html;
    } else {
      this.content.replaceChildren(html);
    }
  }

  open(): void {
    if (!this.dialog.parentElement) {
      document.body.append(this.dialog);
    }
    this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  destroy(): void {
    this.dialog.remove();
  }
}
```

**使用示例**:
```typescript
// Before (旧实现)
const modal = new ModalController({
  title: 'Confirm Action',
  content: 'Are you sure?',
});
modal.show();

// After (DaisyUI 适配器)
const modal = new DaisyUIModal({
  title: 'Confirm Action',
  size: 'md',
});
modal.setContent('Are you sure?');
modal.open();
```

---

#### 任务 2.6.3: 迁移各个 Modal 实例（如决定迁移）

**优先级**: ⚠️ P2（可选）
**预计工时**: 6 小时（假设 4 个 Modal）

**迁移清单** (根据实际项目调整):
- [ ] Support Prompt Modal (`supportPrompt.ts`)
- [ ] Suggestions Modal (如有)
- [ ] Contact Modal (如有)
- [ ] Changelog Modal (如有)

**迁移步骤**（以 supportPrompt.ts 为例）:
1. 备份原文件
   ```bash
   cp src/content/ui/supportPrompt.ts src/content/ui/supportPrompt.ts.backup
   ```

2. 替换 Modal 实现
   ```typescript
   // Before
   import { ModalController } from '../../options/components/shared/ModalController';

   // After
   import { DaisyUIModal } from '../../options/components/shared/DaisyUIModal';
   ```

3. 更新 Modal 创建代码
   ```typescript
   // Before
   const modal = new ModalController({ title: 'Support' });

   // After
   const modal = new DaisyUIModal({
     title: 'Support',
     size: 'lg'
   });
   ```

4. 测试 Modal 功能
   - 打开/关闭正常
   - 背景点击关闭
   - ESC 键关闭
   - 内容显示正确
   - 焦点管理正常

5. 运行单元测试和 E2E 测试
   ```bash
   npm run test:unit
   npm run test:e2e
   ```

---

#### 任务 2.6.4: Modal 测试（如决定迁移）

**优先级**: ⚠️ P2（可选）
**预计工时**: 3 小时

**单元测试**:
```typescript
// tests/unit/shared/daisyUIModal.test.ts
describe('DaisyUIModal', () => {
  it('should create modal with title', () => { /* ... */ });
  it('should open and close modal', () => { /* ... */ });
  it('should close on backdrop click', () => { /* ... */ });
  it('should close on ESC key', () => { /* ... */ });
  it('should set content dynamically', () => { /* ... */ });
});
```

**E2E 测试**:
```typescript
// tests/e2e/modalFlow.test.ts
test('should open support modal', async ({ page }) => {
  await page.goto('chrome-extension://<id>/options/index.html');
  await page.click('button:has-text("Support")');

  // 验证 modal 打开
  const dialog = page.locator('dialog.modal');
  await expect(dialog).toBeVisible();

  // 验证 ESC 关闭
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
```

---

## 质量门禁

### 自动化检查

**每次提交前运行**:
```bash
# 1. Lint 检查
npm run lint
# 期望: 无新增警告

# 2. 类型检查（如 TypeScript 错误已修复）
npm run typecheck:app
# 期望: 无类型错误

# 3. 单元测试
npm run test:unit
# 期望: 100% 通过（537+ 测试）

# 4. E2E 测试（重点场景）
npm run test:e2e -- --grep "options"
# 期望: 关键流程通过
```

### 代码审查清单

**迁移模式检查**:
- [ ] ✅ 所有新组件使用 DaisyUI 类（如 `.radio`, `.toggle`, `.badge`）
- [ ] ✅ 使用工厂函数创建组件（如 `createRadio()`, `createToggle()`）
- [ ] ✅ 添加迁移标记注释（如 `// ✅ Phase 2 DaisyUI migration`）
- [ ] ✅ 保持向后兼容（不改变组件 API）
- [ ] ✅ 移除旧的手动 Tailwind utilities

**代码质量检查**:
- [ ] ✅ 所有新函数有 JSDoc 注释
- [ ] ✅ 所有新函数有单元测试（覆盖率 ≥ 80%）
- [ ] ✅ 所有新函数有 TypeScript 类型定义
- [ ] ✅ 所有新组件在 README.md 中有文档

**视觉检查**:
- [ ] ✅ 组件在 Options 页面正确显示
- [ ] ✅ 组件 hover/focus 状态正常
- [ ] ✅ 组件 disabled 状态正确
- [ ] ✅ 组件间距和对齐一致
- [ ] ✅ 暗色模式正常（如启用）

### 包体积检查

**构建并测量**:
```bash
# 1. 清理并构建
rm -rf dist/
npm run build:dev -- --skip-checks

# 2. 测量包体积
du -sh dist/
# 期望: ≤ 790 KB (+5% from Phase 1 baseline ~750 KB)

# 3. 测量 CSS 大小
ls -lh dist/styles/*.css
# 期望: design-tokens.css + components.css ≤ 18 KB
#        (+6 KB from Phase 1 baseline 12.1 KB)

# 4. 详细对比
echo "Phase 1 baseline: ~750 KB"
echo "Phase 2 current: $(du -sh dist/ | awk '{print $1}')"
```

**如超过 5% 增长**: 分析原因并优化
```bash
# 分析 CSS 增长
grep -o "\\.[a-z-]*" dist/styles/components.css | sort | uniq -c | sort -rn | head -20

# 检查未使用的类
# 确保 Tailwind tree-shaking 工作正常
```

---

## 验收标准

### P0 必须达成（阻塞 Phase 3）

| 标准 | 目标值 | 验证方法 | 状态 |
|------|--------|----------|------|
| **Radio 迁移** | 100% | grep 搜索验证 | ⏸️ |
| **Toggle 迁移** | 100% | grep 搜索验证 | ⏸️ |
| **Badge 迁移** | 100% | 代码审查 | ⏸️ |
| **工厂函数创建** | 3+ 个新函数 | DaisyUIHelpers.ts 检查 | ⏸️ |
| **单元测试** | 100% 通过 | `npm run test:unit` | ⏸️ |
| **包体积增长** | < 5% | Bundle size report | ⏸️ |
| **零破坏性变更** | 0 个失败测试 | 全量测试 | ⏸️ |

### P1 建议达成（不阻塞 Phase 3）

| 标准 | 目标值 | 验证方法 | 状态 |
|------|--------|----------|------|
| **Stats 迁移** | 完成 | UsageDashboard 检查 | ⏸️ |
| **Tabs 迁移** | 完成（如使用）| 代码审查 | ⏸️ |
| **视觉测试** | 7+ 截图 | screenshots/ 目录 | ⏸️ |
| **文档更新** | README.md 完整 | 文档审查 | ⏸️ |

### P2 可选特性（Phase 3 规划）

| 标准 | 目标值 | 验证方法 | 状态 |
|------|--------|----------|------|
| **暗色模式** | 主题切换器工作 | 手动测试 | ⏸️ |
| **Modal 迁移** | 3+ Modal 迁移 | 代码审查 | ⏸️ |
| **Pagination** | 迁移（如使用）| 代码审查 | ⏸️ |

---

## 验收流程

### 开发者自验

**步骤 1: 功能验证** (30 分钟)
```bash
# 1. 启动开发服务器
npm run dev

# 2. 打开 Options 页面
# chrome-extension://<id>/options/index.html

# 3. 手动测试所有迁移的组件
# - 点击所有 Radio 选项
# - 切换所有 Toggle 开关
# - 查看所有 Badge 显示
# - 切换 Tabs（如有）
# - 查看 Stats 显示（如有）
```

**步骤 2: 测试验证** (15 分钟)
```bash
# 运行全量测试
npm run test:unit
npm run test:e2e

# 确保所有测试通过
# 预期: 537+ / 537+ tests passing
```

**步骤 3: 包体积验证** (10 分钟)
```bash
# 构建并测量
npm run build:dev -- --skip-checks
du -sh dist/
ls -lh dist/styles/*.css

# 创建包体积报告
# 参考 Phase 1: docs/251126-design-system-poc/phase1-bundle-size.md
```

**步骤 4: 创建自验报告** (20 分钟)

创建文件: `docs/251126-design-system-poc/PHASE2-SELF-CHECK.md`

```markdown
# Phase 2 开发者自验报告

**验收日期**: YYYY-MM-DD
**开发者**: Your Name
**分支**: feat/phase2-complex-components

## ✅ P0 任务完成情况

- [x] Radio 组件迁移完成
- [x] Toggle 组件迁移完成
- [x] Badge 组件迁移完成
- [x] 工厂函数创建完成（3 个）
- [x] 单元测试全部通过（XXX/XXX）
- [x] 包体积增长 < 5% (+X.XX KB, +X.XX%)

## ✅ P1 任务完成情况

- [x] Stats 组件迁移完成
- [x] Tabs 组件迁移完成（或标记为"不适用"）
- [x] 文档更新完成

## 📊 质量指标

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 单元测试通过率 | 100% | XX% | ✅/❌ |
| 包体积增长 | < 5% | +X.XX% | ✅/❌ |
| DaisyUI 覆盖率 | ≥ 85% | XX% | ✅/❌ |

## 🐛 已知问题

（列出任何未解决的问题）

## 📝 备注

（其他说明）
```

---

### 审核者验证

**审核清单**:
- [ ] 阅读开发者自验报告
- [ ] 拉取 Phase 2 分支并构建
- [ ] 运行全量测试（单元 + E2E）
- [ ] 手动测试所有新迁移的组件
- [ ] 审查代码质量（遵循 Phase 1 模式）
- [ ] 验证包体积增长在 5% 以内
- [ ] 检查文档更新完整性

**审核结论模板**:

创建文件: `docs/251126-design-system-poc/PHASE2-AUDIT-REPORT.md`

```markdown
# Phase 2 审核报告

**审核日期**: YYYY-MM-DD
**审核人**: Auditor Name
**审核对象**: Phase 2 复杂组件迁移

## 审核结论

**总体状态**: ✅ 通过 / ⚠️ 有条件通过 / ❌ 不通过

**完成度**: XX%

**质量评分**: XX/100

## 详细评分

| 维度 | 得分 | 权重 | 加权分 | 说明 |
|------|------|------|--------|------|
| Radio 迁移 | XX/100 | 15% | XX | ... |
| Toggle 迁移 | XX/100 | 15% | XX | ... |
| Badge 迁移 | XX/100 | 10% | XX | ... |
| 工厂函数质量 | XX/100 | 15% | XX | ... |
| 测试覆盖 | XX/100 | 20% | XX | ... |
| 包体积控制 | XX/100 | 15% | XX | ... |
| 文档完整性 | XX/100 | 10% | XX | ... |

**总分**: XX/100

## 问题清单

### 阻塞问题（必须修复）
1. ...

### 建议改进（可选）
1. ...

## 验收决定

✅ 批准进入 Phase 3 / ⚠️ 修复后批准 / ❌ 需要返工
```

---

## 风险和注意事项

### 高风险项

#### 1. Table 组件大规模重构风险

**风险描述**: yamlConfigTable.ts 使用复杂的 Grid 布局，完全迁移到 DaisyUI `.table` 可能破坏现有功能。

**风险等级**: 🔥🔥🔥 高

**缓解措施**:
- ✅ **推荐**: 保持 Grid 布局，仅优化类名使用 DaisyUI 主题变量
- ⚠️ **备选**: 创建独立分支测试完整迁移，风险评估后决定是否合并
- ⚠️ **回滚计划**: 如测试失败，回滚到 Grid 方案

**决策建议**: 优先选择低风险方案（保持 Grid）

---

#### 2. Modal 迁移破坏现有 API

**风险描述**: 现有 Modal 实现（ModalController）可能有多处调用，API 改变会导致大规模修改。

**风险等级**: 🔥🔥 中高

**缓解措施**:
- ✅ 创建向后兼容的适配器（DaisyUIModal 保持与 ModalController 相同的 API）
- ✅ 渐进式迁移（先迁移 1 个 Modal 测试）
- ✅ 保留旧实现一段时间，逐步弃用

**决策建议**: Modal 迁移为 **P2 可选任务**，如时间紧张可跳过

---

#### 3. 暗色模式适配工作量超预期

**风险描述**: 暗色模式可能暴露大量硬编码颜色，需要逐一修复。

**风险等级**: 🔥🔥 中

**缓解措施**:
- ✅ 提前搜索硬编码颜色并统计数量
- ✅ 如数量 > 50 处，建议暂缓至 Phase 3
- ✅ 优先使用 DaisyUI 主题变量而非自定义颜色

**决策建议**: 暗色模式为 **P2 可选任务**，Phase 2 只做准备工作

---

### 中等风险项

#### 4. 新工厂函数测试覆盖不足

**风险描述**: 新增的 `createRadio()`, `createToggle()`, `createBadge()` 可能缺少边界情况测试。

**风险等级**: 🔥 中低

**缓解措施**:
- ✅ 参考 Phase 1 的 `createButton()` 测试模式
- ✅ 每个函数至少 4 个测试用例（正常、disabled、checked、custom className）
- ✅ 代码审查时重点检查测试覆盖率

---

#### 5. 包体积超出 5% 限制

**风险描述**: 新增多个 DaisyUI 组件可能导致 CSS 体积增长过多。

**风险等级**: 🔥 中低

**缓解措施**:
- ✅ 每完成一个组件迁移后立即构建并测量
- ✅ 如接近 5% 阈值，停止迁移并优化现有代码
- ✅ 使用 PurgeCSS 确保 tree-shaking 工作正常

**监控命令**:
```bash
# 每次迁移后运行
npm run build:dev -- --skip-checks
du -sh dist/styles/*.css
# 如超过 18 KB (Phase 1: 12.1 KB + 6 KB allowance)，立即优化
```

---

### 注意事项

#### 兼容性

1. **浏览器兼容性**: DaisyUI 依赖现代 CSS 特性（如 CSS Variables），确保 Chrome 版本 ≥ 90
2. **向后兼容**: 所有组件迁移必须保持现有 API 接口，不影响现有代码调用
3. **类型安全**: 所有新函数必须有完整的 TypeScript 类型定义

#### 性能

1. **首次渲染**: DaisyUI 类可能增加首次 CSS 解析时间（预计 < 10ms）
2. **Tree-shaking**: 确保 Tailwind 的 `purge` 配置正确，未使用的类会被移除
3. **Bundle 拆分**: 如 CSS 文件 > 20 KB，考虑拆分为多个文件按需加载

#### 可访问性 (A11y)

1. **键盘导航**: 所有新组件必须支持键盘导航（Tab、Enter、Esc）
2. **ARIA 属性**: Radio、Toggle、Tabs 等组件需要正确的 ARIA 标记
3. **焦点管理**: Modal 打开时焦点应陷入 Modal 内部

---

## 参考资源

### 官方文档

| 资源 | 链接 | 用途 |
|------|------|------|
| **DaisyUI 官方文档** | https://daisyui.com/components/ | 查看所有组件示例 |
| **DaisyUI Themes** | https://daisyui.com/docs/themes/ | 主题配置和自定义 |
| **Tailwind CSS** | https://tailwindcss.com/docs | Tailwind utilities 参考 |
| **Tailwind Purge** | https://tailwindcss.com/docs/optimizing-for-production | Tree-shaking 配置 |

### 项目内部文档

| 文档 | 位置 | 用途 |
|------|------|------|
| **Phase 1 迁移日志** | `docs/251126-design-system-poc/migration-log.md` | 学习 Phase 1 迁移模式 |
| **Phase 1 验收报告** | `docs/251126-design-system-poc/PHASE1-ACCEPTANCE.md` | 了解验收标准 |
| **Phase 1.5 审核报告** | `docs/251126-design-system-poc/PHASE1.5-AUDIT-REPORT.md` | 参考审核流程 |
| **包体积报告** | `docs/251126-design-system-poc/phase1-bundle-size.md` | 了解包体积测量方法 |
| **视觉测试指南** | `docs/251126-design-system-poc/visual-regression-testing-guide.md` | 视觉测试流程 |
| **组件 README** | `src/options/components/README.md` | 组件使用指南 |

### 代码示例

| 示例 | 位置 | 用途 |
|------|------|------|
| **Button 工厂函数** | `src/options/components/shared/DaisyUIHelpers.ts` (line 1-58) | 参考工厂函数实现 |
| **Button 单元测试** | `tests/unit/shared/daisyUIHelpers.test.ts` | 参考测试写法 |
| **Checkbox 迁移** | `src/options/components/sections/DeepResearchSection.ts` (line 76) | 参考迁移模式 |
| **Input 迁移** | `src/options/components/sections/RoutingSection.ts` (line 264) | 参考迁移模式 |

### 工具和插件

| 工具 | 安装 | 用途 |
|------|------|------|
| **Tailwind CSS IntelliSense** | VS Code 插件市场 | 类名自动补全 |
| **Headless UI** | 可选（如需无样式组件） | 复杂交互组件基础 |
| **Bundlephobia** | https://bundlephobia.com/ | 检查包体积 |

---

## 时间估算

### 分阶段工时

| 阶段 | 任务 | 工时 | 周次 |
|------|------|------|------|
| **Phase 2.1** | 复杂表单控件（Radio, Toggle, Badge） | 7h | Week 1 |
| **Phase 2.2** | 数据展示组件（Stats, Table 优化） | 10h | Week 1-2 |
| **Phase 2.3** | 导航组件（Tabs, Pagination） | 7h | Week 2 |
| **Phase 2.4** | 工厂函数和测试 | 8h | Week 2 |
| **P0 小计** | - | **32h** | **4 天** |
| | | | |
| **Phase 2.4** (续) | 视觉回归测试 | 4.5h | Week 2 |
| **P1 小计** | - | **4.5h** | **0.5 天** |
| | | | |
| **Phase 2.5** | 暗色模式（可选）| 7.5h | Week 3 |
| **Phase 2.6** | Modal 迁移（可选）| 15h | Week 3+ |
| **P2 小计** | - | **22.5h** | **3 天** |
| | | | |
| **总计（P0+P1）** | - | **36.5h** | **~5 天** |
| **总计（含 P2）** | - | **59h** | **~8 天** |

### 推荐排期

**快速迁移路径（P0 only）**: 5 个工作日
```
Week 1:
  Day 1-2: Radio + Toggle 迁移
  Day 3: Badge + Stats 迁移
  Day 4: 工厂函数 + 单元测试
  Day 5: 文档 + 自验 + 提交审核
```

**完整迁移路径（P0+P1）**: 6 个工作日
```
Week 1:
  Day 1-2: Radio + Toggle 迁移
  Day 3: Badge + Stats 迁移
  Day 4: Tabs + 工厂函数
  Day 5: 单元测试 + 视觉测试

Week 2:
  Day 1: 文档 + 自验 + 提交审核
```

**完整迁移路径（P0+P1+P2）**: 8-10 个工作日
```
Week 1: P0 任务（4 天）
Week 2: P1 任务 + 暗色模式（2 天）
Week 3: Modal 迁移（可选，2-3 天）
```

---

## 常见问题 (FAQ)

### Q1: 如果某个组件在项目中没有使用怎么办？

**A**: 跳过该组件的迁移，在清单中标记为"不适用"（N/A）。例如：
- Range Slider → 如项目中无 `type="range"` input，跳过
- Breadcrumbs → 如无面包屑导航，跳过
- Pagination → 如无分页组件，跳过

---

### Q2: 如何判断一个组件应该使用 DaisyUI 类还是工厂函数？

**A**: 参考 Phase 1 经验：
- **动态创建的组件**（JavaScript 中 `createElement`）→ 工厂函数
- **静态 HTML 模板**（HTML 文件中）→ DaisyUI 类
- **简单组件**（如 Badge）→ 可选（类更轻量，工厂函数更灵活）

---

### Q3: 如果包体积超过 5% 怎么办？

**A**: 采取以下措施：
1. 检查 Tailwind `purge` 配置是否正确
2. 运行 `npm run build` 确保 tree-shaking 生效
3. 移除未使用的 DaisyUI 主题（只保留 `light`）
4. 如仍超标，暂停迁移并与团队讨论优先级调整

---

### Q4: 测试失败了怎么办？

**A**:
1. **单元测试失败**: 检查是否修改了组件 API，确保向后兼容
2. **E2E 测试失败**: 检查组件类名变化是否影响测试选择器
3. **视觉测试差异**: 评估是否为预期的样式改进，记录并与团队确认

---

### Q5: 是否需要先修复 TypeScript 错误才能开始 Phase 2？

**A**: 不需要。Phase 2 可以使用 `npm run build:dev -- --skip-checks` 绕过 TypeScript 检查。但建议在 Phase 2 期间**不引入新的 TypeScript 错误**。

---

### Q6: Modal 迁移是否必须？

**A**: **否**。Modal 迁移为 P2 可选任务，风险较高且工时较长。建议优先完成 P0 和 P1 任务，Modal 可暂缓至 Phase 3 或更晚的版本。

---

### Q7: 暗色模式是否必须？

**A**: **否**。暗色模式为 P2 可选任务，需要产品团队决策。如产品暂无暗色模式需求，可跳过此任务。

---

### Q8: 如何与 Phase 1 的工作对接？

**A**:
1. 阅读 `migration-log.md` 了解 Phase 1 迁移模式
2. 复用 `DaisyUIHelpers.ts` 中的工厂函数模式
3. 遵循相同的命名和注释规范（如 `// ✅ Phase 2 DaisyUI migration`）
4. 运行全量测试确保不破坏 Phase 1 的工作

---

## 完成标志

当以下所有条件满足时，Phase 2 可视为完成：

### P0 必须项（阻塞 Phase 3）

- [ ] ✅ Radio 组件 100% 迁移到 DaisyUI `.radio`
- [ ] ✅ Toggle 组件 100% 迁移到 DaisyUI `.toggle`
- [ ] ✅ Badge 组件 100% 迁移到 DaisyUI `.badge`
- [ ] ✅ 创建 `createRadio()` 工厂函数 + 测试
- [ ] ✅ 创建 `createToggle()` 工厂函数 + 测试
- [ ] ✅ 创建 `createBadge()` 工厂函数 + 测试
- [ ] ✅ 所有单元测试通过（537+ / 537+）
- [ ] ✅ 包体积增长 < 5% (< 790 KB total)
- [ ] ✅ 创建 Phase 2 包体积报告（`phase2-bundle-size.md`）
- [ ] ✅ 更新 `migration-log.md` 记录 Phase 2 完成
- [ ] ✅ 更新 `src/options/components/README.md` 文档

### P1 建议项（不阻塞 Phase 3）

- [ ] ✅ Stats 组件迁移完成（如使用）
- [ ] ✅ Tabs 组件迁移完成（如使用）
- [ ] ✅ 视觉回归测试完成（7+ 截图）
- [ ] ✅ 创建开发者自验报告（`PHASE2-SELF-CHECK.md`）
- [ ] ✅ 通过审核者审核（`PHASE2-AUDIT-REPORT.md`）

### P2 可选项（Phase 3 规划）

- [ ] ⏸️ 暗色模式支持（主题切换器 + 测试）
- [ ] ⏸️ Modal 迁移（3+ Modal 实例）
- [ ] ⏸️ Pagination 迁移（如使用）

---

## 支持和反馈

### 遇到问题？

1. **查阅文档**: 优先查阅本指南和 Phase 1 文档
2. **搜索代码**: 参考 Phase 1 的实现（如 `createButton` 工厂函数）
3. **运行测试**: 确保测试环境正常（`npm run test:unit`）
4. **询问团队**: 在团队协作工具中提问

### 提交反馈

如本指南有不清晰或遗漏的地方，请在以下位置提交反馈：
- 创建 Issue 标记为 `daisyui-migration`
- 在团队协作工具中讨论

---

## 附录

### A. DaisyUI 组件速查表

| 组件 | 类名 | 变体 | 尺寸 |
|------|------|------|------|
| **Radio** | `.radio` | `radio-primary` `radio-accent` | (固定大小) |
| **Toggle** | `.toggle` | `toggle-primary` `toggle-accent` `toggle-success` | `toggle-xs` `toggle-sm` `toggle-md` `toggle-lg` |
| **Badge** | `.badge` | `badge-primary` `badge-accent` `badge-success` `badge-error` `badge-ghost` `badge-outline` | `badge-xs` `badge-sm` `badge-md` `badge-lg` |
| **Stats** | `.stats` | `.stat` `.stat-title` `.stat-value` `.stat-desc` | - |
| **Tabs** | `.tabs` | `tabs-bordered` `tabs-lifted` `tabs-boxed` | `tabs-xs` `tabs-sm` `tabs-md` `tabs-lg` |
| **Progress** | `.progress` | `progress-primary` `progress-accent` | - |

### B. 工厂函数模板

```typescript
// Template for new factory function
export interface ComponentOptions {
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

export function createComponent(options?: ComponentOptions): HTMLElement {
  const element = document.createElement('tagname');

  let className = 'base-class';
  if (options?.variant) className += ` base-class-${options.variant}`;
  if (options?.size) className += ` base-class-${options.size}`;
  if (options?.className) className += ` ${options.className}`;

  element.className = className;
  if (options?.disabled) element.setAttribute('disabled', '');

  return element;
}
```

### C. 单元测试模板

```typescript
// Template for component tests
describe('createComponent', () => {
  it('should create element with base classes', () => {
    const element = createComponent();
    expect(element.classList.contains('base-class')).toBe(true);
  });

  it('should apply variant classes', () => {
    const element = createComponent({ variant: 'primary' });
    expect(element.classList.contains('base-class-primary')).toBe(true);
  });

  it('should apply size classes', () => {
    const element = createComponent({ size: 'sm' });
    expect(element.classList.contains('base-class-sm')).toBe(true);
  });

  it('should handle disabled state', () => {
    const element = createComponent({ disabled: true });
    expect(element.hasAttribute('disabled')).toBe(true);
  });

  it('should allow custom className', () => {
    const element = createComponent({ className: 'custom' });
    expect(element.classList.contains('custom')).toBe(true);
  });
});
```

---

**文档结束**

**版本**: v1.0
**最后更新**: 2025-11-27
**下次审查**: Phase 2 启动后

**祝迁移顺利！ 🚀**
