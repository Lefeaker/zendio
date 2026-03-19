# 阶段 3 Week 1-2 实施指南 | Stage 3 Week 1-2 Implementation Guide

> **版本**：v1.0
> **创建日期**：2025-11-28
> **阶段**：阶段 3 月度 1 - Options 页面 Section 迁移（准备工作）
> **预计工时**：80h（2 周 × 2 人）
> **前置条件**：✅ 阶段 0-2 已完成（DaisyUI 组件已创建）

---

## 📋 Week 1-2 目标

### 核心目标

**为批量迁移 Options Sections 做好准备**

### 具体交付物

1. ✅ **迁移清单**（Excel/Markdown）- 列出所有需要迁移的 UI 元素
2. ✅ **迁移规范文档**（README 更新）- 统一的迁移标准和代码风格
3. ✅ **质量门禁配置**（ESLint + CI）- 自动化检查工具
4. ✅ **示例迁移**（1-2 个简单 Section）- 验证迁移流程

---

## 🗓️ Week 1：迁移清单 + 迁移规范（40h）

### 📅 Day 1-2：创建迁移清单 ⏱️ 16h

#### Task 1.1：审计所有 Section 的 UI 元素 ⏱️ 8h

**目标**：列出所有 Section 中需要迁移的 UI 元素

**步骤**：

##### Step 1：列出所有 Section 文件

```bash
# 查看所有 Section 文件
ls -lh src/options/components/sections/*.ts

# 预期输出（14 个文件）：
# AiSection.ts
# ClassifierSection.ts
# DeepResearchSection.ts
# DiagnosisSection.ts
# FragmentSection.ts
# LanguageSection.ts
# PrivacySection.ts
# ReadingSection.ts
# RestSection.ts
# RoutingSection.ts
# TemplatesSection.ts
# TransferSection.ts
# UsageSection.ts
# VideoSection.ts
# YamlConfigSection.ts
```

##### Step 2：逐个文件搜索 UI 元素

**搜索模式**：

```bash
# 搜索按钮（button 元素）
grep -n "createElement('button')" src/options/components/sections/*.ts

# 搜索输入框（input 元素）
grep -n "createElement('input')" src/options/components/sections/*.ts

# 搜索卡片（.card 类名）
grep -n "className.*card" src/options/components/sections/*.ts

# 搜索 Alert（.alert 类名）
grep -n "className.*alert" src/options/components/sections/*.ts

# 搜索手写 Tailwind 类名（长类名）
grep -n "className.*bg-.*text-.*rounded" src/options/components/sections/*.ts
```

##### Step 3：创建迁移清单（Excel 或 Markdown）

**模板**：创建 `docs/251126-design-system-poc/WEEK1-2-MIGRATION-CHECKLIST.md`

```markdown
# Week 1-2 迁移清单

## Section 审计结果

| Section | 文件 | 按钮数 | 输入框数 | 卡片数 | Alert 数 | 其他 UI | 优先级 | 预计工时 |
|---------|------|--------|---------|--------|---------|---------|--------|---------|
| AiSection | AiSection.ts | 2 | 3 | 0 | 0 | - | P1 | 2h |
| LanguageSection | LanguageSection.ts | 1 | 0 | 0 | 0 | 下拉选择 | P1 | 1h |
| PrivacySection | PrivacySection.ts | 1 | 0 | 0 | 0 | 复选框 | P1 | 1h |
| TransferSection | TransferSection.ts | 2 | 0 | 0 | 1 | - | P1 | 1.5h |
| RestSection | RestSection.ts | 3 | 4 | 1 | 1 | 连接测试 | P2 | 3h |
| RoutingSection | RoutingSection.ts | 2 | 2 | 0 | 0 | 路由表 | P2 | 2h |
| FragmentSection | FragmentSection.ts | 2 | 3 | 0 | 0 | - | P2 | 2h |
| VideoSection | VideoSection.ts | 2 | 2 | 0 | 0 | - | P2 | 2h |
| ReadingSection | ReadingSection.ts | 1 | 0 | 1 | 0 | 模板编辑 | P3 | 2h |
| TemplatesSection | TemplatesSection.ts | 2 | 0 | 1 | 0 | 模板列表 | P3 | 2h |
| ClassifierSection | ClassifierSection.ts | 2 | 2 | 0 | 0 | 分类器配置 | P3 | 2h |
| UsageSection | UsageSection.ts | 1 | 0 | 0 | 0 | 图表 | P3 | 1h |
| **YamlConfigSection** | YamlConfigSection.ts | 5 | 10 | 0 | 0 | 表格编辑器 | **P4 延后** | 8h |
| **DiagnosisSection** | DiagnosisSection.ts | 1 | 0 | 0 | 0 | 诊断功能 | **P4 延后** | 1h |

**总计**：
- 简单 Section（P1）：4 个，预计 5.5h
- 中等 Section（P2）：4 个，预计 9h
- 复杂 Section（P3）：4 个，预计 7h
- 延后 Section（P4）：2 个，延后到月度 3

**累计工时**：21.5h（Week 3-4 批量迁移）
```

**交付物**：`WEEK1-2-MIGRATION-CHECKLIST.md`（可以用 Excel 代替）

---

#### Task 1.2：标记需要迁移的代码位置 ⏱️ 6h

**目标**：在每个 Section 文件中添加 TODO 注释，标记需要迁移的 UI 元素

**步骤**：

##### Step 1：逐个文件添加 TODO 注释

**示例**（AiSection.ts）：

```typescript
// src/options/components/sections/AiSection.ts

export class AiSection extends BaseSection {
  render() {
    // ...

    // TODO: Stage 3 Week 3 - Migrate to DaisyButton
    const saveButton = document.createElement('button');
    saveButton.className = 'px-4 py-2 bg-accent text-white rounded-md';
    saveButton.textContent = 'Save';

    // TODO: Stage 3 Week 3 - Migrate to DaisyInput
    const apiKeyInput = document.createElement('input');
    apiKeyInput.type = 'text';
    apiKeyInput.className = 'input input-bordered w-full';
    apiKeyInput.placeholder = 'Enter API Key';

    // ...
  }
}
```

##### Step 2：统计 TODO 数量

```bash
# 统计所有 TODO 标记
grep -r "TODO: Stage 3" src/options/components/sections/ | wc -l

# 预期输出：~40-60 个 TODO
```

##### Step 3：更新迁移清单

在 `WEEK1-2-MIGRATION-CHECKLIST.md` 中添加：

```markdown
## TODO 标记统计

- AiSection：3 个 TODO
- LanguageSection：1 个 TODO
- PrivacySection：1 个 TODO
- ...

**总计**：45 个 TODO
```

**交付物**：所有 Section 文件添加 TODO 注释

---

#### Task 1.3：识别暂不迁移的复杂组件 ⏱️ 2h

**目标**：标记需要延后到月度 3 的复杂组件

**需要延后的组件**：

1. **YamlConfigSection 的表格编辑器**
   - 原因：需要 Zag.js Table（月度 3 任务）
   - 行数：~2000 行（复杂度高）

2. **VaultRouter 的下拉选择器**
   - 原因：需要 Zag.js Select（月度 3 任务）
   - 行数：~300 行

3. **路由表编辑器**（RoutingSection）
   - 原因：需要自定义拖拽逻辑
   - 建议：保留现有实现，仅迁移按钮

**在清单中标记**：

```markdown
## 延后迁移的组件（月度 3）

| 组件 | 位置 | 原因 | 延后到 |
|------|------|------|--------|
| YamlConfig 表格 | YamlConfigSection.ts | 需 Zag.js Table | 月度 3 Week 2 |
| VaultRouter 下拉 | controls/vaultRouterController.ts | 需 Zag.js Select | 月度 3 Week 1 |
| 路由表编辑器 | RoutingSection.ts | 自定义拖拽 | 月度 3 Week 3 |
```

**交付物**：延后组件清单（在迁移清单中）

---

### 📅 Day 3-4：制定迁移规范 ⏱️ 16h

#### Task 1.4：更新 Options 组件 README ⏱️ 8h

**目标**：在 `src/options/components/README.md` 中添加"阶段 3 迁移规范"章节

**步骤**：

##### Step 1：添加迁移规范章节

编辑 `src/options/components/README.md`，在 DaisyUI 迁移状态后添加：

```markdown
## 阶段 3 迁移规范（Stage 3 Migration Guidelines）

### 迁移原则

1. **渐进式迁移**：优先迁移简单组件，延后复杂组件
2. **保持功能不变**：迁移前后功能必须一致
3. **统一代码风格**：所有迁移代码使用相同的模式
4. **添加迁移标记**：所有迁移代码添加注释标记

### 迁移优先级

- **P1（简单 Section）**：仅替换按钮、输入框，无复杂逻辑
- **P2（中等 Section）**：替换按钮、输入框 + 连接测试等业务逻辑
- **P3（复杂 Section）**：保留复杂编辑器，仅替换基础 UI
- **P4（延后）**：需要 Zag.js 的复杂组件，延后到月度 3

### 迁移步骤（通用流程）

#### Step 1：读取原有代码

```typescript
// Before: 旧代码
const button = document.createElement('button');
button.className = 'px-4 py-2 bg-accent text-white rounded-md font-semibold hover:bg-accent-hover';
button.textContent = 'Save';
button.addEventListener('click', () => this.save());
```

#### Step 2：导入 DaisyUI 组件

```typescript
import { DaisyButton } from '../shared/DaisyButton';
```

#### Step 3：替换为 DaisyUI 组件

```typescript
// ✅ Stage 3 Week 3: Migrated to DaisyButton
const buttonContainer = document.createElement('div');
const daisyButton = new DaisyButton(buttonContainer);
daisyButton.render({
  label: 'Save',
  variant: 'primary',
  size: 'md',
  onClick: () => this.save()
});
```

#### Step 4：添加迁移标记注释

```typescript
// ✅ Stage 3 Week 3: Migrated to DaisyButton (AiSection.ts line 123)
```

#### Step 5：测试功能

```bash
# 手动测试
1. 打开 Options 页面
2. 点击保存按钮
3. 验证功能正常

# 自动化测试（如果有）
npm run test:unit -- tests/unit/options/sections/AiSection.test.ts
```

### 代码模板（Copy-Paste 即用）

#### 模板 1：迁移按钮（最常用）

```typescript
// Before
const button = document.createElement('button');
button.className = 'btn btn-primary btn-sm'; // 或手写 Tailwind
button.textContent = 'Label';
button.addEventListener('click', handler);

// After
import { DaisyButton } from '../shared/DaisyButton';

// ✅ Stage 3 Week X: Migrated to DaisyButton
const buttonContainer = document.createElement('div');
const daisyButton = new DaisyButton(buttonContainer);
const buttonEl = daisyButton.render({
  label: 'Label',
  variant: 'primary', // primary | secondary | ghost | error
  size: 'sm',         // sm | md | lg
  onClick: handler
});
container.append(buttonEl);
```

#### 模板 2：迁移输入框

```typescript
// Before
const input = document.createElement('input');
input.type = 'text';
input.className = 'input input-bordered w-full';
input.placeholder = 'Enter value';
input.addEventListener('input', (e) => {
  this.handleChange(e.target.value);
});

// After
import { DaisyInput } from '../shared/DaisyInput';

// ✅ Stage 3 Week X: Migrated to DaisyInput
const inputContainer = document.createElement('div');
const daisyInput = new DaisyInput(inputContainer);
const inputEl = daisyInput.render({
  type: 'text',
  placeholder: 'Enter value',
  variant: 'bordered', // normal | bordered | ghost
  size: 'md',          // sm | md | lg
  onChange: (value) => this.handleChange(value)
});
container.append(inputEl);
```

#### 模板 3：迁移 Alert 提示

```typescript
// Before
const alert = document.createElement('div');
alert.className = 'alert alert-success';
alert.innerHTML = '<span>Success!</span>';

// After
import { DaisyAlert } from '../shared/DaisyAlert';

// ✅ Stage 3 Week X: Migrated to DaisyAlert
const alertContainer = document.createElement('div');
const daisyAlert = new DaisyAlert(alertContainer);
const alertEl = daisyAlert.render({
  type: 'success',     // info | success | warning | error
  message: 'Success!',
  description: 'Operation completed', // 可选
  dismissible: true,   // 可选
  onDismiss: () => console.log('Dismissed')
});
container.append(alertEl);
```

#### 模板 4：迁移卡片容器

```typescript
// Before
const card = document.createElement('div');
card.className = 'card bg-base-100 shadow-xl';
const cardBody = document.createElement('div');
cardBody.className = 'card-body';
card.append(cardBody);

// After
import { DaisyCard } from '../shared/DaisyCard';

// ✅ Stage 3 Week X: Migrated to DaisyCard
const cardContainer = document.createElement('div');
const daisyCard = new DaisyCard(cardContainer);
const cardEl = daisyCard.render({
  title: 'Card Title',     // 可选
  body: 'Card content',    // 或 HTMLElement
  actions: [button1, button2], // 可选
  variant: 'normal'        // normal | compact | side
});
container.append(cardEl);
```

### 迁移标记规范

所有迁移代码必须添加以下格式的注释：

```typescript
// ✅ Stage 3 Week X: Migrated to DaisyButton
// ✅ Stage 3 Week X: Migrated to DaisyInput
// ✅ Stage 3 Week X: Migrated to DaisyAlert
// ✅ Stage 3 Week X: Migrated to DaisyCard
```

**说明**：
- `Week X`：替换为实际迁移的周数（如 Week 3、Week 4）
- 如果需要，可以在后面添加文件名和行号：`(AiSection.ts line 123)`

### 自查清单（Self-Check）

每次迁移后，必须检查：

- [ ] 是否导入了正确的 DaisyUI 组件？
- [ ] 是否添加了迁移标记注释？
- [ ] 是否使用了 `variant`、`size` 等属性？
- [ ] 是否保持了原有的事件处理逻辑？
- [ ] 是否手动测试了功能？
- [ ] 是否运行了单元测试（如果有）？
- [ ] 是否删除了旧代码（注释掉的旧代码）？

### 常见错误（Gotchas）

#### 错误 1：忘记创建容器元素

```typescript
// ❌ 错误：DaisyButton 需要 container
const button = new DaisyButton(null); // TypeError!

// ✅ 正确：先创建容器
const container = document.createElement('div');
const button = new DaisyButton(container);
```

#### 错误 2：混用旧代码和新代码

```typescript
// ❌ 错误：旧代码和新代码并存
const button = document.createElement('button'); // 旧代码
button.className = 'btn btn-primary';
const daisyButton = new DaisyButton(container); // 新代码（冗余）

// ✅ 正确：完全替换旧代码
const daisyButton = new DaisyButton(container);
daisyButton.render({ label: 'Save', variant: 'primary' });
```

#### 错误 3：忘记传递事件处理器

```typescript
// ❌ 错误：忘记传递 onClick
daisyButton.render({ label: 'Save', variant: 'primary' });
// 按钮无法点击！

// ✅ 正确：传递 onClick
daisyButton.render({
  label: 'Save',
  variant: 'primary',
  onClick: () => this.save() // ← 别忘了
});
```

#### 错误 4：使用 innerHTML 代替组件

```typescript
// ❌ 错误：直接写 HTML 字符串
container.innerHTML = '<button class="btn btn-primary">Save</button>';

// ✅ 正确：使用 DaisyButton 组件
const daisyButton = new DaisyButton(container);
daisyButton.render({ label: 'Save', variant: 'primary' });
```
```

**交付物**：`src/options/components/README.md` 更新（新增"阶段 3 迁移规范"章节）

---

#### Task 1.5：创建迁移脚本（可选）⏱️ 4h

**目标**：创建自动化脚本，辅助迁移工作

**脚本 1：检查未迁移的按钮**

创建 `scripts/check-unmigrated-buttons.sh`：

```bash
#!/bin/bash

echo "🔍 检查未迁移的按钮..."

# 搜索手写的 button 元素
grep -rn "createElement('button')" src/options/components/sections/ \
  | grep -v "Stage 3 Week" \
  | grep -v "DaisyButton"

echo ""
echo "✅ 搜索完成"
echo "未迁移的按钮数量："
grep -r "createElement('button')" src/options/components/sections/ \
  | grep -v "Stage 3 Week" \
  | grep -v "DaisyButton" \
  | wc -l
```

**脚本 2：检查迁移进度**

创建 `scripts/check-migration-progress.sh`：

```bash
#!/bin/bash

echo "📊 阶段 3 迁移进度统计..."
echo ""

# 统计迁移标记数量
MIGRATED=$(grep -r "✅ Stage 3 Week" src/options/components/sections/ | wc -l)

# 统计 TODO 标记数量
TODO=$(grep -r "TODO: Stage 3 Week" src/options/components/sections/ | wc -l)

# 计算总数和百分比
TOTAL=$((MIGRATED + TODO))
if [ $TOTAL -gt 0 ]; then
  PERCENTAGE=$((MIGRATED * 100 / TOTAL))
else
  PERCENTAGE=0
fi

echo "✅ 已迁移：$MIGRATED"
echo "⏳ 待迁移：$TODO"
echo "📈 进度：$PERCENTAGE% ($MIGRATED/$TOTAL)"
echo ""

# 按 Section 分组统计
echo "📋 各 Section 迁移进度："
for file in src/options/components/sections/*.ts; do
  filename=$(basename "$file")
  migrated=$(grep -c "✅ Stage 3 Week" "$file" 2>/dev/null || echo 0)
  todo=$(grep -c "TODO: Stage 3 Week" "$file" 2>/dev/null || echo 0)
  total=$((migrated + todo))
  if [ $total -gt 0 ]; then
    echo "  $filename: $migrated/$total"
  fi
done
```

**使用方式**：

```bash
# 赋予执行权限
chmod +x scripts/check-unmigrated-buttons.sh
chmod +x scripts/check-migration-progress.sh

# 运行脚本
./scripts/check-unmigrated-buttons.sh
./scripts/check-migration-progress.sh
```

**交付物**（可选）：
- `scripts/check-unmigrated-buttons.sh`
- `scripts/check-migration-progress.sh`

---

#### Task 1.6：配置质量门禁 ⏱️ 4h

**目标**：配置 ESLint 规则，禁止手写复杂 Tailwind 类名

**步骤**：

##### Step 1：创建 ESLint 规则（可选）

编辑 `.eslintrc.cjs`，添加：

```javascript
module.exports = {
  // ...
  rules: {
    // 禁止手写超过 5 个 Tailwind 类名的 className
    'no-restricted-syntax': [
      'warn',
      {
        selector: 'Literal[value=/^[\\w\\s-]*(\\s[\\w-]+){5,}$/]',
        message: 'Consider using DaisyUI components instead of multiple Tailwind classes'
      }
    ]
  }
};
```

**注意**：这个规则比较严格，可能会误报，建议设为 `warn` 而非 `error`。

##### Step 2：更新 CI/CD Pipeline

编辑 `.github/workflows/ci.yml`（如果有），添加：

```yaml
- name: Check migration progress
  run: |
    ./scripts/check-migration-progress.sh
    UNMIGRATED=$(grep -r "TODO: Stage 3 Week" src/options/components/sections/ | wc -l)
    echo "Unmigrated UI elements: $UNMIGRATED"
```

##### Step 3：更新 package.json scripts

编辑 `package.json`，添加：

```json
{
  "scripts": {
    "check:migration": "bash scripts/check-migration-progress.sh",
    "check:unmigrated": "bash scripts/check-unmigrated-buttons.sh"
  }
}
```

**交付物**：
- `.eslintrc.cjs` 更新（可选）
- `.github/workflows/ci.yml` 更新（可选）
- `package.json` 更新

---

### 📅 Day 5：Week 1 验收和复盘 ⏱️ 8h

#### Task 1.7：Week 1 验收清单 ⏱️ 4h

**验收标准**：

- [ ] **迁移清单**已创建（`WEEK1-2-MIGRATION-CHECKLIST.md`）
  - [ ] 列出所有 14 个 Section
  - [ ] 统计每个 Section 的 UI 元素数量
  - [ ] 标记优先级（P1-P4）
  - [ ] 估算工时

- [ ] **TODO 标记**已添加
  - [ ] 所有 Section 文件添加 TODO 注释
  - [ ] TODO 数量：40-60 个
  - [ ] TODO 格式统一：`TODO: Stage 3 Week X`

- [ ] **迁移规范**已更新（`src/options/components/README.md`）
  - [ ] 添加"阶段 3 迁移规范"章节
  - [ ] 包含迁移原则、步骤、代码模板
  - [ ] 包含自查清单、常见错误

- [ ] **质量门禁**已配置
  - [ ] ESLint 规则配置（可选）
  - [ ] 迁移进度检查脚本
  - [ ] package.json scripts 更新

**验收命令**：

```bash
# 检查迁移清单文件
ls -lh docs/251126-design-system-poc/WEEK1-2-MIGRATION-CHECKLIST.md

# 检查 TODO 标记数量
grep -r "TODO: Stage 3" src/options/components/sections/ | wc -l

# 检查 README 是否更新
grep -n "阶段 3 迁移规范" src/options/components/README.md

# 运行迁移进度脚本
npm run check:migration
```

**如果验收不通过**：返回相应任务，补充缺失的内容。

---

#### Task 1.8：Week 1 复盘会议 ⏱️ 2h

**参与人员**：开发团队 + Tech Lead

**会议议程**：

1. **回顾交付物**（30 分钟）
   - 展示迁移清单
   - 展示迁移规范文档
   - 演示迁移进度脚本

2. **识别问题**（30 分钟）
   - 有哪些 Section 比预期复杂？
   - 有哪些 UI 元素难以迁移？
   - 迁移规范是否足够清晰？

3. **调整计划**（30 分钟）
   - 是否需要调整优先级？
   - 是否需要增加工时估算？
   - 是否需要补充迁移规范？

4. **准备 Week 2**（30 分钟）
   - 确认 Week 2 的示例迁移目标
   - 分配任务给团队成员
   - 设定 Week 2 的验收标准

**会议产出**：
- Week 1 复盘记录（Markdown 或会议纪要）
- Week 2 任务分配表

---

## 🗓️ Week 2：示例迁移 + 流程验证（40h）

### 📅 Day 6-8：示例迁移（简单 Section）⏱️ 24h

#### Task 2.1：迁移 AiSection ⏱️ 8h

**目标**：将 AiSection 的所有按钮和输入框迁移到 DaisyUI 组件

**步骤**：

##### Step 1：读取 AiSection 代码

```bash
# 打开文件
code src/options/components/sections/AiSection.ts

# 查看 TODO 标记
grep -n "TODO: Stage 3" src/options/components/sections/AiSection.ts
```

##### Step 2：逐个迁移 UI 元素

**示例 1：迁移"保存"按钮**

**Before**（假设在 line 123）：

```typescript
// src/options/components/sections/AiSection.ts line 123

// TODO: Stage 3 Week 2 - Migrate to DaisyButton
const saveButton = document.createElement('button');
saveButton.className = 'btn btn-primary btn-sm';
saveButton.textContent = this.messages?.save || 'Save';
saveButton.addEventListener('click', () => {
  this.saveAiConfig();
});
container.append(saveButton);
```

**After**：

```typescript
// src/options/components/sections/AiSection.ts line 123

import { DaisyButton } from '../shared/DaisyButton';

// ✅ Stage 3 Week 2: Migrated to DaisyButton (AiSection.ts line 123)
const saveButtonContainer = document.createElement('div');
const daisySaveButton = new DaisyButton(saveButtonContainer);
const saveButtonEl = daisySaveButton.render({
  label: this.messages?.save || 'Save',
  variant: 'primary',
  size: 'sm',
  onClick: () => this.saveAiConfig()
});
container.append(saveButtonEl);
```

**示例 2：迁移"API Key"输入框**

**Before**（假设在 line 145）：

```typescript
// TODO: Stage 3 Week 2 - Migrate to DaisyInput
const apiKeyInput = document.createElement('input');
apiKeyInput.type = 'password';
apiKeyInput.className = 'input input-bordered w-full';
apiKeyInput.placeholder = 'Enter API Key';
apiKeyInput.value = this.options.aiApiKey || '';
apiKeyInput.addEventListener('input', (e) => {
  this.handleApiKeyChange((e.target as HTMLInputElement).value);
});
container.append(apiKeyInput);
```

**After**：

```typescript
import { DaisyInput } from '../shared/DaisyInput';

// ✅ Stage 3 Week 2: Migrated to DaisyInput (AiSection.ts line 145)
const apiKeyInputContainer = document.createElement('div');
const daisyApiKeyInput = new DaisyInput(apiKeyInputContainer);
const apiKeyInputEl = daisyApiKeyInput.render({
  type: 'password',
  placeholder: 'Enter API Key',
  value: this.options.aiApiKey || '',
  variant: 'bordered',
  size: 'md',
  onChange: (value) => this.handleApiKeyChange(value)
});
container.append(apiKeyInputEl);
```

##### Step 3：删除旧代码（注释掉的代码）

**确保删除所有 TODO 标记和旧代码**：

```typescript
// ❌ 删除这些旧代码：
// TODO: Stage 3 Week 2 - Migrate to DaisyButton
// const saveButton = document.createElement('button');
// ...

// ✅ 只保留新代码：
// ✅ Stage 3 Week 2: Migrated to DaisyButton
const daisySaveButton = new DaisyButton(container);
// ...
```

##### Step 4：手动测试

```bash
# 1. 运行开发构建
npm run build:dev

# 2. 加载扩展到浏览器
# Chrome: chrome://extensions -> Load unpacked -> 选择 dist/ 目录

# 3. 打开 Options 页面
# 右键扩展图标 -> Options

# 4. 点击 AI Section
# 5. 测试所有迁移的 UI 元素：
#    - 点击"保存"按钮 → 功能正常？
#    - 输入 API Key → 输入框正常？
#    - 切换配置选项 → 功能正常？
```

##### Step 5：运行自动化测试（如果有）

```bash
# 运行 AiSection 的单元测试
npm run test:unit -- tests/unit/options/sections/AiSection.test.ts

# 如果测试失败，修复测试代码
```

##### Step 6：提交代码

```bash
# 提交到 Git
git add src/options/components/sections/AiSection.ts
git commit -m "feat(stage3): migrate AiSection to DaisyUI components (Week 2)"
```

**预计工时**：8h（包括阅读代码、迁移、测试、修复 Bug）

**交付物**：AiSection.ts 完成迁移

---

#### Task 2.2：迁移 LanguageSection ⏱️ 4h

**目标**：将 LanguageSection 的按钮和下拉选择迁移到 DaisyUI 组件

**步骤**：参考 Task 2.1，重复以下流程：

1. 读取 LanguageSection 代码
2. 逐个迁移 UI 元素（按钮、下拉选择）
3. 删除旧代码
4. 手动测试
5. 运行自动化测试
6. 提交代码

**注意事项**：

- 下拉选择（`<select>` 元素）可能需要自定义处理
- 如果复杂，可以延后到月度 3 使用 Zag.js Select

**示例：迁移下拉选择（简单情况）**

```typescript
// Before
const select = document.createElement('select');
select.className = 'select select-bordered w-full';
select.innerHTML = `
  <option value="en">English</option>
  <option value="zh-CN">简体中文</option>
  <option value="ja">日本語</option>
`;
select.addEventListener('change', (e) => {
  this.handleLanguageChange((e.target as HTMLSelectElement).value);
});

// After（暂时保留，使用 DaisyUI 类名）
// ⚠️ Stage 3 Week 2: Keep select element, use DaisyUI classes
const select = document.createElement('select');
select.className = 'select select-bordered w-full'; // DaisyUI 类名
select.innerHTML = `
  <option value="en">English</option>
  <option value="zh-CN">简体中文</option>
  <option value="ja">日本語</option>
`;
select.addEventListener('change', (e) => {
  this.handleLanguageChange((e.target as HTMLSelectElement).value);
});

// TODO: Stage 3 Month 3 Week 1 - Migrate to Zag.js Select
```

**预计工时**：4h

**交付物**：LanguageSection.ts 完成迁移

---

#### Task 2.3：迁移 PrivacySection ⏱️ 4h

**目标**：将 PrivacySection 的按钮和复选框迁移到 DaisyUI 组件

**步骤**：参考 Task 2.1

**注意事项**：

- 复选框（`<input type="checkbox">`）使用 DaisyUI 的 `.checkbox` 类名
- 暂时不封装 DaisyCheckbox 组件，直接使用 DaisyUI 类名

**示例：迁移复选框（简单情况）**

```typescript
// Before
const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
checkbox.checked = this.options.enableAnalytics;
checkbox.addEventListener('change', (e) => {
  this.handleAnalyticsChange((e.target as HTMLInputElement).checked);
});

// After
// ✅ Stage 3 Week 2: Using DaisyUI checkbox classes
const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = 'checkbox checkbox-accent w-[18px] h-[18px]'; // DaisyUI 类名
checkbox.checked = this.options.enableAnalytics;
checkbox.addEventListener('change', (e) => {
  this.handleAnalyticsChange((e.target as HTMLInputElement).checked);
});
```

**预计工时**：4h

**交付物**：PrivacySection.ts 完成迁移

---

#### Task 2.4：迁移 TransferSection ⏱️ 8h

**目标**：将 TransferSection 的按钮和 Alert 迁移到 DaisyUI 组件

**步骤**：参考 Task 2.1

**示例：迁移 Alert**

```typescript
// Before
const successAlert = document.createElement('div');
successAlert.className = 'alert alert-success';
successAlert.innerHTML = '<span>Import successful!</span>';
container.append(successAlert);

// After
import { DaisyAlert } from '../shared/DaisyAlert';

// ✅ Stage 3 Week 2: Migrated to DaisyAlert
const alertContainer = document.createElement('div');
const daisyAlert = new DaisyAlert(alertContainer);
const alertEl = daisyAlert.render({
  type: 'success',
  message: 'Import successful!',
  dismissible: true,
  onDismiss: () => alertContainer.remove()
});
container.append(alertEl);
```

**预计工时**：8h（TransferSection 逻辑较复杂）

**交付物**：TransferSection.ts 完成迁移

---

### 📅 Day 9-10：Week 2 验收和总结 ⏱️ 16h

#### Task 2.5：Week 2 验收清单 ⏱️ 8h

**验收标准**：

- [ ] **4 个简单 Section 完成迁移**
  - [ ] AiSection 完成
  - [ ] LanguageSection 完成
  - [ ] PrivacySection 完成
  - [ ] TransferSection 完成

- [ ] **所有迁移代码添加标记注释**
  - [ ] 格式：`✅ Stage 3 Week 2: Migrated to DaisyButton`
  - [ ] 删除所有 TODO 标记

- [ ] **功能测试通过**
  - [ ] 手动测试所有迁移的 Section
  - [ ] 所有按钮、输入框功能正常
  - [ ] 无 Console 错误

- [ ] **自动化测试通过**（如果有）
  - [ ] 单元测试：`npm run test:unit`
  - [ ] E2E 测试：`npm run test:e2e`

- [ ] **代码质量检查通过**
  - [ ] TypeScript：`npm run typecheck` → 0 errors
  - [ ] Lint：`npm run lint:warnings-guard` → 0 warnings
  - [ ] 包体积：`npm run build` → 检查体积增长

**验收命令**：

```bash
# 1. 检查迁移进度
npm run check:migration

# 预期输出：
# ✅ 已迁移：~15
# ⏳ 待迁移：~30
# 📈 进度：33% (15/45)

# 2. 检查 TypeScript
npm run typecheck

# 3. 检查 Lint
npm run lint:warnings-guard

# 4. 运行测试
npm run test:unit

# 5. 手动测试 Options 页面
npm run build:dev
# 加载到浏览器 → 打开 Options → 测试所有迁移的 Section
```

**如果验收不通过**：
- 回到对应的 Task，修复问题
- 重新运行验收命令

---

#### Task 2.6：Week 2 总结报告 ⏱️ 4h

**目标**：编写 Week 1-2 总结报告

**创建文件**：`docs/251126-design-system-poc/WEEK1-2-SUMMARY.md`

```markdown
# Week 1-2 总结报告

## 完成情况

### Week 1：迁移清单 + 迁移规范

- [x] Task 1.1：审计所有 Section 的 UI 元素（8h）
- [x] Task 1.2：标记需要迁移的代码位置（6h）
- [x] Task 1.3：识别暂不迁移的复杂组件（2h）
- [x] Task 1.4：更新 Options 组件 README（8h）
- [x] Task 1.5：创建迁移脚本（4h）
- [x] Task 1.6：配置质量门禁（4h）
- [x] Task 1.7：Week 1 验收和复盘（12h）

**Week 1 累计工时**：44h（计划 40h，超出 10%）

### Week 2：示例迁移 + 流程验证

- [x] Task 2.1：迁移 AiSection（8h）
- [x] Task 2.2：迁移 LanguageSection（4h）
- [x] Task 2.3：迁移 PrivacySection（4h）
- [x] Task 2.4：迁移 TransferSection（8h）
- [x] Task 2.5：Week 2 验收（8h）
- [x] Task 2.6：Week 2 总结报告（4h）

**Week 2 累计工时**：36h（计划 40h，节省 10%）

## 关键指标

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 迁移 Section 数 | 4 个 | 4 个 | ✅ |
| 迁移进度 | ~30% | 33% | ✅ |
| TypeScript errors | 0 | 0 | ✅ |
| Lint warnings | 0 | 0 | ✅ |
| 单元测试通过率 | 100% | 100% | ✅ |
| 包体积增长 | < 5KB | +1.2KB | ✅ |

## 遇到的问题

### 问题 1：下拉选择器迁移复杂

**描述**：LanguageSection 的下拉选择器逻辑复杂，暂时保留原生 `<select>` 元素。

**解决方案**：标记为 TODO，延后到月度 3 使用 Zag.js Select 重构。

### 问题 2：TransferSection 工时超预期

**描述**：TransferSection 的导入/导出逻辑复杂，实际工时 8h，超出计划的 1.5h。

**解决方案**：调整 Week 3-4 的工时估算，复杂 Section 增加 50% 缓冲时间。

## 经验总结

### 做得好的地方

1. ✅ 迁移规范文档非常有用，开发团队参考模板快速完成迁移
2. ✅ TODO 标记帮助追踪进度，避免遗漏
3. ✅ 示例迁移验证了流程可行性，为 Week 3-4 批量迁移奠定基础

### 需要改进的地方

1. ⚠️ 复杂 Section 的工时估算偏乐观，需要增加缓冲时间
2. ⚠️ 下拉选择器、复选框等表单元素暂未封装组件，后续需要统一
3. ⚠️ 手动测试耗时较长，建议补充 E2E 测试

## 下一步行动（Week 3-4）

### Week 3-4 目标

批量迁移剩余 8 个 Section（P2 + P3）

### 调整后的计划

- P2 Section（4 个）：RestSection、RoutingSection、FragmentSection、VideoSection
  - 预计工时：12h（每个 3h，增加 50% 缓冲）

- P3 Section（4 个）：ReadingSection、TemplatesSection、ClassifierSection、UsageSection
  - 预计工时：12h（每个 3h，增加 50% 缓冲）

**Week 3-4 累计工时**：24h + 16h（验收和总结）= 40h

### 风险提示

- ⚠️ RestSection 的连接测试逻辑复杂，可能需要额外时间
- ⚠️ RoutingSection 的路由表编辑器需要保留，仅迁移基础 UI
- ⚠️ UsageSection 的图表暂不迁移，仅迁移按钮
```

**交付物**：`WEEK1-2-SUMMARY.md`

---

#### Task 2.7：准备 Week 3-4 任务 ⏱️ 4h

**目标**：基于 Week 1-2 的经验，调整 Week 3-4 的计划

**步骤**：

1. **更新迁移清单**
   - 标记 Week 2 完成的 Section
   - 调整剩余 Section 的工时估算

2. **分配任务给团队**
   - Week 3：P2 Section（RestSection、RoutingSection、FragmentSection、VideoSection）
   - Week 4：P3 Section + 最终验收

3. **创建 Week 3-4 Guide**（可选）
   - 如果需要，可以创建 `STAGE3-WEEK3-4-GUIDE.md`
   - 或者继续使用本文档作为参考

**交付物**：Week 3-4 任务分配表

---

## ✅ Week 1-2 验收标准（总结）

### 必须完成的交付物

- [x] **迁移清单**（`WEEK1-2-MIGRATION-CHECKLIST.md`）
- [x] **迁移规范**（`src/options/components/README.md` 更新）
- [x] **4 个 Section 迁移完成**（AiSection、LanguageSection、PrivacySection、TransferSection）
- [x] **迁移进度脚本**（`scripts/check-migration-progress.sh`）
- [x] **Week 1-2 总结报告**（`WEEK1-2-SUMMARY.md`）

### 质量指标

- [x] TypeScript：0 errors
- [x] Lint：0 warnings
- [x] 单元测试：100% 通过
- [x] 手动测试：所有迁移功能正常
- [x] 包体积：增长 < 5KB

### 进度指标

- [x] 迁移进度：~30-35%（15/45）
- [x] 完成 4/14 Section（29%）

---

## 📚 参考资料

1. **`STAGE3-IMPLEMENTATION-PLAN.md`** - 阶段 3 总体计划
2. **`STAGE1-2-IMPLEMENTATION-PLAN.md`** - 阶段 1-2 实施经验
3. **`design-system-suggestion-revised.md`** - 设计系统总纲
4. **`src/options/components/README.md`** - Options 组件架构（含迁移规范）

---

## 💡 给开发团队的建议

### 1. 优先使用代码模板

**不要从零开始写**，直接复制 `README.md` 中的代码模板，修改参数即可。

### 2. 遇到问题先查 README

`src/options/components/README.md` 的"常见错误"章节列出了所有常见问题和解决方案。

### 3. 及时更新 TODO 标记

迁移完成后，立即删除 TODO 标记，添加"✅ Stage 3 Week X"标记，避免遗漏。

### 4. 每迁移一个 Section 就测试一次

不要积累多个 Section 再测试，会难以定位问题。

### 5. 遇到复杂逻辑不要强行迁移

如果遇到复杂的下拉选择器、表格编辑器等，标记为 TODO，延后到月度 3。

### 6. 保持代码风格一致

所有迁移代码使用相同的模式：

```typescript
// ✅ Stage 3 Week X: Migrated to DaisyButton
const container = document.createElement('div');
const daisy = new DaisyButton(container);
const el = daisy.render({ /* props */ });
parent.append(el);
```

---

## 🎯 最终交付物清单

- [ ] `docs/251126-design-system-poc/WEEK1-2-MIGRATION-CHECKLIST.md`
- [ ] `src/options/components/README.md`（更新"阶段 3 迁移规范"章节）
- [ ] `scripts/check-migration-progress.sh`
- [ ] `scripts/check-unmigrated-buttons.sh`
- [ ] `src/options/components/sections/AiSection.ts`（迁移完成）
- [ ] `src/options/components/sections/LanguageSection.ts`（迁移完成）
- [ ] `src/options/components/sections/PrivacySection.ts`（迁移完成）
- [ ] `src/options/components/sections/TransferSection.ts`（迁移完成）
- [ ] `docs/251126-design-system-poc/WEEK1-2-SUMMARY.md`

---

**文档版本**：v1.0
**创建日期**：2025-11-28
**预期完成日期**：2025-12-12（2 周后）

**祝实施顺利！** 🚀
