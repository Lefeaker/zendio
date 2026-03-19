# Comment Form 样式解耦执行手册

本手册用于指导拆除 “样式管理与组件耦合” 技术债，目标是将注释表单 `createCommentForm` 的内联样式迁移到统一的样式管理体系，提升复用性与主题扩展能力。写作格式参考 `docs/chrome-api-decoupling-guide.md`，可配合 `docs/jieousuggest.md` 与 `docs/tech-debt-action-plan.md` 的背景说明使用。

---

## 0. 适用范围与前置准备

- 范围锁定 `AiiinOB/src/content/clipper/components/commentForm.ts` 与其在剪藏对话框中的调用路径（`AiiinOB/src/content/clipper/components/dialog.ts`）。
- 完成本手册前，请确认：
  - 已安装依赖，能运行 `npm run dev` 与 `npm run test:unit`；
  - 熟悉设计变量文件 `AiiinOB/src/styles/design-tokens.css`；
  - 了解 `InlineStyleManager` 的加载方式，参见 `AiiinOB/src/content/clipper/shared/styleManager.ts`。
- 推荐先浏览 `docs/jieousuggest.md` 对“样式管理与组件耦合”问题的条目，以及 `docs/tech-debt-action-plan.md` “Clipper 样式 token 与全局设计变量重复”章节，掌握业务背景。

> 产出：在执行阶段开始前，确认具备运行/测试环境，完成对现有样式基线的梳理。

---

## 1. 建立样式耦合清单

1. 检查注释表单的内联样式：
   ```bash
   rg "cssText" AiiinOB/src/content/clipper/components/commentForm.ts
   ```
   重点关注 `AiiinOB/src/content/clipper/components/commentForm.ts:12` 起的 `container.style.cssText`、`preview.style.cssText`、`label.style.cssText`、`textarea.style.cssText` 以及内嵌的 `placeholderStyle` 元素。
2. 记录复用诉求：
   - 与剪藏对话框主体共享的色彩/阴影/间距；
   - 未来主题切换（浅色/高对比）需要覆盖的变量；
   - 事件处理耦合（focus/blur 时直接操作内联样式）。
3. 将清单汇总至 `docs/tech-debt-action-plan.md` 对应条目或团队任务板，确保后续拆解可追踪。

> 产出：样式属性与设计 token 的映射表，列出必要的类名和状态（普通态、聚焦、占位符）。

---

## 2. 设计目标与约束

1. **保持视觉一致**：迁移后仍需沿用已有 design tokens（`--bg-elev-1`、`--text-dim`、`--radius-sm` 等），避免引入硬编码色值。
2. **统一挂载方式**：使用 `InlineStyleManager` 管理注释表单样式，禁止组件自身插入 `<style>`。
3. **语义化类名**：约定形如 `.clipper-comment-form`、`.clipper-comment-preview`、`.clipper-comment-textarea` 的类名，便于跨组件引用。
4. **状态驱动**：焦点/悬停等视觉状态通过类与伪类控制，组件逻辑只负责添加/移除状态类。
5. **可测试性**：迁移后组件应暴露可断言的类与属性，方便在 `tests/unit/clipperDialog.test.ts` 或新增单测中验证。

---

## 3. 构建样式资源

1. **落地独立 CSS 文件**：将注释表单样式整理为 `AiiinOB/src/styles/clipper/comment-form.css`，使用设计 token 作为兜底值，必要时补充响应式规则或状态类（如 `.has-content`）。
2. **通过 `styleRegistry` 装载**：在剪藏对话框初始化时（`AiiinOB/src/content/clipper/components/dialog.ts`），调用 `loadClipperStyle('comment-form')`，并将返回的 CSS 字符串交给 `InlineStyleManager.mount`，与对话框主体样式共同注入。
3. **同步样式目录**：确保 `scripts/build.mjs` 将 `src/styles/clipper/` 复制到 `dist/styles/clipper/`，并在 `docs/uiguide.md` 维护类名索引，方便设计/前端查阅。

> 产出：独立的 CSS 资源及加载流程，完全覆盖旧的内联样式集合。

---

## 4. 重构组件实现

1. **替换类名**：
   - `AiiinOB/src/content/clipper/components/commentForm.ts:13` 将容器的 `style.cssText` 移除，改为 `container.className = 'clipper-comment-form';`。
   - 对 `preview`, `label`, `textarea` 分别设置类名 `clipper-comment-preview`、`clipper-comment-label`、`clipper-comment-textarea`。
2. **去除手动 `<style>` 注入**：删除 `placeholderStyle` 动态节点，依赖伪类选择器。
3. **事件处理改写**：
   - 焦点状态由 CSS 控制，无需在 `focus`/`blur` 事件回调中修改行内样式。
   - 若需要额外视觉状态（例如错误高亮），在组件中添加 `classList.toggle('is-error', condition)`。
4. **文本截断逻辑保持不变**：继续通过脚本生成预览内容（最多 500 字符），并确保 `preview` 支持滚动。
5. **导出契约不变**：`createCommentForm` 返回值 `{ container, textarea, preview }` 保持原样，避免影响对话框调用链。

> 产出：组件只负责结构和状态管理，视觉表现移交给样式层。

---

## 5. 接入剪藏对话框

1. 在 `AiiinOB/src/content/clipper/components/dialog.ts` 中，确保 `InlineStyleManager` 仅挂载一次，示例：
   ```ts
   this.styleManager.mount([CLIPPER_DIALOG_STYLES, CLIPPER_COMMENT_FORM_STYLES].join('\n'));
   ```
   若后续还有独立样式模块，可切换为模板函数或数组迭代。
2. 校验对话框上已有的 aria 声明是否需要同步调整（例如 `textarea` ID 仍然唯一）。
3. 若存在视觉回归风险，记录对话框截图（`AiiinOB/marketing/screenshots/` 可追加调试图）供设计确认。

---

## 6. 测试与验证

| 类别 | 用例 | 说明 |
| --- | --- | --- |
| 单元测试 | `tests/unit/clipperDialog.test.ts` | 断言 `createCommentForm` 生成的元素包含预期类名，焦点事件不再修改 inline 样式。必要时新增快照。 |
| 集成测试 | `tests/e2e/claudeAiChatFlow.test.ts`、`tests/e2e/deepseekAiChatFlow.test.ts` | 确认对话框在 AI 聊天场景仍能输入/提交评论。 |
| 手动验证 | 浏览器加载扩展，执行剪藏（选择/视频） | 检查暗色主题下的外观；切换 `data-theme`（若支持）验证 token 接管。 |

补充：如引入新 CSS 常量，考虑增加视觉回归（截图 diff）或 Playwright 截图步骤，确保跨页面一致。

---

## 7. 交付物与后续事项

1. **代码提交**：
   - PR 描述需引用本手册章节，说明迁移范围与验证方式。
   - 附上前后对比截图或动图，重点展示注释表单外观。
2. **文档更新**：
   - 在 `docs/tech-debt-action-plan.md` 将对应条目标记为完成（含日期、验证方式）。
   - 若新增主题变量或公共类名，更新 `docs/uiguide.md`。
3. **后续跟进**：
   - 若计划扩展多主题或无障碍模式，评估是否将注释表单样式抽至顶部 `src/options`/`src/shared`。
   - 留意其他内联样式（可重复执行本手册步骤），逐步消除剪藏子模块的样式耦合。

> 完成以上步骤后，“样式管理与组件耦合” 技术债即可标记为已修复，团队可转向其它耦合项目的解耦工作。
