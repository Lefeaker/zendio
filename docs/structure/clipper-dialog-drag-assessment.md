# 剪藏对话框拖拽逻辑梳理（D1）

## 现状概览
- 实现位置：`src/content/clipper/components/dialog.ts`
- 状态字段：
  - `isDragging/currentX/currentY/initialX/initialY/xOffset/yOffset`
  - 指针事件处理器分别保存为 `pointerDownHandler` / `pointerMoveHandler` / `pointerUpHandler`
- 样式注入：在 `createDialog` 时通过 `styleElement` 向 `document.head` 添加动画/样式。
- 交互细节：
  - `clipper-dialog-header` 作为拖拽句柄，新增/移除 pointer 事件。
  - 拖拽时通过更新 `xOffset/yOffset` 与 CSS `transform` 实现平移。
  - pointer 事件在整个 document 上监听，松开后解除。

## 问题与痛点
| 类别 | 说明 |
| --- | --- |
| 状态重复 | 手动维护 7 个与拖拽相关的数值字段，逻辑分散在 pointer 事件内，后续扩展（如限制拖拽边界、记忆位置）困难。 |
| 资源清理 | `detachDragHandlers` 需要手工解除 3 个事件，若未来扩展更多交互易漏掉。 |
| 样式管理 | 通过字符串注入 Style 元素，包含动画/阴影等，与业务混杂；难以复用到其他 UI。 |
| 可测试性 | 拖拽逻辑与 DOM 创建紧耦合，目前没有单元测试覆盖 pointer 行为。 |
| 可扩展性 | 缺乏抽象层，若对话框新增 Resize、键盘操作等需大量复制粘贴代码。 |

## 抽象目标（展望）
1. **拖拽控制器**：提供通用 hook/类，负责 pointer 监听、位移计算、边界限制；支持传入回调更新 UI。
2. **样式管理**：将动画/主题相关样式迁移到 CSS/独立模块，或通过 `styleManager` 控制临时样式注入与清除。
3. **状态统一**：减少 `ClipperDialog` 内部状态，只保留位置/可见性；拖拽组件自身管理 pointer 状态。
4. **测试**：为拖拽控制器编写 jsdom 单测，模拟 pointerdown/move/up，验证回调与状态清理。

> 后续 D2 将围绕上述目标提炼公共模块，并在对话框中接入。 
