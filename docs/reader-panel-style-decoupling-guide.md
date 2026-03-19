# Reader Panel 样式解耦执行手册

本手册用于指导 Reader 阅读模式面板（高亮列表与浮层）从遗留的内联/全局样式过渡到统一的样式管理体系。写作格式参考 `docs/comment-form-style-decoupling-guide.md`，执行过程中需同步 `docs/tech-debt-action-plan.md` 与样式治理看板。

---

## 0. 适用范围与前置准备

- 涉及模块：
  - 视图实现：`AiiinOB/src/content/reader/ui/panel.ts`
  - 会话控制：`AiiinOB/src/content/reader/session.ts`
  - 样式资源：`AiiinOB/src/styles/clipper/reader-panel.css`
  - 高亮渲染：`AiiinOB/src/content/reader/session.ts:474` `createHighlightWrapper`
- 操作前确认：
  - 本地可运行 `npm run dev`、`npm run test:unit`、`npm run test:e2e`
  - 了解现有 design tokens（`AiiinOB/src/styles/design-tokens.css`）
  - 熟悉 `InlineStyleManager` 与 `loadClipperStyle` 的注入方式
- 推荐先记录当前面板 UI 的截图与主题配置，便于后续回归对比。

> 产出：确保环境与背景信息齐备，建立 Reader 面板样式现状基线。

---

## 1. 样式耦合现状梳理

1. **全局变量污染**  
   `reader-panel.css` 顶部以 `:root { --reader-* }` 形式注入大量专有变量（bg、shadow、highlight 主题等），导致样式作用域扩散至整页。
2. **主题切换依赖 `:root` dataset**  
   阅读主题通过 `:root[data-aiob-reader-highlight="…"]` 切换，和其它功能（剪藏对话框、视频面板）共享同一 `documentElement`，存在冲突风险。
3. **ID 选择器 + DOM 注入顺序耦合**  
   主要结构使用 `#aiob-reader-*`，同时脚本直接 `document.body.appendChild`，在多实例或 shadow DOM 中难以复用。
4. **设计 token 重复定义**  
   `--reader-panel-bg`、`--reader-panel-shadow` 等与全局 `--bg-elev-*`、`--shadow-soft` 重复，增加维护成本。
5. **状态样式散落**  
   高亮聚焦类 `.aiob-reader-highlight--focus` 由脚本添加/移除，但其样式仍靠根级变量控制，缺乏模块封装。

> 产出：将上述问题记录到样式治理清单，明确要消除的耦合点。

---

## 2. 设计目标与约束

1. **作用域收敛**：Reader 面板样式仅在 `#aiob-reader-root`（或新命名空间类）内生效，不再污染 `:root`。
2. **Token 统一**：背景、阴影、文字颜色改为引用 design tokens，如 `var(--bg-elev-3)`、`var(--shadow-md)`。
3. **主题分层**：高亮主题改用 `#aiob-reader-root[data-highlight-theme]` 控制；保持与 ReaderSession 逻辑一致。
4. **模块化拆分**：将面板布局、列表项、按钮状态与高亮标记拆成易复用的 class，避免依赖 ID。
5. **注入一次**：通过 `styleRegistry` 缓存加载，Reader 会话只 mount 一份 CSS，考虑拆分 `panel` 与 `highlight` 子文件。
6. **无内联样式**：脚本层负责结构与状态 class，禁止新增 `style.*` 或 `cssText`。

---

## 3. 构建样式资源

1. **拆分 CSS 文件**
   - `reader-panel.base.css`：面板容器、按钮、列表项等结构样式
   - `reader-highlight.css`：高亮标记、focus ring、主题变量
   - 将两者在 `scripts/build.mjs` 中复制到 `dist/styles/clipper/`
2. **作用域重写**
   - 使用 `.aiob-reader` 根类包裹所有规则（在 `panel.ts` 中给 `root` 添加该类）
   - 将 `:root[data-aiob-reader-highlight="…"]` 改为 `.aiob-reader[data-highlight-theme="…"]`
3. **Token 替换**
   - 建立映射表，例如 `--reader-panel-bg → var(--bg-elev-3)`，`--reader-primary → var(--accent-solid)`
   - 若缺少合适 token，补充到 `design-tokens.css` 并同步 `docs/uiguide.md`
4. **聚焦状态**
   - 保留 `.aiob-reader-highlight--focus` 作为脚本使用，样式文件内负责设定 outline/背景
5. **滚动条/动画**
   - 将 `::-webkit-scrollbar` 等特例从全局调整到 `.aiob-reader` 下，防止影响页面其它滚动容器

> 产出：新的样式文件、设计 token 映射表与构建脚本更新。

---

## 4. 组件重构计划

1. **根节点命名**
   - `panel.ts` 将 `#aiob-reader-root` 附加类 `.aiob-reader`，必要时保留 ID 兼容现有选择器
   - 设置 `root.dataset.highlightTheme = …` 与样式联动
2. **结构类整理**
   - 为 header/footer/button 追加语义化类（如 `.aiob-reader-header`），减少对 tag 选择器依赖
   - 列表项使用 `.aiob-reader-item` 等命名，统一 BEM 结构
3. **高亮主题应用**
   - `applyHighlightTheme` 中改写为操作根容器 dataset；移除对 `document.documentElement` 的写入
   - 高亮 wrapper (`createHighlightWrapper`) 使用 `.aiob-reader-highlight` + dataset/class 控制
4. **样式加载**
   - `reader/session.ts` 中分两次 `loadClipperStyle`：一个加载 panel base，一个加载 highlight
   - 考虑与视频面板共用高亮 CSS，提炼公共模块（可在后续阶段执行）
5. **清理遗留标记**
   - 移除不再需要的 `#aiob-reader-highlights--empty` ID 规则，改为类
   - 检查 `reader-panel.css` 中的 `!important`，尽量消除

---

## 5. 与其他模块的协同

1. **Video Panel 对齐**：Reader 改造过程中同步记录差异，后续可沿用同一结构/类，减轻视频面板的迁移成本。
2. **剪藏对话框联动**：若共享按钮样式，可考虑在 `styles/clipper/_tokens.css` 中抽出通用变量。
3. **选项页主题设置**：Reader 主题配置位于 `src/options/components/readingSession.ts`，更新说明文档和示例图，确保 token 变更不会破坏选项预览。
4. **Markdown 导出**：`buildReaderHighlightsMarkdown` 依赖 `.aiob-reader-highlight` class，迁移时保持兼容。

---

## 6. 测试与验证

| 类型 | 覆盖点 | 说明 |
|------|--------|------|
| 单元测试 | `tests/unit/readerSessionModifiers.test.ts`, 新增 `readerPanelView.test.ts` | 断言面板结构类名、主题 dataset 与焦点状态 |
| 单元测试 | 新增 `readerHighlight.test.ts` | 验证 `createHighlightWrapper` 输出类/属性，确保无 inline 样式 |
| E2E | `tests/e2e/claudeAiChatFlow.test.ts`, `tests/e2e/clipperFlow.test.ts` | 阅读模式流程，高亮编辑、导出、主题切换 |
| 手动验证 | 浏览器实测 | 浅色/深色主题、不同高亮主题、聚焦跳转（按「滚动到高亮」按钮） |
| 回归检查 | 观看视频后切换回 Reader | 确保 Reader/Video 之间样式不互相污染 |

> 建议为 Reader 面板新增截图对比（放入 `AiiinOB/marketing/screenshots/reader/`）辅助视觉审查。

---

## 7. 交付与后续事项

1. **交付物**
   - 新/改 CSS 文件（含 token 替换说明）
   - 组件/会话脚本改动，移除对 `documentElement` 的样式依赖
   - 新增/更新单元测试与 E2E 覆盖
2. **文档更新**
   - `docs/tech-debt-action-plan.md` 标记 Reader 样式治理完成情况（含日期、验证方式）
   - `docs/uiguide.md` 补充 Reader 面板类名、主题变量说明
   - 如有共享高亮模块，更新 `docs/style-management-decoupling-guide.md`
3. **后续跟进**
   - 参照同样流程迁移视频面板（`src/content/video/ui/panel.ts`）
   - 评估将高亮主题 CSS 抽象为通用模块，供选项页/阅读器使用
   - 建议在下一迭代引入视觉回归（Playwright 截图）防止主题回退

完成以上步骤，即可将 Reader 面板从全局/内联样式中彻底解耦，为后续多主题与跨模块复用打下基础。***
