# Month 3 Week 1-2 验收审计报告 (任务 3.1-3.4)

> **审计日期**: 2025-11-30
> **审计范围**: Repository 重构 Month 3 Week 1-2 (Day 41-50)
> **审计依据**: `REPO-MONTH3-EXECUTION-PLAN.md` 验收标准

---

## 审计执行摘要

| 项目 | 状态 | 得分 |
|------|------|------|
| **任务 3.1**: yamlConfigService 架构债务分析 | ✅ 通过 | 100/100 |
| **任务 3.2**: YamlConfigService 纯函数化 | ✅ 通过 | 95/100 |
| **任务 3.3**: ChromeYamlRepository 接管 storage | ⚠️ 需修复 | 80/100 |
| **任务 3.4**: 调用方迁移至 Repository | ⚠️ 部分通过 | 75/100 |
| **综合质量门禁** | ❌ 未通过 | - |

**总体评价**: 核心重构工作完成 85%,存在 **5 处关键问题** 需修复后方可通过验收。

---

## 任务 3.1: yamlConfigService 架构债务分析 ✅

### 验收标准检查

- [x] 列出 yamlConfigService.ts 所有 chrome.* 调用位置
- [x] 标注哪些是 YAML 解析逻辑(保留为纯函数)
- [x] 标注哪些是 storage 访问(移到 ChromeYamlRepository)
- [x] 创建重构方案文档

### 审计结果

**✅ 文档完整性**: `docs/251126-design-system-poc/YAML-CONFIG-SERVICE-REFACTOR-NOTES.md` (59 行)

**核心内容**:
1. chrome.* 调用清单 (4 处,已全部标注)
2. 纯函数逻辑分层表 (准确区分 YAML 解析 vs storage 访问)
3. 重构方案摘要 (5 点,含 API 设计 + 调用方改造预告)

**结论**: **通过** (100/100)

---

## 任务 3.2: YamlConfigService 纯函数化 ✅

### 验收标准检查

- [x] YamlConfigService 类零 chrome.* 调用
- [x] 所有方法为纯函数(输入确定 → 输出确定,无副作用)
- [x] 移除模块级 `overridesBundle` 全局变量
- [x] 移除 `initializeOverridesFromStorage()` 自动执行
- [ ] TypeScript 0 errors ⚠️

### 审计结果

**✅ chrome API 移除**:
```bash
grep -rn "chrome\." src/shared/services/yamlConfigService.ts | wc -l
# 结果: 0 (完全移除)
```

**✅ YamlConfigService 类实现** (`yamlConfigService.ts:520-580`):
```typescript
export class YamlConfigService {
  resolveConfig(
    contentType: YamlContentType,
    overrides: YamlConfigOverrides | null, // ✅ 显式传入
    options: ResolveYamlConfigOptions = {}
  ): ResolvedYamlConfig {
    const normalizedOverrides = overrides ? normalizeYamlConfigOverrides(overrides) : null;
    const bundle = resolveBundle(DEFAULT_YAML_CONFIG, normalizedOverrides);
    // ...纯函数逻辑,零副作用
  }
}
```

**✅ 辅助 Store**: `src/shared/state/yamlConfigOverridesStore.ts` (104 行)
- 通过 `IOptionsRepository.onChange` 订阅 overrides 变更
- 提供 `get/set/subscribe` API 供调用方使用

**✅ 测试更新**: `tests/unit/shared/yamlConfigService.test.ts` (69 行)
- 直接实例化 `YamlConfigService`,验证纯函数行为
- 无 chrome API mock 依赖

**❌ GAP-1: TypeScript 编译错误**:
```
tests/unit/infrastructure/ChromeYamlRepository.test.ts(46,33): error TS2339: Property 'mockResolvedValueOnce' does not exist on type '() => Promise<CompleteOptions>'.
tests/unit/infrastructure/ChromeYamlRepository.test.ts(56,33): error TS2339: Property 'mockResolvedValueOnce' does not exist on type '() => Promise<CompleteOptions>'.
tests/unit/infrastructure/ChromeYamlRepository.test.ts(73,49): error TS2339: Property 'mock' does not exist on type '(options: Partial<CompleteOptions>) => Promise<void>'.
tests/unit/infrastructure/ChromeYamlRepository.test.ts(82,33): error TS2339: Property 'mockRejectedValueOnce' does not exist on type '(options: Partial<CompleteOptions>) => Promise<void>'.
tests/unit/infrastructure/ChromeYamlRepository.test.ts(93,33): error TS2339: Property 'mockResolvedValueOnce' does not exist on type '() => Promise<CompleteOptions>'.
```

**根因**: Mock 函数未正确声明 Vitest Mock 类型

**修复建议**:
```typescript
// 修改 tests/unit/infrastructure/ChromeYamlRepository.test.ts
const mockOptionsRepository: IOptionsRepository = {
  get: vi.fn<[], Promise<CompleteOptions>>(), // ✅ 显式类型声明
  set: vi.fn<[Partial<CompleteOptions>], Promise<void>>(),
  onChange: vi.fn((listener: (options: CompleteOptions) => void) => {
    subscribers.add(listener);
    return () => { subscribers.delete(listener); };
  })
};
```

**结论**: **需修复 TypeScript 错误后通过** (95/100)

---

## 任务 3.3: ChromeYamlRepository 接管 storage ⚠️

### 验收标准检查

- [x] ChromeYamlRepository 实现 IYamlRepository 所有方法
- [x] 依赖 IOptionsRepository 而非直接访问 chrome API
- [x] onChange 订阅逻辑正确(仅在 yamlConfig 变更时触发)
- [x] 错误处理完善(使用 RepositoryError)
- [ ] TypeScript 0 errors ⚠️

### 审计结果

**✅ Repository 实现** (`src/infrastructure/repositories/ChromeYamlRepository.ts:18-85`):
```typescript
export class ChromeYamlRepository implements IYamlRepository {
  constructor(private readonly optionsRepository: IOptionsRepository) {} // ✅ DI

  async getOverrides(): Promise<YamlConfigOverrides | null> {
    const options = await this.optionsRepository.get();
    return options.yamlConfig ? clone(options.yamlConfig) : null; // ✅ 深拷贝
  }

  async setOverrides(overrides: YamlConfigOverrides): Promise<void> {
    try {
      await this.optionsRepository.set({ yamlConfig: clone(overrides) });
    } catch (error) {
      throw new RepositoryError('Failed to save YAML overrides', 'YamlRepositoryError', { cause: error }); // ✅ 错误包装
    }
  }

  onChange(callback: (overrides: YamlConfigOverrides | null) => void): () => void {
    this.ensureSubscription();
    // ✅ 去重订阅: lastSerialized 变更检测 (lines 34-49)
    this.listeners.add(callback);
    return () => { /* cleanup */ };
  }
}
```

**✅ DI 注册** (`src/shared/di/serviceRegistry.ts:271-280`):
```typescript
registerRepository(DI_TOKENS.IYamlRepository, () => {
  const optionsRepo = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  return new ChromeYamlRepository(optionsRepo); // ✅ 依赖 IOptionsRepository
});
```

**✅ 测试覆盖** (`tests/unit/infrastructure/ChromeYamlRepository.test.ts:1-125`):
- 测试 `getOverrides` 深拷贝逻辑
- 测试 `setOverrides` 错误包装
- 测试 `onChange` 去重通知

**❌ GAP-2: 同任务 3.2 的 TypeScript 错误** (见上述 GAP-1)

**结论**: **需修复 TypeScript 错误后通过** (80/100)

---

## 任务 3.4: 调用方迁移至 Repository ⚠️

### 验收标准检查

- [x] 所有使用方改为注入 IYamlRepository
- [ ] 不再依赖 yamlConfigService 模块级变量 ⚠️
- [ ] 单元测试更新(使用 MockYamlRepository) ⚠️
- [ ] TypeScript 0 errors ⚠️

### 审计结果

**✅ YamlConfigSection 重构** (`src/options/components/sections/YamlConfigSection.ts:37-52`):
```typescript
export class YamlConfigSection extends BaseSection<SectionRenderContext> {
  private readonly yamlRepository: IYamlRepository; // ✅ 注入
  private readonly yamlService: YamlConfigService; // ✅ 纯函数服务

  constructor(container: HTMLElement, deps: YamlSectionDependencies = {}) {
    super(container);
    this.yamlRepository = deps.yamlRepository ?? resolveRepository<IYamlRepository>(DI_TOKENS.IYamlRepository);
    this.yamlService = deps.yamlService ?? new YamlConfigService();
  }

  // ✅ 通过 yamlRepository.getOverrides() 获取,传给 yamlService.resolveConfig()
}
```

**❌ GAP-3: Shared 层仍有 19 处 chrome.* 残留**:

执行计划要求: "Shared 层零 chrome.* 直接调用 (除 infrastructure/)"

实际结果:
```bash
grep -rn "chrome\." src/shared/ | grep -v "infrastructure" | grep -v ".test.ts" | wc -l
# 结果: 19 处
```

**详细清单**:
| 文件 | 行数 | 调用 | 类型 | 建议 |
|------|------|------|------|------|
| `src/shared/types/result.ts` | 87-137 | `chrome.runtime.lastError` | **类型引用 + 工具函数** | ✅ **豁免** (纯类型/工具,无 IO) |
| `src/shared/di/serviceRegistry.ts` | 330 | `typeof chrome !== 'undefined'` | **环境检测** | ✅ **豁免** (仅 guard,无 IO) |
| `src/shared/utils/browserDetection.ts` | 13 | `chrome.runtime` | **环境检测** | ✅ **豁免** (仅 guard,无 IO) |
| `src/shared/errors/analytics/googleAnalyticsReporter.ts` | 244-245 | `chrome.runtime.getManifest()` | **Version 获取** | ⚠️ **需移除** |
| `src/shared/notifications/types.ts` | 34 | `chrome.notifications.TemplateType` | **类型引用** | ✅ **豁免** (纯类型) |
| `src/shared/repositories/{README,IMessagingRepository}.md/.ts` | 多处 | 文档注释 | **文档** | ✅ **豁免** |
| `src/shared/schemas/options.schema.ts` | 115 | 注释 | **文档** | ✅ **豁免** |

**分析**:
- **18 处豁免**: 类型引用/环境检测/文档注释,无实际 IO 操作
- **1 处需修复**: `googleAnalyticsReporter.ts:244-245`

**❌ GAP-4: Options 层残留 5 处 getPlatformServices()**:

执行计划要求: "Options 层零 getPlatformServices() 残留"

实际结果:
```bash
grep -rn "getPlatformServices()" src/options/ | grep -v ".test.ts" | wc -l
# 结果: 5 处
```

**详细清单**:
| 文件 | 行号 | 调用 | 建议 |
|------|------|------|------|
| `src/options/app/experimentalShell.ts` | 261 | `const { storage } = getPlatformServices()` | ❌ **需改为注入 IOptionsRepository** |
| `src/options/state/optionsStore.ts` | 77, 104 | `const { storage } = getPlatformServices()` | ❌ **已废弃文件,应删除或重构** |
| `src/options/components/diagnostics.ts` | 45, 289 | `const { optionsRepository } = getPlatformServices()` | ❌ **需改为构造函数注入** |

**❌ GAP-5: Content Scripts 层残留 7 处 getPlatformServices()**:

执行计划要求: "Content Scripts 层零 getPlatformServices() 残留 (DI 工厂除外)"

实际结果:
```bash
grep -rn "getPlatformServices()" src/content/ | grep -v ".test.ts" | grep -v "Dependencies" | grep -v "index.ts" | wc -l
# 结果: 7 处
```

**详细清单**:
| 文件 | 行号 | 调用 | 状态 |
|------|------|------|------|
| `src/content/reader/presentation/readerPanelView.ts` | 51 | `const { runtime } = getPlatformServices()` | ❌ **需改为注入 IRuntimeRepository** |
| `src/content/ui/supportPrompt.ts` | 18 | `const platformServices = getPlatformServices()` | ❌ **需改为注入** |
| `src/content/video/presentation/videoPanelView.ts` | 52 | `getPlatformServices().runtime.getURL()` | ❌ **需改为注入 IRuntimeRepository** |
| `src/content/clipper/shared/styleRegistry.ts` | 7 | `const { runtime } = getPlatformServices()` | ❌ **需改为注入 IRuntimeRepository** |
| `src/content/clipper/components/dialogFactory.ts` | 29 | `const platform = getPlatformServices()` | ❌ **需改为注入** |
| `src/content/clipper/services/fragmentConfig.ts` | 63 | `optionsRepository ?? getPlatformServices().optionsRepository` | ⚠️ **已有注入,但 fallback 不符合架构原则** |
| `src/content/extractors/aiChatExtractor.ts` | 69 | `const { optionsRepository } = getPlatformServices()` | ❌ **需改为注入** |

**结论**: **需修复 GAP-3/4/5 后通过** (75/100)

---

## 质量门禁检查

### TypeScript 编译 ❌

```bash
npm run typecheck
# 结果: 5 errors in tests/unit/infrastructure/ChromeYamlRepository.test.ts
```

**不通过原因**: Mock 函数类型声明缺失

---

### ESLint ✅

```bash
npm run lint
# 结果: 0 errors
```

**通过**

---

### Lint Warnings ✅

```bash
npm run lint:warnings-guard
# 结果: ✅ Warning 总量保持在基线 0 条
```

**通过**

---

### 单元测试 ✅

```bash
npm run test:unit
# 结果: Test Files 105 passed | Tests 565 passed
```

**通过**

---

### E2E 测试 ⚠️

```bash
npm run test:e2e
# 结果: Test Files 1 failed | 17 passed (18)
#       Tests 1 failed | 23 passed (24)
```

**失败用例**: `tests/e2e/optionsTemplatesAutoSave.test.ts > shows success toast when reading template change auto-saves`

**说明**: 此失败与 YamlConfig 重构无关 (Month 2 遗留问题,已在 Month 2 审计中标注)

**建议**: **不阻塞 Month 3 Week 1 验收**,但需在 Week 3 修复

---

## 修复清单 (优先级排序)

### P0 (阻塞验收)

1. **GAP-1/2**: 修复 `ChromeYamlRepository.test.ts` TypeScript 错误
   - 影响: 阻塞 `npm run typecheck`
   - 工作量: 10 分钟
   - 修复方式: 添加 `vi.fn<[], Promise<T>>()` 类型声明

### P1 (Week 2 补充)

2. **GAP-4**: Options 层移除 5 处 `getPlatformServices()`
   - 影响: 违反执行计划要求 "Options 层零 getPlatformServices()"
   - 工作量: 2 小时
   - 文件: `experimentalShell.ts`, `optionsStore.ts`, `diagnostics.ts`

3. **GAP-5**: Content Scripts 层移除 7 处 `getPlatformServices()`
   - 影响: 违反执行计划要求 "Content Scripts 层零 getPlatformServices() (DI 工厂除外)"
   - 工作量: 3 小时
   - 文件: `readerPanelView.ts`, `supportPrompt.ts`, `videoPanelView.ts` 等

### P2 (Week 3 优化)

4. **GAP-3**: Shared 层移除 1 处 chrome API 调用
   - 文件: `src/shared/errors/analytics/googleAnalyticsReporter.ts:244-245`
   - 修复: 改为注入 `IRuntimeRepository.getManifestVersion()`
   - 工作量: 30 分钟

---

## 验收结论

### 核心成果 ✅

1. **YamlConfigService 纯函数化**: ✅ 完成,零 chrome API 依赖
2. **ChromeYamlRepository 实现**: ✅ 完成,依赖 IOptionsRepository
3. **YamlConfigSection 重构**: ✅ 完成,注入 IYamlRepository
4. **架构债务分析**: ✅ 完成,文档完整

### 遗留问题 ⚠️

1. **TypeScript 编译错误**: 5 处 (阻塞验收)
2. **Options 层 getPlatformServices 残留**: 5 处
3. **Content Scripts 层 getPlatformServices 残留**: 7 处
4. **E2E 测试失败**: 1 处 (非本次重构引入)

### 最终建议

**验收决策**: ❌ **暂缓通过,需修复 GAP-1/2 后重审**

**通过条件**:
1. 修复 `ChromeYamlRepository.test.ts` TypeScript 错误 (P0)
2. 补充 Options/Content Scripts 层 getPlatformServices 清理计划 (P1)

**后续行动**:
- Week 2: 修复 P0 + P1 问题,重审验收
- Week 3: 补充单元测试覆盖率审计 (任务 3.5)
- Week 4: 全量审计 + 架构文档更新 (任务 3.6-3.8)

---

**审计人**: Claude
**审计日期**: 2025-11-30
**签名**: ________________
