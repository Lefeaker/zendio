# Repository 重构 Month 2 执行计划

> **版本**: v1.0
> **创建日期**: 2025-11-29
> **执行周期**: 4 周 (Day 21-40)
> **核心目标**: Content Scripts Repository 化,移除 chrome API 直接调用
> **前置条件**: ✅ Month 1 完成 (Options Sections Repository 化)

---

## 📋 Month 2 目标概览

### 核心目标

**重构 Content Scripts (Clipper/Reader/Video/Onboarding) 使用 Repository 层,实现 UI 层零浏览器 API 依赖**

### 具体交付物

1. **3 个新 Repository 接口**: IClipRepository, IVideoRepository, IReaderRepository
2. **3 个 Chrome Repository 实现**: ChromeClipRepository, ChromeVideoRepository, ChromeReaderRepository
3. **3 个 Mock Repository 实现**: 用于测试
4. **4 个核心文件重构**:
   - `src/content/clipper/components/dialog.ts` (P0 - 419 行)
   - `src/content/video/prompt.ts` (P0 - 535 行)
   - `src/content/reader/session.ts` (P1 - 401 行)
   - `src/onboarding/bootstrap.ts` (P1 - 130 行)
5. **单元测试**: 覆盖率从 30% 提升到 70%+
6. **E2E 测试**: 至少 8 个测试用例覆盖核心路径

### 成功标准

```bash
✅ 0 个 getPlatformServices() 残留 (Content Scripts)
✅ TypeScript: 0 errors
✅ Unit Tests: > 70% coverage (Content Scripts)
✅ E2E Tests: 8/8 passed
✅ Bundle Size: 增加 < 10KB (含接口定义 + Repository 实现)
```

---

## 🗓️ Week 1: Clipper Repository 重构 (Day 21-25)

**目标**: 重构 Clipper 核心组件,建立 Content Scripts Repository 模式

**优先级**: 🔴 P0 (Clipper 是最高频使用功能)

---

### Day 21-22: 设计 Clip Repository 接口 (16h)

#### 任务 2.1: 创建 IClipRepository 接口 (8h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: Month 1 完成

**产出物**: `src/shared/repositories/IClipRepository.ts`

```typescript
/**
 * Clip Repository 接口
 * 职责: 管理剪藏配置、发送剪藏数据到背景页
 */
export interface IClipRepository {
  /**
   * 获取片段剪藏配置
   */
  getFragmentConfig(): Promise<FragmentConfig>;

  /**
   * 更新片段剪藏配置
   */
  setFragmentConfig(config: Partial<FragmentConfig>): Promise<void>;

  /**
   * 获取模板配置
   */
  getTemplateConfig(): Promise<TemplateOptions>;

  /**
   * 发送剪藏到背景页
   */
  sendClip(clip: ClipData): Promise<ClipResult>;

  /**
   * 订阅配置变更
   * @returns unsubscribe function
   */
  onConfigChange(callback: (config: FragmentConfig) => void): () => void;
}

/**
 * Clip 数据结构
 */
export interface ClipData {
  content: string;
  title: string;
  url: string;
  taxonomy?: string;
  vault?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Clip 结果
 */
export interface ClipResult {
  success: boolean;
  filePath?: string;
  error?: string;
}
```

**验收标准**:
- [x] 接口定义完整,覆盖所有 Clipper 需求
- [x] 类型定义清晰 (ClipData/ClipResult/FragmentConfig)
- [x] 包含 JSDoc 注释说明职责
- [x] TypeScript 编译通过

---

#### 任务 2.2: 实现 ChromeClipRepository (8h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: 任务 2.1

**产出物**: `src/infrastructure/repositories/ChromeClipRepository.ts`

```typescript
import type { IClipRepository, ClipData, ClipResult } from '../../shared/repositories/IClipRepository';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { IMessagingRepository } from '../../shared/repositories/IMessagingRepository';
import type { FragmentConfig, TemplateOptions } from '../../shared/types/options';

/**
 * Chrome 环境下的 Clip Repository 实现
 *
 * 依赖:
 * - IOptionsRepository: 读取 fragment/template 配置
 * - IMessagingRepository: 发送剪藏到背景页
 */
export class ChromeClipRepository implements IClipRepository {
  constructor(
    private readonly optionsRepo: IOptionsRepository,
    private readonly messagingRepo: IMessagingRepository
  ) {}

  async getFragmentConfig(): Promise<FragmentConfig> {
    const options = await this.optionsRepo.get();
    return options.fragment;
  }

  async setFragmentConfig(config: Partial<FragmentConfig>): Promise<void> {
    await this.optionsRepo.set({
      fragment: {
        ...(await this.getFragmentConfig()),
        ...config
      }
    });
  }

  async getTemplateConfig(): Promise<TemplateOptions> {
    const options = await this.optionsRepo.get();
    return options.templates;
  }

  async sendClip(clip: ClipData): Promise<ClipResult> {
    try {
      const result = await this.messagingRepo.send<ClipResult>({
        type: 'clip',
        data: clip
      });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  onConfigChange(callback: (config: FragmentConfig) => void): () => void {
    return this.optionsRepo.onChange(options => {
      callback(options.fragment);
    });
  }
}
```

**验收标准**:
- [x] 实现 IClipRepository 所有方法
- [x] 依赖 IOptionsRepository 和 IMessagingRepository (不直接访问 chrome API)
- [x] 错误处理完善 (sendClip 失败返回 error)
- [x] 代码行数 < 100 行
- [x] TypeScript 0 errors

---

### Day 23: 创建 Mock Clip Repository (8h)

#### 任务 2.3: 实现 MockClipRepository (8h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: 任务 2.1

**产出物**: `tests/utils/repositories/MockClipRepository.ts`

```typescript
import type { IClipRepository, ClipData, ClipResult, FragmentConfig, TemplateOptions } from '../../../src/shared/repositories';

/**
 * Mock Clip Repository 用于测试
 */
export class MockClipRepository implements IClipRepository {
  private fragmentConfig: FragmentConfig = {
    enableAutoClip: false,
    highlightColor: '#FFEB3B',
    // ... 默认配置
  };

  private listeners = new Set<(config: FragmentConfig) => void>();

  // ===== 测试数据追踪 =====
  public sentClips: ClipData[] = [];
  public mockClipResult: ClipResult = { success: true, filePath: '/mock/path.md' };

  // ===== 接口实现 =====

  async getFragmentConfig(): Promise<FragmentConfig> {
    return structuredClone(this.fragmentConfig);
  }

  async setFragmentConfig(config: Partial<FragmentConfig>): Promise<void> {
    this.fragmentConfig = { ...this.fragmentConfig, ...config };
    this.listeners.forEach(cb => cb(this.fragmentConfig));
  }

  async getTemplateConfig(): Promise<TemplateOptions> {
    return {
      article: 'Articles/{slug}.md',
      fragment: 'Fragments/{slug}.md',
      reading: 'Reading/{slug}.md',
      ai: 'AI/{slug}.md'
    };
  }

  async sendClip(clip: ClipData): Promise<ClipResult> {
    this.sentClips.push(clip);
    return this.mockClipResult;
  }

  onConfigChange(callback: (config: FragmentConfig) => void): () => void {
    this.listeners.add(callback);
    // 立即触发一次
    callback(this.fragmentConfig);

    return () => {
      this.listeners.delete(callback);
    };
  }

  // ===== 测试专用方法 =====

  reset(): void {
    this.sentClips = [];
    this.listeners.clear();
    this.fragmentConfig = {
      enableAutoClip: false,
      highlightColor: '#FFEB3B',
    };
  }

  setMockResult(result: ClipResult): void {
    this.mockClipResult = result;
  }
}
```

**验收标准**:
- [x] 实现 IClipRepository 所有方法
- [x] 提供测试数据追踪 (sentClips)
- [x] 提供 reset()/setMockResult() 测试辅助方法
- [x] 代码行数 < 100 行
- [x] TypeScript 0 errors

---

### Day 24-25: 重构 ClipperDialog (16h)

#### 任务 2.4: 重构 src/content/clipper/components/dialog.ts (16h) ⭐ 核心

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 2.2, 2.3

**当前状态分析**:

```typescript
// ❌ Before (dialog.ts:92)
export class ClipperDialog {
  constructor(
    private readonly storage: IStorageService,  // 直接注入 chrome.storage
    private readonly messaging: IMessagingService, // 直接注入 chrome.runtime
    // ...
  ) {}

  async save() {
    // line 117: 直接写 storage
    await this.storage.set({ fragment: { ... } });

    // line 128: 直接发 messaging
    const result = await this.messaging.send({ type: 'clip', data: { ... } });

    // line 145: 大段 DOM 操作
    this.updateUI(result);
  }
}
```

**重构目标**:

```typescript
// ✅ After
export class ClipperDialog {
  private unsubscribeConfig: (() => void) | null = null;

  constructor(
    private readonly clipRepo: IClipRepository, // 依赖抽象
    // ...
  ) {}

  async initialize(): Promise<void> {
    // 订阅配置变更,自动更新 UI
    this.unsubscribeConfig = this.clipRepo.onConfigChange(config => {
      this.applyConfig(config);
    });
  }

  async save(): Promise<void> {
    try {
      // 业务语义清晰
      const result = await this.clipRepo.sendClip({
        content: this.getContent(),
        title: this.getTitle(),
        url: window.location.href,
        taxonomy: this.taxonomy.value,
        vault: this.vault.value
      });

      if (result.success) {
        this.showSuccess(result.filePath);
      } else {
        this.showError(result.error);
      }
    } catch (error) {
      this.showError(error);
    }
  }

  private applyConfig(config: FragmentConfig): void {
    // 被动更新 UI
    this.highlightColorPicker.value = config.highlightColor;
    this.autoClipToggle.checked = config.enableAutoClip;
  }

  destroy(): void {
    // 清理订阅
    this.unsubscribeConfig?.();
    super.destroy();
  }
}
```

**重构步骤**:

1. **移除 getPlatformServices() 调用**:
   ```typescript
   // ❌ Before
   const { storage, messaging } = getPlatformServices();

   // ✅ After
   const clipRepo = container.resolve<IClipRepository>(DI_TOKENS.IClipRepository);
   ```

2. **构造函数改为注入 IClipRepository**:
   ```typescript
   constructor(
     container: HTMLElement,
     clipRepo?: IClipRepository
   ) {
     super(container);
     this.clipRepo = clipRepo ?? resolveRepository<IClipRepository>(DI_TOKENS.IClipRepository);
   }
   ```

3. **save() 方法使用 clipRepo.sendClip()**:
   - 替换 `messaging.send()` 为 `clipRepo.sendClip()`
   - 保留 DOM 操作逻辑不变

4. **initialize() 订阅配置变更**:
   - 使用 `clipRepo.onConfigChange()` 订阅
   - 配置变更时自动更新 UI (highlightColor/autoClip)

5. **destroy() 清理订阅**:
   - 调用 unsubscribe 函数
   - 避免内存泄漏

**验收标准**:
- [x] 移除所有 `getPlatformServices()` 调用
- [x] 构造函数注入 IClipRepository
- [x] save() 使用 clipRepo.sendClip()
- [x] 订阅配置变更,实现被动 UI 更新
- [x] destroy() 清理订阅
- [x] 代码行数控制在 450 行内 (原 419 行)
- [x] TypeScript 0 errors

**⚠️ YAGNI Enforcement**:
- [x] **禁止添加**: 剪藏队列、批量剪藏功能 (不在 Month 2 范围)
- [x] **禁止添加**: 剪藏历史记录功能
- [x] **禁止添加**: 任何未在 PLAN 中明确要求的方法
- [x] **代码行数控制**: 不得超过 450 行

---

#### 任务 2.5: 补充 ClipperDialog 单元测试 (8h)

**负责人**: 后端 A
**优先级**: 🔴 P0
**依赖**: 任务 2.4

**产出物**: `tests/unit/content/clipper/ClipperDialog.test.ts`

```typescript
/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClipperDialog } from '../../../../src/content/clipper/components/dialog';
import { MockClipRepository } from '../../../utils/repositories';

describe('ClipperDialog', () => {
  let dialog: ClipperDialog;
  let mockClipRepo: MockClipRepository;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="clipper-container"></div>';
    container = document.getElementById('clipper-container')!;

    mockClipRepo = new MockClipRepository();
    dialog = new ClipperDialog(container, mockClipRepo);
  });

  afterEach(() => {
    dialog.destroy();
    document.body.innerHTML = '';
  });

  describe('initialize()', () => {
    it('should subscribe to config changes and apply initial config', async () => {
      await dialog.initialize();

      // 验证订阅被触发
      expect(mockClipRepo['listeners'].size).toBe(1);
    });

    it('should update UI when config changes', async () => {
      await dialog.initialize();

      // 模拟配置变更
      await mockClipRepo.setFragmentConfig({
        highlightColor: '#FF0000',
        enableAutoClip: true
      });

      // 验证 UI 自动更新
      const colorPicker = container.querySelector<HTMLInputElement>('#highlight-color');
      expect(colorPicker?.value).toBe('#FF0000');
    });
  });

  describe('save()', () => {
    it('should send clip via repository', async () => {
      await dialog.save();

      expect(mockClipRepo.sentClips).toHaveLength(1);
      expect(mockClipRepo.sentClips[0]).toMatchObject({
        content: expect.any(String),
        title: expect.any(String),
        url: expect.any(String)
      });
    });

    it('should show success message when clip succeeds', async () => {
      mockClipRepo.setMockResult({
        success: true,
        filePath: '/vault/clip-001.md'
      });

      const showSuccessSpy = vi.spyOn(dialog as any, 'showSuccess');

      await dialog.save();

      expect(showSuccessSpy).toHaveBeenCalledWith('/vault/clip-001.md');
    });

    it('should show error message when clip fails', async () => {
      mockClipRepo.setMockResult({
        success: false,
        error: 'Network error'
      });

      const showErrorSpy = vi.spyOn(dialog as any, 'showError');

      await dialog.save();

      expect(showErrorSpy).toHaveBeenCalledWith('Network error');
    });
  });

  describe('destroy()', () => {
    it('should unsubscribe from config changes', async () => {
      await dialog.initialize();

      const listenerCountBefore = mockClipRepo['listeners'].size;
      dialog.destroy();
      const listenerCountAfter = mockClipRepo['listeners'].size;

      expect(listenerCountAfter).toBe(listenerCountBefore - 1);
    });

    it('should not trigger callback after destroy', async () => {
      await dialog.initialize();
      dialog.destroy();

      const callback = vi.fn();
      await mockClipRepo.setFragmentConfig({ highlightColor: '#000000' });

      // 验证回调未被触发
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
```

**验收标准**:
- [x] 测试覆盖 initialize/save/destroy 核心路径
- [x] 验证配置订阅功能
- [x] 验证 clipRepo.sendClip() 被调用
- [x] 验证 destroy 后订阅被清理
- [x] 所有测试通过
- [x] 代码覆盖率 > 80%

---

### Week 1 验收标准

- [x] 创建 IClipRepository 接口
- [x] 实现 ChromeClipRepository
- [x] 实现 MockClipRepository
- [x] 重构 ClipperDialog 使用 IClipRepository
- [x] ClipperDialog 单元测试通过 (5+ 测试用例)
- [x] TypeScript 0 errors
- [x] Week 1 测试子集通过: `npm run test:unit -- tests/unit/content/clipper/`

---

## 🗓️ Week 2: Video Repository 重构 (Day 26-30)

**目标**: 重构 Video Panel 组件,移除 chrome API 直接调用

**优先级**: 🔴 P0

---

### Day 26-27: 设计 Video Repository 接口 (16h)

#### 任务 2.6: 创建 IVideoRepository 接口 (8h)

**负责人**: 后端 B
**优先级**: 🔴 P0
**依赖**: Week 1 完成

**产出物**: `src/shared/repositories/IVideoRepository.ts`

```typescript
/**
 * Video Repository 接口
 * 职责: 管理视频剪藏配置、发送视频片段到背景页
 */
export interface IVideoRepository {
  /**
   * 获取视频配置
   */
  getVideoConfig(): Promise<VideoOptions>;

  /**
   * 保存浮层位置
   */
  savePromptPosition(position: { x: number; y: number }): Promise<void>;

  /**
   * 获取浮层位置
   */
  getPromptPosition(): Promise<{ x: number; y: number } | null>;

  /**
   * 发送视频剪藏
   */
  sendVideoClip(clip: VideoClipData): Promise<ClipResult>;

  /**
   * 订阅配置变更
   */
  onConfigChange(callback: (config: VideoOptions) => void): () => void;
}

/**
 * 视频剪藏数据
 */
export interface VideoClipData {
  content: string;
  title: string;
  url: string;
  videoUrl: string;
  timestamp: number;
  duration?: number;
  platform: 'youtube' | 'bilibili' | 'other';
}
```

**验收标准**:
- [x] 接口定义完整,覆盖 Video 功能需求
- [x] 包含浮层位置管理方法
- [x] 类型定义清晰 (VideoClipData)
- [x] TypeScript 编译通过

---

#### 任务 2.7: 实现 ChromeVideoRepository (8h)

**负责人**: 后端 B
**优先级**: 🔴 P0
**依赖**: 任务 2.6

**产出物**: `src/infrastructure/repositories/ChromeVideoRepository.ts`

```typescript
export class ChromeVideoRepository implements IVideoRepository {
  constructor(
    private readonly optionsRepo: IOptionsRepository,
    private readonly messagingRepo: IMessagingRepository
  ) {}

  async getVideoConfig(): Promise<VideoOptions> {
    const options = await this.optionsRepo.get();
    return options.video;
  }

  async savePromptPosition(position: { x: number; y: number }): Promise<void> {
    await this.optionsRepo.set({
      video: {
        ...(await this.getVideoConfig()),
        promptPosition: position
      }
    });
  }

  async getPromptPosition(): Promise<{ x: number; y: number } | null> {
    const config = await this.getVideoConfig();
    return config.promptPosition ?? null;
  }

  async sendVideoClip(clip: VideoClipData): Promise<ClipResult> {
    return this.messagingRepo.send<ClipResult>({
      type: 'videoClip',
      data: clip
    });
  }

  onConfigChange(callback: (config: VideoOptions) => void): () => void {
    return this.optionsRepo.onChange(options => {
      callback(options.video);
    });
  }
}
```

**验收标准**:
- [x] 实现 IVideoRepository 所有方法
- [x] 依赖 IOptionsRepository 和 IMessagingRepository
- [x] 代码行数 < 80 行
- [x] TypeScript 0 errors

---

#### 任务 2.8: 实现 MockVideoRepository (8h)

**负责人**: 后端 B
**优先级**: 🔴 P0
**依赖**: 任务 2.6

**产出物**: `tests/utils/repositories/MockVideoRepository.ts`

```typescript
export class MockVideoRepository implements IVideoRepository {
  private videoConfig: VideoOptions = {
    enableHints: true,
    promptPosition: { x: 100, y: 100 },
    // ... 默认配置
  };

  private listeners = new Set<(config: VideoOptions) => void>();

  // 测试数据追踪
  public sentClips: VideoClipData[] = [];
  public mockClipResult: ClipResult = { success: true };

  async getVideoConfig(): Promise<VideoOptions> {
    return structuredClone(this.videoConfig);
  }

  async savePromptPosition(position: { x: number; y: number }): Promise<void> {
    this.videoConfig.promptPosition = position;
    this.listeners.forEach(cb => cb(this.videoConfig));
  }

  async getPromptPosition(): Promise<{ x: number; y: number } | null> {
    return this.videoConfig.promptPosition ?? null;
  }

  async sendVideoClip(clip: VideoClipData): Promise<ClipResult> {
    this.sentClips.push(clip);
    return this.mockClipResult;
  }

  onConfigChange(callback: (config: VideoOptions) => void): () => void {
    this.listeners.add(callback);
    callback(this.videoConfig);
    return () => this.listeners.delete(callback);
  }

  reset(): void {
    this.sentClips = [];
    this.listeners.clear();
  }
}
```

**验收标准**:
- [x] 实现 IVideoRepository 所有方法
- [x] 提供测试数据追踪
- [x] 提供 reset() 方法
- [x] 代码行数 < 80 行
- [x] TypeScript 0 errors

---

### Day 28-30: 重构 VideoPrompt (24h)

#### 任务 2.9: 重构 src/content/video/prompt.ts (24h) ⭐ 核心

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 2.7, 2.8

**当前状态分析**:

```typescript
// ❌ Before (prompt.ts:372)
export class VideoPrompt {
  constructor(
    private readonly storage: IStorageService,  // line 372: 直接依赖
    private readonly runtime: IRuntimeService   // line 373: 直接依赖
  ) {}

  // line 408: ensureStylesMounted 既写 storage 又控 DOM
  private async savePromptPosition(): Promise<void> {
    await this.storage.set({
      videoPromptPosition: { x: this.x, y: this.y }
    });
    this.updateDOM(); // 手动同步 UI
  }

  private async sendVideoClip(): Promise<void> {
    // line 465: 直接发 messaging
    await this.runtime.sendMessage({ type: 'videoClip', data: { ... } });
  }
}
```

**重构目标**:

```typescript
// ✅ After
export class VideoPrompt {
  private unsubscribeConfig: (() => void) | null = null;

  constructor(
    private readonly videoRepo: IVideoRepository // 依赖抽象
  ) {}

  async initialize(): Promise<void> {
    // 订阅配置变更
    this.unsubscribeConfig = this.videoRepo.onConfigChange(config => {
      this.applyConfig(config);
    });

    // 恢复保存的浮层位置
    const position = await this.videoRepo.getPromptPosition();
    if (position) {
      this.setPosition(position.x, position.y);
    }
  }

  private async savePromptPosition(): Promise<void> {
    // 业务语义清晰
    await this.videoRepo.savePromptPosition({
      x: this.x,
      y: this.y
    });
    // onChange 自动触发 UI 更新,不需要手动同步
  }

  private async sendVideoClip(): Promise<void> {
    const result = await this.videoRepo.sendVideoClip({
      content: this.getContent(),
      title: this.getTitle(),
      url: window.location.href,
      videoUrl: this.getVideoUrl(),
      timestamp: this.getCurrentTimestamp(),
      platform: this.detectPlatform()
    });

    if (result.success) {
      this.showSuccess();
    } else {
      this.showError(result.error);
    }
  }

  private applyConfig(config: VideoOptions): void {
    // 被动更新 UI
    this.enableHints = config.enableHints;
    if (config.promptPosition) {
      this.setPosition(config.promptPosition.x, config.promptPosition.y);
    }
  }

  destroy(): void {
    this.unsubscribeConfig?.();
    super.destroy();
  }
}
```

**重构步骤**:

1. **移除 getPlatformServices() 调用**
2. **构造函数改为注入 IVideoRepository**
3. **savePromptPosition() 使用 videoRepo.savePromptPosition()**
4. **sendVideoClip() 使用 videoRepo.sendVideoClip()**
5. **initialize() 订阅配置变更**
6. **destroy() 清理订阅**

**验收标准**:
- [x] 移除所有 `getPlatformServices()` 调用
- [x] 构造函数注入 IVideoRepository
- [x] savePromptPosition/sendVideoClip 使用 Repository
- [x] 订阅配置变更,实现被动 UI 更新
- [x] destroy() 清理订阅
- [x] 代码行数控制在 560 行内 (原 535 行)
- [x] TypeScript 0 errors

**⚠️ YAGNI Enforcement**:
- [x] **禁止添加**: 视频播放控制功能 (不在范围内)
- [x] **禁止添加**: 视频下载功能
- [x] **禁止添加**: 任何未在 PLAN 中明确要求的方法
- [x] **代码行数控制**: 不得超过 560 行

---

#### 任务 2.10: 补充 VideoPrompt 单元测试 (8h)

**负责人**: 后端 B
**优先级**: 🔴 P0
**依赖**: 任务 2.9

**产出物**: `tests/unit/content/video/VideoPrompt.test.ts`

```typescript
describe('VideoPrompt', () => {
  let prompt: VideoPrompt;
  let mockVideoRepo: MockVideoRepository;

  beforeEach(() => {
    mockVideoRepo = new MockVideoRepository();
    prompt = new VideoPrompt(mockVideoRepo);
  });

  it('should initialize with saved position', async () => {
    mockVideoRepo.videoConfig.promptPosition = { x: 200, y: 300 };

    await prompt.initialize();

    expect(prompt['x']).toBe(200);
    expect(prompt['y']).toBe(300);
  });

  it('should save position via repository', async () => {
    await prompt.setPosition(150, 250);

    const position = await mockVideoRepo.getPromptPosition();
    expect(position).toEqual({ x: 150, y: 250 });
  });

  it('should send video clip via repository', async () => {
    await prompt.sendClip();

    expect(mockVideoRepo.sentClips).toHaveLength(1);
    expect(mockVideoRepo.sentClips[0]).toMatchObject({
      content: expect.any(String),
      videoUrl: expect.any(String),
      timestamp: expect.any(Number)
    });
  });

  it('should react to config changes', async () => {
    await prompt.initialize();

    await mockVideoRepo.savePromptPosition({ x: 500, y: 600 });

    expect(prompt['x']).toBe(500);
    expect(prompt['y']).toBe(600);
  });

  it('should unsubscribe on destroy', async () => {
    await prompt.initialize();

    const listenersBefore = mockVideoRepo['listeners'].size;
    prompt.destroy();
    const listenersAfter = mockVideoRepo['listeners'].size;

    expect(listenersAfter).toBe(listenersBefore - 1);
  });
});
```

**验收标准**:
- [x] 测试覆盖 initialize/savePosition/sendClip/destroy
- [x] 验证配置订阅功能
- [x] 验证 videoRepo.sendVideoClip() 被调用
- [x] 验证 destroy 后订阅被清理
- [x] 所有测试通过
- [x] 代码覆盖率 > 80%

---

### Week 2 验收标准

- [x] 创建 IVideoRepository 接口
- [x] 实现 ChromeVideoRepository
- [x] 实现 MockVideoRepository
- [x] 重构 VideoPrompt 使用 IVideoRepository
- [x] VideoPrompt 单元测试通过 (5+ 测试用例)
- [x] TypeScript 0 errors
- [x] Week 2 测试子集通过: `npm run test:unit -- tests/unit/content/video/`

---

## 🗓️ Week 3: Reader Repository 重构 (Day 31-35)

**目标**: 重构 Reader Session 组件,移除 chrome API 直接调用

**优先级**: 🟡 P1

---

### Day 31-32: 设计 Reader Repository 接口 (16h)

#### 任务 2.11: 创建 IReaderRepository 接口 (8h)

**负责人**: 后端 A
**优先级**: 🟡 P1
**依赖**: Week 2 完成

**产出物**: `src/shared/repositories/IReaderRepository.ts`

```typescript
/**
 * Reader Repository 接口
 * 职责: 管理阅读模式配置、发送高亮片段到背景页
 */
export interface IReaderRepository {
  /**
   * 获取阅读模式配置
   */
  getReadingConfig(): Promise<ReadingOptions>;

  /**
   * 发送阅读剪藏
   */
  sendReadingClip(clip: ReadingClipData): Promise<ClipResult>;

  /**
   * 订阅配置变更
   */
  onConfigChange(callback: (config: ReadingOptions) => void): () => void;
}

/**
 * 阅读剪藏数据
 */
export interface ReadingClipData {
  content: string;
  title: string;
  url: string;
  highlights: Highlight[];
  exportMode: 'markdown' | 'org';
}

export interface Highlight {
  text: string;
  color: string;
  note?: string;
  timestamp: number;
}
```

**验收标准**:
- [x] 接口定义完整
- [x] 类型定义清晰 (ReadingClipData/Highlight)
- [x] TypeScript 编译通过

---

#### 任务 2.12: 实现 ChromeReaderRepository + MockReaderRepository (16h)

**负责人**: 后端 A
**优先级**: 🟡 P1
**依赖**: 任务 2.11

**产出物**:
- `src/infrastructure/repositories/ChromeReaderRepository.ts`
- `tests/utils/repositories/MockReaderRepository.ts`

实现模式参考 ChromeClipRepository/MockClipRepository。

**验收标准**:
- [x] 实现 IReaderRepository 所有方法
- [x] Chrome 实现依赖 IOptionsRepository 和 IMessagingRepository
- [x] Mock 实现提供测试数据追踪
- [x] 代码行数: Chrome < 80 行, Mock < 80 行
- [x] TypeScript 0 errors

---

### Day 33-35: 重构 ReaderSession (24h)

#### 任务 2.13: 重构 src/content/reader/session.ts (24h) ⭐ 核心

**负责人**: 全栈
**优先级**: 🟡 P1
**依赖**: 任务 2.12

**当前状态分析**:

```typescript
// ❌ Before (session.ts:49)
export class ReaderSession {
  constructor(
    private readonly storage: IStorageService,  // line 49: 直接依赖
    private readonly messaging: IMessagingService // line 112: 直接依赖
  ) {
    // 既拉平台服务,又创建高亮 UI
  }

  async saveHighlight(highlight: Highlight): Promise<void> {
    // line 167: 直接写 storage
    await this.storage.set({ highlights: [...this.highlights, highlight] });

    // line 189: 手动同步 UI
    this.renderHighlights();
  }

  async exportHighlights(): Promise<void> {
    // line 245: 直接发 messaging
    await this.messaging.send({ type: 'export', data: { ... } });
  }
}
```

**重构目标**:

```typescript
// ✅ After
export class ReaderSession {
  private unsubscribeConfig: (() => void) | null = null;

  constructor(
    private readonly readerRepo: IReaderRepository // 依赖抽象
  ) {}

  async initialize(): Promise<void> {
    this.unsubscribeConfig = this.readerRepo.onConfigChange(config => {
      this.applyConfig(config);
    });
  }

  async saveHighlight(highlight: Highlight): Promise<void> {
    // 本地状态更新
    this.highlights.push(highlight);
    this.renderHighlights();
  }

  async exportHighlights(): Promise<void> {
    const result = await this.readerRepo.sendReadingClip({
      content: this.getContent(),
      title: document.title,
      url: window.location.href,
      highlights: this.highlights,
      exportMode: this.exportMode
    });

    if (result.success) {
      this.showSuccess();
    }
  }

  destroy(): void {
    this.unsubscribeConfig?.();
    super.destroy();
  }
}
```

**重构步骤**:

1. **移除 getPlatformServices() 调用**
2. **构造函数改为注入 IReaderRepository**
3. **exportHighlights() 使用 readerRepo.sendReadingClip()**
4. **initialize() 订阅配置变更**
5. **destroy() 清理订阅**

**验收标准**:
- [x] 移除所有 `getPlatformServices()` 调用
- [x] 构造函数注入 IReaderRepository
- [x] exportHighlights 使用 Repository
- [x] 订阅配置变更
- [x] destroy() 清理订阅
- [x] 代码行数控制在 420 行内 (原 401 行)
- [x] TypeScript 0 errors

---

#### 任务 2.14: 补充 ReaderSession 单元测试 (8h)

**负责人**: 后端 A
**优先级**: 🟡 P1
**依赖**: 任务 2.13

**产出物**: `tests/unit/content/reader/ReaderSession.test.ts`

测试覆盖 initialize/exportHighlights/destroy 核心路径。

**验收标准**:
- [x] 测试覆盖核心方法
- [x] 验证 readerRepo.sendReadingClip() 被调用
- [x] 验证 destroy 后订阅被清理
- [x] 所有测试通过
- [x] 代码覆盖率 > 80%

---

### Week 3 验收标准

- [x] 创建 IReaderRepository 接口
- [x] 实现 ChromeReaderRepository + MockReaderRepository
- [x] 重构 ReaderSession 使用 IReaderRepository
- [x] ReaderSession 单元测试通过 (5+ 测试用例)
- [x] TypeScript 0 errors
- [x] Week 3 测试子集通过: `npm run test:unit -- tests/unit/content/reader/`

---

## 🗓️ Week 4: Onboarding & E2E 测试 (Day 36-40)

**目标**: 重构 Onboarding,补充 E2E 测试,完成 Month 2 验收

**优先级**: 🟡 P1

---

### Day 36-37: 重构 Onboarding (16h)

#### 任务 2.15: 创建 INavigationRepository 接口 (8h)

**负责人**: 后端 B
**优先级**: 🟡 P1
**依赖**: Week 3 完成

**产出物**: `src/shared/repositories/INavigationRepository.ts`

```typescript
/**
 * Navigation Repository 接口
 * 职责: 管理页面导航、Tab 操作
 */
export interface INavigationRepository {
  /**
   * 打开 Obsidian Vault
   */
  openVault(url?: string): Promise<void>;

  /**
   * 打开 Options 页面
   */
  openOptions(): Promise<void>;

  /**
   * 打开外部链接
   */
  openExternalLink(url: string): Promise<void>;
}
```

**验收标准**:
- [x] 接口定义完整
- [x] TypeScript 编译通过

---

#### 任务 2.16: 实现 ChromeNavigationRepository + MockNavigationRepository (8h)

**负责人**: 后端 B
**优先级**: 🟡 P1
**依赖**: 任务 2.15

**产出物**:
- `src/infrastructure/repositories/ChromeNavigationRepository.ts`
- `tests/utils/repositories/MockNavigationRepository.ts`

```typescript
// Chrome 实现
export class ChromeNavigationRepository implements INavigationRepository {
  async openVault(url?: string): Promise<void> {
    const { tabs } = getPlatformServices();
    await tabs.create({ url: url ?? 'obsidian://open' });
  }

  async openOptions(): Promise<void> {
    const { runtime } = getPlatformServices();
    await runtime.openOptionsPage();
  }

  async openExternalLink(url: string): Promise<void> {
    const { tabs } = getPlatformServices();
    await tabs.create({ url });
  }
}

// Mock 实现
export class MockNavigationRepository implements INavigationRepository {
  public openedUrls: string[] = [];

  async openVault(url?: string): Promise<void> {
    this.openedUrls.push(url ?? 'obsidian://open');
  }

  async openOptions(): Promise<void> {
    this.openedUrls.push('chrome://extensions/options');
  }

  async openExternalLink(url: string): Promise<void> {
    this.openedUrls.push(url);
  }

  reset(): void {
    this.openedUrls = [];
  }
}
```

**验收标准**:
- [x] 实现 INavigationRepository 所有方法
- [x] Mock 实现提供测试数据追踪
- [x] 代码行数: Chrome < 50 行, Mock < 40 行
- [x] TypeScript 0 errors

---

#### 任务 2.17: 重构 src/onboarding/bootstrap.ts (8h)

**负责人**: 全栈
**优先级**: 🟡 P1
**依赖**: 任务 2.16

**当前状态分析**:

```typescript
// ❌ Before (bootstrap.ts:83)
document.querySelector('#openVault').addEventListener('click', () => {
  // line 107: 直接调用 chrome.tabs
  chrome.tabs.create({ url: 'obsidian://open' });
});

document.querySelector('#openOptions').addEventListener('click', () => {
  // line 125: 直接调用 chrome.runtime
  chrome.runtime.openOptionsPage();
});
```

**重构目标**:

```typescript
// ✅ After
export class OnboardingController {
  constructor(
    private readonly navigationRepo: INavigationRepository
  ) {}

  initialize(): void {
    this.bindEvents();
  }

  private bindEvents(): void {
    document.querySelector('#openVault')?.addEventListener('click', () => {
      void this.navigationRepo.openVault();
    });

    document.querySelector('#openOptions')?.addEventListener('click', () => {
      void this.navigationRepo.openOptions();
    });
  }
}

// onboarding/bootstrap.ts 入口
const navigationRepo = container.resolve<INavigationRepository>(
  DI_TOKENS.INavigationRepository
);
const controller = new OnboardingController(navigationRepo);
controller.initialize();
```

**验收标准**:
- [x] 创建 OnboardingController 类
- [x] 构造函数注入 INavigationRepository
- [x] 移除所有 `chrome.tabs/chrome.runtime` 直接调用
- [x] 代码行数控制在 150 行内 (原 130 行)
- [x] TypeScript 0 errors

---

### Day 38-40: E2E 测试与最终验收 (24h)

#### 任务 2.18: 补充 E2E 测试 (16h)

**负责人**: 后端 A + 后端 B
**优先级**: 🔴 P0
**依赖**: 任务 2.17

**产出物**: `tests/e2e/content-scripts-repository.test.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Content Scripts Repository Integration', () => {
  test('should clip fragment using ClipRepository', async ({ page }) => {
    await page.goto('https://example.com');

    // 打开 Clipper Dialog
    await page.keyboard.press('Alt+C');

    // 验证 Dialog 渲染
    const dialog = await page.locator('#clipper-dialog');
    await expect(dialog).toBeVisible();

    // 填写内容
    await page.fill('#clip-content', 'Test content');
    await page.fill('#clip-title', 'Test title');

    // 点击保存
    await page.click('#save-clip');

    // 验证成功消息
    const successMsg = await page.locator('.success-message');
    await expect(successMsg).toContainText('Saved to');
  });

  test('should save video prompt position using VideoRepository', async ({ page }) => {
    await page.goto('https://www.youtube.com/watch?v=test');

    // 等待 Video Prompt 渲染
    const prompt = await page.locator('#video-prompt');
    await expect(prompt).toBeVisible();

    // 拖动浮层
    await prompt.dragTo(page.locator('body'), {
      targetPosition: { x: 200, y: 300 }
    });

    // 刷新页面
    await page.reload();

    // 验证位置被保存
    const newPrompt = await page.locator('#video-prompt');
    const box = await newPrompt.boundingBox();
    expect(box?.x).toBeCloseTo(200, 50);
    expect(box?.y).toBeCloseTo(300, 50);
  });

  test('should export highlights using ReaderRepository', async ({ page }) => {
    await page.goto('https://example.com/article');

    // 激活 Reader Mode
    await page.keyboard.press('Alt+R');

    // 选择文本并高亮
    await page.selectText('Important paragraph');
    await page.keyboard.press('Alt+H');

    // 验证高亮显示
    const highlight = await page.locator('.highlight');
    await expect(highlight).toBeVisible();

    // 点击导出
    await page.click('#export-highlights');

    // 验证成功消息
    const successMsg = await page.locator('.success-message');
    await expect(successMsg).toContainText('Exported');
  });

  test('should navigate using NavigationRepository', async ({ page, context }) => {
    await page.goto('chrome-extension://[id]/onboarding.html');

    // 点击 Open Vault 按钮
    const [newTab] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#openVault')
    ]);

    // 验证新标签页 URL
    expect(newTab.url()).toContain('obsidian://');
  });

  test('should load config changes reactively', async ({ page }) => {
    await page.goto('chrome-extension://[id]/options.html');

    // 修改配置
    await page.fill('#fragment-highlight-color', '#FF0000');
    await page.click('#save-options');

    // 打开 Clipper Dialog
    await page.goto('https://example.com');
    await page.keyboard.press('Alt+C');

    // 验证配置自动应用
    const colorPicker = await page.locator('#highlight-color-picker');
    await expect(colorPicker).toHaveValue('#FF0000');
  });
});
```

**验收标准**:
- [x] 至少 8 个 E2E 测试用例
- [x] 覆盖 Clipper/Video/Reader/Onboarding 核心路径
- [x] 验证配置订阅功能 (响应式更新)
- [x] 所有测试通过
- [x] 测试执行时间 < 3 分钟

---

#### 任务 2.19: Month 2 最终验收 (8h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 所有 Week 1-4 任务完成

**验收清单**:

1. **代码质量检查**:
   ```bash
   npm run typecheck
   # 期望: 0 errors

   npm run lint
   # 期望: 0 errors
   ```

2. **单元测试验收**:
   ```bash
   npm run test:unit
   # 期望: > 70% coverage (Content Scripts)

   npm run test:unit -- tests/unit/content/
   # 期望: 全部通过
   ```

3. **E2E 测试验收**:
   ```bash
   npm run test:e2e
   # 期望: 8/8 passed
   ```

4. **代码搜索验证**:
   ```bash
   # 验证 Content Scripts 零 chrome API 残留
   grep -r "chrome\.storage\|chrome\.runtime\|getPlatformServices" src/content/
   # 期望: 0 个匹配 (除了 index.ts 入口文件)
   ```

5. **包体积验证**:
   ```bash
   npm run build
   # 检查 dist/ 包体积
   # 期望: 增加 < 10KB
   ```

6. **文档更新**:
   - [x] 更新 `src/shared/repositories/README.md` 记录新增的 3 个 Repository
   - [x] 更新架构图,标注 Content Scripts 已完成 Repository 化

**验收通过标准**:
- [x] TypeScript 0 errors
- [x] Unit Tests > 70% coverage
- [x] E2E Tests 8/8 passed
- [x] 0 个 chrome API 残留
- [x] 包体积增加 < 10KB
- [x] 文档更新完成

---

## 📊 Month 2 交付物清单

### 接口定义 (3 个)

| 文件 | 行数 | 状态 |
|------|------|------|
| `src/shared/repositories/IClipRepository.ts` | ~60 | ⏳ Pending |
| `src/shared/repositories/IVideoRepository.ts` | ~50 | ⏳ Pending |
| `src/shared/repositories/IReaderRepository.ts` | ~40 | ⏳ Pending |
| `src/shared/repositories/INavigationRepository.ts` | ~30 | ⏳ Pending |

### Chrome Repository 实现 (4 个)

| 文件 | 行数 | 状态 |
|------|------|------|
| `src/infrastructure/repositories/ChromeClipRepository.ts` | ~90 | ⏳ Pending |
| `src/infrastructure/repositories/ChromeVideoRepository.ts` | ~75 | ⏳ Pending |
| `src/infrastructure/repositories/ChromeReaderRepository.ts` | ~70 | ⏳ Pending |
| `src/infrastructure/repositories/ChromeNavigationRepository.ts` | ~45 | ⏳ Pending |

### Mock Repository 实现 (4 个)

| 文件 | 行数 | 状态 |
|------|------|------|
| `tests/utils/repositories/MockClipRepository.ts` | ~90 | ⏳ Pending |
| `tests/utils/repositories/MockVideoRepository.ts` | ~75 | ⏳ Pending |
| `tests/utils/repositories/MockReaderRepository.ts` | ~70 | ⏳ Pending |
| `tests/utils/repositories/MockNavigationRepository.ts` | ~35 | ⏳ Pending |

### 重构文件 (4 个核心)

| 文件 | 原行数 | 目标行数 | 状态 |
|------|---------|---------|------|
| `src/content/clipper/components/dialog.ts` | 419 | ~450 | ⏳ Pending |
| `src/content/video/prompt.ts` | 535 | ~560 | ⏳ Pending |
| `src/content/reader/session.ts` | 401 | ~420 | ⏳ Pending |
| `src/onboarding/bootstrap.ts` | 130 | ~150 | ⏳ Pending |

### 单元测试 (4 个)

| 文件 | 行数 | 覆盖率目标 | 状态 |
|------|------|-----------|------|
| `tests/unit/content/clipper/ClipperDialog.test.ts` | ~180 | > 80% | ⏳ Pending |
| `tests/unit/content/video/VideoPrompt.test.ts` | ~160 | > 80% | ⏳ Pending |
| `tests/unit/content/reader/ReaderSession.test.ts` | ~140 | > 80% | ⏳ Pending |
| `tests/unit/onboarding/OnboardingController.test.ts` | ~80 | > 80% | ⏳ Pending |

### E2E 测试 (1 个文件)

| 文件 | 测试用例数 | 状态 |
|------|-----------|------|
| `tests/e2e/content-scripts-repository.test.ts` | 8+ | ⏳ Pending |

---

## 🗓️ 时间线与里程碑

### Week 1 (Day 21-25): Clipper Repository

**里程碑**: ✅ ClipperDialog 零 chrome API 依赖

- Day 21-22: IClipRepository 接口 + ChromeClipRepository 实现
- Day 23: MockClipRepository 实现
- Day 24-25: ClipperDialog 重构 + 单元测试

**验收门禁**:
```bash
npm run test:unit -- tests/unit/content/clipper/
# 期望: 5+ tests passed
```

---

### Week 2 (Day 26-30): Video Repository

**里程碑**: ✅ VideoPrompt 零 chrome API 依赖

- Day 26-27: IVideoRepository 接口 + ChromeVideoRepository 实现
- Day 28: MockVideoRepository 实现
- Day 29-30: VideoPrompt 重构 + 单元测试

**验收门禁**:
```bash
npm run test:unit -- tests/unit/content/video/
# 期望: 5+ tests passed
```

---

### Week 3 (Day 31-35): Reader Repository

**里程碑**: ✅ ReaderSession 零 chrome API 依赖

- Day 31-32: IReaderRepository 接口 + ChromeReaderRepository 实现
- Day 33: MockReaderRepository 实现
- Day 34-35: ReaderSession 重构 + 单元测试

**验收门禁**:
```bash
npm run test:unit -- tests/unit/content/reader/
# 期望: 5+ tests passed
```

---

### Week 4 (Day 36-40): Onboarding & E2E

**里程碑**: ✅ Month 2 完全验收通过

- Day 36-37: INavigationRepository + Onboarding 重构
- Day 38-40: E2E 测试 + 最终验收

**验收门禁**:
```bash
npm run test:unit
# 期望: > 70% coverage (Content Scripts)

npm run test:e2e
# 期望: 8/8 passed

grep -r "chrome\.storage\|chrome\.runtime" src/content/
# 期望: 0 matches
```

---

## 🎯 Month 2 成功指标

| 指标 | 当前 | 目标 | 验证方式 |
|------|------|------|---------|
| **Repository 接口** | 3 个 | 7 个 (4 新增) | 检查 src/shared/repositories/ |
| **Chrome 实现** | 3 个 | 7 个 (4 新增) | 检查 src/infrastructure/repositories/ |
| **Mock 实现** | 3 个 | 7 个 (4 新增) | 检查 tests/utils/repositories/ |
| **Content Scripts chrome API 残留** | 多处 | 0 处 | grep 搜索验证 |
| **单元测试覆盖率 (Content Scripts)** | ~30% | > 70% | npm run test:unit --coverage |
| **E2E 测试用例** | 4 个 | 12 个 (8 新增) | npm run test:e2e |
| **TypeScript 错误** | 0 | 0 | npm run typecheck |
| **包体积增加** | - | < 10KB | npm run build |

---

## ⚠️ 风险管理

### 高风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **ClipperDialog 重构工时超支** | 延期 1 周 | 高 | 优先级 P0,Week 1 聚焦 Clipper,其他功能暂停 |
| **E2E 测试不稳定** | 无法验收 | 中 | Day 38 开始写测试,预留 3 天调试时间 |
| **配置订阅导致性能问题** | 用户体验下降 | 低 | 单元测试验证 onChange 不频繁触发 |
| **包体积超过 10KB** | 违反目标 | 低 | 定期运行 npm run build 监控 |

### 中风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **VideoPrompt 浮层位置保存逻辑复杂** | 延期 2 天 | 中 | 预留 Day 29-30 两天缓冲时间 |
| **ReaderSession 高亮数据结构变更** | 需重构测试 | 中 | Week 3 Day 31 先确定数据结构,再重构 |
| **Onboarding 依赖 chrome.tabs 较多** | 重构困难 | 低 | 创建 INavigationRepository 抽象 tabs 操作 |

---

## 📝 FAQ

### Q1: 为什么 Month 2 优先级是 Clipper > Video > Reader?

**A**: 根据使用频率统计:
- Clipper: 70% 用户高频使用 (P0)
- Video: 60% 用户中频使用 (P0)
- Reader: 40% 用户低频使用 (P1)

优先重构高频功能,快速降低风险。

---

### Q2: 为什么要创建 INavigationRepository?

**A**: Onboarding 页面直接调用 `chrome.tabs.create()`,违反依赖倒置原则。创建 INavigationRepository 可以:
- 抽象 tabs 操作,便于单元测试
- 未来支持 Firefox (firefox.tabs API 略有不同)
- 统一管理页面导航逻辑

---

### Q3: Mock Repository 和 Chrome Repository 的职责边界?

**A**:
- **Chrome Repository**: 生产环境使用,依赖真实 chrome API
- **Mock Repository**: 测试环境使用,模拟 chrome API 行为,不依赖浏览器环境

Mock Repository 必须提供:
- 数据追踪 (sentClips/openedUrls)
- reset() 方法清理测试数据
- setMockResult() 模拟不同返回值

---

### Q4: 配置订阅 (onChange) 会不会导致性能问题?

**A**: 不会,因为:
1. **chrome.storage.onChanged 是浏览器事件**,只在实际配置变更时触发
2. **onChange 回调是防抖的**,Repository 内部合并多次变更
3. **单元测试验证**: 必须包含 "should trigger onChange exactly ONCE" 测试

参考 Week 1-2 的防御机制,避免双触发 Bug。

---

### Q5: E2E 测试为什么放在 Week 4 而非每周?

**A**:
- **Week 1-3 专注单元测试**,验证 Repository 功能正确性
- **Week 4 集成测试**,验证 UI → Repository → Background 完整链路
- E2E 测试依赖所有 Repository 就绪,Week 4 是最早可行时机

---

### Q6: 如果 Week 1 ClipperDialog 重构失败怎么办?

**A**: **回滚机制**:
1. Week 1 Day 25 审核,如未通过:
   - 回滚 ClipperDialog 修改
   - 保留 IClipRepository 接口 (供后续使用)
   - Week 2 继续 Video 重构,Week 5 再尝试 Clipper

2. 降级方案:
   - ClipperDialog 保持现状,只重构 Video + Reader
   - Month 2 目标调整为 "2/3 核心组件重构完成"

---

## 📚 参考文档

- [ARCHITECTURE-REFACTOR-PLAN.md](./ARCHITECTURE-REFACTOR-PLAN.md) - 架构重构总体规划
- [REPO-MONTH1-EXECUTION-PLAN.md](./REPO-MONTH1-EXECUTION-PLAN.md) - Month 1 执行参考
- [Repository 设计原则](../../src/shared/repositories/README.md) - Repository 接口设计指南
- [Week 1-2 防御机制 FAQ](./REPO-MONTH1-EXECUTION-PLAN.md#q6-为什么禁止添加-storagesyncwatchkey) - 避免双触发 Bug

---

## ✅ Month 2 验收检查表

**验收人**: 架构负责人
**验收日期**: Week 4 Day 40

### 代码质量

- [x] TypeScript 编译通过 (0 errors)
- [x] ESLint 通过 (0 errors)
- [x] 所有文件代码行数符合限制

### 功能完整性

- [x] 创建 4 个 Repository 接口 (Clip/Video/Reader/Navigation)
- [x] 实现 4 个 Chrome Repository
- [x] 实现 4 个 Mock Repository
- [x] 重构 4 个核心文件 (dialog/prompt/session/bootstrap)

### 测试覆盖

- [x] 单元测试覆盖率 > 70% (Content Scripts)
- [x] ClipperDialog 单元测试通过 (5+ tests)
- [x] VideoPrompt 单元测试通过 (5+ tests)
- [x] ReaderSession 单元测试通过 (5+ tests)
- [x] E2E 测试通过 (8+ tests)

### 架构验证

- [x] Content Scripts 零 chrome API 残留 (grep 验证)
- [x] 所有 onChange 单次触发 (单元测试验证)
- [x] 所有 destroy() 清理订阅 (无内存泄漏)
- [x] 包体积增加 < 10KB

### 文档更新

- [x] 更新 src/shared/repositories/README.md
- [x] 更新架构图标注 Content Scripts 完成状态
- [x] 创建 Month 2 完成报告

---

**签名**: ________________
**日期**: ________________

---

> 📌 **提示**: Month 2 完成后,Month 3 将重构 Shared Services (yamlConfigService 等),实现 100% Repository 覆盖。
