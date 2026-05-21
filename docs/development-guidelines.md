# AiiinOB 开发规范指南

> **版本**: v1.0
> **更新日期**: 2025-10-16
> **适用范围**: AiiinOB 浏览器扩展项目

## 📋 目录

1. [项目结构规范](#1-项目结构规范)
2. [文件放置规则](#2-文件放置规则)
3. [代码架构要求](#3-代码架构要求)
4. [资源管理规范](#4-资源管理规范)
5. [路径引用规范](#5-路径引用规范)
6. [测试组织规范](#6-测试组织规范)
7. [构建和配置规范](#7-构建和配置规范)
8. [开发工作流](#8-开发工作流)
9. [反模式和注意事项](#9-反模式和注意事项)
10. [快速参考](#10-快速参考)

---

## 1. 项目结构规范

### 1.1 标准目录结构

```
AiiinOB/
├── src/                    # 源代码（分层架构）
│   ├── background/         # 后台服务工作者
│   ├── content/           # 内容脚本
│   ├── options/           # 选项页面
│   ├── platform/          # Chrome API 抽象层
│   ├── infrastructure/    # 基础设施层
│   ├── shared/            # 共享模块
│   ├── i18n/              # 国际化系统
│   ├── styles/            # 样式文件
│   ├── third_party/       # 第三方集成
│   └── types/             # 类型定义
├── public/                # 静态资源（版本控制）
│   ├── icons/             # 扩展图标
│   ├── _locales/          # 本地化文件
│   └── manifest.json      # 扩展清单
├── build/                 # 构建产物（忽略版本控制）
│   ├── dist/              # 构建输出
│   ├── releases/          # 发布包
│   └── temp/              # 临时文件
├── tests/                 # 测试文件
│   ├── unit/              # 单元测试
│   ├── e2e/               # 端到端测试
│   ├── fixtures/          # 测试数据
│   └── types/             # 测试类型定义
├── tools/                 # 开发工具
├── docs/                  # 项目文档
└── .archive/              # 历史归档（忽略版本控制）
```

### 1.2 核心原则

- **分层架构**: 严格遵循 Platform → Infrastructure → Application → UI 的分层
- **关注点分离**: 每个目录有明确的职责边界
- **依赖方向**: 高层模块不依赖低层模块，都依赖抽象
- **资源标准化**: 静态资源统一管理，构建产物集中输出

---

## 2. 文件放置规则

### 2.1 新增功能文件放置

#### ✅ 正确示例

```typescript
// 新增剪藏功能相关文件
src / background / services / clipperService.ts; // 业务服务
src / background / application / clipProcessor.ts; // 应用逻辑
src / content / clipper / selectionHandler.ts; // 内容脚本
src / shared / types / clipper.ts; // 共享类型
tests / unit / clipperService.test.ts; // 单元测试
```

#### ❌ 错误示例

```typescript
// 不要将业务逻辑放在平台层
src / platform / clipperService.ts; // ❌ 违反分层原则

// 不要将特定功能的类型放在根类型目录
src / types / clipperTypes.ts; // ❌ 应放在 shared/types/

// 不要将测试文件与源码混放
src / background / services / clipperService.test.ts; // ❌ 应放在 tests/unit/
```

### 2.2 按功能模块组织

| 功能类型        | 放置位置                      | 示例                               |
| --------------- | ----------------------------- | ---------------------------------- |
| Chrome API 抽象 | `src/platform/`               | `platform/chrome/tabs.ts`          |
| 基础设施服务    | `src/infrastructure/`         | `infrastructure/restClient.ts`     |
| 业务服务        | `src/background/services/`    | `services/notificationService.ts`  |
| 应用逻辑        | `src/background/application/` | `application/clipProcessor.ts`     |
| 内容脚本        | `src/content/`                | `content/clipper/`                 |
| UI 组件         | `src/options/components/`     | `components/VaultSelector.ts`      |
| 共享工具        | `src/shared/`                 | `shared/guards/`, `shared/errors/` |

---

## 3. 代码架构要求

### 3.1 分层架构规范

```typescript
// 平台层 (src/platform/) - 最底层
export interface TabsService {
  getCurrentTab(): Promise<chrome.tabs.Tab>;
  sendMessage(tabId: number, message: any): Promise<any>;
}

// 基础设施层 (src/infrastructure/) - 依赖平台层
export class RestClient {
  constructor(private tabsService: TabsService) {}
}

// 应用层 (src/background/application/) - 依赖基础设施层
export class ClipProcessor {
  constructor(private restClient: RestClient) {}
}

// 服务层 (src/background/services/) - 依赖应用层
export class ClipperService {
  constructor(private clipProcessor: ClipProcessor) {}
}
```

### 3.2 依赖注入规范

#### ✅ 正确使用依赖注入

```typescript
// 1. 定义服务令牌
export const TOKENS = {
  ClipperService: Symbol('ClipperService'),
  NotificationService: Symbol('NotificationService')
} as const;

// 2. 注册服务
const registry = new ServiceRegistry();
registry.register(TOKENS.ClipperService, () => new ClipperService());

// 3. 使用服务
const clipperService = registry.get(TOKENS.ClipperService);
```

#### ❌ 避免直接依赖

```typescript
// ❌ 不要直接调用 Chrome API
chrome.tabs.query({ active: true }, (tabs) => {
  // 业务逻辑
});

// ✅ 应该通过平台层抽象
const tabsService = getPlatformServices().tabs;
const currentTab = await tabsService.getCurrentTab();
```

### 3.3 错误处理规范

```typescript
// 使用统一的错误处理系统
import { AppError, ErrorSeverity } from '../shared/errors';

// 创建领域特定错误
export class ClipperError extends AppError {
  constructor(message: string, code: string, cause?: Error) {
    super('clipper', message, ErrorSeverity.ERROR, code, cause);
  }
}

// 错误传播
try {
  await clipContent();
} catch (error) {
  throw new ClipperError('剪藏失败', 'CLIP_FAILED', error);
}
```

### 3.4 选项页架构准则

- **核心组成**
  - 正式 Options UI 启动链为 `src/options/index.ts -> src/options/runtimeEntry.ts -> src/options/app/bootstrap.ts -> src/options/app/productionStitchShell.ts`。
  - `src/options/stitch/*` 的 schema、renderer、content 与 CSS 是当前 Options UI behavior 真值；新增 UI behavior 优先落在 Stitch schema/render/domain code 或 `src/ui/domains/*`。
  - `OptionsApp`、`MainContent`、旧 Section class 与 `FormSectionRegistry` 属于兼容/验证迁移资产；不得作为新增 Options 功能的实现指南，也不得重新接入生产启动链。
  - 删除旧 Options source 前必须运行 Non-Production Code 3.0 owner scan：记录 `audit:non-production-source:report` counts/exit status，并要求 `audit:non-production-source:check` 通过。
  - `OptionsController`（`src/options/app/optionsController.ts`）集中处理持久化、自动保存、导入导出，自动保存链路需调用 `markPendingAutoSave()` + `scheduleAutoSave()`。

- **运行时约束**
  - 二次初始化依赖 `bootstrapOptionsApp()` 内的 `disposeCleanupHandlers()` 与 `teardownMountedShell()`，禁止独立实例化 Controller 或 Shell。
  - Section、Helper（如 `DomainMappingsController`、`YamlConfigTable`）必须实现 `destroy()`，清理事件与子组件。
  - 所有文案通过 `setMessages()` 或 `data-i18n` 绑定，多语言整改遵循 `docs/options-multilingual-adaptation-guide.md`。

- **测试要求**
  - 端到端/复杂单测使用 `tests/utils/domEnvironment.ts` 的 `withDomEnvironment()`，统一覆写并恢复全局。
  - 浏览器 API 测试使用 `tests/utils/browserMocks.ts` 的 `installChromeMock()` / `installFirefoxMock()`，禁止直接向 `globalThis` 写入裸 `vi.fn()`。
  - 新增 Options UI 行为应覆盖 Stitch schema/render/domain 或 production shell contract；不要为旧 Section class 新增生产导向测试。

- **提交前检查清单**
  - `npm run typecheck:tests`、`npm run lint --max-warnings=0`、`npm run lint:warnings-guard`、`npm run test:unit`、`npm run test:e2e` 必须通过（lint 报告必须保持 0 warning，PR 需附 `tmp/quality/lint-warnings.latest.json` 或命令输出佐证）。
  - 新增 Section 或 Helper 后更新 `src/options/README.md`，保持文档与实现一致。

---

## 4. 资源管理规范

### 4.1 静态资源管理

#### 图标资源

```typescript
// ✅ 正确的图标路径引用
export const APP_ICON_PATH = 'icons/bannerlogo-128.png';

// 在 manifest.json 中
{
  "icons": {
    "16": "icons/bannerlogo-16.png",
    "32": "icons/bannerlogo-32.png",
    "48": "icons/bannerlogo-48.png",
    "128": "icons/bannerlogo-128.png"
  }
}
```

#### 本地化文件

```
public/_locales/
├── en/
│   └── messages.json
├── zh_CN/
│   └── messages.json
└── zh_TW/
    └── messages.json
```

### 4.2 构建产物管理

| 目录              | 用途     | 版本控制 |
| ----------------- | -------- | -------- |
| `build/dist/`     | 构建输出 | ❌ 忽略  |
| `build/releases/` | 发布包   | ❌ 忽略  |
| `build/temp/`     | 临时文件 | ❌ 忽略  |
| `public/`         | 静态资源 | ✅ 跟踪  |

---

## 5. 路径引用规范

### 5.1 模块导入规范

```typescript
// ✅ 使用相对路径导入同层级模块
import { ClipperService } from './clipperService';
import { NotificationService } from '../notifications/notificationService';

// ✅ 使用绝对路径导入跨层级模块
import { getPlatformServices } from '../../platform';
import { AppError } from '../../shared/errors';

// ✅ 使用 baseUrl 配置的路径（tsconfig.app.json 中 baseUrl: "./src"）
import { getPlatformServices } from 'platform';
import { AppError } from 'shared/errors';
```

### 5.2 资源路径引用

```typescript
// ✅ 静态资源路径
const iconPath = 'icons/bannerlogo-128.png'; // 相对于 public/
const localePath = '_locales/zh_CN/messages.json';

// ✅ 运行时资源解析
const iconUrl = chrome.runtime.getURL('icons/bannerlogo-128.png');
```

---

## 6. 测试组织规范

### 6.1 测试文件结构

```
tests/
├── unit/                           # 单元测试
│   ├── background/                 # 后台服务测试
│   │   ├── services/
│   │   │   └── clipperService.test.ts
│   │   └── application/
│   │       └── clipProcessor.test.ts
│   ├── content/                    # 内容脚本测试
│   ├── shared/                     # 共享模块测试
│   └── setup/                      # 测试配置
├── e2e/                           # 端到端测试
│   ├── clipperFlow.test.ts
│   └── optionsFlow.test.ts
├── fixtures/                      # 测试数据
│   ├── ai-chat/
│   └── configTestHelpers.ts
└── types/                         # 测试类型
    └── globals.d.ts
```

### 6.2 测试命名规范

```typescript
// ✅ 测试文件命名：与源文件对应
src / background / services / clipperService.ts;
tests / unit / background / services / clipperService.test.ts;

// ✅ 测试用例命名：描述性
describe('ClipperService', () => {
  describe('clipContent', () => {
    it('should successfully clip article content', async () => {
      // 测试实现
    });

    it('should handle network errors gracefully', async () => {
      // 错误处理测试
    });
  });
});
```

---

## 7. 构建和配置规范

### 7.1 包管理规范

#### ✅ 正确的依赖管理

```bash
# 安装生产依赖
npm install lodash

# 安装开发依赖
npm install --save-dev @types/lodash

# 移除依赖
npm uninstall lodash
```

#### ❌ 禁止直接编辑配置文件

```json
// ❌ 不要直接编辑 package.json 添加依赖
{
  "dependencies": {
    "lodash": "^4.17.21" // 手动添加
  }
}
```

### 7.2 构建脚本规范

```javascript
// scripts/build.mjs - 构建脚本示例
import { cp, mkdir } from 'fs/promises';

// ✅ 使用标准化路径
const BUILD_DIR = 'build/dist';
const PUBLIC_DIR = 'public';

await mkdir(BUILD_DIR, { recursive: true });
await cp(PUBLIC_DIR, BUILD_DIR, { recursive: true });
```

---

## 8. 开发工作流

### 8.1 开发命令

```bash
# 开发环境
npm run dev              # 启动开发服务器（监听文件变化）

# 代码质量
npm run typecheck        # TypeScript 类型检查
npm run lint             # ESLint 代码规范检查
npm run format           # Prettier 代码格式化

# 测试
npm run test:unit        # 单元测试
npm run test:e2e         # 端到端测试

# 构建
npm run build            # 生产构建（包含质量检查）
npm run build:fast       # 快速构建（跳过检查）

# 发布
npm run package          # 打包扩展
npm run release          # 创建发布版本
```

### 8.2 开发流程

1. **功能开发**

   ```bash
   # 1. 创建功能分支
   git checkout -b feature/new-clipper-feature

   # 2. 开发过程中持续运行
   npm run dev

   # 3. 编写测试
   npm run test:unit

   # 4. 代码质量检查
   npm run typecheck && npm run lint
   ```

2. **提交前检查**

   ```bash
   # 完整质量检查
   npm run quality

   # 完整测试套件
   npm run test:ci

   # 构建验证
   npm run build
   ```

---

## 9. 反模式和注意事项

### 9.1 架构反模式

#### ❌ 违反分层原则

```typescript
// ❌ 业务逻辑直接调用 Chrome API
export class ClipperService {
  async clipContent() {
    chrome.tabs.query({ active: true }, (tabs) => {
      // 违反分层
      // 业务逻辑
    });
  }
}
```

#### ✅ 正确的分层调用

```typescript
// ✅ 通过依赖注入使用平台服务
export class ClipperService {
  constructor(private tabsService: TabsService) {}

  async clipContent() {
    const currentTab = await this.tabsService.getCurrentTab();
    // 业务逻辑
  }
}
```

### 9.2 文件组织反模式

#### ❌ 错误的文件放置

```
src/
├── clipperUtils.ts              # ❌ 功能散乱
├── background/
│   ├── clipper.ts              # ❌ 职责不明确
│   └── clipper.test.ts         # ❌ 测试文件混放
└── utils/
    └── clipperHelpers.ts       # ❌ 重复的工具类
```

#### ✅ 正确的文件组织

```
src/
├── background/
│   ├── services/
│   │   └── clipperService.ts   # ✅ 明确的服务层
│   └── application/
│       └── clipProcessor.ts    # ✅ 明确的应用层
├── shared/
│   └── clipper/
│       ├── types.ts            # ✅ 共享类型
│       └── utils.ts            # ✅ 共享工具
└── tests/
    └── unit/
        └── clipperService.test.ts  # ✅ 测试文件分离
```

### 9.3 依赖管理反模式

#### ❌ 直接修改配置文件

```bash
# ❌ 不要直接编辑 package.json
vim package.json

# ❌ 不要手动修改 package-lock.json
vim package-lock.json
```

#### ✅ 使用包管理器

```bash
# ✅ 使用 npm 命令管理依赖
npm install package-name
npm uninstall package-name
npm update package-name
```

---

## 10. 快速参考

### 10.1 目录用途速查表

| 目录                          | 用途            | 示例文件                               |
| ----------------------------- | --------------- | -------------------------------------- |
| `src/platform/`               | Chrome API 抽象 | `chrome/tabs.ts`                       |
| `src/infrastructure/`         | 基础设施服务    | `restClient.ts`                        |
| `src/background/services/`    | 业务服务        | `clipperService.ts`                    |
| `src/background/application/` | 应用逻辑        | `clipProcessor.ts`                     |
| `src/content/`                | 内容脚本        | `clipper/index.ts`                     |
| `src/options/`                | 选项页面        | `components/VaultSelector.ts`          |
| `src/shared/`                 | 共享模块        | `types/`, `errors/`, `di/`             |
| `src/i18n/`                   | 国际化          | `messages.ts`, `locales/`              |
| `public/`                     | 静态资源        | `icons/`, `_locales/`, `manifest.json` |
| `tests/unit/`                 | 单元测试        | `clipperService.test.ts`               |
| `tests/e2e/`                  | 端到端测试      | `clipperFlow.test.ts`                  |

### 10.2 常用命令速查

| 任务     | 命令                |
| -------- | ------------------- |
| 开发调试 | `npm run dev`       |
| 类型检查 | `npm run typecheck` |
| 代码规范 | `npm run lint`      |
| 单元测试 | `npm run test:unit` |
| 完整构建 | `npm run build`     |
| 打包发布 | `npm run package`   |

### 10.3 路径引用速查

| 引用类型   | 示例                                              |
| ---------- | ------------------------------------------------- |
| 同层级模块 | `import { Service } from './service';`            |
| 跨层级模块 | `import { Utils } from '../../shared/utils';`     |
| 平台服务   | `import { getPlatformServices } from 'platform';` |
| 共享类型   | `import { AppError } from 'shared/errors';`       |
| 静态资源   | `'icons/bannerlogo-128.png'`                      |
| 本地化文件 | `'_locales/zh_CN/messages.json'`                  |

---

## 📝 更新日志

- **v1.0** (2025-10-16): 初始版本，基于目录重构后的项目结构制定

---

## 11. 具体场景指南

### 11.1 新增 Chrome API 抽象

当需要使用新的 Chrome API 时：

```typescript
// 1. 在 src/platform/interfaces/ 定义接口
export interface BookmarksService {
  create(bookmark: chrome.bookmarks.BookmarkTreeNode): Promise<chrome.bookmarks.BookmarkTreeNode>;
  search(query: string): Promise<chrome.bookmarks.BookmarkTreeNode[]>;
}

// 2. 在 src/platform/chrome/ 实现
export class ChromeBookmarksService implements BookmarksService {
  async create(
    bookmark: chrome.bookmarks.BookmarkTreeNode
  ): Promise<chrome.bookmarks.BookmarkTreeNode> {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.create(bookmark, (result) => {
        if (chrome.runtime.lastError) {
          reject(new ChromeApiError(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }
}

// 3. 在 src/platform/services.ts 注册
registry.register(PLATFORM_TOKENS.Bookmarks, () => new ChromeBookmarksService());
```

### 11.2 新增业务服务

```typescript
// 1. 定义服务接口 (src/shared/types/services.ts)
export interface BookmarkService {
  saveClip(content: ClipContent): Promise<void>;
  searchClips(query: string): Promise<ClipContent[]>;
}

// 2. 实现服务 (src/background/services/bookmarkService.ts)
export class BookmarkServiceImpl implements BookmarkService {
  constructor(
    private bookmarksApi: BookmarksService,
    private notificationService: NotificationService
  ) {}

  async saveClip(content: ClipContent): Promise<void> {
    try {
      await this.bookmarksApi.create({
        title: content.title,
        url: content.url
      });
      await this.notificationService.notifySuccess('书签保存成功');
    } catch (error) {
      throw new BookmarkError('保存书签失败', 'SAVE_FAILED', error);
    }
  }
}

// 3. 注册服务 (src/background/bootstrap.ts)
registry.register(
  SERVICE_TOKENS.Bookmark,
  () =>
    new BookmarkServiceImpl(
      getPlatformServices().bookmarks,
      registry.get(SERVICE_TOKENS.Notification)
    )
);
```

### 11.3 新增内容脚本功能

```typescript
// 1. 创建功能模块 (src/content/bookmark/bookmarkInjector.ts)
export class BookmarkInjector {
  private button: HTMLElement | null = null;

  inject(): void {
    this.createBookmarkButton();
    this.attachEventListeners();
  }

  private createBookmarkButton(): void {
    this.button = document.createElement('button');
    this.button.textContent = '保存书签';
    this.button.className = 'aiiin-bookmark-btn';
    document.body.appendChild(this.button);
  }

  private attachEventListeners(): void {
    this.button?.addEventListener('click', () => {
      this.handleBookmarkClick();
    });
  }
}

// 2. 在主入口注册 (src/content/index.ts)
import { BookmarkInjector } from './bookmark/bookmarkInjector';

const bookmarkInjector = new BookmarkInjector();
bookmarkInjector.inject();
```

### 11.4 新增选项页面组件

```typescript
// 1. 创建组件 (src/options/components/BookmarkSettings.ts)
export class BookmarkSettings {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = `
      <div class="bookmark-settings">
        <h3>书签设置</h3>
        <label>
          <input type="checkbox" id="auto-bookmark" />
          自动保存书签
        </label>
      </div>
    `;
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const checkbox = this.container.querySelector('#auto-bookmark') as HTMLInputElement;
    checkbox.addEventListener('change', (e) => {
      this.handleSettingChange(e.target.checked);
    });
  }
}

// 2. 在选项页面集成 (src/options/app/OptionsApp.ts)
import { BookmarkSettings } from '../components/BookmarkSettings';

export class OptionsApp {
  private bookmarkSettings: BookmarkSettings;

  constructor() {
    const container = document.getElementById('bookmark-settings-container')!;
    this.bookmarkSettings = new BookmarkSettings(container);
  }

  initialize(): void {
    this.bookmarkSettings.render();
  }
}
```

## 12. 国际化开发指南

### 12.1 添加新的本地化消息

```typescript
// 1. 在 src/i18n/messages.ts 定义消息键
export const MESSAGES = {
  // 现有消息...
  bookmarkSaved: 'bookmarkSaved',
  bookmarkFailed: 'bookmarkFailed',
  bookmarkSettings: 'bookmarkSettings'
} as const;

// 2. 在 public/_locales/en/messages.json 添加英文
{
  "bookmarkSaved": {
    "message": "Bookmark saved successfully"
  },
  "bookmarkFailed": {
    "message": "Failed to save bookmark: $ERROR$",
    "placeholders": {
      "error": {
        "content": "$1"
      }
    }
  }
}

// 3. 在 public/_locales/zh_CN/messages.json 添加中文
{
  "bookmarkSaved": {
    "message": "书签保存成功"
  },
  "bookmarkFailed": {
    "message": "保存书签失败：$ERROR$",
    "placeholders": {
      "error": {
        "content": "$1"
      }
    }
  }
}

// 4. 在代码中使用
import { getMessages, formatMessage } from '../i18n';

const messages = await getMessages();
console.log(messages.bookmarkSaved);

// 带参数的消息
const errorMsg = formatMessage(messages.bookmarkFailed, { error: 'Network timeout' });
```

### 12.2 国际化最佳实践

```typescript
// ✅ 正确：使用消息键
const messages = await getMessages();
showNotification(messages.clipSuccess);

// ❌ 错误：硬编码文本
showNotification('剪藏成功');

// ✅ 正确：参数化消息
const msg = formatMessage(messages.clipFailedWithReason, { reason: error.message });

// ❌ 错误：字符串拼接
const msg = messages.clipFailed + ': ' + error.message;
```

## 13. 错误处理最佳实践

### 13.1 创建领域特定错误

```typescript
// src/shared/errors/bookmarkErrors.ts
export class BookmarkError extends AppError {
  constructor(message: string, code: string, cause?: Error) {
    super('bookmark', message, ErrorSeverity.ERROR, code, cause);
  }
}

export const bookmarkErrors = {
  SAVE_FAILED: (cause?: Error) => new BookmarkError('保存书签失败', 'SAVE_FAILED', cause),
  INVALID_URL: (url: string) => new BookmarkError(`无效的URL: ${url}`, 'INVALID_URL'),
  PERMISSION_DENIED: () => new BookmarkError('没有书签权限', 'PERMISSION_DENIED')
};
```

### 13.2 错误处理模式

```typescript
// ✅ 正确的错误处理
export class BookmarkService {
  async saveBookmark(url: string): Promise<void> {
    try {
      if (!this.isValidUrl(url)) {
        throw bookmarkErrors.INVALID_URL(url);
      }

      await this.bookmarksApi.create({ url, title: 'New Bookmark' });
    } catch (error) {
      if (error instanceof BookmarkError) {
        throw error; // 重新抛出领域错误
      }

      // 包装未知错误
      throw bookmarkErrors.SAVE_FAILED(error);
    }
  }
}

// 调用方处理
try {
  await bookmarkService.saveBookmark(url);
} catch (error) {
  if (error instanceof BookmarkError) {
    await notificationService.notifyError(error.message);
  } else {
    await notificationService.notifyError('未知错误');
  }
}
```

## 14. 性能优化指南

### 14.1 懒加载模式

```typescript
// ✅ 懒加载大型模块
export class ClipperService {
  private aiExtractor: Promise<AiChatExtractor> | null = null;

  private async getAiExtractor(): Promise<AiChatExtractor> {
    if (!this.aiExtractor) {
      this.aiExtractor = import('../extractors/aiChatExtractor').then(
        (module) => new module.AiChatExtractor()
      );
    }
    return this.aiExtractor;
  }

  async extractAiChat(url: string): Promise<ChatContent> {
    const extractor = await this.getAiExtractor();
    return extractor.extract(url);
  }
}
```

### 14.2 缓存策略

```typescript
// ✅ 实现简单缓存
export class ConfigService {
  private cache = new Map<string, any>();
  private cacheExpiry = new Map<string, number>();

  async getConfig(key: string): Promise<any> {
    const cached = this.cache.get(key);
    const expiry = this.cacheExpiry.get(key);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    const value = await this.fetchConfig(key);
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + 5 * 60 * 1000); // 5分钟缓存

    return value;
  }
}
```

---

> 💡 **提示**: 遇到不确定的情况时，请参考现有代码中的最佳实践，或查阅项目的其他文档。保持代码的一致性是最重要的原则。

> 📚 **相关文档**:
>
> - [Chrome API 解耦指南](./chrome-api-decoupling-guide.md)
> - [目录重构计划](./directory-restructure-plan.md)
> - [目录重构最佳实践](./directory-restructure-best-practices.md)
