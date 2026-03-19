# 阶段 3 实施计划 | Stage 3 Implementation Plan

> **版本**：v1.0
> **创建日期**：2025-11-28
> **阶段目标**：渐进式替换现有组件，与 Tailwind Stage5-7 协调
> **预计周期**：3-4 个月（分 4 个月度迭代）
> **前置条件**：✅ 阶段 0-2 已完成（POC + 基础组件 + Shadow DOM）

---

## 2026-03-13 Tailwind 现状同步

- `Onboarding` 第一刀已完成，页面 inline `<style>` 与动态 `<style>` 已退出主路径
- `Options` 已删除 `aob-options.css`，页面与 preview 改由 `tailwind.css` + `global.tailwind.css` + `design-tokens.css` 承载
- `SupportPrompt` / `Reader` / `Video` / `Clipper` 已退出业务层直接 `<style>` 注入，统一收口到 `shadowStyleBridge.ts`
- `Clipper` / `ReaderPanel` / `VideoPanel` 已改成 Shadow-only 业务入口
- 已完成 Chromium 样本回放与真实扩展首开自动化样本；Article 跨站点样本已覆盖 Wikipedia / MDN
- 当前 Tailwind 主线已满足归档条件；遗留议题只剩 Firefox content script 主线下的统一 bridge fallback 兼容性

本计划后续若引用 Tailwind 相关状态，应以上述真值为准，不再沿用“Stage 5-7 已稳定完成”或“可长期接受混用”的旧口径。Tailwind 余项的管理阶段也应视为**验证与归档**，而不是继续机械迁移样式文件。

---

## 📋 当前完成度对比

### ✅ 已完成（阶段 0-2）

根据 `design-system-suggestion-revised.md` 的路线图：

| 阶段 | 任务 | 状态 | 备注 |
|------|------|------|------|
| **阶段 0** | POC 验证 | ✅ 100% | DaisyUI + Shadow DOM + FocusTrap 验证通过 |
| **阶段 1** | 基础组件封装 | ✅ 120% | 计划 5 个，实际交付 6+1（超额） |
| **阶段 2** | Shadow DOM 适配 | ✅ 100% | ClipperDialog + DaisyDialog 完成 |

**累计交付**：
- 6 个 DaisyUI 组件（Button、Input、Card、Badge、Alert、Dialog）
- 28 个单元测试（565/565 全量测试通过）
- Options 架构升级（79 文件，+19361 行）
- 0 TypeScript errors
- 0 Lint warnings

---

## 🎯 阶段 3 目标

### 总体目标

**逐步替换现有组件，与 Tailwind Stage5-7 协调**

### 具体目标（可量化）

1. **Options 页面迁移**：90% 的 UI 组件使用 DaisyUI
2. **Content Scripts 迁移**：Reader + Video + Support Prompt 已完成 DaisyDialog
3. **复杂组件重构**：VaultRouter + YamlConfig + Tabs 使用 Zag.js
4. **无障碍性审计**：通过 WCAG 2.1 AA 标准
5. **包体积控制**：总增长 < 50KB（gzipped）
6. **Lighthouse 评分**：Performance + Accessibility > 90

---

## 📅 月度计划（4 个月）

### 月度 1：Options 页面 Section 迁移 ⏱️ 4 周

#### 目标

迁移所有 Section 的基础 UI（按钮、输入框、卡片），保留复杂组件暂不迁移。

#### 任务清单

##### Week 1-2：准备工作（2 周）

- [ ] **任务 1.1**：创建迁移清单
  - 审计所有 Section（14 个文件）
  - 标记需要迁移的 UI 元素（按钮、输入框、卡片）
  - 标记暂不迁移的复杂组件（表格、路由编辑器）
  - 创建 Excel/Markdown 清单

- [ ] **任务 1.2**：制定迁移规范
  - 更新 `src/options/components/README.md`
  - 添加"DaisyUI 迁移规范"章节
  - 定义迁移标记注释格式
  - 提供 Before/After 代码示例

- [ ] **任务 1.3**：设置质量门禁
  - 配置 ESLint 规则（禁止手写 Tailwind 类名）
  - 配置包体积监控（`npm run bundle-size-check`）
  - 更新 CI/CD pipeline

##### Week 3-4：批量迁移（2 周）

**优先级规则**：
1. 简单 Section 优先（AiSection、LanguageSection）
2. 高频使用 Section 优先（RestSection、RoutingSection）
3. 复杂 Section 延后（YamlConfigSection）

- [ ] **任务 1.4**：迁移简单 Section（4 个）
  - [ ] AiSection（替换按钮、输入框）
  - [ ] LanguageSection（替换按钮、下拉选择）
  - [ ] PrivacySection（替换按钮、复选框）
  - [ ] TransferSection（替换按钮）

- [ ] **任务 1.5**：迁移中等 Section（4 个）
  - [ ] RestSection（替换按钮、输入框、连接测试区域）
  - [ ] RoutingSection（替换按钮、输入框、保留路由表编辑器）
  - [ ] FragmentSection（替换按钮、输入框）
  - [ ] VideoSection（替换按钮、输入框）

- [ ] **任务 1.6**：迁移复杂 Section（保守）
  - [ ] ReadingSection（替换按钮，保留模板编辑器）
  - [ ] TemplatesSection（替换按钮，保留模板列表）
  - [ ] UsageSection（保留图表，仅替换按钮）
  - [ ] ClassifierSection（替换按钮，保留分类器配置）

**暂不迁移**（延后到月度 3）：
- [ ] YamlConfigSection（复杂表格编辑器，需 Zag.js Table）
- [ ] DiagnosisSection（仅诊断功能，优先级低）

#### 验收标准

- [ ] 12/14 Section 完成基础 UI 迁移（85%）
- [ ] 所有迁移代码添加 `// ✅ Stage 3 DaisyUI migration` 标记
- [ ] 单元测试通过率 100%
- [ ] 手动测试 Options 页面，所有功能正常
- [ ] 包体积增长 < 15KB（累计 < 20KB）

#### 预计工时

- 准备工作：40h（2 周 × 2 人）
- 批量迁移：60h（2 周 × 3 人，并行）
- 测试验收：20h（1 周）
- **总计**：120h（约 4 周）

---

### 月度 2：Content Scripts 迁移 ⏱️ 4 周

#### 目标

迁移 Reader Panel、Video Panel、Support Prompt 到 DaisyDialog 架构。

#### 任务清单

##### Week 1：Reader Panel 迁移

- [x] **任务 2.1**：重构 Reader Panel
  - [ ] 使用 DaisyDialog 替换现有 Dialog
  - [ ] 使用 DaisyButton 替换工具栏按钮
  - [ ] 使用 DaisyBadge 显示标签数量
  - [ ] 保留现有 MarkdownBuilder 逻辑

- [x] **任务 2.2**：测试 Reader Panel
  - [ ] 在 10+ 主流网站测试（Wikipedia、Medium、GitHub）
  - [ ] 验证样式隔离（无 CSS 冲突）
  - [ ] 验证焦点管理（Tab 键不跳出）
  - [ ] 验证快捷键（Ctrl+Shift+C）

##### Week 2：Video Panel 迁移

- [x] **任务 2.3**：重构 Video Panel
  - [ ] 使用 DaisyDialog 替换现有 Dialog
  - [ ] 使用 DaisyButton 替换操作按钮
  - [ ] 使用 DaisyAlert 显示提示信息
  - [ ] 保留现有截图逻辑

- [x] **任务 2.4**：测试 Video Panel
  - [ ] 在 YouTube、Bilibili 测试
  - [ ] 验证视频控制器不被遮挡
  - [ ] 验证截图功能正常
  - [ ] 验证时间戳捕获

##### Week 3：Support Prompt 迁移

- [x] **任务 2.5**：重构 Support Prompt
  - [ ] 使用 DaisyDialog 替换现有 Prompt
  - [ ] 使用 DaisyButton 替换操作按钮
  - [ ] 使用 DaisyCard 显示捐赠信息
  - [ ] 保留现有显示逻辑

- [x] **任务 2.6**：测试 Support Prompt
  - [ ] 验证首次安装后显示
  - [ ] 验证点击"不再提醒"后不显示
  - [ ] 验证跳转到捐赠页面

##### Week 4：E2E 测试补充

- [x] **任务 2.7**：编写 E2E 测试
  - [x] Reader Panel E2E 测试（3 个关键流程）
  - [x] Video Panel E2E 测试（3 个关键流程）
  - [x] Support Prompt E2E 测试（4 个关键流程）

- [ ] **任务 2.8**：无障碍性测试
  - [ ] 使用 axe-core 扫描
  - [ ] 修复所有 P0 无障碍性问题
  - [ ] 测试屏幕阅读器（NVDA/VoiceOver）

#### 验收标准

- [x] 3/3 Content Scripts 完成迁移
- [ ] 通过 E2E 测试（8 个测试用例）
- [ ] 通过 axe-core 扫描（0 P0 issues）
- [ ] 包体积增长 < 10KB（累计 < 30KB）

#### 预计工时

- Reader Panel：30h
- Video Panel：30h
- Support Prompt：20h
- E2E 测试：40h
- **总计**：120h（约 4 周）

---

### 月度 3：复杂组件重构 ⏱️ 4 周

#### 目标

完成 `VaultRouter` 与 `YamlConfig` 两个核心复杂组件的 UI 收口，并将 `Tabs` 降级为后续独立任务。

> **2026-03-07 真值更新**：`YamlConfigService` 的服务层重构已在 Repo Month 3 完成；本轮已完成 `VaultRouterView` / `YamlConfigView` 视图层收口与相关测试补强。由于当前导航体系采用 `Sidebar + Navigation + MainContent`，`Tabs` 不再作为本轮阻断项。

#### 任务清单

##### Week 1-2：VaultRouter 重构

- [x] **任务 3.1**：完成 VaultRouter 视图层边界设计
  - [x] 分析现有 VaultRouter 功能与 Store / Controller / Section 职责
  - [x] 确定 `RoutingSection` 仅保留编排与同步职责
  - [x] 提炼内部 `VaultRouterView` 渲染接口

- [x] **任务 3.2**：完成 VaultRouter UI 收口
  - [x] 将表头、规则行、空态、添加按钮下沉到 `VaultRouterView`
  - [x] 统一 Daisy 风格输入、选择器、按钮与状态展示
  - [x] 保持 `VaultRouterController` 命令层职责不变

- [x] **任务 3.3**：完成 VaultRouter 测试补强
  - [x] 保留既有控制器单测
  - [x] 补强 `RoutingSection` 交互测试（增删改规则、切换目标仓库、空态恢复）
  - [x] 保持 autosave / repository 同步链路兼容

##### Week 2-3：YamlConfig 重构

- [x] **任务 3.4**：完成 YamlConfig 视图层设计收口
  - [x] 保留 `YamlConfigService` / `IYamlRepository` 现有边界
  - [x] 将 Section 内联 YAML 编辑器装配提炼为 `YamlConfigView`
  - [x] 明确本轮不强制引入 Zag Table 依赖

- [x] **任务 3.5**：完成 YamlConfig UI 收口
  - [x] `YamlConfigSection` 切换为正式视图层装配
  - [x] 默认字段 / 自定义字段 / 域名覆盖继续复用同一套状态流
  - [x] 保持 Daisy 风格表格、按钮、错误提示与摘要交互一致

- [x] **任务 3.6**：完成 YamlConfig 测试补强
  - [x] 保留既有 `yamlConfigTable` / `YamlConfigSection` 单测
  - [x] 补充域名覆盖 flow 测试
  - [x] 保持 visual interaction harness 可用

##### Week 3-4：Tabs 组件重构

- [ ] **任务 3.7**：封装 DaisyTabs 组件（延期）
  - [ ] 继续评估是否引入 `@zag-js/tabs`
  - [ ] 如后续实施，再统一处理导航迁移

- [ ] **任务 3.8**：迁移使用 Tabs 的地方（延期）
  - [ ] Options 页面主导航保持 `Sidebar + Navigation + MainContent`
  - [ ] 其他使用点后续单独评估

#### 验收标准

- [x] `VaultRouter` 完成视图层收口
- [x] `YamlConfig` 完成视图层收口
- [x] Month 3 相关单元 / flow 测试通过
- [ ] `Tabs` 作为后续独立任务保留，不计入本轮阻断

---

### 月度 4：无障碍性审计和优化 ⏱️ 4 周

#### 目标

通过 WCAG 2.1 AA 标准，优化屏幕阅读器兼容性。

#### 任务清单

##### Week 1：自动化审计

- [ ] **任务 4.1**：集成 axe-core
  - [ ] 安装 `@axe-core/playwright`
  - [ ] 编写 E2E 测试中的 axe 检查
  - [ ] 生成无障碍性报告

- [ ] **任务 4.2**：Lighthouse 审计
  - [ ] 对 Options 页面运行 Lighthouse
  - [ ] 对 Clipper Dialog 运行 Lighthouse（Content Script）
  - [ ] 记录所有 P0 + P1 issues

##### Week 2-3：问题修复

- [ ] **任务 4.3**：修复颜色对比度问题
  - [ ] 使用 WebAIM Contrast Checker 检查所有颜色
  - [ ] 调整不符合 WCAG AA 的颜色（对比度 ≥ 4.5:1）

- [ ] **任务 4.4**：修复 ARIA 属性缺失
  - [ ] 添加缺失的 `aria-label`
  - [ ] 添加缺失的 `role`
  - [ ] 添加缺失的 `aria-describedby`

- [ ] **任务 4.5**：修复焦点管理问题
  - [ ] 确保所有交互元素可聚焦
  - [ ] 确保焦点顺序符合逻辑
  - [ ] 确保焦点可见（outline 样式）

- [ ] **任务 4.6**：修复键盘导航问题
  - [ ] 确保所有功能可通过键盘操作
  - [ ] 确保 Tab/Shift+Tab 正确
  - [ ] 确保 Enter/Space/Esc 正确

##### Week 4：手动测试

- [ ] **任务 4.7**：屏幕阅读器测试
  - [ ] 使用 NVDA（Windows）测试 Options 页面
  - [ ] 使用 VoiceOver（macOS）测试 Options 页面
  - [ ] 使用 NVDA 测试 Clipper Dialog（Content Script）

- [ ] **任务 4.8**：高对比度模式测试
  - [ ] 在 Windows 高对比度模式下测试
  - [ ] 确保所有元素可见

- [ ] **任务 4.9**：放大模式测试
  - [ ] 在 200% 缩放下测试
  - [ ] 确保布局不崩溃，文字不重叠

#### 验收标准

- [ ] 通过 axe-core 扫描（0 P0 + P1 issues）
- [ ] Lighthouse Accessibility 评分 ≥ 90
- [ ] 通过屏幕阅读器测试（NVDA + VoiceOver）
- [ ] 通过 WCAG 2.1 AA 标准（至少 90% 的检查项）

#### 预计工时

- 自动化审计：20h
- 问题修复：60h
- 手动测试：20h
- **总计**：100h（约 4 周）

---

## 🎯 总体验收标准（阶段 3 完成）

### 功能指标

- [ ] **Options 页面**：12/14 Section 完成迁移（85%）
- [ ] **Content Scripts**：3/3 完成迁移（Reader + Video + Support）
- [ ] **复杂组件**：3/3 完成重构（VaultRouter + YamlConfig + Tabs）
- [ ] **组件覆盖率**：90% 的 UI 组件使用 DaisyUI

### 质量指标

- [ ] **测试通过率**：100%（单元测试 + E2E 测试）
- [ ] **TypeScript**：0 errors
- [ ] **Lint**：0 warnings
- [ ] **无障碍性**：通过 WCAG 2.1 AA 标准（90% 检查项）
- [ ] **Lighthouse**：
  - Performance ≥ 90
  - Accessibility ≥ 90
  - Best Practices ≥ 90

### 包体积指标

- [ ] **累计增长**：< 50KB（gzipped）
- [ ] **分解**：
  - DaisyUI CSS：~5KB
  - Lucide Icons：~10KB（按需加载）
  - Zag.js：~15KB（Select + Tabs）
  - 其他：~20KB

---

## 🚨 风险评估

| 风险项 | 严重性 | 可能性 | 缓解措施 |
|--------|--------|--------|----------|
| **范围蔓延** | 高 | 中 | ✅ 严格按月度计划执行，复杂组件延后 |
| **Zag.js 学习曲线** | 中 | 高 | ✅ 提前 0.5 周学习，准备 Tutorial |
| **无障碍性修复耗时** | 中 | 高 | ✅ 每月度迭代中持续修复，避免积压 |
| **与 Tailwind 迁移冲突** | 高 | 中 | ✅ 每周同步进度，避免同时修改同一文件 |
| **包体积超标** | 中 | 低 | ✅ 每月度检查，按需加载 Zag.js 组件 |

---

## 📊 进度跟踪

### 月度 1（Options Sections）

| Week | 任务 | 状态 | 备注 |
|------|------|------|------|
| Week 1-2 | 准备工作 | ⏳ Pending | - |
| Week 3-4 | 批量迁移 | ⏳ Pending | - |

### 月度 2（Content Scripts）

| Week | 任务 | 状态 | 备注 |
|------|------|------|------|
| Week 1 | Reader Panel | ✅ Done | DaisyDialog + 自动化证据已收口 |
| Week 2 | Video Panel | ✅ Done | DaisyDialog + 专项 E2E + 审计已收口 |
| Week 3 | Support Prompt | ✅ Done | DaisyDialog + 单测 + Flow 测试已收口 |
| Week 4 | E2E 测试 | ⏳ Pending | - |

### 月度 3（复杂组件）

| Week | 任务 | 状态 | 备注 |
|------|------|------|------|
| Week 1-2 | VaultRouter | ✅ Completed | 视图层收口 + 交互测试已补齐 |
| Week 2-3 | YamlConfig | ✅ Completed | 视图层收口 + domain override flow 已补齐 |
| Week 3-4 | Tabs | ⏸️ Deferred | 现有导航沿用 Sidebar + Navigation + MainContent |

### 月度 4（无障碍性）

| Week | 任务 | 状态 | 备注 |
|------|------|------|------|
| Week 1 | 自动化审计 | ⏳ Pending | - |
| Week 2-3 | 问题修复 | ⏳ Pending | - |
| Week 4 | 手动测试 | ⏳ Pending | - |

---

## 🎖️ 与阶段 4-7 的衔接

### 前置条件（阶段 3 完成后）

- ✅ 90% UI 组件使用 DaisyUI
- ✅ 通过 WCAG 2.1 AA 标准
- ✅ 包体积增长 < 50KB
- ✅ Tailwind 主视觉迁移已基本收口，后续以验证 / 兼容 / 归档为主

### 阶段 4-7 目标

根据 `design-system-suggestion-revised.md` line 956-968：

- [ ] 创建 `src/ui/` 独立目录
- [ ] 逐步迁移组件到新目录
- [ ] 重构组件的导入路径
- [ ] 更新所有文档

**时机**：与 Tailwind 主线验证与归档阶段协调（预计 3-6 个月后）

---

## 📚 参考文档

1. **`design-system-suggestion-revised.md`** - 设计系统总纲
2. **`STAGE1-2-IMPLEMENTATION-PLAN.md`** - 阶段 1-2 实施计划（已完成）
3. **`src/options/components/README.md`** - Options 组件架构文档
4. **Zag.js 官方文档**：https://zagjs.com/
5. **WCAG 2.1 标准**：https://www.w3.org/WAI/WCAG21/quickref/
6. **axe-core 文档**：https://github.com/dequelabs/axe-core

---

## 💡 开发建议

### 迁移规范

所有迁移代码必须添加标记注释：

```typescript
// ✅ Stage 3 DaisyUI migration - Month 1: Options Sections
const button = new DaisyButton(container);
button.render({ label: 'Save', variant: 'primary' });

// ✅ Stage 3 Zag.js migration - Month 3: VaultRouter
import * as select from '@zag-js/select';
const machine = select.machine({ /* ... */ });
```

### 质量门禁

每月度迭代结束前必须执行：

```bash
# TypeScript 检查
npm run typecheck

# Lint 检查
npm run lint:warnings-guard

# 单元测试
npm run test:unit

# E2E 测试
npm run test:e2e

# 无障碍性扫描
npm run test:a11y

# 包体积检查
npm run bundle-size-check
```

### 代码审查清单

- [ ] 是否添加迁移标记注释？
- [ ] 是否使用 DaisyUI 组件而非手写 Tailwind？
- [ ] 是否添加 ARIA 属性？
- [ ] 是否支持键盘导航？
- [ ] 是否编写单元测试？
- [ ] 是否更新 README？

---

## ✅ 最终交付物（阶段 3 完成时）

1. ✅ **12 个 Section 迁移**（Options 页面）
2. ✅ **3 个 Content Scripts 迁移**（Reader + Video + Support）
3. ✅ **3 个复杂组件重构**（VaultRouter + YamlConfig + Tabs）
4. ✅ **无障碍性报告**（WCAG 2.1 AA 审计）
5. ✅ **E2E 测试套件**（至少 15 个测试用例）
6. ✅ **包体积报告**（< 50KB 增长）
7. ✅ **更新文档**（README + 迁移日志）

---

**文档版本**：v1.0
**创建日期**：2025-11-28
**下次更新**：月度 1 完成后（预计 2025-12-28）

---

**开始阶段 3 前的准备**：

```bash
# 1. 创建月度 1 分支
git checkout -b stage3/month1-options-sections

# 2. 创建迁移清单
cat > docs/251126-design-system-poc/STAGE3-MONTH1-CHECKLIST.md

# 3. 开始任务 1.1：审计所有 Section
```

**祝实施顺利！** 🚀
