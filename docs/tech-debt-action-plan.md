# 技术债务清单与修复计划

## 背景
为确保 All in Ob 浏览器扩展在体验、可维护性与多语言支持上持续迭代，本文件在现有整改计划基础上梳理新增的关键技术债务，并给出明确的修复步骤与预期产出。计划默认在 1-2 个迭代内完成，可根据资源动态调整。

## 全局目标
- 提升剪藏体验的可访问性与稳定性，使键盘、触屏用户获得一致交互。
- 降低 UI 组件与样式 token 重复，以便未来主题化和 i18n 扩展。
- 强化多仓路由配置的易用性与国际化兼容。
- 拆分庞大 DOM 处理逻辑，补齐复杂场景测试，防止后续改动回归。

## 优先级概览
| 序号 | 债务项 | 影响 | 复杂度 | 状态 | 负责人 |
| --- | --- | --- | --- | --- | --- |
| 1 | 剪藏对话框缺少焦点陷阱/键盘拖拽支持 | 高：影响键盘/屏幕阅读器 | 中 | 已完成 | TBD |
| 2 | DragController 缺少 `pointercancel` 处理 | 中：极端场景导致拖拽失效 | 低 | 已完成 | TBD |
| 3 | Clipper 样式 token 与全局设计变量重复 | 中：主题难统一 | 中 | 已完成 | TBD |
| 4 | 多仓路由选项页未模块化、缺 i18n 对话框 | 中：国际化体验差，阻碍复用 | 中高 | 已完成 | TBD |
| 5 | `contextCapture.ts` 逻辑庞大且缺少复杂 fixture 覆盖 | 中高：难维护及回归风险 | 高 | 已完成 | TBD |

> 影响评估：高 = 直接影响核心流程或合规；中 = 有明显体验/维护痛点；低 = 较少触发但需修复。

---

## 1. 剪藏对话框可访问性缺口
- **位置**：`src/content/clipper/components/dialog.ts`
- **症状**：仅支持鼠标拖拽和 `Esc` 关闭；缺少 Tab 焦点循环、键盘拖拽替代、ARIA 说明不足；文档 `docs/structure/clipper-dialog-a11y-update.md` 已列待办。
- **影响**：键盘或屏幕阅读器用户无法安全退出/移动对话框，违反可访问性要求。

### 修复目标
1. 引入焦点陷阱，限制 Tab/Shift+Tab 在对话框内部循环。
2. 添加键盘拖拽替代（如 `Alt+箭头` 微调或提供“重置位置”操作）。
3. 补充可访问性提示：为按钮提供 `aria-label`/角色描述。

### 拆解任务
- D1：编写 `FocusTrap` 小工具（含 `trap()`/`release()` API），并在对话框生命周期挂载/释放。
- D2：为标题添加隐藏描述，说明键盘移动快捷键；实现 `Arrow` 组合键调整 `transform`。
- D3：更新单元测试 `tests/unit/clipperDialog.test.ts`，覆盖 Tab 循环、键盘拖拽、焦点恢复。
- D4：更新文档与发布说明，记录可访问性提升。

### 验收标准
- Vitest 通过新增用例；手动测试验证键盘可独立完成剪藏。
- Story / 动图记录焦点陷阱行为。

> 当前状态：已交付 FocusTrap、Alt+方向键键盘拖拽、隐藏说明文本及配套测试更新（2025-10-04）。

---

## 2. DragController 事件覆盖不足
- **位置**：`src/content/clipper/shared/dragController.ts`
- **症状**：当前仅监听 `pointerdown/move/up`，若发生 `pointercancel`/`lostpointercapture` 会导致 `active` 状态悬挂，拖拽永久失效。
- **影响**：在触屏、窗口切换或浏览器强制取消指针时，用户需刷新页签才能恢复。

### 修复目标
- 监听并正确处理 `pointercancel`、`lostpointercapture`，确保状态回收。
- 在 `detach()` 中同步移除新增监听。

### 拆解任务
- E1：扩展指针事件处理并补充日志便于调试。
- E2：更新 `tests/unit/dragController.test.ts`，模拟取消事件并断言 `onEnd` 触发。
- E3：在剪藏对话框集成测试中加入取消指针场景。

### 验收标准
- 单元测试覆盖新分支；在 DevTools 强制调用 `dispatchEvent(new PointerEvent('pointercancel'))` 时不再卡死。

> 当前状态：已补充 pointer cancel / lost pointer capture 处理与单元测试覆盖（2025-10-04）。

---

## 3. Clipper 样式 token 与全局设计变量重复
- **位置**：`src/content/clipper/shared/styles.ts`、`src/styles/design-tokens.css`
- **症状**：`--clipper-*` 变量与全局 design tokens 重复定义，未来主题切换需双处维护。
- **影响**：样式一致性受限，组件难以复用到其他界面。

### 修复目标
- 统一剪藏对话框样式使用 `design-tokens.css` 提供的变量，如 `--bg-elev-2`、`--shadow-soft`。
- 将对话框专属变量收敛为局部 class 或扩展全局 token。

### 拆解任务
- F1：盘点当前 `CLIPPER_DIALOG_STYLES` 中的 token 与全局变量映射关系。
- F2：重构样式，必要时在 `design-tokens.css` 增加新变量并记录于 `uiguide.md`。
- F3：对话框样式文件改为引用全局 CSS（或新增模块化 CSS），减少内联模板字符串。
- F4：冒烟测试确认主题变更或色彩覆写与旧版本保持一致。

### 验收标准
- 重构后 `styles.ts` 中不再硬编码颜色/阴影常量；构建输出差异仅限样式。
- UI 视觉对比（手动或截图 diff）无显著偏差。

> 当前状态：对话框样式已对齐 design tokens，并清理 CommentForm 内联色值（2025-10-04）。

---

## 4. 多仓路由选项页缺乏模块化与国际化
- **位置**：`src/options/components/vaultRouterSection.ts`
- **症状**：使用大段模板字符串拼接 HTML，直接嵌入中文文案、`alert/confirm`；交互难测试，其他语言体验不佳。
- **影响**：阻塞后续功能扩展（如快捷筛选、批量导入）；对非中文用户不友好。

### 修复目标
- 将选项页拆成可复用组件，文案全部接入 i18n。
- 替换 `alert/confirm` 为自定义对话框组件（支持键盘、国际化）。
- 引入声明式渲染层（可选：轻量模板或直接使用 lit-html/预编译函数）。

### 拆解任务
- G1：设计组件层级（Vault 列表项、Rule 行、确认对话框），定义状态更新 API。
- G2：重写渲染逻辑，利用 `OPTIONS_FORM_SCHEMA` 的结构或新增 store 监听；确保事件绑定集中。
- G3：替换所有硬编码中文，在 `src/i18n/locales.ts` 添加键值。
- G4：扩展 `tests/unit/vaultRouterSection.test.ts` 覆盖新增组件行为，模拟多语言环境。
- G5：编写迁移指南，帮助贡献者使用新组件扩展配置项。

### 验收标准
- 选项页在中文/英文环境下展示一致，Vitest 用例通过。
- 交互（新增/删除仓库、规则）在新对话框中完成，无阻塞弹窗。

> 当前状态：已拆分组件、接入 i18n，并以自定义模态替换原生确认交互（2025-10-04）。

---

## 5. `contextCapture.ts` 逻辑庞大、缺少复杂场景测试
- **位置**：`src/content/clipper/services/contextCapture.ts`
- **症状**：单文件 250+ 行混合多层循环、`try/catch`；仅覆盖基础 DOM 场景，未测试 Shadow DOM/多列布局；文档列出需补充 fixture。
- **影响**：修改上下文策略成本高，容易引入回归。

### 修复目标
- 将上下文提取流程拆分为可组合的纯函数（如容器判定、前/后文截取、祖先结构处理）。
- 新增复杂 DOM fixture，覆盖列表嵌套、Shadow DOM、富文本块。

### 拆解任务
- H1：梳理当前函数逻辑并拆成 `selectContextContainer`、`collectBeforeSegments`、`collectAfterSegments` 等模块；保持导出 API 不变。
- H2：在 `tests/fixtures/context/` 增加多类型 HTML，并更新 `tests/unit/contextCapture.test.ts`。
- H3：引入 Shadow DOM 模拟（可使用 `@webcomponents/shadydom` 或自定义 mock）确保逻辑不崩溃。
- H4：文档更新（`docs/structure/clipper-rest-refactor-notes.md`）记录新模块边界与扩展点。

### 验收标准
- 新拆分模块有独立单测，覆盖率显著提升（至少覆盖主要分支）。
- `npm run test` 在新 fixture 下保持通过；手动验证剪藏无回归。

> 当前状态：已抽离上下文收集辅助函数并补充列表/嵌套/Shadow DOM 场景测试（2025-10-04）。

---

## 跟踪与沟通
- 每周同步任务进度，更新本表状态与负责人。
- 关键改动需在 PR 描述中引用本文件相关章节，便于后续审查。
- 完成后在 `docs/structure/refactor-regression-log.md` 记录测试要点，确保持续回归。
