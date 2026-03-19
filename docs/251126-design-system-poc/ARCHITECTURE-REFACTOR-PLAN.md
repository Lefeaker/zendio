# 架构重构计划 | Architecture Refactor Plan

> **版本**: v1.0
> **创建日期**: 2025-11-29
> **核心目标**: 解耦前后端逻辑,引入 Repository 层,提升测试覆盖率
> **预计周期**: 4 个月 (与 Stage 3 平行执行)
> **前置条件**: ✅ 阶段 0-2 已完成

---

## 2026-03-13 Tailwind 现状同步

- Content UI 的样式主路径已切到 Tailwind 产物 + 统一 Shadow bridge
- `SupportPrompt`、`Reader`、`Video`、`Clipper` 已退出业务层直接 runtime `<style>` 注入
- `shadowStyleBridge.ts` 当前仍保留受控 fallback `<style>`，原因是 Firefox content script 兼容性仍未完全退出主线
- `Options` 侧当前剩余 CSS 已进入结构兼容层判定，不再作为“大块 legacy CSS”叙述
- 已完成 Chromium 样本回放与真实扩展首开自动化样本，`build/dist` 下主线已能跑通 Options / SupportPrompt / Reader / YouTube video prompt

因此，架构计划中涉及样式系统的条目，后续应统一按以下事实表述：

1. Tailwind 主线已落地，剩余工作已进入验证与归档阶段
2. bridge 是受控过渡层，不是长期默认终态
3. 跨站点视频样本与人工浏览器回归仍是活跃未完成项

---

## 📋 问题诊断

### 当前架构缺陷

根据架构审计报告,发现 **7 个前后端混合热点**:

| 热点文件 | 问题症状 | 隐患等级 |
|---------|---------|---------|
| `src/content/index.ts:37` | 入口同时控 DOM + 调 messaging/storage | 🔴 P0 |
| `src/content/clipper/components/dialog.ts:92` | UI 组件直接注入 chrome.storage | 🔴 P0 |
| `src/content/video/prompt.ts:372` | 浮层既写 storage 又控 DOM | 🔴 P0 |
| `src/content/reader/session.ts:49` | Session 混有平台服务 + UI 逻辑 | 🟡 P1 |
| `src/onboarding/bootstrap.ts:83` | 按钮绑定混杂 chrome.tabs API | 🟡 P1 |
| `src/options/components/sections/UsageSection.ts:471` | UI 事件直接写 storage + 发埋点 | 🟡 P1 |
| `src/shared/services/yamlConfigService.ts:594` | "shared" 层直接访问 chrome.storage | 🔴 P0 |

### 根因分析

**根因 1: 缺失清晰的三层架构**

```
❌ 现状 (2.5层):
┌─────────────────────────────────┐
│  UI Layer                       │ ← 直接调用 chrome.storage
│  - 混杂 DOM + API 调用          │ ← 直接发 messaging
│  - 没有清晰边界                 │ ← 状态管理混乱
└─────────────────────────────────┘
          ↓ 混乱依赖
┌─────────────────────────────────┐
│  半吊子 Platform Layer          │ ← getPlatformServices() 只是薄封装
│  - 没有真正的抽象边界           │ ← chrome.* API 泄漏到 UI 层
└─────────────────────────────────┘
          ↓
┌─────────────────────────────────┐
│  Background Service Worker      │
└─────────────────────────────────┘
```

**根因 2: 没有"单一真相源" (Single Source of Truth)**

```typescript
// ❌ 状态分裂
UI 层: this.localState = { ... }
Storage: chrome.storage.sync.set({ ... })
Background: chrome.runtime.sendMessage({ ... })

// 谁是真相? 三者如何同步? 竞态如何处理?
```

**根因 3: 依赖方向倒置**

```
❌ 高层模块依赖低层模块:
UI → chrome.storage (UI 直接依赖浏览器 API)

✅ 应该依赖抽象:
UI → Repository Interface ← Chrome Implementation
```

### 影响评估

| 影响维度 | 当前状态 | 隐患 |
|---------|---------|------|
| **测试覆盖率** | 30% | 无法脱离 chrome API 单元测试,UI 逻辑难以验证 |
| **可维护性** | 低 | 前后端逻辑混杂,修改一处影响多处 |
| **可扩展性** | 差 | 无法复用到 Web 端,无法支持多浏览器 |
| **错误处理** | 散乱 | storage/messaging 错误处理散落各处,不统一 |
| **状态一致性** | 弱 | UI/storage/background 三者状态同步靠手动,竞态风险高 |

---

## 🎯 重构目标

### 总体目标

**建立清晰的三层架构,将数据访问集中到 Repository 层,UI 层零浏览器 API 依赖**

### 具体目标 (可量化)

1. **Repository 层覆盖**: 100% 的 chrome.storage/messaging 访问通过 Repository
2. **UI 层纯净度**: Options/Content Scripts 零 `chrome.*` 直接调用
3. **测试覆盖率**: 从 30% 提升到 80%+
4. **Mock 实现**: 为所有 Repository 提供 Mock 实现用于测试
5. **错误处理**: 集中化 storage/messaging 错误处理逻辑
6. **包体积控制**: 重构不增加包体积 (仅增加 < 5KB 接口定义)

---

## 📅 月度计划 (与 Stage 3 平行)

### 月度 1: Repository 基础设施 + Options Sections ⏱️ 4 周

#### 目标

建立 Repository 抽象层,重构 Options 页面 12 个 Sections 使用 Repository。

#### Week 1: 基础设施建设

##### Day 1-2: 设计 Repository 接口

- [ ] **任务 1.1**: 创建核心 Repository 接口
  ```typescript
  // src/shared/repositories/IOptionsRepository.ts
  export interface IOptionsRepository {
    get(): Promise<CompleteOptions>;
    set(options: Partial<CompleteOptions>): Promise<void>;
    onChange(callback: (options: CompleteOptions) => void): () => void;
  }

  // src/shared/repositories/IMessagingRepository.ts
  export interface IMessagingRepository {
    send<T>(message: Message): Promise<T>;
    onMessage(handler: MessageHandler): () => void;
  }

  // src/shared/repositories/IYamlRepository.ts
  export interface IYamlRepository {
    getOverrides(): Promise<YamlConfigOverrides | null>;
    setOverrides(overrides: YamlConfigOverrides): Promise<void>;
    onChange(callback: (overrides: YamlConfigOverrides | null) => void): () => void;
  }
  ```

- [ ] **任务 1.2**: 创建 Repository 设计文档
  - 在 `src/shared/repositories/README.md` 记录设计原则
  - 说明为何需要 Repository 层
  - 提供接口使用示例

##### Day 3-4: 实现 Chrome Repository

- [ ] **任务 1.3**: 实现 ChromeOptionsRepository
  ```typescript
  // src/infrastructure/repositories/ChromeOptionsRepository.ts
  export class ChromeOptionsRepository implements IOptionsRepository {
    private readonly storageKey = 'options';
    private changeListeners = new Set<(options: CompleteOptions) => void>();

    async get(): Promise<CompleteOptions> {
      try {
        const { storage } = getPlatformServices();
        const result = await storage.get(this.storageKey);
        return optionsMerger.merge(result ?? {});
      } catch (error) {
        // 集中错误处理
        throw new StorageError('Failed to get options', { cause: error });
      }
    }

    async set(options: Partial<CompleteOptions>): Promise<void> {
      try {
        const { storage } = getPlatformServices();
        await storage.set({ [this.storageKey]: options });
        // 自动触发 onChange 回调
        this.notifyListeners();
      } catch (error) {
        throw new StorageError('Failed to set options', { cause: error });
      }
    }

    onChange(callback: (options: CompleteOptions) => void): () => void {
      this.changeListeners.add(callback);
      // 立即触发一次,确保 UI 同步最新状态
      void this.get().then(callback);

      // 返回取消订阅函数
      return () => {
        this.changeListeners.delete(callback);
      };
    }

    private notifyListeners(): void {
      void this.get().then(options => {
        this.changeListeners.forEach(cb => cb(options));
      });
    }
  }
  ```

- [ ] **任务 1.4**: 实现 ChromeMessagingRepository
- [ ] **任务 1.5**: 实现 ChromeYamlRepository

##### Day 5: 创建 Mock Repository

- [ ] **任务 1.6**: 实现 MockOptionsRepository
  ```typescript
  // tests/utils/repositories/MockOptionsRepository.ts
  export class MockOptionsRepository implements IOptionsRepository {
    private data: CompleteOptions = DEFAULT_OPTIONS;
    private listeners = new Set<(options: CompleteOptions) => void>();

    async get(): Promise<CompleteOptions> {
      return structuredClone(this.data); // 防止引用泄漏
    }

    async set(options: Partial<CompleteOptions>): Promise<void> {
      this.data = { ...this.data, ...options };
      // 自动触发 onChange
      this.listeners.forEach(cb => cb(this.data));
    }

    onChange(callback: (options: CompleteOptions) => void): () => void {
      this.listeners.add(callback);
      callback(this.data); // 立即触发一次
      return () => {
        this.listeners.delete(callback);
      };
    }

    // 测试专用方法
    reset(): void {
      this.data = DEFAULT_OPTIONS;
      this.listeners.clear();
    }
  }
  ```

- [ ] **任务 1.7**: 实现 MockMessagingRepository
- [ ] **任务 1.8**: 实现 MockYamlRepository

#### Week 2: DI 容器集成

- [ ] **任务 1.9**: 更新 DI 容器注册逻辑
  ```typescript
  // src/shared/di/serviceRegistry.ts
  import { ChromeOptionsRepository } from '../../infrastructure/repositories/ChromeOptionsRepository';
  import { ChromeMessagingRepository } from '../../infrastructure/repositories/ChromeMessagingRepository';

  export const registerRepositories = (): void => {
    // 生产环境注册 Chrome 实现
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

  // 测试环境注册 Mock 实现
  export const registerMockRepositories = (): void => {
    container.registerSingleton(
      DI_TOKENS.IOptionsRepository,
      MockOptionsRepository
    );
    // ...
  };
  ```

- [ ] **任务 1.10**: 更新 DI tokens 定义
  ```typescript
  // src/shared/di/tokens.ts
  export const DI_TOKENS = {
    // 新增 Repository tokens
    IOptionsRepository: Symbol('IOptionsRepository'),
    IMessagingRepository: Symbol('IMessagingRepository'),
    IYamlRepository: Symbol('IYamlRepository'),

    // 保留现有 tokens
    IRestClient: Symbol('IRestClient'),
    // ...
  } as const;
  ```

- [ ] **任务 1.11**: 编写 Repository 集成测试
  ```typescript
  // tests/unit/infrastructure/ChromeOptionsRepository.test.ts
  describe('ChromeOptionsRepository', () => {
    let repo: ChromeOptionsRepository;

    beforeEach(() => {
      // 使用真实的 chrome mock
      repo = new ChromeOptionsRepository();
    });

    it('should get options from chrome.storage', async () => {
      const options = await repo.get();
      expect(options).toMatchObject(DEFAULT_OPTIONS);
    });

    it('should set options to chrome.storage', async () => {
      await repo.set({ privacy: { analytics: false } });
      const options = await repo.get();
      expect(options.privacy.analytics).toBe(false);
    });

    it('should trigger onChange when storage changes', async () => {
      const callback = vi.fn();
      const unsubscribe = repo.onChange(callback);

      await repo.set({ privacy: { analytics: false } });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          privacy: expect.objectContaining({ analytics: false })
        })
      );

      unsubscribe();
    });
  });
  ```

#### Week 3-4: 重构 Options Sections

**优先级规则**: 与 Stage 3 同步,先重构正在迁移 DaisyUI 的 Sections

##### Week 3: 重构简单 Sections (P0)

- [ ] **任务 1.12**: 重构 AiSection
  ```typescript
  // ❌ Before
  class AiSection {
    async save() {
      const services = getPlatformServices();
      await services.storage.set({ ai: { ... } }); // 直接依赖
    }
  }

  // ✅ After
  class AiSection {
    constructor(
      private readonly optionsRepo: IOptionsRepository // 依赖注入
    ) {}

    async save() {
      await this.optionsRepo.set({ ai: { ... } }); // 通过抽象
    }
  }
  ```

- [ ] **任务 1.13**: 重构 LanguageSection
- [ ] **任务 1.14**: 重构 PrivacySection
- [ ] **任务 1.15**: 重构 TransferSection

**每个 Section 重构后必须**:
1. 移除所有 `getPlatformServices()` 调用
2. 通过构造函数注入 `IOptionsRepository`
3. 补充单元测试 (使用 MockOptionsRepository)

##### Week 4: 重构复杂 Sections (P1)

- [ ] **任务 1.16**: 重构 RestSection
  - 移除 `getPlatformServices().storage` 调用
  - 使用 `IOptionsRepository` + `IMessagingRepository`
  - 重构连接测试逻辑 (通过 Repository 获取配置)

- [ ] **任务 1.17**: 重构 RoutingSection
  - 使用 `IOptionsRepository` 获取 vaultRouter 配置
  - 移除直接 storage 访问

- [ ] **任务 1.18**: 重构 FragmentSection
- [ ] **任务 1.19**: 重构 VideoSection

- [ ] **任务 1.20**: 重构 TemplatesSection
  - 移除 domainMappings 直接 storage 访问
  - 使用 `IOptionsRepository`

- [ ] **任务 1.21**: 重构 UsageSection ⭐ 重点
  ```typescript
  // ❌ Before (UsageSection.ts:471)
  class UsageSection {
    async clearStats() {
      const services = getPlatformServices();
      await services.storage.set({ usageStats: {} }); // 直接写
      this.updateUI(); // 手动同步

      // line 433: 直接发 messaging
      await services.messaging.send({ type: 'track', event: 'clear_stats' });
    }
  }

  // ✅ After
  class UsageSection {
    constructor(
      private readonly optionsRepo: IOptionsRepository,
      private readonly messagingRepo: IMessagingRepository
    ) {}

    async clearStats() {
      await this.optionsRepo.set({ usageStats: {} }); // Repository 自动触发 onChange
      // UI 通过 onChange 回调自动更新,无需手动调用 updateUI()

      await this.messagingRepo.send({ type: 'track', event: 'clear_stats' });
    }

    override renderWithState() {
      // 订阅 Repository 变更
      this.unsubscribe = this.optionsRepo.onChange(options => {
        this.updateUI(options.usageStats); // 被动更新
      });
    }

    override destroy() {
      this.unsubscribe?.(); // 取消订阅
    }
  }
  ```

- [ ] **任务 1.22**: 重构 ClassifierSection
- [ ] **任务 1.23**: 重构 ReadingSection

**暂不重构** (延后到月度 3):
- [ ] YamlConfigSection (需先重构 yamlConfigService.ts)
- [ ] DiagnosisSection (优先级低)

#### 验收标准

- [ ] 创建 3 个核心 Repository 接口 (Options/Messaging/Yaml)
- [ ] 实现 3 个 Chrome Repository + 3 个 Mock Repository
- [ ] 10/14 Options Sections 完成重构 (71%)
- [ ] 移除所有 Section 中的 `getPlatformServices().storage` 调用
- [ ] 单元测试通过率 100% (使用 Mock Repository)
- [ ] TypeScript 0 errors
- [ ] 包体积增长 < 3KB (仅接口定义)

#### 预计工时

- Week 1 基础设施: 40h (2 人 × 5 天)
- Week 2 DI 集成: 20h (1 人 × 5 天)
- Week 3-4 Section 重构: 60h (3 人 × 10 天,并行)
- **总计**: 120h (约 4 周)

---

### 月度 2: Content Scripts 重构 ⏱️ 4 周

#### 目标

重构 Content Scripts (Clipper/Reader/Video/Onboarding) 使用 Repository 层。

#### Week 1: 重构 Clipper (P0 优先级)

- [ ] **任务 2.1**: 创建 IClipRepository 接口
  ```typescript
  // src/shared/repositories/IClipRepository.ts
  export interface IClipRepository {
    // 获取剪藏配置
    getFragmentConfig(): Promise<FragmentConfig>;
    setFragmentConfig(config: FragmentConfig): Promise<void>;

    // 获取模板配置
    getTemplateConfig(): Promise<TemplateOptions>;

    // 发送剪藏到背景页
    sendClip(clip: ClipData): Promise<ClipResult>;
  }
  ```

- [ ] **任务 2.2**: 实现 ChromeClipRepository
  ```typescript
  export class ChromeClipRepository implements IClipRepository {
    constructor(
      private readonly optionsRepo: IOptionsRepository,
      private readonly messagingRepo: IMessagingRepository
    ) {}

    async getFragmentConfig(): Promise<FragmentConfig> {
      const options = await this.optionsRepo.get();
      return options.fragment; // 从 Options 中提取
    }

    async sendClip(clip: ClipData): Promise<ClipResult> {
      return this.messagingRepo.send<ClipResult>({
        type: 'clip',
        data: clip
      });
    }
  }
  ```

- [ ] **任务 2.3**: 重构 src/content/clipper/components/dialog.ts ⭐ 核心
  ```typescript
  // ❌ Before (dialog.ts:92)
  export class ClipperDialog {
    constructor(
      private readonly storage: IStorageService, // 直接注入 chrome.storage
      // ...
    ) {}

    async save() {
      await this.storage.set({ ... }); // 直接写 storage
      // line 117 起大段 DOM 操作
    }
  }

  // ✅ After
  export class ClipperDialog {
    constructor(
      private readonly clipRepo: IClipRepository, // 依赖抽象
      // ...
    ) {}

    async save() {
      const result = await this.clipRepo.sendClip({ ... }); // 业务语义清晰
      // DOM 操作保留
    }

    private async loadConfig(): Promise<void> {
      const config = await this.clipRepo.getFragmentConfig();
      this.applyConfig(config);
    }
  }
  ```

- [ ] **任务 2.4**: 重构 src/content/index.ts ⭐ 核心
  ```typescript
  // ❌ Before (index.ts:37)
  const { messaging } = getPlatformServices(); // 直接获取平台服务

  if (!window.__aiobClipperInitialized) {
    initializeClipperRuntime(); // line 50 起混有 DOM + messaging
  }

  // ✅ After
  // 通过 DI 容器获取 Repository,不直接访问 chrome API
  const clipRepo = container.resolve<IClipRepository>(DI_TOKENS.IClipRepository);

  if (!window.__aiobClipperInitialized) {
    initializeClipperRuntime(clipRepo); // 依赖注入
  }
  ```

- [ ] **任务 2.5**: 补充 ClipperDialog 单元测试
  ```typescript
  describe('ClipperDialog', () => {
    let dialog: ClipperDialog;
    let mockClipRepo: MockClipRepository;

    beforeEach(() => {
      mockClipRepo = new MockClipRepository();
      dialog = new ClipperDialog(mockClipRepo);
    });

    it('should save clip via repository', async () => {
      await dialog.save({ content: 'test' });

      expect(mockClipRepo.sentClips).toHaveLength(1);
      expect(mockClipRepo.sentClips[0].content).toBe('test');
    });
  });
  ```

#### Week 2: 重构 Video Panel (P0 优先级)

- [ ] **任务 2.6**: 创建 IVideoRepository 接口
  ```typescript
  export interface IVideoRepository {
    getVideoConfig(): Promise<VideoOptions>;
    saveVideoPosition(position: { x: number; y: number }): Promise<void>;
    sendVideoClip(clip: VideoClipData): Promise<ClipResult>;
  }
  ```

- [ ] **任务 2.7**: 重构 src/content/video/prompt.ts ⭐ 核心
  ```typescript
  // ❌ Before (prompt.ts:372)
  export class VideoPrompt {
    constructor(
      private readonly storage: IStorageService, // 直接依赖 chrome.storage
      private readonly runtime: IRuntimeService   // 直接依赖 chrome.runtime
    ) {}

    // line 408: ensureStylesMounted 既写 storage 又控 DOM
    private async savePromptPosition(): Promise<void> {
      await this.storage.set({ videoPromptPosition: { ... } }); // 直接写
      this.updateDOM(); // 手动同步
    }
  }

  // ✅ After
  export class VideoPrompt {
    constructor(
      private readonly videoRepo: IVideoRepository // 依赖抽象
    ) {}

    private async savePromptPosition(): Promise<void> {
      await this.videoRepo.saveVideoPosition({ ... }); // 业务语义清晰
      // onChange 自动触发 UI 更新
    }

    override renderWithState() {
      this.unsubscribe = this.videoRepo.onChange(config => {
        this.updateDOM(config); // 被动更新
      });
    }
  }
  ```

- [ ] **任务 2.8**: 重构 src/content/video/session.ts
- [ ] **任务 2.9**: 补充 VideoPrompt 单元测试

#### Week 3: 重构 Reader Panel (P1 优先级)

- [ ] **任务 2.10**: 创建 IReaderRepository 接口
  ```typescript
  export interface IReaderRepository {
    getReadingConfig(): Promise<ReadingOptions>;
    sendReadingClip(clip: ReadingClipData): Promise<ClipResult>;
  }
  ```

- [ ] **任务 2.11**: 重构 src/content/reader/session.ts ⭐ 核心
  ```typescript
  // ❌ Before (session.ts:49)
  export class ReaderSession {
    constructor(
      private readonly storage: IStorageService, // line 49 直接依赖
      private readonly messaging: IMessagingService // line 112 直接依赖
    ) {
      // 既拉平台服务,又创建高亮 UI
    }
  }

  // ✅ After
  export class ReaderSession {
    constructor(
      private readonly readerRepo: IReaderRepository // 依赖抽象
    ) {}

    async saveHighlight(highlight: Highlight): Promise<void> {
      await this.readerRepo.sendReadingClip({ ... });
    }
  }
  ```

- [ ] **任务 2.12**: 补充 ReaderSession 单元测试

#### Week 4: 重构 Onboarding + Support Prompt

- [ ] **任务 2.13**: 重构 src/onboarding/bootstrap.ts
  ```typescript
  // ❌ Before (bootstrap.ts:83)
  document.querySelector('#openVault').addEventListener('click', () => {
    chrome.tabs.create({ url: '...' }); // line 107 直接调用 chrome.tabs
  });

  // ✅ After
  export class OnboardingController {
    constructor(
      private readonly navigationRepo: INavigationRepository // 抽象导航行为
    ) {}

    private bindEvents(): void {
      document.querySelector('#openVault').addEventListener('click', () => {
        this.navigationRepo.openVault(); // 业务语义清晰
      });
    }
  }
  ```

- [ ] **任务 2.14**: 重构 src/content/ui/supportPrompt.ts
- [ ] **任务 2.15**: 补充 E2E 测试

#### 验收标准

- [ ] 创建 3 个 Repository 接口 (Clip/Video/Reader)
- [ ] 重构 3 个核心 Content Scripts (Clipper/Video/Reader)
- [ ] 移除所有 Content Scripts 中的 `getPlatformServices()` 调用
- [ ] 单元测试覆盖率 > 70%
- [ ] E2E 测试通过 (至少 8 个测试用例)
- [ ] TypeScript 0 errors

#### 预计工时

- Clipper 重构: 30h
- Video 重构: 30h
- Reader 重构: 30h
- Onboarding/Support: 20h
- **总计**: 110h (约 4 周)

---

### 月度 3: Shared Services 重构 ⏱️ 4 周

#### 目标

重构 `src/shared/services/yamlConfigService.ts` 等 Shared 层服务,移除 chrome API 依赖。

#### Week 1-2: 重构 YamlConfigService (P0 优先级)

- [ ] **任务 3.1**: 分析 yamlConfigService.ts 职责
  - 当前职责: YAML 配置解析 + chrome.storage 访问 + storage.onChanged 监听
  - 重构目标: 只保留 YAML 配置解析,storage 访问交给 Repository

- [ ] **任务 3.2**: 重构 yamlConfigService.ts ⭐ 核心
  ```typescript
  // ❌ Before (yamlConfigService.ts:594)
  const initializeOverridesFromStorage = (): void => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      return; // ← guard 说明作者知道这是错的
    }

    try {
      chrome.storage.sync.get('yamlConfig', result => { // 直接访问
        // ...
      });
    } catch (error) {
      // ...
    }
  };

  // ✅ After
  export class YamlConfigService {
    constructor(
      private readonly yamlRepo: IYamlRepository // 依赖注入
    ) {}

    async loadOverrides(): Promise<YamlConfigOverrides | null> {
      return this.yamlRepo.getOverrides(); // 不关心底层是 chrome 还是 firefox
    }

    async saveOverrides(overrides: YamlConfigOverrides): Promise<void> {
      await this.yamlRepo.setOverrides(overrides);
    }

    // 纯函数: YAML 解析逻辑 (零外部依赖)
    parseYaml(content: string): YamlConfigOverrides {
      // 保留现有解析逻辑
    }
  }

  // Infrastructure 层才访问 chrome API
  export class ChromeYamlRepository implements IYamlRepository {
    async getOverrides(): Promise<YamlConfigOverrides | null> {
      const { storage } = getPlatformServices();
      const result = await storage.get('yamlConfig');
      return result?.yamlConfig ?? null;
    }

    async setOverrides(overrides: YamlConfigOverrides): Promise<void> {
      const { storage } = getPlatformServices();
      await storage.set({ yamlConfig: overrides });
    }

    onChange(callback): () => void {
      // 监听 storage.onChanged,只在这里访问 chrome API
      const { storage } = getPlatformServices();
      const handler = (changes) => {
        if (changes.yamlConfig) {
          callback(changes.yamlConfig.newValue);
        }
      };
      storage.onChanged.addListener(handler);
      return () => storage.onChanged.removeListener(handler);
    }
  }
  ```

- [ ] **任务 3.3**: 更新所有使用 yamlConfigService 的地方
  - YamlConfigSection.ts
  - 其他引用该 service 的组件

- [ ] **任务 3.4**: 补充 YamlConfigService 单元测试
  ```typescript
  describe('YamlConfigService', () => {
    it('should parse YAML without external dependencies', () => {
      const service = new YamlConfigService(new MockYamlRepository());
      const result = service.parseYaml('key: value');
      expect(result).toEqual({ key: 'value' });
    });

    it('should load overrides via repository', async () => {
      const mockRepo = new MockYamlRepository();
      mockRepo.setMockData({ templates: { article: 'custom' } });

      const service = new YamlConfigService(mockRepo);
      const overrides = await service.loadOverrides();

      expect(overrides?.templates?.article).toBe('custom');
    });
  });
  ```

#### Week 3: 重构 VaultRouter + YamlConfigSection

- [ ] **任务 3.5**: 重构 VaultRouterController
  - 使用 IOptionsRepository 替代直接 storage 访问
  - 移除 `getPlatformServices()` 调用

- [ ] **任务 3.6**: 重构 YamlConfigSection
  - 使用重构后的 YamlConfigService
  - 通过 IYamlRepository 获取/保存配置

#### Week 4: 审计 + 收尾

- [ ] **任务 3.7**: 全量审计 chrome.* 直接调用
  ```bash
  # 搜索残留的 chrome API 直接调用 (Options/Content Scripts 层)
  grep -r "chrome\." src/options/components/sections/ src/content/ \
    | grep -v "node_modules" \
    | grep -v "infrastructure" \
    | grep -v "platform"

  # 期望结果: 0 个匹配
  ```

- [ ] **任务 3.8**: 更新架构文档
  - 在 `docs/architecture/REPOSITORY-PATTERN.md` 记录 Repository 模式
  - 说明如何编写新的 Repository
  - 提供最佳实践

- [ ] **任务 3.9**: 创建迁移指南
  ```markdown
  # Repository 迁移指南

  ## 如何识别需要重构的代码

  1. 搜索 `getPlatformServices()`
  2. 搜索 `chrome.storage` / `chrome.runtime`
  3. 检查是否在 UI 层直接访问

  ## 如何重构

  ### Before
  ```typescript
  class MyComponent {
    async save() {
      const { storage } = getPlatformServices();
      await storage.set({ ... });
    }
  }
  ```

  ### After
  ```typescript
  class MyComponent {
    constructor(private readonly optionsRepo: IOptionsRepository) {}

    async save() {
      await this.optionsRepo.set({ ... });
    }
  }
  ```
  ```

#### 验收标准

- [ ] yamlConfigService.ts 零 chrome API 依赖
- [ ] VaultRouter/YamlConfig 使用 Repository 层
- [ ] Options/Content Scripts 层零 `chrome.*` 直接调用 (除 infrastructure/)
- [ ] 架构文档完善 (REPOSITORY-PATTERN.md)
- [ ] 迁移指南完成

#### 预计工时

- YamlConfigService 重构: 40h
- VaultRouter/YamlConfig 重构: 30h
- 全量审计 + 文档: 30h
- **总计**: 100h (约 4 周)

---

### 月度 4: 测试覆盖率提升 + 质量门禁 ⏱️ 4 周

#### 目标

提升单元测试覆盖率到 80%+,建立质量门禁,确保重构质量。

#### Week 1: 补充 Repository 单元测试

- [ ] **任务 4.1**: 补充 ChromeOptionsRepository 测试
  - 测试 get/set/onChange 方法
  - 测试错误处理 (storage 写入失败)
  - 测试并发场景 (多个 onChange 订阅者)

- [ ] **任务 4.2**: 补充 ChromeMessagingRepository 测试
- [ ] **任务 4.3**: 补充 ChromeYamlRepository 测试
- [ ] **任务 4.4**: 补充 ChromeClipRepository 测试

**目标**: Repository 层测试覆盖率 100%

#### Week 2: 补充 UI 层单元测试

- [ ] **任务 4.5**: 补充 Options Sections 测试
  - 使用 MockOptionsRepository
  - 测试 UI 交互 → Repository 调用链路
  - 测试 Repository onChange → UI 更新链路

- [ ] **任务 4.6**: 补充 Content Scripts 测试
  - ClipperDialog 测试 (使用 MockClipRepository)
  - VideoPrompt 测试 (使用 MockVideoRepository)
  - ReaderSession 测试 (使用 MockReaderRepository)

**目标**: UI 层测试覆盖率 > 80%

#### Week 3: E2E 测试补充

- [ ] **任务 4.7**: 补充 Options 页面 E2E 测试
  - 测试保存配置 → chrome.storage 写入
  - 测试 storage 变更 → UI 自动更新

- [ ] **任务 4.8**: 补充 Content Scripts E2E 测试
  - 测试 Clipper 保存 → Background 处理 → Obsidian 写入
  - 测试 Video 截图 → Background 处理

**目标**: E2E 测试覆盖核心流程 (至少 15 个测试用例)

#### Week 4: 质量门禁 + 最终验收

- [ ] **任务 4.9**: 配置测试覆盖率门禁
  ```json
  // vitest.config.ts
  export default defineConfig({
    test: {
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80
        },
        exclude: [
          'tests/**',
          'src/infrastructure/**', // Infrastructure 层暂不要求
          'src/platform/**'
        ]
      }
    }
  });
  ```

- [ ] **任务 4.10**: 配置 CI 门禁
  ```yaml
  # .github/workflows/test.yml
  - name: Run tests with coverage
    run: npm run test:coverage

  - name: Check coverage thresholds
    run: npm run test:coverage -- --reporter=json-summary

  - name: Fail if coverage < 80%
    run: |
      coverage=$(jq '.total.lines.pct' coverage/coverage-summary.json)
      if (( $(echo "$coverage < 80" | bc -l) )); then
        echo "Coverage $coverage% is below 80%"
        exit 1
      fi
  ```

- [ ] **任务 4.11**: 最终验收
  - 运行全量测试 (单元 + E2E)
  - 检查测试覆盖率报告
  - 检查 TypeScript 编译
  - 检查 Lint warnings

#### 验收标准

- [ ] **单元测试覆盖率**: 80%+
  - Repository 层: 100%
  - UI 层: 80%+
- [ ] **E2E 测试**: 15+ 测试用例通过
- [ ] **TypeScript**: 0 errors
- [ ] **Lint**: 0 warnings
- [ ] **CI 门禁**: 配置完成,自动检查覆盖率

#### 预计工时

- Repository 测试: 20h
- UI 层测试: 40h
- E2E 测试: 30h
- 质量门禁: 10h
- **总计**: 100h (约 4 周)

---

## 🎯 总体验收标准 (重构完成)

### 架构指标

- [ ] **三层架构清晰**:
  - Presentation Layer (UI) - 零 chrome API 依赖
  - Data Layer (Repository) - 集中数据访问
  - Infrastructure Layer - chrome/firefox 适配

- [ ] **Repository 覆盖率**: 100%
  - Options/Messaging/Yaml/Clip/Video/Reader 全部通过 Repository

- [ ] **依赖方向正确**:
  - UI → Repository Interface (依赖抽象)
  - Repository Impl → chrome.* (依赖具体)

### 质量指标

- [ ] **测试覆盖率**: 80%+
  - Repository 层: 100%
  - UI 层: 80%+
  - E2E 测试: 15+ 用例

- [ ] **代码质量**:
  - TypeScript: 0 errors
  - Lint: 0 warnings
  - 所有 Section/Content Scripts 零 `getPlatformServices()` 直接调用

### 可维护性指标

- [ ] **文档完善**:
  - Repository 模式设计文档
  - 迁移指南
  - 最佳实践

- [ ] **Mock 实现齐全**:
  - 所有 Repository 提供 Mock 实现
  - 测试可完全脱离 chrome API 运行

### 包体积指标

- [ ] **增长控制**: < 5KB (gzipped)
  - 仅接口定义 + DI 注册代码

---

## 🚨 风险评估

| 风险项 | 严重性 | 可能性 | 缓解措施 |
|--------|--------|--------|----------|
| **与 Stage 3 冲突** | 高 | 中 | ✅ 每周同步进度,优先重构正在 DaisyUI 迁移的 Section |
| **测试覆盖率目标过高** | 中 | 低 | ✅ Mock Repository 简化测试编写,降低成本 |
| **Repository 抽象过度设计** | 中 | 低 | ✅ 按需设计,不提前优化,保持接口简单 |
| **开发学习曲线** | 中 | 中 | ✅ 提供详细文档 + 示例代码,Week 1 集中培训 |
| **包体积意外增长** | 低 | 低 | ✅ 仅增加接口定义,实现复用现有 Platform 层 |

---

## 📊 进度跟踪

### 月度 1 (Repository 基础设施 + Options Sections)

| Week | 任务 | 状态 | 备注 |
|------|------|------|------|
| Week 1 | 基础设施建设 | ⏳ Pending | 创建 Repository 接口 + Chrome/Mock 实现 |
| Week 2 | DI 容器集成 | ⏳ Pending | 注册 Repository + 集成测试 |
| Week 3 | 重构简单 Sections | ⏳ Pending | Ai/Language/Privacy/Transfer |
| Week 4 | 重构复杂 Sections | ⏳ Pending | Rest/Routing/Fragment/Video/Templates/Usage |

### 月度 2 (Content Scripts 重构)

| Week | 任务 | 状态 | 备注 |
|------|------|------|------|
| Week 1 | Clipper 重构 | ⏳ Pending | dialog.ts + index.ts |
| Week 2 | Video 重构 | ⏳ Pending | prompt.ts + session.ts |
| Week 3 | Reader 重构 | ⏳ Pending | session.ts |
| Week 4 | Onboarding/Support | ⏳ Pending | bootstrap.ts + supportPrompt.ts |

### 月度 3 (Shared Services 重构)

| Week | 任务 | 状态 | 备注 |
|------|------|------|------|
| Week 1-2 | YamlConfigService 重构 | ⏳ Pending | 移除 chrome API 依赖 |
| Week 3 | VaultRouter/YamlConfig | ⏳ Pending | 使用 IYamlRepository |
| Week 4 | 审计 + 文档 | ⏳ Pending | 全量审计 + 迁移指南 |

### 月度 4 (测试覆盖率提升)

| Week | 任务 | 状态 | 备注 |
|------|------|------|------|
| Week 1 | Repository 测试 | ⏳ Pending | 覆盖率 100% |
| Week 2 | UI 层测试 | ⏳ Pending | 覆盖率 80%+ |
| Week 3 | E2E 测试 | ⏳ Pending | 15+ 测试用例 |
| Week 4 | 质量门禁 | ⏳ Pending | CI 配置 + 最终验收 |

---

## 🎖️ 与 Stage 3 的协调策略

### 并行执行原则

**核心原则**: 重构与迁移同步进行,避免重复劳动

| Stage 3 任务 | 架构重构任务 | 协调策略 |
|-------------|------------|---------|
| **Month 1**: Options Sections DaisyUI 迁移 | **Month 1**: Repository 基础设施 + Sections 重构 | ✅ 同一个 Section,先建 Repository,再迁移 DaisyUI,一次性搞定 |
| **Month 2**: Content Scripts DaisyUI 迁移 | **Month 2**: Content Scripts Repository 重构 | ✅ dialog.ts/prompt.ts 同时重构架构 + UI |
| **Month 3**: VaultRouter/YamlConfig Zag.js 重构 | **Month 3**: YamlConfigService 重构 | ✅ Zag.js 重构前先抽离 Repository,避免混杂 |
| **Month 4**: 无障碍性审计 | **Month 4**: 测试覆盖率提升 | ✅ 互补任务,同时进行 |

### 冲突避免机制

1. **每周同步会议**:
   - Stage 3 团队 + 架构重构团队每周五同步进度
   - 提前协调下周要修改的文件,避免冲突

2. **Git 分支策略**:
   ```
   main
   ├── stage3/month1-options-sections      (DaisyUI 迁移)
   └── refactor/month1-repository          (架构重构)

   # 策略: 先 merge refactor 分支,再 merge stage3 分支
   # 这样 DaisyUI 迁移时代码已经是 Repository 版本
   ```

3. **优先级规则**:
   - 架构重构优先级 > DaisyUI 迁移
   - 理由: 架构是基础,UI 是表面,先打地基再盖房子

---

## 📚 参考文档

1. **Repository Pattern**:
   - Martin Fowler: https://martinfowler.com/eaaCatalog/repository.html
   - Microsoft Docs: https://docs.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design

2. **依赖注入**:
   - InversifyJS: https://inversify.io/ (如需引入 DI 容器)
   - 或使用轻量级手写 DI (当前项目已有 serviceRegistry.ts)

3. **测试最佳实践**:
   - Testing Library: https://testing-library.com/
   - Vitest: https://vitest.dev/

4. **项目内部文档**:
   - `src/shared/di/README.md` - DI 容器使用指南
   - `src/platform/README.md` - Platform 层设计
   - `STAGE3-IMPLEMENTATION-PLAN.md` - DaisyUI 迁移计划

---

## 💡 开发建议

### Repository 设计原则

1. **接口优先**: 先定义接口,再实现
2. **职责单一**: 一个 Repository 只管一类数据
3. **返回 Promise**: 所有异步方法返回 Promise,便于测试
4. **提供 onChange**: 数据变更时通知订阅者
5. **集中错误处理**: Repository 层统一处理 storage 错误

### Mock Repository 编写规范

```typescript
// ✅ 好的 Mock Repository
export class MockOptionsRepository implements IOptionsRepository {
  private data = DEFAULT_OPTIONS;
  private listeners = new Set<Function>();

  async get() { return structuredClone(this.data); } // 防止引用泄漏

  async set(opts) {
    this.data = { ...this.data, ...opts };
    this.notifyListeners(); // 自动触发 onChange
  }

  onChange(cb) {
    this.listeners.add(cb);
    cb(this.data); // 立即触发一次
    return () => this.listeners.delete(cb);
  }

  // 测试专用方法
  reset() {
    this.data = DEFAULT_OPTIONS;
    this.listeners.clear();
  }

  getMockData() { return this.data; } // 用于断言
}
```

### 单元测试编写模板

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MyComponent } from './MyComponent';
import { MockOptionsRepository } from 'tests/utils/repositories';

describe('MyComponent', () => {
  let component: MyComponent;
  let mockRepo: MockOptionsRepository;

  beforeEach(() => {
    mockRepo = new MockOptionsRepository();
    component = new MyComponent(mockRepo); // 依赖注入
  });

  it('should save options via repository', async () => {
    await component.save({ privacy: { analytics: false } });

    const data = mockRepo.getMockData();
    expect(data.privacy.analytics).toBe(false);
  });

  it('should update UI when repository changes', async () => {
    const updateSpy = vi.spyOn(component, 'updateUI');

    await mockRepo.set({ privacy: { analytics: false } });

    expect(updateSpy).toHaveBeenCalled();
  });
});
```

---

## ✅ 最终交付物 (重构完成时)

1. ✅ **Repository 层完整实现**
   - 6 个核心接口 (Options/Messaging/Yaml/Clip/Video/Reader)
   - 6 个 Chrome 实现
   - 6 个 Mock 实现

2. ✅ **重构代码**
   - 12 个 Options Sections
   - 3 个 Content Scripts (Clipper/Video/Reader)
   - 1 个 Shared Service (yamlConfigService)

3. ✅ **测试套件**
   - Repository 单元测试 (覆盖率 100%)
   - UI 层单元测试 (覆盖率 80%+)
   - E2E 测试 (15+ 用例)

4. ✅ **架构文档**
   - `REPOSITORY-PATTERN.md` - Repository 模式设计
   - `MIGRATION-GUIDE.md` - 迁移指南
   - `src/shared/repositories/README.md` - Repository 使用文档

5. ✅ **质量门禁**
   - CI 配置 (自动检查覆盖率)
   - Pre-commit hook (禁止 UI 层直接调用 chrome API)

---

**文档版本**: v1.0
**创建日期**: 2025-11-29
**下次更新**: 月度 1 完成后 (预计 2025-12-29)

---

**开始重构前的准备**:

```bash
# 1. 创建重构分支
git checkout -b refactor/month1-repository

# 2. 创建目录结构
mkdir -p src/shared/repositories
mkdir -p src/infrastructure/repositories
mkdir -p tests/utils/repositories

# 3. 开始任务 1.1: 创建第一个 Repository 接口
touch src/shared/repositories/IOptionsRepository.ts
```

**祝实施顺利!** 🚀
