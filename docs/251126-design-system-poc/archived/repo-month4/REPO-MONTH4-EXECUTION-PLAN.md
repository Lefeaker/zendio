# Repository 重构 Month 4 执行计划

> **版本**: v1.0
> **创建日期**: 2025-11-30
> **执行周期**: 4 周 (Day 61-80)
> **核心目标**: 测试覆盖率提升 + CI 质量门禁
> **前置条件**: ✅ Month 3 完成 (Shared Services Repository 化,架构债务清零)

---

## Month 4 目标概览

**核心目标**: 提升单元测试覆盖率到 80%+,补充 E2E 测试,建立 CI 质量门禁

**具体交付物**:
1. **Repository 层单元测试**: 100% 覆盖率 (ChromeOptionsRepository, ChromeYamlRepository 等)
2. **UI 层单元测试**: 80%+ 覆盖率 (Options Sections, Content Scripts)
3. **E2E 测试补充**: 15+ 核心流程测试用例
4. **CI 质量门禁**: 测试覆盖率自动检查,阻断低质量代码合并
5. **测试文档**: 测试策略文档 + Mock 使用指南

**成功标准**:
```bash
✅ Repository 层测试覆盖率 100%
✅ UI 层测试覆盖率 > 80%
✅ E2E 测试 47+ 用例通过 (当前 32 个 + 新增 15 个)
✅ CI 门禁配置完成,自动检查覆盖率阈值
✅ TypeScript: 0 errors
✅ ESLint: 0 warnings
```

---

## Week 1: Repository 层单元测试 100% 覆盖 (Day 61-65, 5天)

### 任务 4.1: ChromeOptionsRepository 单元测试 (16h)

**测试目标**: 100% 覆盖率

**当前状态**:
- 文件: `src/infrastructure/repositories/ChromeOptionsRepository.ts` (~120 行)
- 已有测试: 基础 get/set 测试
- 覆盖率: ~60% (估计)

**补充测试场景**:

```typescript
describe('ChromeOptionsRepository', () => {
  let repo: ChromeOptionsRepository;
  let mockStorage: MockPlatformStorage;

  beforeEach(() => {
    mockStorage = new MockPlatformStorage();
    repo = new ChromeOptionsRepository(mockStorage);
  });

  describe('get', () => {
    it('should return default options when storage is empty', async () => {
      // 测试默认值合并逻辑
    });

    it('should merge partial options with defaults', async () => {
      // 测试部分配置更新
    });

    it('should throw RepositoryError when storage fails', async () => {
      // 测试错误处理
      mockStorage.injectError('get', new Error('Storage quota exceeded'));
      await expect(repo.get()).rejects.toThrow(RepositoryError);
    });
  });

  describe('set', () => {
    it('should perform deep merge with existing options', async () => {
      // 测试深度合并逻辑
      await repo.set({ yamlConfig: { contentTypes: { article: {} } } });
      const result = await repo.get();
      expect(result.yamlConfig.contentTypes.article).toBeDefined();
    });

    it('should sanitize invalid options before saving', async () => {
      // 测试输入清洗
      await repo.set({ vaultPath: '  /path/to/vault  ' } as any);
      const result = await repo.get();
      expect(result.vaultPath).toBe('/path/to/vault');
    });

    it('should throw RepositoryError when storage quota exceeded', async () => {
      // 测试 storage 写入失败
      mockStorage.injectError('set', new Error('QUOTA_EXCEEDED'));
      await expect(repo.set({})).rejects.toThrow(RepositoryError);
    });
  });

  describe('onChange', () => {
    it('should immediately trigger callback with initial value', async () => {
      // 测试立即触发
      const callback = vi.fn();
      repo.onChange(callback);
      await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    });

    it('should trigger callback when options change', async () => {
      // 测试订阅触发
      const callback = vi.fn();
      const unsubscribe = repo.onChange(callback);

      await repo.set({ vaultPath: '/new/path' });

      expect(callback).toHaveBeenCalledTimes(2); // 初始 + 变更
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({ vaultPath: '/new/path' })
      );

      unsubscribe();
    });

    it('should not trigger callback for unrelated storage changes', async () => {
      // 测试过滤逻辑
      const callback = vi.fn();
      repo.onChange(callback);

      mockStorage.triggerChange('usageStats', {}, 'sync');

      expect(callback).toHaveBeenCalledTimes(1); // 仅初始触发
    });

    it('should handle multiple subscribers independently', async () => {
      // 测试多订阅者
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsub1 = repo.onChange(callback1);
      const unsub2 = repo.onChange(callback2);

      await repo.set({ vaultPath: '/test' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();

      unsub1();
      await repo.set({ vaultPath: '/test2' });

      expect(callback2).toHaveBeenCalledTimes(3); // 初始 + 2 次变更
    });

    it('should unsubscribe correctly without affecting other listeners', async () => {
      // 测试取消订阅
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsub1 = repo.onChange(callback1);
      repo.onChange(callback2);

      unsub1();
      await repo.set({ vaultPath: '/after-unsub' });

      expect(callback2).toHaveBeenCalled();
    });

    it('should deep clone options before passing to callback', async () => {
      // 测试不可变性
      let received: any;
      repo.onChange((options) => { received = options; });

      await waitFor(() => expect(received).toBeDefined());

      received.vaultPath = 'MUTATED';
      const fresh = await repo.get();
      expect(fresh.vaultPath).not.toBe('MUTATED');
    });
  });
});
```

**验收标准**:
- [ ] ChromeOptionsRepository 测试覆盖率 100%
- [ ] 测试 get/set/onChange 所有方法
- [ ] 测试错误处理 (storage 失败、quota 超限)
- [ ] 测试并发场景 (多订阅者)
- [ ] 测试不可变性 (深拷贝)
- [ ] 所有测试通过

---

### 任务 4.2: ChromeYamlRepository 单元测试 (12h)

**测试目标**: 100% 覆盖率

**当前状态**:
- 文件: `src/infrastructure/repositories/ChromeYamlRepository.ts` (~82 行)
- 已有测试: 基础测试
- 覆盖率: ~70% (估计)

**补充测试场景**:

```typescript
describe('ChromeYamlRepository', () => {
  let yamlRepo: ChromeYamlRepository;
  let mockOptionsRepo: MockOptionsRepository;

  beforeEach(() => {
    mockOptionsRepo = new MockOptionsRepository();
    yamlRepo = new ChromeYamlRepository(mockOptionsRepo);
  });

  describe('getOverrides', () => {
    it('should return null when yamlConfig is undefined', async () => {
      await mockOptionsRepo.set({ yamlConfig: undefined as any });
      const result = await yamlRepo.getOverrides();
      expect(result).toBeNull();
    });

    it('should return yamlConfig from options', async () => {
      const overrides = { contentTypes: { article: { fields: [] } } };
      await mockOptionsRepo.set({ yamlConfig: overrides });
      const result = await yamlRepo.getOverrides();
      expect(result).toEqual(overrides);
    });

    it('should throw RepositoryError when optionsRepo fails', async () => {
      mockOptionsRepo.injectError('get', new Error('Storage error'));
      await expect(yamlRepo.getOverrides()).rejects.toThrow(RepositoryError);
    });
  });

  describe('setOverrides', () => {
    it('should save overrides to options.yamlConfig', async () => {
      const overrides = { contentTypes: { video: { fields: [] } } };
      await yamlRepo.setOverrides(overrides);

      const options = await mockOptionsRepo.get();
      expect(options.yamlConfig).toEqual(overrides);
    });

    it('should throw RepositoryError when optionsRepo fails', async () => {
      mockOptionsRepo.injectError('set', new Error('QUOTA_EXCEEDED'));
      await expect(yamlRepo.setOverrides({})).rejects.toThrow(RepositoryError);
    });
  });

  describe('onChange', () => {
    it('should trigger callback when yamlConfig changes', async () => {
      const callback = vi.fn();
      yamlRepo.onChange(callback);

      const overrides = { contentTypes: { article: { fields: [] } } };
      await mockOptionsRepo.set({ yamlConfig: overrides });

      expect(callback).toHaveBeenCalledWith(overrides);
    });

    it('should not trigger callback when other options change', async () => {
      const callback = vi.fn();
      yamlRepo.onChange(callback);
      callback.mockClear(); // 清除初始触发

      await mockOptionsRepo.set({ vaultPath: '/new/path' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should trigger callback with null when yamlConfig is removed', async () => {
      const callback = vi.fn();
      await mockOptionsRepo.set({ yamlConfig: { contentTypes: {} } });

      yamlRepo.onChange(callback);
      callback.mockClear();

      await mockOptionsRepo.set({ yamlConfig: null as any });

      expect(callback).toHaveBeenCalledWith(null);
    });
  });
});
```

**验收标准**:
- [ ] ChromeYamlRepository 测试覆盖率 100%
- [ ] 测试依赖 IOptionsRepository 的所有路径
- [ ] 测试 onChange 过滤逻辑
- [ ] 测试错误处理
- [ ] 所有测试通过

---

### 任务 4.3: ChromeMessagingRepository 单元测试 (8h)

**测试目标**: 100% 覆盖率

**文件**: `src/infrastructure/repositories/ChromeMessagingRepository.ts`

**测试场景**:
- sendMessage: 成功/失败/超时
- onMessage: 订阅/取消订阅/多订阅者
- 错误处理: Service Worker 未响应/消息格式错误

**验收标准**:
- [ ] ChromeMessagingRepository 测试覆盖率 100%
- [ ] 测试 sendMessage/onMessage
- [ ] 测试超时与重试逻辑
- [ ] 所有测试通过

---

### 任务 4.4: ChromeClipRepository 单元测试 (8h)

**测试目标**: 100% 覆盖率

**文件**: `src/infrastructure/repositories/ChromeClipRepository.ts`

**测试场景**:
- appendClip: 批量追加
- flush: 写入与清空
- 错误处理: messaging 失败

**验收标准**:
- [ ] ChromeClipRepository 测试覆盖率 100%
- [ ] 测试批量追加与 flush 逻辑
- [ ] 所有测试通过

---

### Week 1 验收标准

- [ ] **Repository 层测试覆盖率**: 100%
  - ChromeOptionsRepository: 100%
  - ChromeYamlRepository: 100%
  - ChromeMessagingRepository: 100%
  - ChromeClipRepository: 100%
- [ ] **所有测试通过**: Repository 单元测试 0 failures
- [ ] **测试文档**: 更新 `tests/README.md`,说明 Repository 测试策略

---

## Week 2: UI 层单元测试 80%+ 覆盖 (Day 66-70, 5天)

### 任务 4.5: Options Sections 单元测试 (24h)

**测试目标**: 80%+ 覆盖率

**重点文件**:
- `src/options/components/sections/TemplatesSection.ts`
- `src/options/components/sections/YamlConfigSection.ts`
- `src/options/components/sections/RoutingSection.ts`
- `src/options/components/sections/UsageSection.ts`

**测试模式**:

```typescript
describe('TemplatesSection', () => {
  let section: TemplatesSection;
  let mockOptionsRepo: MockOptionsRepository;
  let mockYamlRepo: MockYamlRepository;

  beforeEach(() => {
    mockOptionsRepo = new MockOptionsRepository();
    mockYamlRepo = new MockYamlRepository();
    section = new TemplatesSection(mockOptionsRepo, mockYamlRepo);
    section.mount(document.body);
  });

  afterEach(() => {
    section.destroy();
  });

  describe('初始化', () => {
    it('should load current template from options', async () => {
      await mockOptionsRepo.set({
        templates: { article: 'Custom/{slug}.md' }
      });

      await section.render();

      const input = section.container.querySelector('[data-field="article"]');
      expect(input.value).toBe('Custom/{slug}.md');
    });

    it('should subscribe to options changes', async () => {
      await section.render();

      await mockOptionsRepo.set({
        templates: { article: 'Updated/{slug}.md' }
      });

      await waitFor(() => {
        const input = section.container.querySelector('[data-field="article"]');
        expect(input.value).toBe('Updated/{slug}.md');
      });
    });
  });

  describe('用户交互', () => {
    it('should save template when user types', async () => {
      await section.render();

      const input = section.container.querySelector('[data-field="article"]');
      input.value = 'New/{slug}.md';
      input.dispatchEvent(new Event('input'));

      await waitFor(async () => {
        const options = await mockOptionsRepo.get();
        expect(options.templates.article).toBe('New/{slug}.md');
      });
    });

    it('should show success toast after save', async () => {
      await section.render();

      const input = section.container.querySelector('[data-field="article"]');
      input.value = 'Test/{slug}.md';
      input.dispatchEvent(new Event('input'));

      await waitFor(() => {
        const toast = document.querySelector('.toast-success');
        expect(toast).toBeInTheDocument();
        expect(toast.textContent).toContain('已保存');
      });
    });

    it('should show error toast when save fails', async () => {
      mockOptionsRepo.injectError('set', new Error('QUOTA_EXCEEDED'));
      await section.render();

      const input = section.container.querySelector('[data-field="article"]');
      input.value = 'Test/{slug}.md';
      input.dispatchEvent(new Event('input'));

      await waitFor(() => {
        const toast = document.querySelector('.toast-error');
        expect(toast).toBeInTheDocument();
        expect(toast.textContent).toContain('保存失败');
      });
    });
  });

  describe('清理', () => {
    it('should unsubscribe onChange when destroyed', async () => {
      await section.render();
      const callbackCount = mockOptionsRepo.onChangeCallbacks.size;

      section.destroy();

      expect(mockOptionsRepo.onChangeCallbacks.size).toBe(callbackCount - 1);
    });
  });
});
```

**验收标准**:
- [ ] TemplatesSection 测试覆盖率 > 80%
- [ ] YamlConfigSection 测试覆盖率 > 80%
- [ ] RoutingSection 测试覆盖率 > 80%
- [ ] UsageSection 测试覆盖率 > 80%
- [ ] 测试 UI → Repository 调用链路
- [ ] 测试 Repository onChange → UI 更新链路
- [ ] 测试错误处理与用户提示
- [ ] 所有测试通过

---

### 任务 4.6: Content Scripts 单元测试 (16h)

**测试目标**: 80%+ 覆盖率

**重点文件**:
- `src/content/clipper/components/dialog.ts`
- `src/content/video/prompt.ts`
- `src/content/reader/session.ts`

**测试场景**:
- ClipperDialog: 打开/关闭/保存/取消
- VideoPrompt: 挂载/定位/交互
- ReaderSession: 高亮/导出/清理

**验收标准**:
- [ ] ClipperDialog 测试覆盖率 > 80%
- [ ] VideoPrompt 测试覆盖率 > 80%
- [ ] ReaderSession 测试覆盖率 > 80%
- [ ] 使用 MockRepository 隔离测试
- [ ] 所有测试通过

---

### Week 2 验收标准

- [ ] **UI 层测试覆盖率**: > 80%
  - Options Sections: > 80%
  - Content Scripts: > 80%
- [ ] **所有测试通过**: UI 单元测试 0 failures
- [ ] **测试文档**: 更新 Mock Repository 使用指南

---

## Week 3: E2E 测试补充 (Day 71-75, 5天)

### 任务 4.7: Options 页面 E2E 测试 (24h)

**测试目标**: 新增 8 个 E2E 测试用例

**新增测试场景**:

```typescript
describe('Options 页面 E2E', () => {
  it('should persist vault router rules to chrome.storage', async () => {
    // 1. 打开 Options → Routing Section
    // 2. 添加新规则: *.example.com → Test Vault
    // 3. 保存
    // 4. 验证 chrome.storage.sync 包含新规则
    // 5. 刷新页面,验证规则仍存在
  });

  it('should sync options changes across tabs', async () => {
    // 1. 打开两个 Options 标签页
    // 2. 在 Tab 1 修改 vault path
    // 3. 验证 Tab 2 自动更新显示
  });

  it('should show validation error for invalid vault path', async () => {
    // 1. 输入无效路径 (如 "not-a-path")
    // 2. 验证显示错误提示
    // 3. 验证无法保存
  });

  it('should handle storage quota exceeded gracefully', async () => {
    // 1. Mock chrome.storage.sync.set 返回 QUOTA_EXCEEDED
    // 2. 尝试保存大量数据
    // 3. 验证显示友好错误提示
    // 4. 验证数据未被损坏
  });

  it('should export usage stats to CSV', async () => {
    // 1. 生成模拟使用统计数据
    // 2. 点击导出按钮
    // 3. 验证下载 CSV 文件
    // 4. 验证 CSV 格式正确
  });

  it('should clear usage stats and update UI', async () => {
    // 1. 生成使用统计数据
    // 2. 点击清除按钮
    // 3. 确认对话框
    // 4. 验证 chrome.storage 清空
    // 5. 验证 UI 显示空状态
  });

  it('should restore default templates', async () => {
    // 1. 修改所有模板
    // 2. 点击恢复默认
    // 3. 验证所有模板恢复为默认值
    // 4. 验证显示成功提示
  });

  it('should navigate between sections without losing state', async () => {
    // 1. 在 Templates Section 输入数据
    // 2. 切换到 Routing Section
    // 3. 切换回 Templates Section
    // 4. 验证输入数据未丢失
  });
});
```

**验收标准**:
- [ ] 新增 8 个 Options E2E 测试
- [ ] 测试覆盖 storage 写入/读取/同步
- [ ] 测试覆盖跨标签页同步
- [ ] 测试覆盖错误处理
- [ ] 所有测试通过

---

### 任务 4.8: Content Scripts E2E 测试 (16h)

**测试目标**: 新增 7 个 E2E 测试用例

**新增测试场景**:

```typescript
describe('Content Scripts E2E', () => {
  it('should capture article and route to correct vault', async () => {
    // 1. 加载测试页面 (news.example.com)
    // 2. 触发 Clipper
    // 3. 输入标题、标签
    // 4. 保存
    // 5. 验证 Background 收到消息
    // 6. 验证路由到 News Vault
    // 7. 验证 Obsidian REST 请求正确
  });

  it('should capture video timestamp with selection', async () => {
    // 1. 加载 YouTube 视频
    // 2. 播放到 1:30
    // 3. 选中字幕文本
    // 4. 点击 Video Prompt
    // 5. 保存
    // 6. 验证 markdown 包含 timestamp
    // 7. 验证 selection 包含在 markdown 中
  });

  it('should handle clipper dialog keyboard shortcuts', async () => {
    // 1. 打开 Clipper Dialog
    // 2. 按 Cmd+Enter 保存
    // 3. 验证保存成功
    // 4. 按 Esc 关闭
    // 5. 验证 dialog 关闭
  });

  it('should restore reader highlights from storage', async () => {
    // 1. 在页面 A 高亮文本
    // 2. 保存 Session
    // 3. 刷新页面
    // 4. 验证高亮恢复显示
  });

  it('should export reader session with all highlights', async () => {
    // 1. 高亮多段文本
    // 2. 添加笔记
    // 3. 点击导出
    // 4. 验证 markdown 包含所有高亮
    // 5. 验证笔记格式正确
  });

  it('should handle AI chat export with code blocks', async () => {
    // 1. 加载 ChatGPT 页面
    // 2. 触发 AI Chat Exporter
    // 3. 验证代码块保留语法高亮标记
    // 4. 验证数学公式正确转换
  });

  it('should retry failed clip submission', async () => {
    // 1. Mock Background 第一次响应失败
    // 2. 尝试保存 Clip
    // 3. 验证显示重试提示
    // 4. 点击重试
    // 5. 验证第二次成功
  });
});
```

**验收标准**:
- [ ] 新增 7 个 Content Scripts E2E 测试
- [ ] 测试覆盖 Clipper/Video/Reader 核心流程
- [ ] 测试覆盖错误重试逻辑
- [ ] 所有测试通过

---

### Week 3 验收标准

- [ ] **E2E 测试总数**: 47+ (当前 32 + 新增 15)
- [ ] **测试通过率**: 100%
- [ ] **测试覆盖**: Options 页面 + Content Scripts 核心流程
- [ ] **测试文档**: E2E 测试运行指南

---

## Week 4: CI 质量门禁 + 最终验收 (Day 76-80, 5天)

### 任务 4.9: 配置测试覆盖率门禁 (8h)

**目标**: 配置 vitest 覆盖率阈值,阻断低质量代码合并

**配置文件**: `vitest.unit.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      thresholds: {
        lines: 80,           // 语句覆盖率 ≥ 80%
        functions: 80,       // 函数覆盖率 ≥ 80%
        branches: 75,        // 分支覆盖率 ≥ 75%
        statements: 80       // 声明覆盖率 ≥ 80%
      },
      exclude: [
        'tests/**',
        'src/infrastructure/**',  // Infrastructure 层暂不强制覆盖
        'src/platform/**',
        'src/third_party/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**'
      ]
    }
  }
});
```

**验收标准**:
- [ ] vitest.unit.config.ts 配置覆盖率阈值
- [ ] 本地运行 `npm run test:coverage` 验证阈值生效
- [ ] 覆盖率不足时命令返回非 0 退出码

---

### 任务 4.10: 配置 CI 门禁 (12h)

**目标**: GitHub Actions 自动检查测试覆盖率,阻断低质量 PR

**配置文件**: `.github/workflows/test.yml`

```yaml
name: Test & Coverage

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run TypeScript type check
        run: npm run typecheck

      - name: Run ESLint
        run: npm run lint

      - name: Run Lint Warning Guard
        run: npm run lint:warnings-guard

      - name: Run unit tests with coverage
        run: npm run test:unit -- --coverage

      - name: Check coverage thresholds
        run: |
          LINES=$(jq '.total.lines.pct' coverage/coverage-summary.json)
          FUNCTIONS=$(jq '.total.functions.pct' coverage/coverage-summary.json)
          BRANCHES=$(jq '.total.branches.pct' coverage/coverage-summary.json)

          echo "Coverage: Lines=$LINES%, Functions=$FUNCTIONS%, Branches=$BRANCHES%"

          if (( $(echo "$LINES < 80" | bc -l) )); then
            echo "❌ Lines coverage $LINES% is below 80%"
            exit 1
          fi

          if (( $(echo "$FUNCTIONS < 80" | bc -l) )); then
            echo "❌ Functions coverage $FUNCTIONS% is below 80%"
            exit 1
          fi

          if (( $(echo "$BRANCHES < 75" | bc -l) )); then
            echo "❌ Branches coverage $BRANCHES% is below 75%"
            exit 1
          fi

          echo "✅ All coverage thresholds met"

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage reports
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
          flags: unittests
          name: codecov-umbrella

      - name: Comment PR with coverage
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          lcov-file: ./coverage/lcov.info
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

**验收标准**:
- [ ] `.github/workflows/test.yml` 配置完成
- [ ] TypeScript/ESLint/Lint Guard 检查
- [ ] 单元测试覆盖率检查 (80%+)
- [ ] E2E 测试检查
- [ ] PR 自动评论覆盖率报告
- [ ] CI 通过后才能合并 PR

---

### 任务 4.11: 最终验收 (8h)

**验收清单**:

#### 测试覆盖率

- [ ] **Repository 层**: 100%
  ```bash
  npm run test:unit -- tests/unit/infrastructure/ --coverage
  # 期望: 100% lines, 100% functions
  ```

- [ ] **UI 层**: > 80%
  ```bash
  npm run test:unit -- tests/unit/options/ tests/unit/content/ --coverage
  # 期望: > 80% lines, > 80% functions
  ```

- [ ] **E2E 测试**: 47+ 通过
  ```bash
  npm run test:e2e
  # 期望: 47/47 passed
  ```

#### 代码质量

- [ ] **TypeScript**: 0 errors
  ```bash
  npm run typecheck
  ```

- [ ] **ESLint**: 0 errors, 0 warnings
  ```bash
  npm run lint
  ```

- [ ] **Lint Warning Guard**: 0 warnings
  ```bash
  npm run lint:warnings-guard
  ```

#### CI 门禁

- [ ] **GitHub Actions 配置**: `.github/workflows/test.yml` 存在
- [ ] **覆盖率阈值检查**: CI 自动验证覆盖率 ≥ 80%
- [ ] **PR 评论**: 自动评论覆盖率变化
- [ ] **合并阻断**: 覆盖率不足时阻止合并

#### 文档更新

- [ ] **测试策略文档**: `docs/TESTING-STRATEGY.md`
- [ ] **Mock 使用指南**: `docs/MOCK-REPOSITORY-GUIDE.md`
- [ ] **E2E 测试指南**: `docs/E2E-TESTING-GUIDE.md`

---

### Week 4 验收标准

- [ ] 所有质量门禁通过
- [ ] CI 配置完成并验证
- [ ] 测试文档完善
- [ ] 创建 `REPO-MONTH4-COMPLETION-REPORT.md`

---

## 交付物清单

### 单元测试代码

| 文件 | 行数 | 覆盖率目标 | 状态 |
|------|------|-----------|------|
| `tests/unit/infrastructure/ChromeOptionsRepository.test.ts` | ~250 | 100% | ⏳ Pending |
| `tests/unit/infrastructure/ChromeYamlRepository.test.ts` | ~180 | 100% | ⏳ Pending |
| `tests/unit/infrastructure/ChromeMessagingRepository.test.ts` | ~120 | 100% | ⏳ Pending |
| `tests/unit/infrastructure/ChromeClipRepository.test.ts` | ~100 | 100% | ⏳ Pending |
| `tests/unit/options/sections/TemplatesSection.test.ts` | ~200 | > 80% | ⏳ Pending |
| `tests/unit/options/sections/YamlConfigSection.test.ts` | ~200 | > 80% | ⏳ Pending |
| `tests/unit/options/sections/RoutingSection.test.ts` | ~200 | > 80% | ⏳ Pending |
| `tests/unit/options/sections/UsageSection.test.ts` | ~150 | > 80% | ⏳ Pending |
| `tests/unit/content/clipper/dialog.test.ts` | ~180 | > 80% | ⏳ Pending |
| `tests/unit/content/video/prompt.test.ts` | ~150 | > 80% | ⏳ Pending |
| `tests/unit/content/reader/session.test.ts` | ~200 | > 80% | ⏳ Pending |

**总计**: ~1930 行测试代码

---

### E2E 测试代码

| 文件 | 测试用例数 | 状态 |
|------|-----------|------|
| `tests/e2e/optionsStoragePersistence.test.ts` | 5 | ⏳ Pending |
| `tests/e2e/optionsCrossTabSync.test.ts` | 3 | ⏳ Pending |
| `tests/e2e/contentScriptsClipperFlow.test.ts` | 4 | ⏳ Pending |
| `tests/e2e/contentScriptsVideoFlow.test.ts` | 3 | ⏳ Pending |

**总计**: 15 个新增 E2E 测试用例

---

### CI 配置文件

| 文件 | 行数 | 状态 |
|------|------|------|
| `.github/workflows/test.yml` | ~80 | ⏳ Pending |
| `vitest.unit.config.ts` (更新) | ~120 | ⏳ Pending |

---

### 测试文档

| 文件 | 行数 | 状态 |
|------|------|------|
| `docs/TESTING-STRATEGY.md` | ~400 | ⏳ Pending |
| `docs/MOCK-REPOSITORY-GUIDE.md` | ~300 | ⏳ Pending |
| `docs/E2E-TESTING-GUIDE.md` | ~250 | ⏳ Pending |

**总计**: ~950 行文档

---

## 时间线与里程碑

### Week 1 (Day 61-65): Repository 层测试 100% 覆盖

**里程碑**: ✅ Repository 层测试覆盖率 100%

- Day 61-62: ChromeOptionsRepository 测试
- Day 63: ChromeYamlRepository 测试
- Day 64: ChromeMessagingRepository 测试
- Day 65: ChromeClipRepository 测试

**验收门禁**:
```bash
npm run test:unit -- tests/unit/infrastructure/ --coverage
# 期望: 100% lines, 100% functions
```

---

### Week 2 (Day 66-70): UI 层测试 80%+ 覆盖

**里程碑**: ✅ UI 层测试覆盖率 > 80%

- Day 66-68: Options Sections 测试
- Day 69-70: Content Scripts 测试

**验收门禁**:
```bash
npm run test:unit -- tests/unit/options/ tests/unit/content/ --coverage
# 期望: > 80% lines, > 80% functions
```

---

### Week 3 (Day 71-75): E2E 测试补充

**里程碑**: ✅ E2E 测试 47+ 用例通过

- Day 71-73: Options 页面 E2E 测试
- Day 74-75: Content Scripts E2E 测试

**验收门禁**:
```bash
npm run test:e2e
# 期望: 47/47 passed
```

---

### Week 4 (Day 76-80): CI 门禁 + 最终验收

**里程碑**: ✅ Month 4 完全验收通过

- Day 76-77: 配置覆盖率门禁
- Day 78-79: 配置 CI 门禁
- Day 80: 最终验收

**验收门禁**:
```bash
npm run typecheck
# 期望: 0 errors

npm run lint
# 期望: 0 errors, 0 warnings

npm run test:coverage
# 期望: Lines 80%+, Functions 80%+, Branches 75%+

npm run test:e2e
# 期望: 47/47 passed
```

---

## 成功指标

| 指标 | 当前 | 目标 | 验证方式 |
|------|------|------|---------|
| **Repository 层覆盖率** | ~70% | 100% | `npm run test:unit -- tests/unit/infrastructure/ --coverage` |
| **UI 层覆盖率** | ~50% | > 80% | `npm run test:unit -- tests/unit/options/ tests/unit/content/ --coverage` |
| **E2E 测试用例数** | 32 | 47+ | `npm run test:e2e` |
| **CI 门禁配置** | 无 | 完成 | `.github/workflows/test.yml` 存在 |
| **测试文档** | 无 | 完成 | 3 份测试文档完成 |
| **TypeScript 错误** | 0 | 0 | `npm run typecheck` |
| **ESLint 警告** | 0 | 0 | `npm run lint:warnings-guard` |

---

## 风险管理

### 高风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **测试覆盖率目标过高** | 延期 1 周 | 中 | ✅ Mock Repository 简化测试编写 + 优先覆盖核心路径 |
| **E2E 测试不稳定** | 影响 CI 可靠性 | 中 | ✅ 配置 `test.retry = 1` + 严格测试隔离 |
| **CI 配置复杂** | 延期 2 天 | 低 | ✅ 参考业界最佳实践 + 分步验证 |

### 中风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **测试编写工作量超预期** | 延期 3 天 | 低 | ✅ Week 1 完成后评估,必要时调整 Week 2-3 范围 |
| **覆盖率阈值设置不合理** | 误报 | 低 | ✅ 先设置 75%,逐步提升到 80% |

---

## FAQ

### Q1: 为什么 Repository 层要求 100% 覆盖率?

**A**: Repository 层是数据访问的唯一入口,逻辑相对简单但极其关键。100% 覆盖率确保:
- ✅ 所有 get/set/onChange 路径验证
- ✅ 所有错误处理分支验证
- ✅ 订阅/取消订阅逻辑验证

由于 Repository 接口明确,测试编写成本低,100% 覆盖率是可达成且必要的。

---

### Q2: UI 层为什么只要求 80%?

**A**: UI 层包含大量边界交互逻辑,100% 覆盖率成本极高且收益递减。80% 覆盖率足以验证:
- ✅ 核心业务逻辑 (初始化、用户交互、保存)
- ✅ Repository 集成链路
- ✅ 错误处理

剩余 20% 通常是边缘 UI 状态,E2E 测试可补充覆盖。

---

### Q3: E2E 测试为什么新增 15 个用例?

**A**: 当前 32 个 E2E 测试主要覆盖 AI Chat 提取 + Options 基础流程。新增 15 个用例补充:
- ✅ Options storage 持久化 + 跨标签页同步
- ✅ Clipper/Video/Reader 完整流程
- ✅ 错误重试与降级逻辑

达到 47 个用例后,核心用户流程覆盖率 > 90%。

---

### Q4: CI 门禁会不会过于严格?

**A**: 不会。覆盖率门禁设置:
- Lines: 80% (行业标准)
- Functions: 80% (确保核心函数测试)
- Branches: 75% (允许少量防御分支未覆盖)

且排除 `infrastructure/`, `platform/`, `third_party/` 等非核心代码。这是**业界主流开源项目的标准配置**。

---

### Q5: Month 4 完成后,下一步是什么?

**A**: Month 5-6: 性能优化 + 用户体验提升
- Week 1: 包体积优化 (目标 < 200KB gzipped)
- Week 2: 启动性能优化 (目标 < 100ms)
- Week 3: 用户反馈收集 + Bug 修复
- Week 4: 1.0 Release Candidate

---

## 验收检查表

**验收人**: 架构负责人
**验收日期**: Week 4 Day 80

### 测试覆盖率

- [ ] Repository 层覆盖率 100%
- [ ] UI 层覆盖率 > 80%
- [ ] E2E 测试 47+ 用例通过

### 代码质量

- [ ] TypeScript 编译通过 (0 errors)
- [ ] ESLint 通过 (0 errors, 0 warnings)
- [ ] Lint Warning Guard 通过

### CI 门禁

- [ ] `.github/workflows/test.yml` 配置完成
- [ ] 覆盖率阈值检查生效
- [ ] PR 自动评论覆盖率
- [ ] 低质量 PR 自动阻断

### 文档更新

- [ ] TESTING-STRATEGY.md 完成
- [ ] MOCK-REPOSITORY-GUIDE.md 完成
- [ ] E2E-TESTING-GUIDE.md 完成
- [ ] 创建 REPO-MONTH4-COMPLETION-REPORT.md

---

**签名**: ________________
**日期**: ________________

---

> 📌 **提示**: Month 4 完成后,项目进入 1.0 Release Candidate 阶段,重点转向性能优化与用户体验提升。
