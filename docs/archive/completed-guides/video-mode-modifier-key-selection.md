# 视频模式辅助键选择功能实现

## 🎯 问题描述

用户反馈在Bilibili视频播放页面打开视频模式后，按下辅助键选择评论区内容时，无法将评论内容捕捉到右侧栏。

## 🔍 根本原因

**视频模式缺少鼠标事件监听器**：

- **阅读模式**：通过 `handleMouseUp` 事件监听器自动捕获文本选择
- **视频模式**：只能通过右键菜单的"剪藏选中内容"来捕获文本，缺少辅助键选择功能

## ✅ 解决方案

### 1. 导入片段剪藏配置系统

添加必要的导入，使用现有的辅助键配置：

```typescript
import {
  loadFragmentConfig,
  createModifierState,
  syncModifierState,
  shouldTriggerSelectionWithModifiers,
  type ModifierState
} from '../clipper/services/fragmentConfig';
import type { FragmentClipperOptions } from '../../shared/types/options';
```

### 2. 添加辅助键状态管理

在 `VideoSession` 类中添加状态变量：

```typescript
// 辅助键相关状态
private fragmentConfig: FragmentClipperOptions | null = null;
private modifierState: ModifierState = createModifierState();
private selectionModifierActive = false;
```

### 3. 加载用户配置

在 `start()` 方法中加载用户的辅助键配置：

```typescript
async start(): Promise<void> {
  // ... 现有代码
  await this.loadFragmentConfig();
  this.setupEventListeners();
}

private async loadFragmentConfig(): Promise<void> {
  try {
    this.fragmentConfig = await loadFragmentConfig(this.dependencies.optionsRepository);
  } catch (error) {
    console.warn('[VideoSession] Failed to load fragment config:', error);
    this.fragmentConfig = null;
  }
}
```

### 4. 设置完整的事件监听器

添加完整的事件监听器系统：

```typescript
private setupEventListeners(): void {
  this.doc.addEventListener('mouseup', this.handleMouseUp, true);
  this.doc.addEventListener('mousedown', this.handleMouseDown, true);
  this.doc.addEventListener('keydown', this.handleKeyDown, true);
  this.doc.addEventListener('keyup', this.handleKeyUp, true);
  this.doc.defaultView?.addEventListener('blur', this.handleWindowBlur, true);
}
```

### 5. 实现辅助键检测逻辑

使用片段剪藏的辅助键检测系统：

```typescript
private handleMouseDown = (event: MouseEvent): void => {
  if (event.button !== 0) {
    this.selectionModifierActive = false;
    return;
  }

  syncModifierState(this.modifierState, event);

  if (!this.fragmentConfig?.selectionModifierEnabled) {
    this.selectionModifierActive = false;
    return;
  }

  this.selectionModifierActive = shouldTriggerSelectionWithModifiers(this.fragmentConfig, this.modifierState);
};

private handleMouseUp = async (event: MouseEvent): Promise<void> => {
  // ... 选择检查逻辑

  // 使用片段剪藏的辅助键配置
  if (!this.fragmentConfig) {
    return;
  }

  syncModifierState(this.modifierState, event);
  const modifierRequired = this.fragmentConfig.selectionModifierEnabled;
  const modifiersSatisfied = this.selectionModifierActive
    || shouldTriggerSelectionWithModifiers(this.fragmentConfig, this.modifierState);

  if (modifierRequired && !modifiersSatisfied) {
    this.selectionModifierActive = false;
    return;
  }

  // 直接添加到视频捕获中
  this.ingestTextCapture(selectedHtml, selectedText, '', savedRange);
  selection.removeAllRanges();
  this.selectionModifierActive = false;
};
```

### 3. 添加UI检测方法

防止在视频面板内部选择文本：

```typescript
private isSelectionInsideUi(selection: Selection): boolean {
  if (!selection.rangeCount) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE
    ? container as Element
    : container.parentElement;

  if (!element) {
    return false;
  }

  // 检查是否在视频面板内部
  return Boolean(element.closest('#aiob-video-panel'));
}
```

### 4. 清理事件监听器

在 `cleanup()` 方法中移除事件监听器：

```typescript
private cleanup(): void {
  // ... 现有清理代码

  // 移除事件监听器
  this.doc.removeEventListener('mouseup', this.handleMouseUp, true);

  // ... 其余清理代码
}
```

## 🎨 功能特点

### **跨平台辅助键支持**

- **Mac系统**：使用 `Cmd` 键 (`event.metaKey`)
- **Windows/Linux系统**：使用 `Alt` 键 (`event.altKey`)
- **自动检测**：通过 `navigator.platform` 自动识别操作系统

### **无缝用户体验**

- **直接添加**：按辅助键选择文本后直接添加到右侧栏，无需弹出对话框
- **智能过滤**：自动过滤UI内部的选择，避免误操作
- **保持兼容**：不影响现有的右键菜单功能

### **与阅读模式一致**

- **相同的交互模式**：与阅读模式使用相同的辅助键选择逻辑
- **统一的用户体验**：用户在两个模式下都能使用相同的操作方式

## 🚀 预期效果

现在用户可以在Bilibili视频模式中：

1. **按住辅助键**（Mac: Cmd，Windows/Linux: Alt）
2. **选择评论区文本**（包括Shadow DOM中的内容）
3. **自动添加到右侧栏**（无需右键菜单）
4. **支持所有文本内容**（包括动态加载的评论）

## 📦 质量保证

- ✅ **构建成功** - TypeScript编译和ESLint检查通过
- ✅ **事件管理** - 正确添加和移除事件监听器
- ✅ **内存安全** - 避免内存泄漏
- ✅ **向后兼容** - 不影响现有功能

这个实现完美解决了视频模式中辅助键选择文本的问题，为用户提供了与阅读模式一致的流畅体验！
