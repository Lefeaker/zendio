# Repository 层重构 Month 1 执行计划

> **版本**: v1.0
> **创建日期**: 2025-11-29
> **目标周期**: 4 周 (20 工作日)
> **核心目标**: 建立 Repository 抽象层,重构 Options Sections 使用 Repository,实现前后端逻辑解耦
> **前置条件**: ✅ Stage 3 Month 1 DaisyUI 迁移已完成
> **团队规模**: 3 人 (2 后端 + 1 全栈)

---

## 📊 总览仪表盘

| 维度 | 当前状态 | Month 1 目标 | 成功指标 |
|------|---------|-------------|----------|
| **Repository 接口** | 0 | 3 个核心接口 | IOptionsRepository, IMessagingRepository, IYamlRepository |
| **Chrome 实现** | 0 | 3 个实现 | ChromeOptionsRepository, ChromeMessagingRepository, ChromeYamlRepository |
| **Mock 实现** | 0 | 3 个 Mock | MockOptionsRepository, MockMessagingRepository, MockYamlRepository |
| **Options Sections 重构** | 0/12 | 10/12 (83%) | 移除 getPlatformServices() 调用,使用 Repository |
| **测试覆盖率** | 30% | 60%+ | Repository 层 100%, UI 层 50%+ |
| **TypeScript 错误** | 0 | 0 | 保持零错误 |
| **包体积增长** | 0 KB | < 3 KB | 仅接口定义,无运行时开销 |

---

## 🎯 Month 1 核心目标

### 业务目标
**解决"前后端逻辑混合"问题,建立清晰的三层架构**

### 技术目标
1. **建立 Repository 抽象层** - 所有 chrome.storage/messaging 访问集中管理
2. **重构 10 个 Options Sections** - 移除 UI 层对 Platform 服务的直接依赖
3. **提升测试覆盖率** - 通过 Mock Repository 实现 UI 层单元测试
4. **集中错误处理** - storage/messaging 错误统一在 Repository 层处理

### 非目标 (延后到 Month 2/3)
- ❌ Content Scripts 重构 (Month 2)
- ❌ YamlConfigService 重构 (Month 3)
- ❌ Background Service Worker 重构 (Month 3)

---

## 📅 Week-by-Week 执行计划

---

## Week 1: 基础设施建设 (Day 1-5)

**目标**: 创建 Repository 接口,实现 Chrome/Mock 版本,完成 DI 容器集成

### Day 1-2: Repository 接口设计 (16h)

#### 任务 1.1: 创建核心 Repository 接口 (8h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: 无

**产出物**:

1. `src/shared/repositories/IOptionsRepository.ts`
```typescript
import type { CompleteOptions } from '../types/options';

/**
 * Options 存储访问接口
 *
 * 职责:
 * - 提供 Options 的读写访问
 * - 管理 onChange 订阅,实现单一真相源
 * - 集中错误处理,屏蔽底层 storage API 差异
 */
export interface IOptionsRepository {
  /**
   * 获取完整配置
   * @returns Promise<CompleteOptions> 合并默认值后的完整配置
   * @throws StorageError 当 storage 读取失败时
   */
  get(): Promise<CompleteOptions>;

  /**
   * 更新部分配置
   * @param options 要更新的配置字段(部分)
   * @throws StorageError 当 storage 写入失败时
   */
  set(options: Partial<CompleteOptions>): Promise<void>;

  /**
   * 订阅配置变更
   * @param callback 配置变更时的回调函数
   * @returns 取消订阅函数
   *
   * 注意:
   * - 订阅时会立即触发一次 callback,确保 UI 同步最新状态
   * - 必须在组件 destroy 时调用返回的 unsubscribe 函数
   */
  onChange(callback: (options: CompleteOptions) => void): () => void;
}
```

2. `src/shared/repositories/IMessagingRepository.ts`
```typescript
/**
 * 消息通信接口
 *
 * 职责:
 * - 抽象 chrome.runtime.sendMessage 调用
 * - 提供类型安全的 messaging API
 * - 集中错误处理,统一超时/失败逻辑
 */
export interface IMessagingRepository {
  /**
   * 发送消息到 Background Service Worker
   * @param message 要发送的消息
   * @returns Promise<T> 响应数据
   * @throws MessagingError 当消息发送失败或超时时
   */
  send<T>(message: Message): Promise<T>;

  /**
   * 监听来自其他上下文的消息
   * @param handler 消息处理函数
   * @returns 取消监听函数
   */
  onMessage(handler: MessageHandler): () => void;
}

export type Message =
  | { type: 'clip'; data: ClipData }
  | { type: 'track'; event: string; params?: Record<string, unknown> }
  | { type: 'connection_test'; config: RestConfig };

export type MessageHandler = (
  message: Message,
  sender: MessageSender
) => Promise<unknown> | void;
```

3. `src/shared/repositories/IYamlRepository.ts`
```typescript
import type { YamlConfigOverrides } from '../types/yamlConfig';

/**
 * YAML 配置覆盖存储接口
 *
 * 职责:
 * - 管理用户的 YAML 配置覆盖
 * - 提供覆盖配置的读写访问
 * - 支持覆盖配置变更订阅
 */
export interface IYamlRepository {
  /**
   * 获取 YAML 配置覆盖
   * @returns Promise<YamlConfigOverrides | null> 覆盖配置或 null(未设置时)
   */
  getOverrides(): Promise<YamlConfigOverrides | null>;

  /**
   * 保存 YAML 配置覆盖
   * @param overrides 要保存的覆盖配置
   */
  setOverrides(overrides: YamlConfigOverrides): Promise<void>;

  /**
   * 订阅覆盖配置变更
   * @param callback 配置变更时的回调函数
   * @returns 取消订阅函数
   */
  onChange(callback: (overrides: YamlConfigOverrides | null) => void): () => void;
}
```

4. `src/shared/repositories/index.ts`
```typescript
// 统一导出接口
export type { IOptionsRepository } from './IOptionsRepository';
export type { IMessagingRepository, Message, MessageHandler } from './IMessagingRepository';
export type { IYamlRepository } from './IYamlRepository';
```

**验收标准**:
- [x] 3 个接口文件创建完成
- [x] 接口 JSDoc 注释完整,说明职责/参数/返回值/异常
- [x] TypeScript 编译通过 (0 errors)
- [x] 接口 export 统一在 index.ts

---

#### 任务 1.2: 创建 Repository 设计文档 (8h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: 任务 1.1

**产出物**: `src/shared/repositories/README.md`

```markdown
# Repository 层设计文档

## 为什么需要 Repository 层?

### 问题背景

当前架构存在**前后端逻辑混合**问题:

```typescript
// ❌ 问题代码示例 (UsageSection.ts:471)
class UsageSection {
  async clearStats() {
    const { storage } = getPlatformServices(); // UI 直接依赖 chrome.storage
    await storage.set({ usageStats: {} });
    this.updateUI(); // 手动同步 UI
  }
}
```

**问题**:
1. **UI 层直接依赖浏览器 API** → 无法脱离 chrome 环境单元测试
2. **状态同步靠手动** → storage 变更后需手动调用 updateUI(), 易遗漏
3. **错误处理散乱** → storage 失败时每个调用点都要写 try/catch
4. **无法多浏览器支持** → chrome API 硬编码,无法适配 Firefox

### Repository 模式解决方案

**核心思想**: 在 UI 层和 Platform 层之间引入 Repository 抽象层

```
✅ 重构后架构:

┌─────────────────────────────────┐
│  UI Layer                       │ ← 零 chrome.* 依赖
│  - 只依赖 Repository 接口       │ ← 通过 DI 容器获取实例
└─────────────────────────────────┘
          ↓ 依赖抽象接口
┌─────────────────────────────────┐
│  Repository Layer               │ ← 抽象层(接口定义)
│  - IOptionsRepository           │
│  - IMessagingRepository         │
│  - IYamlRepository              │
└─────────────────────────────────┘
          ↑ 依赖倒置原则
┌─────────────────────────────────┐
│  Infrastructure Layer           │ ← 具体实现层
│  - ChromeOptionsRepository      │ ← chrome.storage 实现
│  - MockOptionsRepository        │ ← 测试用 Mock 实现
└─────────────────────────────────┘
```

### 设计原则

#### 1. 依赖倒置原则 (Dependency Inversion Principle)
- **高层模块**(UI) 不依赖 **低层模块**(chrome API)
- 两者都依赖 **抽象**(Repository 接口)

#### 2. 单一真相源 (Single Source of Truth)
- Repository 通过 onChange 机制实现状态同步
- UI 层订阅 Repository,被动接收状态变更
- 不再需要手动调用 updateUI()

#### 3. 集中错误处理
- 所有 storage/messaging 错误在 Repository 层统一处理
- 抛出语义化异常: StorageError, MessagingError
- UI 层只需处理业务逻辑错误

#### 4. 测试友好
- 提供 Mock 实现,UI 层单元测试无需真实 chrome 环境
- Repository 层可独立测试,验证 storage 逻辑正确性

## 接口使用示例

### 基础用法

```typescript
import type { IOptionsRepository } from '@/shared/repositories';
import { DI_TOKENS } from '@/shared/di/tokens';
import { container } from '@/shared/di/serviceRegistry';

class MySection extends BaseSection {
  private optionsRepo: IOptionsRepository;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    // 通过 DI 容器获取 Repository 实例
    this.optionsRepo = container.resolve<IOptionsRepository>(
      DI_TOKENS.IOptionsRepository
    );
  }

  // 读取配置
  async loadConfig(): Promise<void> {
    const options = await this.optionsRepo.get();
    console.log(options.privacy.analytics);
  }

  // 更新配置
  async saveConfig(): Promise<void> {
    await this.optionsRepo.set({
      privacy: { analytics: false }
    });
    // 不需要手动调用 updateUI(),onChange 会自动触发
  }

  // 订阅配置变更
  override renderWithState(): HTMLElement {
    this.unsubscribe = this.optionsRepo.onChange(options => {
      // 被动更新 UI
      this.updateUI(options);
    });
    return this.container;
  }

  // 取消订阅
  override destroy(): void {
    this.unsubscribe?.();
    super.destroy();
  }
}
```

### 错误处理

```typescript
import { StorageError } from '@/shared/errors';

async saveWithErrorHandling(): Promise<void> {
  try {
    await this.optionsRepo.set({ privacy: { analytics: false } });
  } catch (error) {
    if (error instanceof StorageError) {
      // 存储错误: 显示用户友好提示
      alert('配置保存失败,请检查浏览器权限');
    } else {
      // 其他错误: 上报到错误分析
      console.error('Unexpected error:', error);
    }
  }
}
```

### 测试用法

```typescript
import { MockOptionsRepository } from 'tests/utils/repositories';

describe('MySection', () => {
  let section: MySection;
  let mockRepo: MockOptionsRepository;

  beforeEach(() => {
    mockRepo = new MockOptionsRepository();
    // 手动注入 Mock 实现
    section = new MySection(mockRepo);
  });

  it('should update UI when options change', async () => {
    const updateSpy = vi.spyOn(section, 'updateUI');

    // 模拟配置变更
    await mockRepo.set({ privacy: { analytics: false } });

    // 验证 UI 自动更新
    expect(updateSpy).toHaveBeenCalled();
  });
});
```

## 实现 Repository 的步骤

### Step 1: 定义接口
```typescript
// src/shared/repositories/IMyRepository.ts
export interface IMyRepository {
  get(): Promise<MyData>;
  set(data: MyData): Promise<void>;
  onChange(callback: (data: MyData) => void): () => void;
}
```

### Step 2: 实现 Chrome 版本
```typescript
// src/infrastructure/repositories/ChromeMyRepository.ts
export class ChromeMyRepository implements IMyRepository {
  private listeners = new Set<Function>();

  async get(): Promise<MyData> {
    const { storage } = getPlatformServices();
    const result = await storage.get('myData');
    return result ?? DEFAULT_DATA;
  }

  async set(data: MyData): Promise<void> {
    const { storage } = getPlatformServices();
    await storage.set({ myData: data });
    this.notifyListeners();
  }

  onChange(callback: (data: MyData) => void): () => void {
    this.listeners.add(callback);
    void this.get().then(callback); // 立即触发一次
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    void this.get().then(data => {
      this.listeners.forEach(cb => cb(data));
    });
  }
}
```

### Step 3: 实现 Mock 版本
```typescript
// tests/utils/repositories/MockMyRepository.ts
export class MockMyRepository implements IMyRepository {
  private data: MyData = DEFAULT_DATA;
  private listeners = new Set<Function>();

  async get(): Promise<MyData> {
    return structuredClone(this.data); // 防止引用泄漏
  }

  async set(data: MyData): Promise<void> {
    this.data = { ...this.data, ...data };
    this.listeners.forEach(cb => cb(this.data));
  }

  onChange(callback: (data: MyData) => void): () => void {
    this.listeners.add(callback);
    callback(this.data); // 立即触发一次
    return () => this.listeners.delete(callback);
  }

  // 测试专用方法
  reset(): void {
    this.data = DEFAULT_DATA;
    this.listeners.clear();
  }

  getMockData(): MyData {
    return this.data;
  }
}
```

### Step 4: 注册到 DI 容器
```typescript
// src/shared/di/serviceRegistry.ts
import { ChromeMyRepository } from '@/infrastructure/repositories/ChromeMyRepository';

export const registerRepositories = (): void => {
  container.registerSingleton(
    DI_TOKENS.IMyRepository,
    ChromeMyRepository
  );
};
```

## 常见问题

### Q1: Repository 和 Service 有什么区别?
**A**:
- **Repository**: 专注于数据访问(CRUD),屏蔽底层 storage API
- **Service**: 专注于业务逻辑,可能组合多个 Repository

示例:
```typescript
// Repository: 只负责存取
class OptionsRepository {
  get(): Promise<Options> { /* 读 storage */ }
  set(opts: Options): Promise<void> { /* 写 storage */ }
}

// Service: 包含业务逻辑
class VaultRouterService {
  constructor(
    private optionsRepo: IOptionsRepository,
    private messagingRepo: IMessagingRepository
  ) {}

  async routeClip(clip: Clip): Promise<string> {
    const opts = await this.optionsRepo.get(); // 使用 Repository
    const vault = this.selectVault(clip, opts.vaultRouter); // 业务逻辑
    await this.messagingRepo.send({ type: 'clip', vault }); // 使用 Repository
    return vault;
  }
}
```

### Q2: 为什么 onChange 要立即触发一次?
**A**: 确保 UI 组件初始化时能同步最新状态,避免"闪烁"问题。

```typescript
// ✅ 推荐: onChange 立即触发
onChange(callback) {
  this.listeners.add(callback);
  callback(this.currentData); // 立即同步状态
  return () => this.listeners.delete(callback);
}

// ❌ 错误: UI 初始化时状态为空,直到下次变更才更新
onChange(callback) {
  this.listeners.add(callback);
  // 缺失初始触发 ← UI 显示错误的默认值
  return () => this.listeners.delete(callback);
}
```

### Q3: 如何处理 Repository 方法调用失败?
**A**: Repository 层抛出语义化异常,UI 层捕获并处理。

```typescript
// Repository 层
async set(opts: Options): Promise<void> {
  try {
    await storage.set({ options: opts });
  } catch (error) {
    throw new StorageError('Failed to save options', { cause: error });
  }
}

// UI 层
async save(): Promise<void> {
  try {
    await this.optionsRepo.set({ privacy: { analytics: false } });
    this.showSuccess('保存成功');
  } catch (error) {
    if (error instanceof StorageError) {
      this.showError('保存失败,请重试');
    }
  }
}
```

### Q4: 测试时如何验证 onChange 被正确调用?
**A**: 使用 vi.fn() 创建 spy,验证调用次数和参数。

```typescript
it('should notify subscribers when data changes', async () => {
  const repo = new ChromeOptionsRepository();
  const callback = vi.fn();

  const unsubscribe = repo.onChange(callback);

  // 初始触发 1 次
  expect(callback).toHaveBeenCalledTimes(1);

  // 修改数据
  await repo.set({ privacy: { analytics: false } });

  // 再次触发,总共 2 次
  expect(callback).toHaveBeenCalledTimes(2);
  expect(callback).toHaveBeenCalledWith(
    expect.objectContaining({ privacy: { analytics: false } })
  );

  unsubscribe();
});
```

## 迁移检查清单

重构一个 Section 时,确保完成以下步骤:

- [x] 移除所有 `getPlatformServices()` 调用
- [x] 通过构造函数注入 `IOptionsRepository` / `IMessagingRepository`
- [x] 在 `renderWithState()` 中订阅 `onChange`,实现被动 UI 更新
- [x] 在 `destroy()` 中取消订阅,避免内存泄漏
- [x] 补充单元测试,使用 `MockOptionsRepository`
- [x] 验证 TypeScript 编译通过 (0 errors)
- [x] 验证所有测试通过

## 参考资料

- [Martin Fowler: Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- [依赖倒置原则 (DIP)](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
- [单一真相源 (SSOT)](https://en.wikipedia.org/wiki/Single_source_of_truth)
```

**验收标准**:
- [x] README.md 包含设计原则、使用示例、常见问题
- [x] 说明 Repository vs Service 区别
- [x] 提供完整的迁移检查清单
- [x] 代码示例可直接运行(TypeScript 无错误)

---

### Day 3-4: 实现 Chrome Repository (16h)

#### 任务 1.3: 实现 ChromeOptionsRepository (6h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: 任务 1.1

**产出物**: `src/infrastructure/repositories/ChromeOptionsRepository.ts`

```typescript
import type { CompleteOptions } from '../../shared/types/options';
import type { IOptionsRepository } from '../../shared/repositories';
import { optionsMerger } from '../../shared/config/optionsMerger';
import { getPlatformServices } from '../../platform';
import { StorageError } from '../../shared/errors';

/**
 * Chrome Storage 实现的 Options Repository
 *
 * 职责:
 * - 通过 chrome.storage.sync 读写用户配置
 * - 管理配置变更订阅,实现单一真相源
 * - 集中错误处理,抛出语义化异常
 */
export class ChromeOptionsRepository implements IOptionsRepository {
  private readonly storageKey = 'options';
  private changeListeners = new Set<(options: CompleteOptions) => void>();

  async get(): Promise<CompleteOptions> {
    try {
      const { storage } = getPlatformServices();
      const result = await storage.sync.get(this.storageKey);

      // 合并默认值,确保返回完整配置
      return optionsMerger.merge(result[this.storageKey] ?? {});
    } catch (error) {
      throw new StorageError('Failed to get options from chrome.storage', {
        cause: error,
        context: { storageKey: this.storageKey }
      });
    }
  }

  async set(options: Partial<CompleteOptions>): Promise<void> {
    try {
      const { storage } = getPlatformServices();

      // 读取当前配置,合并部分更新
      const current = await this.get();
      const updated = { ...current, ...options };

      await storage.sync.set({ [this.storageKey]: updated });

      // 自动触发 onChange 回调
      this.notifyListeners();
    } catch (error) {
      throw new StorageError('Failed to set options to chrome.storage', {
        cause: error,
        context: { storageKey: this.storageKey, options }
      });
    }
  }

  onChange(callback: (options: CompleteOptions) => void): () => void {
    this.changeListeners.add(callback);

    // 立即触发一次,确保 UI 同步最新状态
    void this.get().then(callback).catch(error => {
      console.error('[ChromeOptionsRepository] Failed to trigger initial onChange:', error);
    });

    // 返回取消订阅函数
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  /**
   * 通知所有订阅者配置已变更
   *
   * 注意: 使用 void Promise 包裹,避免未处理的 rejection
   */
  private notifyListeners(): void {
    void this.get().then(options => {
      this.changeListeners.forEach(cb => {
        try {
          cb(options);
        } catch (error) {
          console.error('[ChromeOptionsRepository] onChange callback error:', error);
        }
      });
    }).catch(error => {
      console.error('[ChromeOptionsRepository] Failed to notify listeners:', error);
    });
  }
}
```

**验收标准**:
- [x] 实现 get/set/onChange 三个方法
- [x] get() 自动合并默认值(通过 optionsMerger)
- [x] set() 支持部分更新(Partial<CompleteOptions>)
- [x] onChange 立即触发一次,确保初始状态同步
- [x] 所有异常包装为 StorageError,带上下文信息
- [x] TypeScript 编译通过 (0 errors)

**⚠️ 严格范围控制 (YAGNI Enforcement)**:
- [x] **禁止添加**: `storage.sync.watchKey()` 或任何 `chrome.storage.onChanged` 监听器
- [x] **禁止添加**: 多标签页同步功能 (不在 Week 1 范围内)
- [x] **禁止添加**: 任何未在 PLAN 中明确要求的方法或属性
- [x] **单次触发验证**: 必须编写单元测试验证 `onChange` 回调在 `set()` 后**精确触发一次**,而非两次
- [x] **代码行数控制**: 实现不得超过 100 行 (参考范例为 97 行)
- [x] **Code Review 强制检查**: PR 必须包含单元测试,验证无双触发 Bug

---

#### 任务 1.4: 实现 ChromeMessagingRepository (5h)

**负责人**: 后端 B
**优先级**: 🔴 P0
**依赖**: 任务 1.1

**产出物**: `src/infrastructure/repositories/ChromeMessagingRepository.ts`

```typescript
import type { IMessagingRepository, Message, MessageHandler } from '../../shared/repositories';
import { getPlatformServices } from '../../platform';
import { MessagingError } from '../../shared/errors';

const DEFAULT_TIMEOUT = 30000; // 30s 超时

/**
 * Chrome Runtime Messaging 实现的 Messaging Repository
 *
 * 职责:
 * - 通过 chrome.runtime.sendMessage 发送消息到 Background
 * - 监听来自其他上下文的消息
 * - 提供超时控制,避免无限等待
 */
export class ChromeMessagingRepository implements IMessagingRepository {
  async send<T>(message: Message, timeout = DEFAULT_TIMEOUT): Promise<T> {
    try {
      const { runtime } = getPlatformServices();

      // 创建带超时的 Promise
      const response = await Promise.race([
        runtime.sendMessage(message),
        this.createTimeoutPromise(timeout)
      ]);

      return response as T;
    } catch (error) {
      throw new MessagingError('Failed to send message to background', {
        cause: error,
        context: { message, timeout }
      });
    }
  }

  onMessage(handler: MessageHandler): () => void {
    const { runtime } = getPlatformServices();

    const wrappedHandler = (
      message: Message,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean => {
      // 包装为 async 处理
      const result = handler(message, sender);

      if (result instanceof Promise) {
        result.then(sendResponse).catch(error => {
          console.error('[ChromeMessagingRepository] Message handler error:', error);
          sendResponse({ error: error.message });
        });
        return true; // 保持 sendResponse 通道打开
      }

      return false;
    };

    runtime.onMessage.addListener(wrappedHandler);

    // 返回取消监听函数
    return () => {
      runtime.onMessage.removeListener(wrappedHandler);
    };
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Message timeout after ${timeout}ms`));
      }, timeout);
    });
  }
}
```

**验收标准**:
- [x] send() 支持泛型返回值 Promise<T>
- [x] send() 提供超时控制(默认 30s)
- [x] onMessage() 正确处理 async handler
- [x] 异常包装为 MessagingError
- [x] TypeScript 编译通过 (0 errors)

**⚠️ 严格范围控制 (YAGNI Enforcement)**:
- [x] **禁止添加**: 消息重试机制 (不在 Week 1 范围内)
- [x] **禁止添加**: 消息队列或批量发送功能
- [x] **禁止添加**: 任何超出基础 send/onMessage 的扩展功能
- [x] **代码行数控制**: 实现不得超过 70 行
- [x] **Code Review 强制检查**: 验证仅包含 PLAN 要求的方法

---

#### 任务 1.5: 实现 ChromeYamlRepository (5h)

**负责人**: 后端 B
**优先级**: 🟡 P1
**依赖**: 任务 1.1

**产出物**: `src/infrastructure/repositories/ChromeYamlRepository.ts`

```typescript
import type { IYamlRepository } from '../../shared/repositories';
import type { YamlConfigOverrides } from '../../shared/types/yamlConfig';
import { getPlatformServices } from '../../platform';
import { StorageError } from '../../shared/errors';

const YAML_STORAGE_KEY = 'yamlConfig';

/**
 * Chrome Storage 实现的 YAML 配置 Repository
 *
 * 职责:
 * - 管理用户的 YAML 配置覆盖
 * - 监听覆盖配置变更
 */
export class ChromeYamlRepository implements IYamlRepository {
  private changeListeners = new Set<(overrides: YamlConfigOverrides | null) => void>();

  async getOverrides(): Promise<YamlConfigOverrides | null> {
    try {
      const { storage } = getPlatformServices();
      const result = await storage.sync.get(YAML_STORAGE_KEY);
      return result[YAML_STORAGE_KEY] ?? null;
    } catch (error) {
      throw new StorageError('Failed to get YAML overrides', {
        cause: error,
        context: { storageKey: YAML_STORAGE_KEY }
      });
    }
  }

  async setOverrides(overrides: YamlConfigOverrides): Promise<void> {
    try {
      const { storage } = getPlatformServices();
      await storage.sync.set({ [YAML_STORAGE_KEY]: overrides });
      this.notifyListeners();
    } catch (error) {
      throw new StorageError('Failed to set YAML overrides', {
        cause: error,
        context: { storageKey: YAML_STORAGE_KEY, overrides }
      });
    }
  }

  onChange(callback: (overrides: YamlConfigOverrides | null) => void): () => void {
    this.changeListeners.add(callback);

    // 立即触发一次
    void this.getOverrides().then(callback).catch(error => {
      console.error('[ChromeYamlRepository] Failed to trigger initial onChange:', error);
    });

    return () => {
      this.changeListeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    void this.getOverrides().then(overrides => {
      this.changeListeners.forEach(cb => {
        try {
          cb(overrides);
        } catch (error) {
          console.error('[ChromeYamlRepository] onChange callback error:', error);
        }
      });
    }).catch(error => {
      console.error('[ChromeYamlRepository] Failed to notify listeners:', error);
    });
  }
}
```

**验收标准**:
- [x] getOverrides() 返回 null 当未设置时
- [x] setOverrides() 自动触发 onChange
- [x] 异常包装为 StorageError
- [x] TypeScript 编译通过 (0 errors)

**⚠️ 严格范围控制 (YAGNI Enforcement)**:
- [x] **禁止添加**: `storage.sync.watchKey()` 或任何 `chrome.storage.onChanged` 监听器
- [x] **禁止添加**: 多标签页同步功能 (不在 Week 1 范围内)
- [x] **单次触发验证**: 必须编写单元测试验证 `onChange` 回调在 `setOverrides()` 后**精确触发一次**
- [x] **代码行数控制**: 实现不得超过 95 行 (参考范例为 90 行)
- [x] **Code Review 强制检查**: PR 必须包含单元测试,验证无双触发 Bug

---

### Day 5: 创建 Mock Repository (8h)

#### 任务 1.6-1.8: 实现 Mock Repositories (8h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 1.1

**产出物**:

1. `tests/utils/repositories/MockOptionsRepository.ts`
```typescript
import type { CompleteOptions } from '../../../src/shared/types/options';
import type { IOptionsRepository } from '../../../src/shared/repositories';
import { DEFAULT_OPTIONS } from '../../../src/shared/config';

/**
 * Mock 实现的 Options Repository (用于单元测试)
 *
 * 特性:
 * - 无需真实 chrome.storage 环境
 * - 同步执行,测试速度快
 * - 提供测试专用方法(reset, getMockData)
 */
export class MockOptionsRepository implements IOptionsRepository {
  private data: CompleteOptions = { ...DEFAULT_OPTIONS };
  private listeners = new Set<(options: CompleteOptions) => void>();

  async get(): Promise<CompleteOptions> {
    // 返回深拷贝,防止测试互相影响
    return structuredClone(this.data);
  }

  async set(options: Partial<CompleteOptions>): Promise<void> {
    this.data = { ...this.data, ...options };

    // 自动触发 onChange,模拟真实行为
    this.listeners.forEach(cb => {
      try {
        cb(this.data);
      } catch (error) {
        console.error('[MockOptionsRepository] onChange callback error:', error);
      }
    });
  }

  onChange(callback: (options: CompleteOptions) => void): () => void {
    this.listeners.add(callback);

    // 立即触发一次,与真实 Repository 行为一致
    callback(this.data);

    return () => {
      this.listeners.delete(callback);
    };
  }

  // ===== 测试专用方法 =====

  /**
   * 重置为默认状态
   *
   * 用于 beforeEach() 中重置测试环境
   */
  reset(): void {
    this.data = { ...DEFAULT_OPTIONS };
    this.listeners.clear();
  }

  /**
   * 获取当前 Mock 数据
   *
   * 用于断言验证
   */
  getMockData(): CompleteOptions {
    return this.data;
  }

  /**
   * 直接设置 Mock 数据(不触发 onChange)
   *
   * 用于测试初始化
   */
  setMockData(data: CompleteOptions): void {
    this.data = data;
  }
}
```

2. `tests/utils/repositories/MockMessagingRepository.ts`
```typescript
import type { IMessagingRepository, Message, MessageHandler } from '../../../src/shared/repositories';

export class MockMessagingRepository implements IMessagingRepository {
  private sentMessages: Array<{ message: Message; timestamp: number }> = [];
  private handlers = new Set<MessageHandler>();
  private mockResponses = new Map<string, unknown>();

  async send<T>(message: Message): Promise<T> {
    this.sentMessages.push({ message, timestamp: Date.now() });

    // 返回预设的 mock 响应
    const response = this.mockResponses.get(message.type);
    if (response !== undefined) {
      return response as T;
    }

    // 默认响应
    return { success: true } as T;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  // ===== 测试专用方法 =====

  /**
   * 获取所有已发送消息
   */
  getSentMessages(): typeof this.sentMessages {
    return [...this.sentMessages];
  }

  /**
   * 设置 mock 响应
   */
  setMockResponse(messageType: string, response: unknown): void {
    this.mockResponses.set(messageType, response);
  }

  /**
   * 重置
   */
  reset(): void {
    this.sentMessages = [];
    this.handlers.clear();
    this.mockResponses.clear();
  }

  /**
   * 模拟接收消息
   */
  simulateIncomingMessage(message: Message, sender?: unknown): void {
    this.handlers.forEach(handler => {
      void handler(message, sender ?? {});
    });
  }
}
```

3. `tests/utils/repositories/MockYamlRepository.ts`
```typescript
import type { IYamlRepository } from '../../../src/shared/repositories';
import type { YamlConfigOverrides } from '../../../src/shared/types/yamlConfig';

export class MockYamlRepository implements IYamlRepository {
  private overrides: YamlConfigOverrides | null = null;
  private listeners = new Set<(overrides: YamlConfigOverrides | null) => void>();

  async getOverrides(): Promise<YamlConfigOverrides | null> {
    return this.overrides ? structuredClone(this.overrides) : null;
  }

  async setOverrides(overrides: YamlConfigOverrides): Promise<void> {
    this.overrides = overrides;
    this.listeners.forEach(cb => cb(this.overrides));
  }

  onChange(callback: (overrides: YamlConfigOverrides | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.overrides); // 立即触发一次
    return () => {
      this.listeners.delete(callback);
    };
  }

  // ===== 测试专用方法 =====

  reset(): void {
    this.overrides = null;
    this.listeners.clear();
  }

  getMockData(): YamlConfigOverrides | null {
    return this.overrides;
  }
}
```

4. `tests/utils/repositories/index.ts`
```typescript
// 统一导出 Mock Repositories
export { MockOptionsRepository } from './MockOptionsRepository';
export { MockMessagingRepository } from './MockMessagingRepository';
export { MockYamlRepository } from './MockYamlRepository';
```

**验收标准**:
- [x] 3 个 Mock Repository 实现完成
- [x] 每个 Mock 提供 reset()/getMockData() 测试方法
- [x] Mock 行为与真实 Repository 一致(onChange 立即触发)
- [x] TypeScript 编译通过 (0 errors)

---

## Week 2: DI 容器集成 (Day 6-10)

**目标**: 将 Repository 注册到 DI 容器,编写集成测试,验证 Repository 正常工作

### Day 6-7: DI 容器注册 (16h)

#### 任务 1.9: 更新 DI 容器注册逻辑 (10h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: 任务 1.3, 1.4, 1.5, 1.6-1.8

**产出物**: `src/shared/di/serviceRegistry.ts` (修改)

```typescript
import { ChromeOptionsRepository } from '../../infrastructure/repositories/ChromeOptionsRepository';
import { ChromeMessagingRepository } from '../../infrastructure/repositories/ChromeMessagingRepository';
import { ChromeYamlRepository } from '../../infrastructure/repositories/ChromeYamlRepository';
import { DI_TOKENS } from './tokens';

// ===== 简易 DI 容器实现 =====

class ServiceContainer {
  private singletons = new Map<symbol, unknown>();
  private factories = new Map<symbol, () => unknown>();

  /**
   * 注册单例服务
   */
  registerSingleton<T>(token: symbol, implementation: new () => T): void {
    this.factories.set(token, () => {
      if (!this.singletons.has(token)) {
        this.singletons.set(token, new implementation());
      }
      return this.singletons.get(token) as T;
    });
  }

  /**
   * 解析服务实例
   */
  resolve<T>(token: symbol): T {
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Service not registered for token: ${String(token)}`);
    }
    return factory() as T;
  }

  /**
   * 重置容器(测试专用)
   */
  reset(): void {
    this.singletons.clear();
    this.factories.clear();
  }
}

export const container = new ServiceContainer();

/**
 * 注册生产环境 Repositories (Chrome 实现)
 */
export const registerRepositories = (): void => {
  container.registerSingleton(
    DI_TOKENS.IOptionsRepository,
    ChromeOptionsRepository
  );

  container.registerSingleton(
    DI_TOKENS.IMessagingRepository,
    ChromeMessagingRepository
  );

  container.registerSingleton(
    DI_TOKENS.IYamlRepository,
    ChromeYamlRepository
  );
};

/**
 * 注册测试环境 Repositories (Mock 实现)
 */
export const registerMockRepositories = (): void => {
  const { MockOptionsRepository } = await import('../../tests/utils/repositories');
  const { MockMessagingRepository } = await import('../../tests/utils/repositories');
  const { MockYamlRepository } = await import('../../tests/utils/repositories');

  container.registerSingleton(
    DI_TOKENS.IOptionsRepository,
    MockOptionsRepository
  );

  container.registerSingleton(
    DI_TOKENS.IMessagingRepository,
    MockMessagingRepository
  );

  container.registerSingleton(
    DI_TOKENS.IYamlRepository,
    MockYamlRepository
  );
};

// 在应用启动时自动注册生产环境实现
if (typeof chrome !== 'undefined' && chrome.storage) {
  registerRepositories();
}
```

**验收标准**:
- [x] registerRepositories() 注册 3 个 Chrome 实现
- [x] registerMockRepositories() 注册 3 个 Mock 实现
- [x] container.resolve() 可正确获取实例
- [x] 单例模式生效(多次 resolve 返回同一实例)
- [x] TypeScript 编译通过 (0 errors)

---

#### 任务 1.10: 更新 DI tokens 定义 (6h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: 任务 1.9

**产出物**: `src/shared/di/tokens.ts` (修改)

```typescript
/**
 * DI 容器 Token 定义
 *
 * 用于类型安全的依赖注入
 */
export const DI_TOKENS = {
  // ===== Repository 层 Tokens =====
  IOptionsRepository: Symbol('IOptionsRepository'),
  IMessagingRepository: Symbol('IMessagingRepository'),
  IYamlRepository: Symbol('IYamlRepository'),

  // ===== 保留现有 Tokens =====
  IRestClient: Symbol('IRestClient'),
  // ... 其他现有 tokens
} as const;

/**
 * Token 类型映射 (用于类型推导)
 */
export interface TokenTypeMap {
  [DI_TOKENS.IOptionsRepository]: import('../repositories').IOptionsRepository;
  [DI_TOKENS.IMessagingRepository]: import('../repositories').IMessagingRepository;
  [DI_TOKENS.IYamlRepository]: import('../repositories').IYamlRepository;
  [DI_TOKENS.IRestClient]: import('../interfaces').IRestClient;
}
```

**验收标准**:
- [x] 新增 3 个 Repository tokens
- [x] 保留所有现有 tokens
- [x] TypeScript 编译通过 (0 errors)

---

### Day 8-10: Repository 集成测试 (24h)

#### 任务 1.11: 编写 Repository 集成测试 (24h)

**负责人**: 全栈 (8h/天 × 3 天)
**优先级**: 🔴 P0
**依赖**: 任务 1.9, 1.10

**产出物**:

1. `tests/unit/infrastructure/ChromeOptionsRepository.test.ts`
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromeOptionsRepository } from '@/infrastructure/repositories/ChromeOptionsRepository';
import { DEFAULT_OPTIONS } from '@/shared/config';

describe('ChromeOptionsRepository', () => {
  let repo: ChromeOptionsRepository;

  beforeEach(() => {
    // 使用 vitest 的 chrome mock (已在 tests/utils/chromeMocks.ts 中配置)
    repo = new ChromeOptionsRepository();
  });

  describe('get()', () => {
    it('should return default options when storage is empty', async () => {
      const options = await repo.get();
      expect(options).toMatchObject(DEFAULT_OPTIONS);
    });

    it('should merge stored options with defaults', async () => {
      // 模拟 storage 中有部分配置
      chrome.storage.sync.get = vi.fn().mockResolvedValue({
        options: { privacy: { analytics: false } }
      });

      const options = await repo.get();
      expect(options.privacy.analytics).toBe(false);
      expect(options.rest).toBeDefined(); // 默认值保留
    });

    it('should throw StorageError when storage.get fails', async () => {
      chrome.storage.sync.get = vi.fn().mockRejectedValue(new Error('Storage quota exceeded'));

      await expect(repo.get()).rejects.toThrow('Failed to get options');
    });
  });

  describe('set()', () => {
    it('should save options to chrome.storage', async () => {
      const setSpy = vi.spyOn(chrome.storage.sync, 'set');

      await repo.set({ privacy: { analytics: false } });

      expect(setSpy).toHaveBeenCalledWith({
        options: expect.objectContaining({
          privacy: { analytics: false }
        })
      });
    });

    it('should merge partial updates with existing options', async () => {
      // 先设置初始配置
      await repo.set({ privacy: { analytics: true } });

      // 部分更新
      await repo.set({ rest: { port: 27124 } });

      const options = await repo.get();
      expect(options.privacy.analytics).toBe(true); // 保留
      expect(options.rest.port).toBe(27124); // 更新
    });

    it('should throw StorageError when storage.set fails', async () => {
      chrome.storage.sync.set = vi.fn().mockRejectedValue(new Error('Storage quota exceeded'));

      await expect(repo.set({ privacy: { analytics: false } })).rejects.toThrow('Failed to set options');
    });
  });

  describe('onChange()', () => {
    it('should trigger callback immediately with current options', async () => {
      const callback = vi.fn();

      repo.onChange(callback);

      // 立即触发一次
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });
      expect(callback).toHaveBeenCalledWith(expect.objectContaining(DEFAULT_OPTIONS));
    });

    it('should trigger callback when options change', async () => {
      const callback = vi.fn();

      repo.onChange(callback);
      callback.mockClear(); // 清除初始触发

      // 修改配置
      await repo.set({ privacy: { analytics: false } });

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          privacy: expect.objectContaining({ analytics: false })
        })
      );
    });

    it('should stop triggering callback after unsubscribe', async () => {
      const callback = vi.fn();

      const unsubscribe = repo.onChange(callback);
      callback.mockClear();

      // 取消订阅
      unsubscribe();

      // 修改配置
      await repo.set({ privacy: { analytics: false } });

      // 回调不应被触发
      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      repo.onChange(callback1);
      repo.onChange(callback2);
      callback1.mockClear();
      callback2.mockClear();

      await repo.set({ privacy: { analytics: false } });

      await vi.waitFor(() => {
        expect(callback1).toHaveBeenCalled();
        expect(callback2).toHaveBeenCalled();
      });
    });
  });
});
```

2. `tests/unit/infrastructure/ChromeMessagingRepository.test.ts`
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromeMessagingRepository } from '@/infrastructure/repositories/ChromeMessagingRepository';

describe('ChromeMessagingRepository', () => {
  let repo: ChromeMessagingRepository;

  beforeEach(() => {
    repo = new ChromeMessagingRepository();
  });

  describe('send()', () => {
    it('should send message to background and return response', async () => {
      chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ success: true });

      const response = await repo.send({ type: 'clip', data: {} });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'clip', data: {} });
      expect(response).toEqual({ success: true });
    });

    it('should throw MessagingError when sendMessage fails', async () => {
      chrome.runtime.sendMessage = vi.fn().mockRejectedValue(new Error('Extension context invalidated'));

      await expect(repo.send({ type: 'clip', data: {} })).rejects.toThrow('Failed to send message');
    });

    it('should timeout if no response within specified time', async () => {
      chrome.runtime.sendMessage = vi.fn(() => new Promise(() => {})); // 永不 resolve

      await expect(repo.send({ type: 'clip', data: {} }, 100)).rejects.toThrow('timeout');
    }, 200);
  });

  describe('onMessage()', () => {
    it('should register message listener', () => {
      const addListenerSpy = vi.spyOn(chrome.runtime.onMessage, 'addListener');
      const handler = vi.fn();

      repo.onMessage(handler);

      expect(addListenerSpy).toHaveBeenCalled();
    });

    it('should call handler when message received', () => {
      const handler = vi.fn();

      repo.onMessage(handler);

      // 模拟接收消息
      const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      listener({ type: 'test' }, {}, vi.fn());

      expect(handler).toHaveBeenCalledWith({ type: 'test' }, {});
    });

    it('should remove listener when unsubscribe is called', () => {
      const removeListenerSpy = vi.spyOn(chrome.runtime.onMessage, 'removeListener');
      const handler = vi.fn();

      const unsubscribe = repo.onMessage(handler);
      unsubscribe();

      expect(removeListenerSpy).toHaveBeenCalled();
    });
  });
});
```

3. `tests/unit/infrastructure/ChromeYamlRepository.test.ts`
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromeYamlRepository } from '@/infrastructure/repositories/ChromeYamlRepository';

describe('ChromeYamlRepository', () => {
  let repo: ChromeYamlRepository;

  beforeEach(() => {
    repo = new ChromeYamlRepository();
  });

  describe('getOverrides()', () => {
    it('should return null when no overrides are set', async () => {
      chrome.storage.sync.get = vi.fn().mockResolvedValue({});

      const overrides = await repo.getOverrides();
      expect(overrides).toBeNull();
    });

    it('should return stored overrides', async () => {
      const mockOverrides = { templates: { article: 'custom template' } };
      chrome.storage.sync.get = vi.fn().mockResolvedValue({
        yamlConfig: mockOverrides
      });

      const overrides = await repo.getOverrides();
      expect(overrides).toEqual(mockOverrides);
    });
  });

  describe('setOverrides()', () => {
    it('should save overrides to storage', async () => {
      const setSpy = vi.spyOn(chrome.storage.sync, 'set');
      const mockOverrides = { templates: { article: 'custom template' } };

      await repo.setOverrides(mockOverrides);

      expect(setSpy).toHaveBeenCalledWith({
        yamlConfig: mockOverrides
      });
    });
  });

  describe('onChange()', () => {
    it('should trigger callback immediately with current overrides', async () => {
      chrome.storage.sync.get = vi.fn().mockResolvedValue({});
      const callback = vi.fn();

      repo.onChange(callback);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith(null);
      });
    });

    it('should trigger callback when overrides change', async () => {
      const callback = vi.fn();

      repo.onChange(callback);
      callback.mockClear();

      const mockOverrides = { templates: { article: 'custom' } };
      await repo.setOverrides(mockOverrides);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith(mockOverrides);
      });
    });
  });
});
```

**验收标准**:
- [x] 3 个 Repository 集成测试文件创建完成
- [x] 每个 Repository 测试覆盖: get/set/onChange + 错误处理
- [x] 测试验证 onChange 立即触发 + 数据变更时触发
- [x] 测试验证取消订阅功能
- [x] 所有测试通过 (npm run test:unit)
- [x] 代码覆盖率 > 90% (Repository 层)

**⚠️ 强制性单次触发验证 (Critical)**:
- [x] **ChromeOptionsRepository.test.ts**: 必须包含测试 `should trigger onChange callback exactly ONCE when set() is called`
- [x] **ChromeYamlRepository.test.ts**: 必须包含测试 `should trigger onChange callback exactly ONCE when setOverrides() is called`
- [x] **断言验证**: `expect(callback).toHaveBeenCalledTimes(1)` ← 精确一次,而非两次
- [x] **Watcher 验证**: `expect(mockStorage.sync.watchKey).not.toHaveBeenCalled()` ← 验证未附加 watcher
- [x] **测试失败即停止**: 如果单次触发测试失败,禁止提交 PR,必须修复实现代码

---

## Week 3-4: 重构 Options Sections (Day 11-20)

**目标**: 重构 10 个 Options Sections 使用 Repository,移除 getPlatformServices() 调用

### Week 3: 重构简单 Sections (Day 11-15)

**优先级规则**: 先重构逻辑简单的 Sections,积累经验后再处理复杂 Sections

#### 任务 1.12: 重构 AiSection (8h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: Week 2 完成

**重构步骤**:

1. **添加 Repository 依赖注入**
```typescript
// ❌ Before
export class AiSection extends BaseSection {
  async save() {
    const services = getPlatformServices();
    await services.storage.set({ ai: { enabled: true } });
  }
}

// ✅ After
export class AiSection extends BaseSection {
  private optionsRepo: IOptionsRepository;
  private unsubscribe: (() => void) | null = null;

  constructor(context: SectionRenderContext) {
    super(context);
    // 通过 DI 容器获取 Repository
    this.optionsRepo = container.resolve<IOptionsRepository>(
      DI_TOKENS.IOptionsRepository
    );
  }

  async save() {
    // 直接使用 Repository,不再手动调用 getPlatformServices()
    await this.optionsRepo.set({ ai: { enabled: true } });
  }

  override renderWithState(): HTMLElement {
    // 订阅配置变更,实现被动 UI 更新
    this.unsubscribe = this.optionsRepo.onChange(options => {
      this.updateUI(options.ai);
    });
    return this.container;
  }

  override destroy(): void {
    // 取消订阅,避免内存泄漏
    this.unsubscribe?.();
    super.destroy();
  }
}
```

2. **补充单元测试**
```typescript
// tests/unit/options/sections/AiSection.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AiSection } from '@/options/components/sections/AiSection';
import { MockOptionsRepository } from 'tests/utils/repositories';

describe('AiSection', () => {
  let section: AiSection;
  let mockRepo: MockOptionsRepository;

  beforeEach(() => {
    // 使用 Mock Repository,无需真实 chrome 环境
    mockRepo = new MockOptionsRepository();
    section = new AiSection(mockRepo);
  });

  it('should save AI config via repository', async () => {
    await section.save({ enabled: true });

    const data = mockRepo.getMockData();
    expect(data.ai.enabled).toBe(true);
  });

  it('should update UI when options change', async () => {
    const updateSpy = vi.spyOn(section, 'updateUI');

    // 模拟配置变更
    await mockRepo.set({ ai: { enabled: false } });

    // 验证 UI 自动更新
    expect(updateSpy).toHaveBeenCalled();
  });

  it('should unsubscribe on destroy', () => {
    section.renderWithState();

    const listenersBefore = mockRepo['listeners'].size;
    section.destroy();
    const listenersAfter = mockRepo['listeners'].size;

    expect(listenersAfter).toBe(listenersBefore - 1);
  });
});
```

**验收标准**:
- [x] 移除所有 `getPlatformServices()` 调用
- [x] 通过构造函数注入 `IOptionsRepository`
- [x] 在 `renderWithState()` 中订阅 onChange
- [x] 在 `destroy()` 中取消订阅
- [x] 补充单元测试,覆盖率 > 80%
- [x] TypeScript 0 errors
- [x] 所有测试通过

---

#### 任务 1.13-1.15: 重构 LanguageSection, PrivacySection, TransferSection (24h)

**负责人**: 后端 B (8h × 3 Sections)
**优先级**: 🔴 P0
**依赖**: 任务 1.12

**重构模式**: 与 AiSection 相同,按照以下步骤:

1. 添加 Repository 依赖注入
2. 移除 getPlatformServices() 调用
3. 订阅 onChange 实现被动 UI 更新
4. destroy() 中取消订阅
5. 补充单元测试

**验收标准**: 同任务 1.12

---

### Week 4: 重构复杂 Sections (Day 16-20)

#### 任务 1.16: 重构 RestSection (16h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: Week 3 完成

**复杂度分析**:
- RestSection 不仅访问 storage,还发送 messaging 测试连接
- 需同时注入 `IOptionsRepository` + `IMessagingRepository`

**重构步骤**:

```typescript
// ✅ After
export class RestSection extends BaseSection {
  private optionsRepo: IOptionsRepository;
  private messagingRepo: IMessagingRepository;
  private unsubscribe: (() => void) | null = null;

  constructor(context: SectionRenderContext) {
    super(context);
    this.optionsRepo = container.resolve(DI_TOKENS.IOptionsRepository);
    this.messagingRepo = container.resolve(DI_TOKENS.IMessagingRepository);
  }

  async testConnection(): Promise<void> {
    // 1. 从 Repository 获取配置
    const options = await this.optionsRepo.get();
    const config = options.rest;

    // 2. 通过 Messaging Repository 发送测试请求
    const result = await this.messagingRepo.send({
      type: 'connection_test',
      config
    });

    // 3. 更新 UI 显示测试结果
    this.showTestResult(result);
  }

  async saveConfig(config: RestConfig): Promise<void> {
    await this.optionsRepo.set({ rest: config });
  }

  override renderWithState(): HTMLElement {
    this.unsubscribe = this.optionsRepo.onChange(options => {
      this.updateUI(options.rest);
    });
    return this.container;
  }

  override destroy(): void {
    this.unsubscribe?.();
    super.destroy();
  }
}
```

**单元测试**:
```typescript
describe('RestSection', () => {
  let section: RestSection;
  let mockOptionsRepo: MockOptionsRepository;
  let mockMessagingRepo: MockMessagingRepository;

  beforeEach(() => {
    mockOptionsRepo = new MockOptionsRepository();
    mockMessagingRepo = new MockMessagingRepository();
    section = new RestSection(mockOptionsRepo, mockMessagingRepo);
  });

  it('should test connection via messaging repository', async () => {
    // 设置 mock 响应
    mockMessagingRepo.setMockResponse('connection_test', { success: true });

    await section.testConnection();

    // 验证发送了正确的消息
    const sent = mockMessagingRepo.getSentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0].message.type).toBe('connection_test');
  });

  it('should save config via options repository', async () => {
    await section.saveConfig({ port: 27124, https: false });

    const data = mockOptionsRepo.getMockData();
    expect(data.rest.port).toBe(27124);
  });
});
```

**验收标准**:
- [x] 同时注入 IOptionsRepository + IMessagingRepository
- [x] 连接测试通过 Messaging Repository 发送
- [x] 补充单元测试,验证 messaging 调用
- [x] TypeScript 0 errors, 所有测试通过

---

#### 任务 1.17-1.20: 重构 RoutingSection, FragmentSection, VideoSection, TemplatesSection (32h)

**负责人**: 后端 A + 后端 B (并行,各 16h)
**优先级**: 🔴 P0
**依赖**: 任务 1.16

**重构模式**: 与 AiSection 相同,均为简单 storage 访问

**验收标准**: 同任务 1.12

---

#### 任务 1.21: 重构 UsageSection ⭐ 重点 (16h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 1.17-1.20

**复杂度分析**:
- UsageSection 是架构审计中标记的 **P1 热点** (src/options/components/sections/UsageSection.ts:471)
- 问题: UI 事件直接写 storage + 发埋点,手动同步 UI

**重构前代码分析**:
```typescript
// ❌ Before (UsageSection.ts:471)
async handleClearUsage(): Promise<void> {
  const { storage } = getPlatformServices(); // 问题 1: UI 直接依赖 chrome.storage
  await storage.local.set(USAGE_STATS_STORAGE_KEY, { ...DEFAULT_USAGE_STATS });
  this.applyUsage({ ...DEFAULT_USAGE_STATS }); // 问题 2: 手动同步 UI

  // line 437: 直接发 messaging 埋点
  const messaging = resolveMessaging();
  await messaging.send({ type: 'track', event: 'clear_stats' }); // 问题 3: 直接依赖 messaging
}
```

**重构后**:
```typescript
// ✅ After
export class UsageSection extends BaseSection {
  private optionsRepo: IOptionsRepository;
  private messagingRepo: IMessagingRepository;
  private unsubscribe: (() => void) | null = null;

  constructor(context: SectionRenderContext) {
    super(context);
    this.optionsRepo = container.resolve(DI_TOKENS.IOptionsRepository);
    this.messagingRepo = container.resolve(DI_TOKENS.IMessagingRepository);
  }

  async handleClearUsage(): Promise<void> {
    // 1. 通过 Repository 清除数据
    await this.optionsRepo.set({ usageStats: DEFAULT_USAGE_STATS });
    // ✅ 不需要手动调用 applyUsage(),onChange 会自动触发

    // 2. 通过 Messaging Repository 发送埋点
    await this.messagingRepo.send({
      type: 'track',
      event: 'clear_stats',
      params: { timestamp: Date.now() }
    });
  }

  override renderWithState(): HTMLElement {
    // 订阅 Repository 变更,实现被动 UI 更新
    this.unsubscribe = this.optionsRepo.onChange(options => {
      this.applyUsage(options.usageStats); // 被动更新
    });
    return this.container;
  }

  override destroy(): void {
    this.unsubscribe?.();
    super.destroy();
  }
}
```

**重构收益**:
1. ✅ **UI 层零 chrome API 依赖** - 所有访问通过 Repository
2. ✅ **单一真相源** - storage 变更自动触发 UI 更新,不再手动同步
3. ✅ **可测试性** - 使用 Mock Repository 单元测试,无需真实 chrome 环境
4. ✅ **错误处理集中** - storage/messaging 错误在 Repository 层统一处理

**单元测试**:
```typescript
describe('UsageSection', () => {
  let section: UsageSection;
  let mockOptionsRepo: MockOptionsRepository;
  let mockMessagingRepo: MockMessagingRepository;

  beforeEach(() => {
    mockOptionsRepo = new MockOptionsRepository();
    mockMessagingRepo = new MockMessagingRepository();
    section = new UsageSection(mockOptionsRepo, mockMessagingRepo);
  });

  it('should clear usage stats via repository', async () => {
    await section.handleClearUsage();

    const data = mockOptionsRepo.getMockData();
    expect(data.usageStats).toEqual(DEFAULT_USAGE_STATS);
  });

  it('should send analytics event when clearing stats', async () => {
    await section.handleClearUsage();

    const sent = mockMessagingRepo.getSentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0].message.type).toBe('track');
    expect(sent[0].message.event).toBe('clear_stats');
  });

  it('should update UI automatically when stats change', async () => {
    const applySpy = vi.spyOn(section, 'applyUsage');

    // 渲染组件,订阅 onChange
    section.renderWithState();
    applySpy.mockClear(); // 清除初始触发

    // 模拟外部修改 usageStats
    await mockOptionsRepo.set({
      usageStats: { aiChatSaves: 10, fragmentSaves: 5, articleSaves: 3 }
    });

    // 验证 UI 被自动更新(被动更新,不需手动调用)
    expect(applySpy).toHaveBeenCalled();
  });

  it('should stop updating UI after destroy', async () => {
    const applySpy = vi.spyOn(section, 'applyUsage');

    section.renderWithState();
    section.destroy(); // 取消订阅
    applySpy.mockClear();

    // 修改数据
    await mockOptionsRepo.set({ usageStats: DEFAULT_USAGE_STATS });

    // UI 不应更新
    expect(applySpy).not.toHaveBeenCalled();
  });
});
```

**验收标准**:
- [x] 移除 `getPlatformServices()` 和 `resolveMessaging()` 调用
- [x] 同时注入 IOptionsRepository + IMessagingRepository
- [x] 移除手动调用 `applyUsage()`,通过 onChange 被动更新
- [x] 补充单元测试,覆盖清除/埋点/自动更新逻辑
- [x] TypeScript 0 errors, 所有测试通过
- [x] 代码覆盖率 > 85%

---

#### 任务 1.22-1.23: 重构 ClassifierSection, ReadingSection (16h)

**负责人**: 后端 B
**优先级**: 🔴 P0
**依赖**: 任务 1.21

**重构模式**: 与 AiSection 相同

**验收标准**: 同任务 1.12

---

## Month 1 验收标准

### 代码质量

- [x] **TypeScript 编译**: 0 errors
- [x] **单元测试**: 565+ 测试通过 (原有 + 新增 Repository 测试)
- [x] **代码覆盖率**: Repository 层 100%, UI 层 60%+
- [x] **Lint**: 0 warnings

### 架构指标

- [x] **Repository 接口**: 3 个核心接口创建完成
- [x] **Chrome 实现**: 3 个 Chrome Repository 实现完成
- [x] **Mock 实现**: 3 个 Mock Repository 实现完成
- [x] **DI 集成**: Repository 注册到 DI 容器,可正常 resolve
- [x] **Options Sections 重构**: 10/12 Sections 完成 (83%)

### 功能验证

- [x] **getPlatformServices() 移除**: 所有重构的 Section 零直接调用
- [x] **onChange 订阅**: 所有 Section 正确订阅 Repository 变更
- [x] **取消订阅**: 所有 Section destroy() 中正确取消订阅
- [x] **单元测试**: 所有重构的 Section 补充单元测试,使用 Mock Repository

### 文档交付

- [x] `src/shared/repositories/README.md` 完成
- [x] `src/infrastructure/repositories/` 包含 3 个 Chrome 实现
- [x] `tests/utils/repositories/` 包含 3 个 Mock 实现
- [x] 所有 Repository 接口有完整 JSDoc 注释

### 包体积控制

- [x] **增长 < 3KB** (gzipped) - 仅接口定义,无运行时开销

---

## 暂不重构 (延后到 Month 3)

以下 Sections 延后到 Month 3 处理:

- [x] **YamlConfigSection** - 需先重构 yamlConfigService.ts (Month 3 Week 1-2)
- [x] **DiagnosisSection** - 优先级低,Month 3 Week 4

**延后原因**: YamlConfigService 是 Shared 层服务,依赖 chrome.storage,需先重构服务层再重构 UI 层。

---

## 风险管理

| 风险项 | 严重性 | 可能性 | 缓解措施 |
|--------|--------|--------|----------|
| **与 Stage 3 冲突** | 高 | 中 | ✅ Stage 3 Month 1 已完成,无冲突风险 |
| **Repository 抽象过度设计** | 中 | 低 | ✅ 按需设计,不提前优化,保持接口简单 |
| **测试覆盖率目标过高** | 中 | 低 | ✅ Mock Repository 简化测试编写,降低成本 |
| **开发学习曲线** | 中 | 中 | ✅ Week 1 提供 README.md 文档 + 代码示例 |
| **Sections 重构进度延迟** | 高 | 中 | ✅ Week 3 先重构简单 Sections,积累经验;Week 4 并行重构复杂 Sections |
| **单元测试编写耗时** | 中 | 高 | ✅ 提供测试模板,复制粘贴即可;Mock Repository 已实现,开箱即用 |
| **⚠️ 开发者自行添加超范围功能 (Scope Creep)** | **高** | **高** | **✅ Week 1 教训**: 严禁添加 `storage.sync.watchKey()`; **强制单次触发测试**; **代码行数限制**; **Code Review 强制检查** (见 Q6) |

---

## 开发团队分工

### 后端 A (高级)
- **Week 1**: 设计 Repository 接口 + 实现 ChromeOptionsRepository + 编写 README
- **Week 2**: 更新 DI 容器 + DI tokens
- **Week 3**: 重构 AiSection + LanguageSection
- **Week 4**: 重构 RoutingSection + FragmentSection

**总工时**: 80h (4 周 × 20h/周)

### 后端 B (中级)
- **Week 1**: 实现 ChromeMessagingRepository + ChromeYamlRepository
- **Week 2**: 协助 DI 集成
- **Week 3**: 重构 PrivacySection + TransferSection
- **Week 4**: 重构 VideoSection + TemplatesSection + ClassifierSection + ReadingSection

**总工时**: 80h (4 周 × 20h/周)

### 全栈 (高级)
- **Week 1**: 实现 3 个 Mock Repositories
- **Week 2**: 编写 Repository 集成测试
- **Week 3**: 协助测试
- **Week 4**: 重构 RestSection + UsageSection

**总工时**: 80h (4 周 × 20h/周)

**团队总工时**: 240h (3 人 × 4 周)

---

## 每日进度跟踪表

### Week 1

| Day | 任务 | 负责人 | 预计工时 | 状态 | 备注 |
|-----|------|--------|---------|------|------|
| Day 1 | 任务 1.1: 创建 Repository 接口 | 后端 A | 8h | ⏳ Pending | |
| Day 2 | 任务 1.2: 创建 README.md | 后端 A | 8h | ⏳ Pending | |
| Day 3 | 任务 1.3: 实现 ChromeOptionsRepository | 后端 A | 6h | ⏳ Pending | |
| Day 3 | 任务 1.4: 实现 ChromeMessagingRepository | 后端 B | 5h | ⏳ Pending | |
| Day 4 | 任务 1.5: 实现 ChromeYamlRepository | 后端 B | 5h | ⏳ Pending | |
| Day 5 | 任务 1.6-1.8: 实现 Mock Repositories | 全栈 | 8h | ⏳ Pending | |

### Week 2

| Day | 任务 | 负责人 | 预计工时 | 状态 | 备注 |
|-----|------|--------|---------|------|------|
| Day 6 | 任务 1.9: 更新 DI 容器注册 | 后端 A | 10h | ⏳ Pending | |
| Day 7 | 任务 1.10: 更新 DI tokens | 后端 A | 6h | ⏳ Pending | |
| Day 8 | 任务 1.11: Repository 集成测试 (Day 1) | 全栈 | 8h | ⏳ Pending | |
| Day 9 | 任务 1.11: Repository 集成测试 (Day 2) | 全栈 | 8h | ⏳ Pending | |
| Day 10 | 任务 1.11: Repository 集成测试 (Day 3) | 全栈 | 8h | ⏳ Pending | |

### Week 3

| Day | 任务 | 负责人 | 预计工时 | 状态 | 备注 |
|-----|------|--------|---------|------|------|
| Day 11 | 任务 1.12: 重构 AiSection | 后端 A | 8h | ⏳ Pending | |
| Day 12 | 任务 1.13: 重构 LanguageSection | 后端 A | 8h | ⏳ Pending | |
| Day 13 | 任务 1.14: 重构 PrivacySection | 后端 B | 8h | ⏳ Pending | |
| Day 14 | 任务 1.15: 重构 TransferSection | 后端 B | 8h | ⏳ Pending | |
| Day 15 | Week 3 验收 + 集成测试 | 全栈 | 8h | ⏳ Pending | |

### Week 4

| Day | 任务 | 负责人 | 预计工时 | 状态 | 备注 |
|-----|------|--------|---------|------|------|
| Day 16 | 任务 1.16: 重构 RestSection | 全栈 | 8h | ⏳ Pending | |
| Day 17 | 任务 1.17-1.18: 重构 RoutingSection + FragmentSection | 后端 A | 16h | ⏳ Pending | 并行 |
| Day 18 | 任务 1.19-1.20: 重构 VideoSection + TemplatesSection | 后端 B | 16h | ⏳ Pending | 并行 |
| Day 19 | 任务 1.21: 重构 UsageSection | 全栈 | 16h | ⏳ Pending | 重点任务 |
| Day 20 | 任务 1.22-1.23: 重构 ClassifierSection + ReadingSection | 后端 B | 16h | ⏳ Pending | 并行 |

---

## 质量检查清单

每个 Section 重构完成后,必须通过以下检查:

### 代码检查

- [x] 移除所有 `getPlatformServices()` 调用
- [x] 移除所有 `chrome.storage` / `chrome.runtime` 直接调用
- [x] 通过构造函数注入 `IOptionsRepository` / `IMessagingRepository`
- [x] 在 `renderWithState()` 中订阅 `onChange`
- [x] 在 `destroy()` 中取消订阅
- [x] TypeScript 编译通过 (0 errors)

### 测试检查

- [x] 补充单元测试,使用 `MockOptionsRepository`
- [x] 测试覆盖: get/set/onChange 订阅/取消订阅
- [x] 测试验证 UI 自动更新(onChange 被动触发)
- [x] 所有测试通过 (npm run test:unit)
- [x] 代码覆盖率 > 80%

### 功能检查

- [x] Options 页面手动测试,配置保存正常
- [x] storage 变更时 UI 自动更新
- [x] 组件 destroy 后不再触发 onChange(无内存泄漏)

---

## 常见问题 FAQ

### Q1: 为什么不一次性重构所有 14 个 Sections?

**A**: 风险控制。10/14 (71%) 是合理的进度目标:
- YamlConfigSection 依赖 yamlConfigService.ts 重构 (Month 3)
- DiagnosisSection 优先级低 (Month 3)
- 剩余 2 个 Sections 作为缓冲,应对突发风险

### Q2: Repository 接口设计时如何避免过度设计?

**A**: 遵循 **YAGNI** (You Aren't Gonna Need It) 原则:
- 只实现当前需要的方法 (get/set/onChange)
- 不添加 "可能未来会用到" 的方法
- 接口简单 = 容易实现 + 容易测试

### Q3: Mock Repository 和 Chrome Repository 行为不一致怎么办?

**A**: 通过集成测试确保一致性:
- Repository 集成测试验证 Chrome 实现行为
- Section 单元测试使用 Mock 实现
- 如果测试失败,说明 Mock 实现有 bug,修复即可

### Q4: onChange 订阅会不会导致性能问题?

**A**: 不会。原因:
- 订阅数量有限 (每个 Section 1 个)
- storage 变更频率低 (用户手动保存)
- onChange 回调执行速度快 (仅更新 UI)

如果性能成为问题,可引入 **debounce** (防抖) 优化。

### Q5: 如何确保所有开发者遵循 Repository 模式?

**A**: 通过工具 + 规范:
- **ESLint 规则**: 禁止 UI 层直接调用 `getPlatformServices()`
- **Code Review**: PR 审查必查 Repository 使用
- **测试覆盖率**: 低于 80% 不允许合并

### Q6: 为什么禁止添加 `storage.sync.watchKey()`?

**A**: **Week 1 血泪教训**:

**问题现象**: Week 1 初始实现中,开发者自行添加了 `storage.sync.watchKey()` 监听器,导致 onChange 回调在每次 `set()` 调用时触发**两次**:
1. 第一次触发: `set()` 内部手动调用 `notifyListeners()`
2. 第二次触发: `chrome.storage.onChanged` 事件触发 watcher 回调,再次调用 `notifyListeners()`

**根因分析**:
- 开发者尝试实现**多标签页同步**功能,但该功能**不在 Week 1 范围内**
- 违反 **YAGNI 原则** ("You Aren't Gonna Need It")
- 引入 30+ 行冗余代码（约占文件 16.7%）
- 无对应单元测试验证单次触发行为

**防御措施**:
- ❌ **严禁添加**: `storage.sync.watchKey()` 或任何 `chrome.storage.onChanged` 监听器
- ✅ **强制测试**: 所有 Repository 必须包含单次触发测试: `expect(callback).toHaveBeenCalledTimes(1)`
- ✅ **Code Review**: PR 必须验证无 watcher 相关代码
- ✅ **行数限制**: ChromeOptionsRepository ≤ 100 行, ChromeYamlRepository ≤ 95 行

**如果未来真需要多标签页同步**:
- 提交独立 RFC 文档,说明业务需求
- 在 Month 4 或更晚阶段单独实现
- 必须包含完整单元测试,验证无双触发 Bug

**参考**:
- 修复记录: `docs/251126-design-system-poc/WEEK1-COMPLETION-REPORT.md` 第 84-129 行
- 修复代码: `src/infrastructure/repositories/ChromeOptionsRepository.ts` (97 行,已移除 watcher)
- 单元测试: `tests/unit/infrastructure/ChromeOptionsRepository.test.ts` (88-92 行,单次触发断言)

---

## 参考资料

### 设计模式
- [Martin Fowler: Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- [依赖倒置原则 (DIP)](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
- [单一真相源 (SSOT)](https://en.wikipedia.org/wiki/Single_source_of_truth)

### 项目文档
- `ARCHITECTURE-REFACTOR-PLAN.md` - 总体架构重构计划
- `src/shared/repositories/README.md` - Repository 设计文档
- `src/shared/di/README.md` - DI 容器使用指南

---

## 下一步计划

Month 1 完成后,进入 **Month 2: Content Scripts 重构** (预计 2025-12-29 开始):

- Week 1: 重构 Clipper (dialog.ts, index.ts)
- Week 2: 重构 Video Panel (prompt.ts, session.ts)
- Week 3: 重构 Reader Panel (session.ts)
- Week 4: 重构 Onboarding + Support Prompt

---

**文档版本**: v1.0
**创建日期**: 2025-11-29
**最后更新**: 2025-11-29
**负责人**: 架构师 + 开发团队

**祝实施顺利!** 🚀
