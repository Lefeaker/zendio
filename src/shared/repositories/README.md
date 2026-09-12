# Repository 层设计文档

## 为什么需要 Repository 层?

### 问题背景

当前架构存在**前后端逻辑混合**问题:

```typescript
// ❌ 问题代码示例（旧 Options UI 直接依赖 platform services）
class UsageDashboardView {
  async clearStats() {
    const { storage } = platformServices; // UI 直接依赖 chrome.storage
    await storage.local.remove('usageStats');
    this.updateUI(); // 手动同步 UI
  }
}
```

Usage statistics are a separate background-owned stream, not an Options field:

```typescript
class UsageDashboardPresenter {
  constructor(private readonly usageStats: UsageStatsClientLike) {}

  load(): Promise<UsageStats> {
    return this.usageStats.get();
  }

  reset(): Promise<UsageStats> {
    return this.usageStats.reset();
  }
}
```

Only the background usage queue reads/migrates/records/resets the canonical local `usageStats` key.

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
│  - OptionsMutationClient        │ ← runtime message client
│  - ChromeOptionsRepository      │ ← read/observe + background raw IO
│  - MockOptionsRepository        │ ← 测试用 Mock 实现
└─────────────────────────────────┘
          ↓ mutation message
┌─────────────────────────────────┐
│  Background authority           │
│  - OptionsMutationCoordinator   │ ← 唯一生产写 owner / FIFO
│  - UsageStatsStore              │ ← usage get/reset/record owner
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

class MyOptionsPresenter {
  private optionsRepo: IOptionsRepository;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    // 通过 DI 容器获取 Repository 实例
    this.optionsRepo = container.resolve<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  }

  // 读取配置
  async loadConfig(): Promise<void> {
    const options = await this.optionsRepo.get();
    console.log(options.privacyPreferences.analytics);
  }

  // 局部更新：只发送 schema 允许的路径
  async saveConfig(): Promise<void> {
    await this.optionsRepo.patch({
      path: ['privacyPreferences', 'analytics'],
      value: false
    });
    // 不需要手动调用 updateUI(),onChange 会自动触发
  }

  // 完整导入/重置：严格替换，不保留旧的未知 root
  async replaceConfig(imported: StoredOptions): Promise<void> {
    await this.optionsRepo.replace(imported);
  }

  // 订阅配置变更
  override renderWithState(): HTMLElement {
    this.unsubscribe = this.optionsRepo.onChange((options) => {
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
import { OptionsMutationError } from '@/shared/types/optionsMutationMessages';

async saveWithErrorHandling(): Promise<void> {
  try {
    await this.optionsRepo.patch({
      path: ['privacyPreferences', 'analytics'],
      value: false
    });
  } catch (error) {
    if (error instanceof OptionsMutationError) {
      // 包括 messaging 不可用、quota、外部同步冲突等稳定错误码
      alert(`配置保存失败: ${error.code}`);
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
    await mockRepo.patch({
      path: ['privacyPreferences', 'analytics'],
      value: false
    });

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
  replace(data: MyData): Promise<void>;
  onChange(callback: (data: MyData) => void): () => void;
}
```

### Step 2: 实现 Chrome 版本

```typescript
// src/infrastructure/repositories/ChromeMyRepository.ts
export class ChromeMyRepository implements IMyRepository {
  private listeners = new Set<Function>();

  async get(): Promise<MyData> {
    const { storage } = platformServices;
    const result = await storage.sync.get('myData');
    return result.myData ?? DEFAULT_DATA;
  }

  async replace(data: MyData): Promise<void> {
    const { storage } = platformServices;
    const validated = MyDataSchema.parse(data);
    await storage.sync.set({ myData: structuredClone(validated) });
    this.notifyListeners();
  }

  onChange(callback: (data: MyData) => void): () => void {
    this.listeners.add(callback);
    void this.get().then(callback); // 立即触发一次
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    void this.get().then((data) => {
      this.listeners.forEach((cb) => cb(data));
    });
  }
}
```

## 接口总览（2025-11-30）

| 接口                             | 职责              | 主要消费者                |
| -------------------------------- | ----------------- | ------------------------- |
| `IOptionsRepository`             | 配置存储          | Options Shell             |
| `IYamlRepository`                | YAML Overrides    | YAML editor, Reader/Video |
| `IMessagingRepository`           | Background 通信   | Content Scripts           |
| `IVideoClipRepository`           | 视频剪辑缓存/发送 | Video Session Exporter    |
| `IVideoPromptPositionRepository` | 浮窗位置          | Video Prompt              |
| `UsageStatsClientLike`           | Serialized usage  | Usage Dashboard           |
| `IVaultRouterRepository`         | 多仓路由          | Production Stitch storage |
| `IFragmentRepository`            | Clipper 片段缓存  | Fragment 工具链           |

> 详细设计参见 `docs/REPOSITORY-PATTERN.md`，迁移步骤参见 `docs/MIGRATION-GUIDE.md`。

## 文档与审计

- `docs/REPOSITORY-PATTERN.md`：设计原则、实践清单。
- `docs/MIGRATION-GUIDE.md`：迁移流程、Before/After 案例。
- `docs/251126-design-system-poc/REPO-MONTH3-SHARED-AUDIT.md`：最新审计报告。

所有 Repository 变更必须同步更新上述文档，以便审核团队追踪。

### Step 3: 实现 Mock 版本

```typescript
// tests/utils/repositories/MockMyRepository.ts
export class MockMyRepository implements IMyRepository {
  private data: MyData = DEFAULT_DATA;
  private listeners = new Set<Function>();

  async get(): Promise<MyData> {
    return structuredClone(this.data); // 防止引用泄漏
  }

  async replace(data: MyData): Promise<void> {
    this.data = structuredClone(data);
    this.listeners.forEach((cb) => cb(this.data));
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
  container.registerSingleton(DI_TOKENS.IMyRepository, ChromeMyRepository);
};
```

## 常见问题

### Q1: Repository 和 Service 有什么区别?

**A**:

- **Repository**: 专注于数据访问(CRUD),屏蔽底层 storage API
- **Service**: 专注于业务逻辑,可能组合多个 Repository

示例:

```typescript
// Options Repository: client 只负责读、订阅与发送显式 mutation command
class OptionsRepository {
  get(): Promise<CompleteOptions> {
    /* 从 read/observe provider 读取 */
  }
  patch(patches: OptionsPatch | readonly OptionsPatch[]): Promise<CompleteOptions> {
    /* 发消息给 background coordinator */
  }
  replace(options: StoredOptions): Promise<CompleteOptions> {
    /* 发 strict-replace command 给 background coordinator */
  }
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
// UI 层
async save(): Promise<void> {
  try {
    await this.optionsRepo.patch({
      path: ['privacyPreferences', 'analytics'],
      value: false
    });
    this.showSuccess('保存成功');
  } catch (error) {
    if (error instanceof OptionsMutationError) {
      this.showError(`保存失败: ${error.code}`);
    }
  }
}
```

### Q4: 测试时如何验证 onChange 被正确调用?

**A**: 使用 vi.fn() 创建 spy,验证调用次数和参数。

```typescript
it('should notify subscribers when data changes', async () => {
  const repo = new MockOptionsRepository();
  const callback = vi.fn();

  const unsubscribe = repo.onChange(callback);

  // 初始触发 1 次
  expect(callback).toHaveBeenCalledTimes(1);

  // 修改数据
  await repo.patch({
    path: ['privacyPreferences', 'analytics'],
    value: false
  });

  // 再次触发,总共 2 次
  expect(callback).toHaveBeenCalledTimes(2);
  expect(callback).toHaveBeenCalledWith(
    expect.objectContaining({ privacyPreferences: expect.objectContaining({ analytics: false }) })
  );

  unsubscribe();
});
```

## 迁移检查清单

重构一个 Section 时,确保完成以下步骤:

- [ ] 移除所有 `getPlatformServices` 调用
- [ ] 通过构造函数注入 `IOptionsRepository` / `IMessagingRepository`
- [ ] Options 局部更新使用 typed `patch`，导入/重置使用 strict `replace`
- [ ] Usage dashboard 通过 `UsageStatsClient` 读取/重置，不写 Options root 或 local key
- [ ] 在 `renderWithState()` 中订阅 `onChange`,实现被动 UI 更新
- [ ] 在 `destroy()` 中取消订阅,避免内存泄漏
- [ ] 补充单元测试,使用 `MockOptionsRepository`
- [ ] 验证 TypeScript 编译通过 (0 errors)
- [ ] 验证所有测试通过

## 参考资料

- [Martin Fowler: Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- [依赖倒置原则 (DIP)](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
- [单一真相源 (SSOT)](https://en.wikipedia.org/wiki/Single_source_of_truth)
