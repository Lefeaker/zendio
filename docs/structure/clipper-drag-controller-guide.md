# 拖拽控制器使用说明（D4）

## 模块位置

- `src/content/clipper/shared/dragController.ts`
  - 提供 `DragController` 类，封装 pointerdown/move/up/cancel 事件及位移计算。
  - 自动处理 pointer cancel 与 `lostpointercapture`，确保意外中断时释放状态。
  - 支持传入 `handle`、`initialPosition`、`onMove`、`onEnd` 回调。
- `src/content/clipper/shared/styleManager.ts`
  - `InlineStyleManager` 用于在对话框创建时注入/移除动态样式。

## 对话框接入方式

- `src/content/clipper/components/dialog.ts`
  - 在 `createDialog` 中实例化 `InlineStyleManager` 注入动画样式。
  - 使用 `DragController` 监听标题区域拖拽，并通过 `transform: translate(...)` 更新位置。
  - `remove()` 时调用 `detachDragHandlers()`，再统一清理 `DragController` 与样式。

## 使用步骤

1. **创建控制器**
   ```ts
   const controller = new DragController({
     handle: headerElement,
     initialPosition: { x: 0, y: 0 },
     onMove: ({ x, y }) => {
       dialogContent.style.transform = `translate(${x}px, ${y}px)`;
     },
     onEnd: () => {
       /* 可选：记录位置或保存状态 */
     }
   });
   controller.attach();
   ```
2. **组件销毁**
   ```ts
   controller.detach();
   ```
3. **样式注入**
   ```ts
   const styleManager = new InlineStyleManager(document);
   styleManager.mount(`@keyframes fadeIn { ... }`);
   // 销毁时调用 styleManager.unmount();
   ```

## 测试覆盖

- 拖拽控制器：`tests/unit/dragController.test.ts`
  - 验证 pointerdown/move/up/cancel 行为、onMove 回调与 onEnd 回调。
  - 覆盖 pointer cancel 以及 pointer capture 丢失时的状态还原。
- 样式管理器：`tests/unit/styleManager.test.ts`
  - 验证 style 节点挂载/卸载。
- 对话框集成：`tests/unit/clipperDialog.test.ts`
  - 确认拖拽触发后 `transform` 更新，保持既有交互流程。

## 调试建议

- 如需观察位移值，可在 `onMove` 回调中打印 `x/y` 或使用 devtools 检查元素 style。
- 若将拖拽行为复用到其他弹窗，可直接引入 `DragController` 并根据需要扩展边界限制逻辑。
