## 🔗 AiiinOB 项目耦合问题分析

### 🚨 **严重耦合问题**

#### 1. **Chrome API 直接依赖散布全项目**
**问题**: Chrome API 调用分散在各个模块中，缺少统一的抽象层

````typescript path=AiiinOB/src/content/extractors/aiChatExtractor.ts mode=EXCERPT
// 直接在业务逻辑中调用 Chrome API
optionsCache.pending = chrome.storage.sync.get('options')
  .then(({ options }) => {
    optionsCache.value = options as OptionsState | undefined;
````

**影响**: 
- 测试困难（需要 mock Chrome API）
- 跨平台移植困难
- 业务逻辑与平台 API 紧耦合

**解耦建议**:
```typescript
// 创建存储抽象层
interface StorageService {
  getOptions(): Promise<OptionsState>;
  setOptions(options: OptionsState): Promise<void>;
  onOptionsChanged(callback: (options: OptionsState) => void): void;
}

// Chrome 实现
class ChromeStorageService implements StorageService {
  async getOptions(): Promise<OptionsState> {
    const { options } = await chrome.storage.sync.get('options');
    return options;
  }
}
```

#### 2. **UI 组件与业务逻辑强耦合**
**问题**: 对话框组件直接处理业务逻辑和状态管理

````typescript path=AiiinOB/src/content/clipper/components/dialog.ts mode=EXCERPT
export class ClipperDialog {
  // 混合了 UI 渲染、事件处理、业务逻辑
  async show(selectedText: string, options?: ClipperDialogOptions): Promise<ClipperDialogResult> {
    // UI 创建逻辑
    void this.createDialog(selectedText);
    // 业务逻辑处理
  }
````

**解耦建议**:
```typescript
// 分离关注点
interface ClipperDialogPresenter {
  show(viewModel: ClipperViewModel): Promise<ClipperDialogResult>;
}

interface ClipperDialogController {
  handleClipAction(comment: string): Promise<void>;
  handleReaderAction(comment: string): Promise<void>;
}
```

#### 3. **消息通信缺少统一抽象**
**问题**: 各模块直接使用 `chrome.runtime.sendMessage`，缺少统一的消息总线

````typescript path=AiiinOB/src/content/video/session.ts mode=EXCERPT
chrome.runtime.sendMessage({ type: 'CLIP_RESULT', payload }, () => {
  const lastError = chrome.runtime.lastError;
  // 重复的错误处理逻辑
});
````

**解耦建议**:
```typescript
interface MessageBus {
  send<T>(message: Message): Promise<T>;
  subscribe<T>(type: string, handler: (message: T) => void): void;
}

class ChromeMessageBus implements MessageBus {
  async send<T>(message: Message): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}
```

---

### ⚠️ **中等耦合问题**

#### 4. **选项表单与存储逻辑耦合**
**问题**: 表单组件直接操作存储，缺少数据层抽象

````typescript path=AiiinOB/src/options/components/vaultRouterSection.ts mode=EXCERPT
async function persistVaultRouterOptions(): Promise<void> {
  // 表单组件直接处理存储逻辑
  const options = collectOptionsFromForm(previous);
  await saveOptionsToStorage(options);
}
````

#### 5. **提取器模块间循环依赖**
**问题**: 提取器之间存在相互依赖

````typescript path=AiiinOB/src/content/index.ts mode=EXCERPT
// 在同一个文件中处理多种提取逻辑
const detectedChat = isAIChat(url, doc);
result = detectedChat
  ? await extractAIChat(doc, url)
  : await extractArticle(doc, url);
````

#### 6. **样式管理与组件耦合**
**问题**: 样式直接内联在组件中，难以复用和主题化

````typescript path=AiiinOB/src/content/clipper/components/commentForm.ts mode=EXCERPT
textarea.style.cssText = `
  width: 100%;
  min-height: 120px;
  padding: var(--space-md, 14px);
  // 大量内联样式
`;
````

---

### 🔧 **轻微耦合问题**

#### 7. **国际化与 DOM 操作耦合**
**问题**: i18n 直接操作 DOM，缺少视图层抽象

````typescript path=AiiinOB/src/i18n/index.ts mode=EXCERPT
export async function initI18n(): Promise<void> {
  // 直接操作 DOM
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = msgs[key];
  });
}
````

#### 8. **配置验证与业务逻辑混合**
**问题**: 配置验证逻辑散布在各个组件中

---

### 📋 **解耦优先级建议**

| 优先级 | 耦合问题 | 影响范围 | 解耦复杂度 | 建议时间 |
|--------|----------|----------|------------|----------|
| **P0** | Chrome API 直接依赖 | 全项目 | 高 | 2-3周 |
| **P0** | 消息通信缺少抽象 | 跨模块通信 | 中 | 1-2周 |
| **P1** | UI 组件业务逻辑耦合 | 前端组件 | 高 | 2-3周 |
| **P1** | 选项表单存储耦合 | 配置管理 | 中 | 1周 |
| **P2** | 提取器循环依赖 | 内容提取 | 中 | 1-2周 |
| **P2** | 样式管理耦合 | UI 一致性 | 低 | 3-5天 |

---

### 🎯 **具体解耦方案**

#### **阶段一：基础设施解耦（P0）**
1. **创建平台抽象层**
   ```typescript
   // src/shared/platform/
   interface PlatformServices {
     storage: StorageService;
     messaging: MessageBus;
     notifications: NotificationService;
   }
   ```

2. **统一消息总线**
   ```typescript
   // src/shared/messaging/
   class MessageBus {
     private handlers = new Map();
     async send<T>(type: string, payload: any): Promise<T>;
     subscribe<T>(type: string, handler: MessageHandler<T>): void;
   }
   ```

#### **阶段二：组件架构解耦（P1）**
1. **实现 MVP 模式**
   ```typescript
   // src/content/clipper/architecture/
   interface ClipperView {
     render(viewModel: ClipperViewModel): void;
     onAction(callback: ActionCallback): void;
   }
   
   class ClipperPresenter {
     constructor(
       private view: ClipperView,
       private model: ClipperModel
     ) {}
   }
   ```

2. **配置管理解耦**
   ```typescript
   // src/shared/config/
   interface ConfigRepository {
     load(): Promise<Config>;
     save(config: Config): Promise<void>;
     watch(callback: ConfigChangeCallback): void;
   }
   ```

#### **阶段三：业务逻辑解耦（P2）**
1. **提取器工厂模式**
   ```typescript
   // src/content/extractors/
   interface ExtractorFactory {
     createExtractor(type: ExtractorType): ContentExtractor;
   }
   ```

2. **样式系统重构**
   ```typescript
   // src/shared/styles/
   class ThemeManager {
     applyTheme(component: Component, theme: Theme): void;
   }
   ```

---

### 💡 **实施建议**

1. **渐进式重构**: 避免大规模重写，采用适配器模式逐步迁移
2. **依赖注入**: 使用 DI 容器管理依赖关系
3. **接口优先**: 先定义接口，再实现具体类
4. **测试驱动**: 每个解耦步骤都要有对应的单元测试
5. **文档同步**: 更新架构文档和开发指南

这些解耦工作将显著提升项目的可维护性、可测试性和可扩展性，为后续功能开发奠定良好的架构基础。
