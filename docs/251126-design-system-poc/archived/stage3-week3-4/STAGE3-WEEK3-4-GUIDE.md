# 阶段 3 Week 3-4 实施指南 | Stage 3 Week 3-4 Implementation Guide

> **版本**：v1.0
> **创建日期**：2025-11-29
> **阶段**：阶段 3 月度 1 - Options 页面 Section 迁移（批量迁移）
> **预计工时**：60h（2 周 × 3 人）
> **前置条件**：✅ Week 1-2 已完成（迁移清单 + 规范 + P1 Section 示例）

---

## 📋 Week 3-4 目标

### 核心目标

**批量迁移 P2 + P3 Section，完成月度 1 的 85% 迁移目标**

### 具体交付物

1. ✅ **P2 Section 迁移**（4 个）- RestSection, RoutingSection, FragmentSection, VideoSection
2. ✅ **P3 Section 迁移**（4 个）- ReadingSection, TemplatesSection, ClassifierSection, UsageSection
3. ✅ **单元测试补充** - 为所有迁移的 Section 添加测试
4. ✅ **Month 1 总结报告** - 月度 1 完成情况、经验教训、下一步计划

### 预期进度

| 时间点 | 进度 | 已完成 Section | 备注 |
|--------|------|----------------|------|
| Week 2 结束 | 18% | 4/22（P1 完成） | AiSection, LanguageSection, PrivacySection, TransferSection |
| Week 3 结束 | 50% | 12/22（P1+P2 完成） | +RestSection, +RoutingSection, +FragmentSection, +VideoSection |
| Week 4 结束 | 85% | 20/22（P1+P2+P3 完成） | +ReadingSection, +TemplatesSection, +ClassifierSection, +UsageSection |
| Month 1 完成 | 85% | 12/14 Section | P4（YamlConfig, Diagnosis）延后到 Month 3 |

---

## 🗓️ Week 3：P2 Section 批量迁移（30h）

### 📅 Day 11-12：RestSection 迁移 ⏱️ 12h

#### Task 3.1：审计 RestSection UI 元素 ⏱️ 2h

**目标**：明确 RestSection 的迁移范围

**步骤**：

##### Step 1：阅读 RestSection.ts 源码

```bash
# 查看文件行数和结构
wc -l src/options/components/sections/RestSection.ts
head -100 src/options/components/sections/RestSection.ts
```

##### Step 2：列出待迁移的 UI 元素

根据 `WEEK1-2-MIGRATION-CHECKLIST.md`：

| UI 元素 | 数量 | 预计工时 |
|---------|------|----------|
| 按钮（保存、测试、重置） | 3 | 1.5h |
| 输入框（Host、Port、Token、Vault） | 4 | 2h |
| 卡片（连接测试结果区域） | 1 | 1h |
| Alert（错误/成功提示） | 1 | 0.5h |

**总计**：5h（实际迁移时间）+ 3h（测试）+ 4h（调试）= 12h

##### Step 3：标记 TODO 位置

在 RestSection.ts 中找到所有待迁移代码，确认 TODO 标记是否已添加：

```bash
grep -n "TODO: Stage 3 Week" src/options/components/sections/RestSection.ts
```

**交付物**：RestSection 迁移计划（可以在代码注释中）

---

#### Task 3.2：迁移 RestSection 按钮和输入框 ⏱️ 5h

**目标**：替换所有手写 UI 为 DaisyUI 组件

**迁移模式**：

##### 模式 1：迁移保存/测试/重置按钮

```typescript
// Before（旧代码，删除）
const saveButton = document.createElement('button');
saveButton.className = 'btn btn-primary btn-sm';
saveButton.textContent = '保存配置';
saveButton.addEventListener('click', () => this.handleSave());

// After
import { DaisyButton } from '../shared/DaisyButton';

// ✅ Stage 3 Week 3: Migrated save button to DaisyButton (RestSection)
const saveBtnHost = this.createElement('div', 'inline-block');
const saveBtn = new DaisyButton(saveBtnHost);
const saveBtnEl = saveBtn.render({
  label: this.messages?.restSaveButton ?? '保存配置',
  variant: 'primary',
  size: 'sm',
  onClick: () => this.handleSave()
});
buttonContainer.append(saveBtnEl);
```

##### 模式 2：迁移输入框（Host, Port, Token, Vault）

```typescript
// Before（旧代码，删除）
const hostInput = document.createElement('input');
hostInput.type = 'text';
hostInput.className = 'input input-bordered w-full';
hostInput.placeholder = 'http://localhost';
hostInput.value = this.options.restHost || '';
hostInput.addEventListener('input', (e) => {
  this.options.restHost = e.target.value;
  this.handleInput();
});

// After
import { DaisyInput } from '../shared/DaisyInput';

// ✅ Stage 3 Week 3: Migrated host input to DaisyInput (RestSection)
const hostInputHost = this.createElement('div', 'w-full');
const hostInput = new DaisyInput(hostInputHost);
const hostInputEl = hostInput.render({
  type: 'text',
  placeholder: this.messages?.restHostPlaceholder ?? 'http://localhost',
  value: this.options.restHost || '',
  variant: 'bordered',
  size: 'md',
  onChange: (value) => {
    this.options.restHost = value;
    this.handleInput();
  }
});
formRow.append(hostInputEl);
```

**重复以上模式迁移**：
- Port 输入框（type: 'number'）
- Token 输入框（type: 'password'）
- Vault 输入框（type: 'text'）

**交付物**：RestSection.ts 更新（按钮 + 输入框迁移完成）

---

#### Task 3.3：迁移 RestSection 连接测试区域 ⏱️ 3h

**目标**：替换连接测试卡片和 Alert 提示

##### 模式 3：迁移连接测试结果卡片

```typescript
// Before（旧代码，删除）
const testResultCard = document.createElement('div');
testResultCard.className = 'card bg-base-200 shadow-sm mt-4';
const cardBody = document.createElement('div');
cardBody.className = 'card-body p-4';
testResultCard.append(cardBody);

// After
import { DaisyCard } from '../shared/DaisyCard';

// ✅ Stage 3 Week 3: Migrated test result card to DaisyCard (RestSection)
const testCardHost = this.createElement('div', 'mt-4');
const testCard = new DaisyCard(testCardHost);
const testCardEl = testCard.render({
  title: this.messages?.restTestResultTitle ?? '连接测试结果',
  body: this.buildTestResultBody(), // HTMLElement
  variant: 'normal'
});
container.append(testCardEl);
```

##### 模式 4：迁移 Alert 提示（成功/错误）

```typescript
// Before（旧代码，删除）
const successAlert = document.createElement('div');
successAlert.className = 'alert alert-success mt-2';
successAlert.innerHTML = '<span>✅ 连接成功</span>';

// After
import { DaisyAlert } from '../shared/DaisyAlert';

// ✅ Stage 3 Week 3: Migrated connection alert to DaisyAlert (RestSection)
const alertHost = this.createElement('div', 'mt-2');
const alert = new DaisyAlert(alertHost);
const alertEl = alert.render({
  type: this.testSuccess ? 'success' : 'error',
  message: this.testSuccess
    ? (this.messages?.restTestSuccess ?? '✅ 连接成功')
    : (this.messages?.restTestFailed ?? '❌ 连接失败'),
  description: this.testMessage,
  dismissible: true,
  onDismiss: () => {
    alertHost.remove();
  }
});
testResultContainer.append(alertEl);
```

**交付物**：RestSection.ts 更新（连接测试区域迁移完成）

---

#### Task 3.4：测试 RestSection ⏱️ 2h

**测试清单**：

##### 手动测试（必需）

```bash
# 1. 打开 Options 页面
open chrome-extension://YOUR_EXTENSION_ID/options/index.html

# 2. 导航到 Rest 配置 Section
# 3. 测试输入框
#    - 输入 Host: http://localhost
#    - 输入 Port: 8080
#    - 输入 Token: test-token
#    - 输入 Vault: MyVault
#    - 验证：输入框样式正确，值可以保存

# 4. 测试按钮
#    - 点击"保存配置"按钮
#    - 点击"测试连接"按钮
#    - 点击"重置"按钮
#    - 验证：按钮样式正确，功能正常

# 5. 测试连接测试区域
#    - 输入错误的 Host，点击"测试连接"
#    - 验证：显示错误 Alert
#    - 输入正确的 Host，点击"测试连接"
#    - 验证：显示成功 Alert 和连接详情卡片
```

##### 单元测试（可选）

```bash
# 运行 RestSection 相关测试
npm run test:unit -- tests/unit/options/sections/RestSection.test.ts
```

**如果发现问题**：返回 Task 3.2/3.3 修复代码。

**交付物**：RestSection 手动测试报告（通过/失败 + 截图）

---

### 📅 Day 13：RoutingSection 迁移 ⏱️ 6h

#### Task 3.5：迁移 RoutingSection ⏱️ 4h

**迁移范围**（根据清单）：

| UI 元素 | 数量 | 迁移目标 |
|---------|------|----------|
| 按钮（添加规则、保存） | 2 | → DaisyButton |
| 输入框（域名、路径匹配） | 2 | → DaisyInput |
| **路由表编辑器** | 1 | **延后到 Month 3**（保留现有实现） |

**关键注意事项**：
- ⚠️ **路由表编辑器不迁移**，仅迁移外围按钮和输入框
- 路由表的拖拽、增删改查逻辑保持不变
- 在路由表代码上方添加注释：
  ```typescript
  // ⏸️ Stage 3 Month 3 Week 3: Route editor table pending complex refactor
  // 当前保留原有实现，等待 Zag.js 集成后统一重构
  ```

**迁移步骤**：

参考 Task 3.2/3.3 的模式，迁移：
1. "添加规则"按钮 → DaisyButton
2. "保存配置"按钮 → DaisyButton
3. 域名输入框 → DaisyInput
4. 路径匹配输入框 → DaisyInput

**交付物**：RoutingSection.ts 更新（按钮 + 输入框完成，路由表标记延后）

---

#### Task 3.6：测试 RoutingSection ⏱️ 2h

**测试清单**：

```bash
# 1. 打开 Options 页面，导航到 Routing Section
# 2. 测试按钮：点击"添加规则"、"保存配置"
# 3. 测试输入框：输入域名和路径，验证样式和功能
# 4. 测试路由表：验证现有路由表功能正常（拖拽、编辑、删除）
# 5. 验证：迁移后的 UI 样式与 Week 2 一致
```

**交付物**：RoutingSection 测试报告

---

### 📅 Day 14：FragmentSection 迁移 ⏱️ 6h

#### Task 3.7：迁移 FragmentSection ⏱️ 4h

**迁移范围**（根据清单）：

| UI 元素 | 数量 |
|---------|------|
| 按钮（启用片段、保存） | 2 |
| 输入框（模板、前缀、后缀） | 3 |
| YAML 片段表单 | 1（复杂，延后） |

**迁移步骤**：

参考 RestSection 模式，迁移：
1. 启用片段开关按钮 → DaisyButton（或保留 checkbox，添加 DaisyUI 样式）
2. 保存按钮 → DaisyButton
3. 模板输入框 → DaisyInput（或 textarea）
4. 前缀输入框 → DaisyInput
5. 后缀输入框 → DaisyInput

**YAML 片段表单处理**：
- 如果是复杂的多行编辑器，标记为延后：
  ```typescript
  // ⏸️ Stage 3 Month 3: YAML editor pending Monaco/CodeMirror integration
  ```
- 如果是简单的 textarea，可以迁移到 DaisyInput（type: 'textarea'）

**交付物**：FragmentSection.ts 更新

---

#### Task 3.8：测试 FragmentSection ⏱️ 2h

**测试清单**：同 Task 3.4 模式，测试所有迁移的 UI 元素。

**交付物**：FragmentSection 测试报告

---

### 📅 Day 15：VideoSection 迁移 + Week 3 验收 ⏱️ 6h

#### Task 3.9：迁移 VideoSection ⏱️ 3h

**迁移范围**（根据清单）：

| UI 元素 | 数量 |
|---------|------|
| 按钮（启用视频笔记、保存） | 2 |
| 输入框（平台配置） | 2 |
| 平台列表 | 1（简单列表，可迁移） |

**迁移步骤**：

参考前面的模式，迁移所有按钮和输入框。

**平台列表处理**：
- 如果是简单的 `<ul>` 列表，保持不变，仅添加 DaisyUI 样式类
- 如果是复杂的动态列表，考虑使用 DaisyCard 包裹每个平台项

**交付物**：VideoSection.ts 更新

---

#### Task 3.10：Week 3 验收 ⏱️ 3h

**验收标准**：

- [ ] **4 个 P2 Section 完成迁移**
  - [ ] RestSection: 3 按钮 + 4 输入框 + 1 卡片 + 1 Alert
  - [ ] RoutingSection: 2 按钮 + 2 输入框（路由表延后）
  - [ ] FragmentSection: 2 按钮 + 3 输入框
  - [ ] VideoSection: 2 按钮 + 2 输入框

- [ ] **所有迁移代码添加 `✅ Stage 3 Week 3` 标记**

- [ ] **迁移进度达到 50%**
  ```bash
  npm run check:migration
  # 预期：✅ 已迁移：12  ⏳ 待迁移：10  📈 进度：50% (12/22)
  ```

- [ ] **质量指标通过**
  ```bash
  npm run typecheck        # 0 errors
  npm run test:unit        # 565/565 tests pass
  npm run lint:warnings-guard  # warnings 下降到 < 300
  ```

**验收命令**：

```bash
# 1. 检查迁移进度
npm run check:migration

# 2. 检查质量指标
npm run typecheck
npm run test:unit

# 3. 检查未迁移的 UI 元素
npm run check:unmigrated

# 4. 手动测试所有 P2 Section
# 打开 Options 页面，逐个测试 RestSection, RoutingSection, FragmentSection, VideoSection
```

**如果验收不通过**：返回相应 Task 修复问题。

**交付物**：Week 3 验收报告（通过/失败）

---

## 🗓️ Week 4：P3 Section 批量迁移 + Month 1 总结（30h）

### 📅 Day 16：ReadingSection 迁移 ⏱️ 6h

#### Task 4.1：迁移 ReadingSection ⏱️ 4h

**迁移范围**（根据清单）：

| UI 元素 | 数量 |
|---------|------|
| 按钮（保存模板） | 1 |
| 卡片（模板预览） | 1 |
| **模板编辑器** | 1（复杂，延后） |

**迁移步骤**：

1. 迁移保存按钮 → DaisyButton
2. 迁移模板预览卡片 → DaisyCard
3. **模板编辑器不迁移**，标记为延后：
   ```typescript
   // ⏸️ Stage 3 Month 3: Template editor pending Monaco/CodeMirror integration
   // 当前使用简单 textarea，等待富文本编辑器集成后重构
   ```

**交付物**：ReadingSection.ts 更新

---

#### Task 4.2：测试 ReadingSection ⏱️ 2h

**测试清单**：同前面的测试模式。

**交付物**：ReadingSection 测试报告

---

### 📅 Day 17：TemplatesSection 迁移 ⏱️ 6h

#### Task 4.3：迁移 TemplatesSection ⏱️ 4h

**迁移范围**（根据清单）：

| UI 元素 | 数量 |
|---------|------|
| 按钮（添加模板、删除） | 2 |
| 卡片（模板列表项） | 1（每个模板） |
| **模板列表拖拽** | 1（复杂，延后） |

**迁移步骤**：

1. 迁移"添加模板"按钮 → DaisyButton
2. 迁移"删除模板"按钮 → DaisyButton
3. 迁移模板列表项卡片 → DaisyCard
4. **模板列表拖拽不迁移**，保留现有实现，标记延后

**交付物**：TemplatesSection.ts 更新

---

#### Task 4.4：测试 TemplatesSection ⏱️ 2h

**测试清单**：同前面的测试模式。

**交付物**：TemplatesSection 测试报告

---

### 📅 Day 18：ClassifierSection 迁移 ⏱️ 6h

#### Task 4.5：迁移 ClassifierSection ⏱️ 4h

**迁移范围**（根据清单）：

| UI 元素 | 数量 |
|---------|------|
| 按钮（启用分类器、保存） | 2 |
| 输入框（API Key、模型） | 2 |
| **分类器配置面板** | 1（中等复杂，保留） |

**迁移步骤**：

1. 迁移按钮 → DaisyButton
2. 迁移输入框 → DaisyInput
3. **分类器配置面板**：如果是简单的表单，迁移输入框；如果是复杂的规则编辑器，标记延后

**交付物**：ClassifierSection.ts 更新

---

#### Task 4.6：测试 ClassifierSection ⏱️ 2h

**测试清单**：同前面的测试模式。

**交付物**：ClassifierSection 测试报告

---

### 📅 Day 19：UsageSection 迁移 + Week 4 验收 ⏱️ 6h

#### Task 4.7：迁移 UsageSection ⏱️ 2h

**迁移范围**（根据清单）：

| UI 元素 | 数量 |
|---------|------|
| 按钮（清除数据） | 1 |
| **使用统计图表** | 1（延后） |

**迁移步骤**：

1. 迁移"清除数据"按钮 → DaisyButton
2. **使用统计图表不迁移**，保留现有 Chart.js 实现

**交付物**：UsageSection.ts 更新

---

#### Task 4.8：Week 4 + Month 1 验收 ⏱️ 4h

**验收标准**：

- [ ] **4 个 P3 Section 完成迁移**
  - [ ] ReadingSection: 1 按钮 + 1 卡片
  - [ ] TemplatesSection: 2 按钮 + 1 卡片
  - [ ] ClassifierSection: 2 按钮 + 2 输入框
  - [ ] UsageSection: 1 按钮

- [ ] **迁移进度达到 85%**
  ```bash
  npm run check:migration
  # 预期：✅ 已迁移：20  ⏳ 待迁移：2  📈 进度：90% (20/22)
  # （剩余 2 个 TODO 来自 P4 Section：YamlConfig + Diagnosis）
  ```

- [ ] **质量指标通过**
  ```bash
  npm run typecheck        # 0 errors
  npm run test:unit        # 565/565 tests pass
  npm run lint:warnings-guard  # warnings 下降到 < 100
  ```

- [ ] **Month 1 目标达成**
  - [ ] 12/14 Section 完成迁移（85%）
  - [ ] 所有迁移代码添加标记注释
  - [ ] 包体积增长 < 15KB（累计 < 20KB）

**验收命令**：

```bash
# 1. 检查迁移进度
npm run check:migration

# 2. 检查质量指标
npm run typecheck
npm run test:unit
npm run lint:warnings-guard

# 3. 检查包体积
npm run build
ls -lh dist/*.js > docs/251126-design-system-poc/month1-bundle-size.txt

# 4. 手动测试所有 Section
# 打开 Options 页面，逐个测试所有 12 个已迁移的 Section
```

**交付物**：Month 1 验收报告

---

### 📅 Day 20：Month 1 总结和复盘 ⏱️ 6h

#### Task 4.9：编写 Month 1 总结报告 ⏱️ 4h

**报告内容**：

##### 1. 完成情况总结

```markdown
## Month 1 完成情况

### 迁移进度

| Week | 计划 | 实际 | 完成率 |
|------|------|------|--------|
| Week 1 | 准备工作 | ✅ 完成 | 100% |
| Week 2 | 4 个 P1 Section | ✅ 完成 | 100% |
| Week 3 | 4 个 P2 Section | ✅ 完成 | 100% |
| Week 4 | 4 个 P3 Section | ✅ 完成 | 100% |

**总计**：12/14 Section 完成迁移（85%），符合 Month 1 目标。

### 代码质量指标

- TypeScript：0 errors ✅
- 单元测试：565/565 通过 ✅
- Lint warnings：517 → 95（下降 422 条）✅
- 包体积增长：< 15KB ✅

### 延后的组件（符合预期）

- YamlConfigSection（需 Zag.js Table）
- DiagnosisSection（优先级低）
```

##### 2. 经验教训

```markdown
## 经验教训

### 做得好的地方

1. **迁移规范清晰**：Week 1 制定的规范和模板非常实用，减少了重复工作
2. **标记注释有效**：`✅ Stage 3 Week X` 标记帮助追踪进度
3. **质量门禁有效**：脚本自动检测未迁移的 UI，避免遗漏

### 需要改进的地方

1. **工时估算偏差**：部分 Section 比预期复杂，实际耗时 +20%
2. **测试覆盖不足**：单元测试主要测试组件，Section 级别测试较少
3. **包体积监控**：未设置自动化包体积检查，需要手动统计

### 风险和问题

1. **Lint warnings 基线调整**：Week 2 出现 517 个 warnings，需要说服团队接受
2. **复杂组件延后**：YamlConfig 和 Diagnosis 延后到 Month 3，可能影响整体进度
```

##### 3. 下一步计划

```markdown
## 下一步计划（Month 2）

### Month 2 目标

根据 `STAGE3-IMPLEMENTATION-PLAN.md`：
- 迁移 Reader Panel（Week 5-6）
- 迁移 Video Panel（Week 7）
- 迁移 Support Prompt（Week 8）

### 预期交付物

- 3 个 Content Scripts 迁移完成
- E2E 测试补充（8 个测试用例）
- 无障碍性初步审计（axe-core 扫描）

### 风险缓解

- **风险 1**：Content Scripts 样式隔离问题 → 提前在主流网站测试
- **风险 2**：E2E 测试环境搭建 → Week 1 先搭建环境
```

**交付物**：`docs/251126-design-system-poc/STAGE3-MONTH1-SUMMARY.md`

---

#### Task 4.10：Month 1 复盘会议 ⏱️ 2h

**参与人员**：开发团队 + Tech Lead + PM

**会议议程**：

1. **展示成果**（30 分钟）
   - 演示 Options 页面迁移前后对比
   - 展示迁移进度报告（85% 完成）
   - 展示代码质量指标（0 errors, 565 tests pass）

2. **分享经验教训**（30 分钟）
   - 讨论做得好的地方
   - 讨论需要改进的地方
   - 收集团队反馈

3. **规划 Month 2**（30 分钟）
   - 确认 Content Scripts 迁移目标
   - 分配 Week 5-8 任务
   - 设定 Month 2 验收标准

4. **庆祝和总结**（30 分钟）
   - 感谢团队付出
   - 分享迁移过程中的有趣故事
   - 设定 Month 2 Kick-off 时间

**交付物**：Month 1 复盘会议纪要

---

## 🎯 Month 1 总体验收标准

### 功能指标

- [ ] **12/14 Section 完成迁移**（85%）
  - ✅ P1（4 个）：AiSection, LanguageSection, PrivacySection, TransferSection
  - ✅ P2（4 个）：RestSection, RoutingSection, FragmentSection, VideoSection
  - ✅ P3（4 个）：ReadingSection, TemplatesSection, ClassifierSection, UsageSection
  - ⏸️ P4（2 个）：YamlConfigSection, DiagnosisSection（延后到 Month 3）

- [ ] **所有迁移代码添加 `✅ Stage 3 Week X` 标记**

- [ ] **迁移进度达到 85%**
  ```bash
  npm run check:migration
  # 预期：✅ 已迁移：20  ⏳ 待迁移：2  📈 进度：90% (20/22)
  ```

### 质量指标

- [ ] **TypeScript**：0 errors
- [ ] **单元测试**：565/565 通过
- [ ] **Lint warnings**：< 100（从基线 517 下降 > 80%）
- [ ] **包体积增长**：< 15KB（累计 < 20KB）

### 文档指标

- [ ] **迁移清单**已完成（标记 P1-P3 完成）
- [ ] **Month 1 总结报告**已创建
- [ ] **复盘会议纪要**已归档

---

## 🚨 风险评估

| 风险项 | 严重性 | 可能性 | 缓解措施 |
|--------|--------|--------|----------|
| **工时超支** | 中 | 中 | ✅ 预留 20% buffer，延后复杂组件 |
| **复杂组件阻塞** | 高 | 低 | ✅ 提前标记延后，不影响主流程 |
| **测试覆盖不足** | 中 | 高 | ✅ Week 4 补充单元测试 + E2E 测试 |
| **包体积超标** | 低 | 低 | ✅ 无新增依赖，仅复用已有组件 |

---

## 📚 参考文档

1. **`STAGE3-IMPLEMENTATION-PLAN.md`** - 3-4 个月总计划
2. **`STAGE3-WEEK1-2-GUIDE.md`** - Week 1-2 实施指南
3. **`STAGE3-WEEK1-REVIEW.md`** - Week 1 验收报告
4. **`STAGE3-WEEK2-REVIEW.md`** - Week 2 验收报告
5. **`WEEK1-2-MIGRATION-CHECKLIST.md`** - 完整迁移清单
6. **`src/options/components/README.md`** - 迁移规范和代码模板

---

## 💡 开发建议

### 迁移节奏控制

**建议节奏**：
- 每天完成 1 个 Section 的迁移 + 测试
- 每周五进行一次 Demo 和复盘
- 遇到复杂组件立即标记延后，不要死磕

### 代码审查清单

每次迁移后，必须检查：

- [ ] 是否导入了正确的 DaisyUI 组件？
- [ ] 是否添加了迁移标记注释（`✅ Stage 3 Week X`）？
- [ ] 是否保持了原有功能（事件处理、状态管理）？
- [ ] 是否支持 i18n（使用 `this.messages?.xxx`）？
- [ ] 是否手动测试了功能？
- [ ] 是否运行了单元测试（如果有）？
- [ ] 是否删除了旧代码（不要注释掉，直接删除）？

### 质量门禁执行

每周末（Day 15, Day 20）必须执行：

```bash
# TypeScript 检查
npm run typecheck

# Lint 检查
npm run lint:warnings-guard

# 单元测试
npm run test:unit

# 迁移进度检查
npm run check:migration

# 未迁移 UI 检查
npm run check:unmigrated
```

**如果任何检查失败**：立即修复，不要带问题进入下一周。

---

## ✅ 最终交付物（Month 1 完成时）

1. ✅ **12 个 Section 迁移**（Options 页面 85%）
2. ✅ **20 个迁移标记**（`✅ Stage 3 Week X`）
3. ✅ **Month 1 总结报告**（完成情况 + 经验教训 + 下一步计划）
4. ✅ **复盘会议纪要**（团队反馈 + Month 2 规划）
5. ✅ **更新迁移清单**（标记 P1-P3 完成，P4 延后）
6. ✅ **更新 STAGE3-IMPLEMENTATION-PLAN.md**（Month 1 进度跟踪表）

---

**文档版本**：v1.0
**创建日期**：2025-11-29
**下次更新**：Month 2 Week 5-8 Guide（预计 2025-12-10）

---

**开始 Week 3 前的准备**：

```bash
# 1. 确认 Week 2 已验收通过
cat docs/251126-design-system-poc/STAGE3-WEEK2-REVIEW.md

# 2. 调整 lint baseline（如果需要）
npm run lint:warnings-report

# 3. 创建 Week 3 分支
git checkout -b stage3/week3-p2-sections

# 4. 开始 Task 3.1：审计 RestSection
```

**祝 Week 3-4 实施顺利！** 🚀
