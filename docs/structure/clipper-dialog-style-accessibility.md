# 剪藏对话框样式与可访问性现状（E1）

## 结构概览
- DOM 入口：`src/content/clipper/components/dialog.ts`
- 主要特征：
  - 所有布局/颜色均通过内联 `style.cssText` 注入；缺乏集中式样式文件。
  - 动画 `@keyframes` 在运行期通过 `InlineStyleManager` 写入 `<style>`，但仍由组件掌控，未与其他 UI 共享。
  - 外层容器 `#obsidian-clipper-dialog` 作为全屏遮罩，取消 pointer 事件并靠内层 `div` 接管交互。

## 样式问题
| 问题 | 描述 |
| --- | --- |
| 样式分散 | 主体样式、悬浮态、按钮状态全部硬编码在 TypeScript 字符串中，后续维护不易，也影响主题化。 |
| 颜色/主题固定 | 使用大量固定色值（如 `#14172A`, `#1F233F`），缺少统一 token，夜间模式或主题切换困难。 |
| 阴影/动画耦合 | 动画、阴影值散落在多个 `style.cssText` 中，没有复用的常量，也不便于统一调整。 |
| 缺少响应式考虑 | 只有 width/height 的百分比限制，缺少针对移动端或更小屏幕的断点控制。 |

## 可访问性问题
| 问题 | 描述 |
| --- | --- |
| 无 ARIA 语义 | 对话框未设置 `role="dialog"` / `aria-modal="true"` 等属性，也没有描述性 `aria-labelledby`。 |
| 焦点管理缺失 | 打开后不会自动聚焦在对话框内；Tab 键可移出对话框，没有焦点陷阱。 |
| 键盘关闭缺失 | 目前仅通过按钮点击触发关闭，未支持 `Esc` 键。 |
| 拖拽键盘无替代 | 拖拽只支持鼠标/指针操作，键盘无法调整位置。 |
| 按钮无状态提示 | 虽有 hover 动效，但缺少 `aria-pressed` 或禁用状态逻辑，未来扩展需考虑。 |

## 建议方向
1. **样式模块化**：将核心样式迁移至 CSS（例如 `src/styles/components.css` 或新建 `clipper-dialog.css`），组件仅切换 class。
2. **主题 Token 化**：引用通用设计 token 或 CSS 变量，避免硬编码色值。
3. **ARIA & 焦点管理**：
   - 设置 `role="dialog"`, `aria-modal="true"`，并在标题上添加 `id` 用于关联。
   - 打开时聚焦第一个可交互元素，关闭时还原原焦点。
   - 引入简单的焦点陷阱（Tab 循环）。
   - 支持 `Esc` 关闭。
4. **键盘拖拽替代**（Nice-to-have）：提供快捷键微调或在无鼠标情况下保持可用。
5. **样式共享**：动画、阴影等可抽到 `styleManager` 或全局样式文件内，减少重复定义。

## 已执行的调整
- 创建 `src/content/clipper/shared/styles.ts`，集中维护对话框样式和设计变量，通过 `InlineStyleManager` 注入。
- `dialog.ts` 现改用 class 名称而非内联样式，颜色/阴影等引用统一 token，按钮/标题 hover 交互统一在 CSS 中管理。
- 拖拽交互继续由 `DragController` 处理，仅保留必要的 transform 设置，避免内联样式膨胀。

> 上述问题将作为后续 E2-E4 的基础，后续迭代可按优先级逐项解决。
