# 剪藏对话框样式 & 可访问性改进说明（E4）

## 样式
- 新增 `src/styles/clipper/dialog.css` 集中维护对话框 CSS，使用设计变量描述背景、按钮、阴影等，通过 `styleRegistry` 注入。
- `dialog.ts` 改为仅设置 class 与动态位置，删除大量内联样式与 hover 事件，后续可统一主题。
- `InlineStyleManager` 负责注入/移除样式，避免遗留 `<style>` 节点。

## 可访问性
- 对话框容器添加 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`/`aria-describedby`，标题赋 `id` 以供关联。
- 打开时自动聚焦评论文本域，关闭时恢复先前焦点。
- 新增 `Escape` 关闭快捷键，并在关闭时返回取消结果。
- 引入焦点陷阱：Tab/Shift+Tab 仅在对话框内循环，避免焦点逃逸。
- 增加隐藏说明文本与键盘拖拽提示，方便使用辅助科技的用户阅读。

## 交互/测试
- 拖拽仍通过 `DragController` 管理，仅更新 `transform` 值；新增 `DragController` 单元测试。
- `tests/unit/clipperDialog.test.ts` 覆盖提交、取消、拖拽、ARIA、焦点、焦点陷阱及键盘拖拽行为。
- 样式注入与拆分有对应的 `styleManager` 测试确保 mount/unmount 生效。
- 新增键盘移动用例，验证 `Alt(+Shift)+方向键` 更新位置。

## 后续建议
- 现已对齐 design tokens，后续主题化可直接复用全局变量。
- 将键盘拖拽提示与相关文案纳入 i18n 体系，提供多语言支持。
