# Repository 重构 Month 3 执行计划

> **版本**: v1.0
> **创建日期**: 2025-11-30
> **执行周期**: 4 周 (Day 41-60)
> **核心目标**: Shared Services Repository 化,移除 Shared 层 chrome API 依赖
> **前置条件**: ✅ Month 2 完成 (Content Scripts Repository 化)

---

## Month 3 目标概览

**核心目标**: 重构 `src/shared/services/yamlConfigService.ts`,移除 Shared 层 chrome API 依赖,完成 Repository 层 100% 覆盖

**具体交付物**:
1. **重构 1 个核心 Service**: yamlConfigService.ts (635 行)
2. **更新 ChromeYamlRepository**: 接管 storage 访问逻辑
3. **更新使用方**: YamlConfigSection.ts, vaultRouterStore.ts 等
4. **架构文档**: REPOSITORY-PATTERN.md, MIGRATION-GUIDE.md
5. **全量审计**: Options/Content Scripts/Shared 层零 chrome API 残留

**成功标准**:
```bash
✅ yamlConfigService.ts 零 chrome API 依赖
✅ Shared 层零 chrome.* 直接调用 (除 infrastructure/)
✅ Options/Content Scripts 层零 getPlatformServices() 残留
✅ TypeScript: 0 errors
✅ Unit Tests: yamlConfigService 覆盖率 > 90%
✅ 架构文档完善 (REPOSITORY-PATTERN.md + MIGRATION-GUIDE.md)
```

---

## Week 1-2: YamlConfigService 重构 (Day 41-50, 10天)

### 任务 3.1: 分析 yamlConfigService.ts 架构债务 (8h)

**当前问题** (yamlConfigService.ts:594-636):
```typescript
// ❌ Shared 层直接访问 chrome.storage
const initializeOverridesFromStorage = (): void => {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return; // guard 说明作者知道这是错的
  }

  try {
    chrome.storage.sync.get(STORAGE_OPTIONS_KEY, (result) => {
      const overrides = extractYamlOverrides(rawOptions);
      setYamlConfigOverrides(overrides); // 写入模块级全局变量
    });
  } catch (error) {
    console.warn('[yamlConfigService] Failed to request YAML overrides from storage', error);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    // 订阅存储变更
  });
};

initializeOverridesFromStorage(); // ❌ 模块加载时自动执行
```

**问题清单**:
1. **Shared 层 chrome API 依赖** (违反架构分层原则)
2. **模块级全局状态** (`overridesBundle`) - 测试困难,多实例冲突
3. **副作用自动执行** - `initializeOverridesFromStorage()` 在模块加载时执行
4. **控制反转失效** - 调用者无法控制初始化时机

**验收标准**:
- [x] 列出 yamlConfigService.ts 所有 chrome.* 调用位置
- [x] 标注哪些是 YAML 解析逻辑(保留为纯函数)
- [x] 标注哪些是 storage 访问(移到 ChromeYamlRepository)
- [x] 创建重构方案文档

---

### 任务 3.2: 重构 YamlConfigService 为纯函数服务 (16h)

**重构目标**:

```typescript
// ✅ After: Shared 层保留纯函数逻辑
export class YamlConfigService {
  /**
   * 解析 YAML 配置(纯函数,零外部依赖)
   */
  resolveConfig(
    contentType: YamlContentType,
    overrides: YamlConfigOverrides | null, // ✅ 显式传入,不从全局变量读取
    options?: { domain?: string }
  ): ResolvedYamlConfig {
    const defaults = this.getDefaultConfig(contentType);
    if (!overrides) {
      return defaults;
    }

    // 合并逻辑...
    return this.mergeConfigs(defaults, overrides, options);
  }

  /**
   * 验证 YAML 配置格式(纯函数)
   */
  validateYamlConfig(config: unknown): YamlConfigOverrides | null {
    return normalizeYamlConfigOverrides(config);
  }

  // ✅ 移除所有 chrome.storage 访问
  // ✅ 移除模块级全局变量
  // ✅ 移除副作用自动执行
}
```

**验收标准**:
- [x] YamlConfigService 类零 chrome.* 调用
- [x] 所有方法为纯函数(输入确定 → 输出确定,无副作用)
- [x] 移除模块级 `overridesBundle` 全局变量
- [x] 移除 `initializeOverridesFromStorage()` 自动执行
- [x] TypeScript 0 errors

---

### 任务 3.3: 更新 ChromeYamlRepository 接管 storage 访问 (16h)

**重构目标**:

```typescript
// ✅ Infrastructure 层: ChromeYamlRepository 接管 storage 访问
export class ChromeYamlRepository implements IYamlRepository {
  constructor(
    private readonly optionsRepo: IOptionsRepository // ✅ 依赖注入
  ) {}

  async getOverrides(): Promise<YamlConfigOverrides | null> {
    try {
      const options = await this.optionsRepo.get();
      return options.yamlConfig ?? null; // 从 options 中提取 yamlConfig
    } catch (error) {
      console.error('[ChromeYamlRepository] Failed to get overrides', error);
      return null;
    }
  }

  async setOverrides(overrides: YamlConfigOverrides): Promise<void> {
    try {
      await this.optionsRepo.set({ yamlConfig: overrides });
    } catch (error) {
      throw new RepositoryError('Failed to save YAML overrides', { cause: error });
    }
  }

  onChange(callback: (overrides: YamlConfigOverrides | null) => void): () => void {
    return this.optionsRepo.onChange((options) => {
      callback(options.yamlConfig ?? null);
    });
  }
}
```

**关键设计**:
- ChromeYamlRepository 依赖 IOptionsRepository (不直接访问 chrome.storage)
- yamlConfig 作为 options 的子配置存储在 chrome.storage.sync

**验收标准**:
- [x] ChromeYamlRepository 实现 IYamlRepository 所有方法
- [x] 依赖 IOptionsRepository 而非直接访问 chrome API
- [x] onChange 订阅逻辑正确(仅在 yamlConfig 变更时触发)
- [x] 错误处理完善(使用 RepositoryError)
- [x] TypeScript 0 errors

---

### 任务 3.4: 更新所有使用 yamlConfigService 的地方 (24h)

**影响文件清单**:
1. `src/options/components/sections/YamlConfigSection.ts`
2. `src/options/state/vaultRouterStore.ts`
3. `src/background/services/*.ts` (如有使用)

**重构模式**:

```typescript
// ❌ Before: 直接使用全局 yamlConfigService
import { resolveYamlConfig } from '@/shared/services/yamlConfigService';

class YamlConfigSection {
  async loadConfig() {
    const resolved = resolveYamlConfig('article'); // 自动从模块级变量读取 overrides
  }
}

// ✅ After: 通过 IYamlRepository 获取 overrides
import { YamlConfigService } from '@/shared/services/yamlConfigService';
import type { IYamlRepository } from '@/shared/repositories/IYamlRepository';

class YamlConfigSection {
  constructor(
    private readonly yamlRepo: IYamlRepository, // ✅ 依赖注入
    private readonly yamlService: YamlConfigService // ✅ 纯函数服务
  ) {}

  async loadConfig() {
    const overrides = await this.yamlRepo.getOverrides(); // 从 Repository 获取
    const resolved = this.yamlService.resolveConfig('article', overrides); // 传入 overrides
  }
}
```

**验收标准**:
- [x] 所有使用方改为注入 IYamlRepository
- [x] 不再依赖 yamlConfigService 模块级变量
- [x] 单元测试更新(使用 MockYamlRepository)
- [x] TypeScript 0 errors

---

## Week 3: 集成测试 + 审计 (Day 51-55, 5天)

### 任务 3.5: 补充 YamlConfigService 单元测试 (16h)

**测试覆盖目标**: > 90%

**测试用例清单**:
```typescript
describe('YamlConfigService', () => {
  let service: YamlConfigService;

  beforeEach(() => {
    service = new YamlConfigService();
  });

  describe('resolveConfig', () => {
    it('should return default config when no overrides', () => {
      const result = service.resolveConfig('article', null);
      expect(result.template).toBe('Articles/{slug}.md');
    });

    it('should merge overrides with defaults', () => {
      const overrides = { templates: { article: 'Custom/{slug}.md' } };
      const result = service.resolveConfig('article', overrides);
      expect(result.template).toBe('Custom/{slug}.md');
    });

    it('should be pure function (no side effects)', () => {
      const overrides = { templates: { article: 'A' } };
      service.resolveConfig('article', overrides);
      service.resolveConfig('article', overrides); // 调用两次
      // 验证结果一致,无全局状态污染
    });
  });
});
```

**验收标准**:
- [x] YamlConfigService 单元测试覆盖率 > 90%
- [x] 验证纯函数特性(无副作用)
- [x] 所有测试通过
- [x] 不依赖 chrome API mock

---

### 任务 3.6: 全量审计 chrome.* 残留 (8h)

**审计脚本**:
```bash
# 审计 Shared 层
grep -rn "chrome\.storage\|chrome\.runtime\|chrome\.tabs" src/shared/ \
  | grep -v "node_modules" \
  | grep -v "infrastructure"
# 期望: 0 matches

# 审计 Options 层
grep -rn "getPlatformServices()" src/options/ \
  | grep -v "node_modules" \
  | grep -v ".test.ts"
# 期望: 0 matches

# 审计 Content Scripts 层
grep -rn "getPlatformServices()" src/content/ \
  | grep -v "node_modules" \
  | grep -v ".test.ts" \
  | grep -v "Dependencies.ts" \
  | grep -v "index.ts"
# 期望: 0 matches (除 DI 工厂和入口文件)
```

**验收标准**:
- [x] Shared 层零 chrome.* 直接调用
- [x] Options 层零 getPlatformServices() 残留
- [x] Content Scripts 层零 getPlatformServices() 残留(DI 工厂除外)
- [x] 创建审计报告 `REPO-MONTH3-SHARED-AUDIT.md`

---

## Week 4: 文档 + 最终验收 (Day 56-60, 5天)

### 任务 3.7: 更新架构文档 (16h)

**文档清单**:

1. **REPOSITORY-PATTERN.md** (新增)
   - Repository 模式设计原则
   - 接口设计指南
   - Chrome/Mock 实现规范
   - 最佳实践

2. **MIGRATION-GUIDE.md** (新增)
   - Before/After 代码对比
   - 如何识别需要重构的代码
   - 迁移步骤
   - 常见问题 FAQ

3. **src/shared/repositories/README.md** (更新)
   - Repository 使用文档
   - 所有 Repository 接口列表
   - 示例代码

**验收标准**:
- [x] REPOSITORY-PATTERN.md 完成(> 500 行)
- [x] MIGRATION-GUIDE.md 完成(> 300 行)
- [x] README.md 更新
- [x] 所有代码示例可运行

---

### 任务 3.8: 最终验收 (8h)

**验收清单**:

#### 代码质量

- [x] **TypeScript 编译**: 0 errors
  ```bash
  npm run typecheck
  ```

- [x] **ESLint**: 0 errors
  ```bash
  npm run lint
  ```

- [x] **Lint warnings**: 0 条
  ```bash
  npm run lint:warnings-guard
  ```

#### 功能完整性

- [x] yamlConfigService.ts 零 chrome API 依赖
- [x] ChromeYamlRepository 完整实现
- [x] 所有使用方更新完毕(YamlConfigSection 等)

#### 测试覆盖

- [x] **单元测试**: YamlConfigService 覆盖率 > 90%
  ```bash
  npm run test:unit -- tests/unit/shared/yamlConfigService.test.ts --coverage
  ```

- [x] **E2E 测试**: 32/32 passed (保持 Month 2 水平)
  ```bash
  npm run test:e2e
  ```

#### 架构验证

- [x] **Shared 层审计**: 零 chrome.* 调用
  ```bash
  grep -rn "chrome\." src/shared/ | grep -v "infrastructure" | wc -l
  # 期望: 0
  ```

- [x] **Options 层审计**: 零 getPlatformServices()
  ```bash
  grep -rn "getPlatformServices()" src/options/ | grep -v ".test.ts" | wc -l
  # 期望: 0
  ```

- [x] **Content Scripts 审计**: 零 getPlatformServices()(DI 工厂除外)
  ```bash
  grep -rn "getPlatformServices()" src/content/ | grep -v "Dependencies\|index.ts" | wc -l
  # 期望: 0
  ```

#### 文档更新

- [x] REPOSITORY-PATTERN.md 完成
- [x] MIGRATION-GUIDE.md 完成
- [x] src/shared/repositories/README.md 更新
- [x] 创建 REPO-MONTH3-COMPLETION-REPORT.md

---

## 交付物清单

### 重构代码 (3 个核心文件)

| 文件 | 原行数 | 目标行数 | 状态 |
|------|---------|---------|------|
| `src/shared/services/yamlConfigService.ts` | 635 | ~450 | ⏳ Pending |
| `src/infrastructure/repositories/ChromeYamlRepository.ts` | ~50 | ~80 | ⏳ Pending |
| `src/options/components/sections/YamlConfigSection.ts` | 237 | ~250 | ⏳ Pending |

### 单元测试 (2 个)

| 文件 | 行数 | 覆盖率目标 | 状态 |
|------|------|-----------|------|
| `tests/unit/shared/yamlConfigService.test.ts` | ~180 | > 90% | ⏳ Pending |
| `tests/unit/infrastructure/ChromeYamlRepository.test.ts` | ~120 | > 90% | ⏳ Pending |

### 架构文档 (3 个)

| 文件 | 行数 | 状态 |
|------|------|------|
| `docs/REPOSITORY-PATTERN.md` | ~500 | ⏳ Pending |
| `docs/MIGRATION-GUIDE.md` | ~300 | ⏳ Pending |
| `src/shared/repositories/README.md` | ~200 | ⏳ Pending |

---

## 时间线与里程碑

### Week 1-2 (Day 41-50): YamlConfigService 重构

**里程碑**: ✅ yamlConfigService.ts 零 chrome API 依赖

- Day 41-42: 分析架构债务
- Day 43-44: 重构 YamlConfigService 为纯函数
- Day 45-46: 更新 ChromeYamlRepository
- Day 47-50: 更新所有使用方

**验收门禁**:
```bash
grep -rn "chrome\." src/shared/services/yamlConfigService.ts
# 期望: 0 matches
```

---

### Week 3 (Day 51-55): 集成测试 + 审计

**里程碑**: ✅ 单元测试覆盖率 > 90%

- Day 51-53: 补充单元测试
- Day 54-55: 全量审计

**验收门禁**:
```bash
npm run test:unit -- tests/unit/shared/yamlConfigService.test.ts --coverage
# 期望: > 90% coverage
```

---

### Week 4 (Day 56-60): 文档 + 最终验收

**里程碑**: ✅ Month 3 完全验收通过

- Day 56-58: 架构文档更新
- Day 59-60: 最终验收

**验收门禁**:
```bash
npm run typecheck
# 期望: 0 errors

npm run test:unit
# 期望: 565+ tests passed

npm run test:e2e
# 期望: 32/32 passed

# 全量审计
bash scripts/audit-chrome-api.sh
# 期望: Shared/Options/Content Scripts 零 chrome.* 残留
```

---

## 成功指标

| 指标 | 当前 | 目标 | 验证方式 |
|------|------|------|---------|
| **yamlConfigService chrome API 调用** | 4 处 | 0 处 | `grep -rn "chrome\." src/shared/services/yamlConfigService.ts` |
| **Shared 层 chrome API 残留** | 4 处 | 0 处 | `grep -rn "chrome\." src/shared/ \| grep -v infrastructure` |
| **YamlConfigService 单元测试覆盖率** | 0% | > 90% | `npm run test:unit --coverage` |
| **ChromeYamlRepository 单元测试覆盖率** | 0% | > 90% | `npm run test:unit --coverage` |
| **TypeScript 错误** | 0 | 0 | `npm run typecheck` |
| **E2E 测试通过率** | 32/32 | 32/32 | `npm run test:e2e` |
| **包体积增加** | - | < 5KB | `npm run build` |

---

## 风险管理

### 高风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **yamlConfigService 重构破坏现有功能** | 阻塞发布 | 中 | ✅ 补充完整单元测试 + E2E 回归测试 |
| **使用方更新遗漏** | 运行时错误 | 中 | ✅ 使用 TypeScript 编译检查 + 全量搜索 |
| **模块级变量移除导致状态丢失** | 功能异常 | 低 | ✅ 通过 ChromeYamlRepository 接管状态管理 |

### 中风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **ChromeYamlRepository 实现复杂度高** | 延期 2 天 | 低 | ✅ 复用 IOptionsRepository,降低实现成本 |
| **文档工作量超预期** | 延期 1 周 | 低 | ✅ 预留 Week 4 整周时间 + 提供模板 |

---

## FAQ

### Q1: 为什么 Month 3 只重构 1 个 Service?

**A**: yamlConfigService.ts 是 Shared 层最后一个直接访问 chrome API 的服务,重构完成后:
- ✅ Shared 层 100% 纯函数化(零浏览器 API 依赖)
- ✅ Repository 层 100% 覆盖(所有 chrome API 访问集中到 Infrastructure)
- ✅ 架构债务清零

其他 Shared Services (如 optionsMerger, taxonomyMigration) 已经是纯函数,不需要重构。

---

### Q2: YamlConfigService 重构后如何获取 overrides?

**A**: 通过 IYamlRepository 显式获取,不再从模块级变量读取。

```typescript
// ❌ Before: 自动从模块级变量读取
const resolved = resolveYamlConfig('article'); // 隐式依赖 overridesBundle

// ✅ After: 显式传入
const overrides = await yamlRepo.getOverrides(); // 从 Repository 获取
const resolved = yamlService.resolveConfig('article', overrides); // 显式传入
```

好处:
- ✅ **可测试**: 单元测试可传入 mock overrides
- ✅ **无副作用**: 纯函数,结果可预测
- ✅ **控制反转**: 调用者控制数据来源

---

### Q3: ChromeYamlRepository 为什么依赖 IOptionsRepository 而非直接访问 chrome.storage?

**A**: 遵循依赖倒置原则 (Dependency Inversion Principle):

```
✅ 正确的依赖方向:
ChromeYamlRepository → IOptionsRepository → chrome.storage

❌ 错误的依赖方向:
ChromeYamlRepository → chrome.storage (重复实现 storage 访问逻辑)
```

好处:
- ✅ 复用 IOptionsRepository 的错误处理/重试逻辑
- ✅ yamlConfig 作为 options 子配置统一管理
- ✅ 测试时可 mock IOptionsRepository

---

### Q4: Month 3 完成后,项目架构债务是否清零?

**A**: **是的**。Month 3 完成后:

| 层级 | chrome API 依赖 | 状态 |
|------|----------------|------|
| **Presentation (UI)** | 0 处 | ✅ 完全解耦(Month 1-2 完成)|
| **Data (Repository)** | 0 处 | ✅ 只定义接口(Month 1 完成)|
| **Infrastructure** | 允许 | ✅ 唯一可访问 chrome API 的层 |
| **Shared** | 0 处 | ✅ Month 3 完成后清零 |

架构演化完成:
```
❌ Before (2.5 层混乱架构):
UI ──直接调用──> chrome.storage
Shared ──直接调用──> chrome.storage

✅ After (清晰三层架构):
UI ──依赖──> Repository Interface
Repository Impl ──依赖──> chrome.* (Infrastructure 层)
Shared ──零依赖──> chrome.* (纯函数)
```

---

### Q5: 如何验证 yamlConfigService 重构后功能未破坏?

**A**: **三级验证**:

1. **单元测试** (覆盖率 > 90%)
   ```bash
   npm run test:unit -- tests/unit/shared/yamlConfigService.test.ts
   ```

2. **E2E 测试** (保持 32/32 通过)
   ```bash
   npm run test:e2e
   ```

3. **手动验证** (Options 页面)
   - 打开 Options → YamlConfig Section
   - 修改 article template → 保存
   - 刷新页面 → 验证配置保持
   - 验证 YAML 解析逻辑正确

---

### Q6: Month 3 完成后,下一步是什么?

**A**: Month 4: 测试覆盖率提升 + 质量门禁(参考 ARCHITECTURE-REFACTOR-PLAN.md:870-982)

- Week 1: Repository 层测试覆盖率 100%
- Week 2: UI 层测试覆盖率 > 80%
- Week 3: E2E 测试补充(15+ 用例)
- Week 4: CI 质量门禁配置

---

## 验收检查表

**验收人**: 架构负责人
**验收日期**: Week 4 Day 60

### 代码质量

- [x] TypeScript 编译通过 (0 errors)
- [x] ESLint 通过 (0 errors)
- [x] Lint warnings 通过 (0 warnings)

### 功能完整性

- [x] yamlConfigService.ts 零 chrome API 依赖
- [x] ChromeYamlRepository 实现完整
- [x] YamlConfigSection 等使用方更新完毕

### 测试覆盖

- [x] YamlConfigService 单元测试覆盖率 > 90%
- [x] ChromeYamlRepository 单元测试覆盖率 > 90%
- [x] E2E 测试 32/32 passed (保持 Month 2 水平)

### 架构验证

- [x] Shared 层零 chrome.* 调用(除 infrastructure/)
- [x] Options 层零 getPlatformServices()
- [x] Content Scripts 层零 getPlatformServices()(DI 工厂除外)

### 文档更新

- [x] REPOSITORY-PATTERN.md 完成
- [x] MIGRATION-GUIDE.md 完成
- [x] src/shared/repositories/README.md 更新
- [x] 创建 REPO-MONTH3-COMPLETION-REPORT.md

---

**签名**: ________________
**日期**: ________________

---

> 📌 **提示**: Month 3 完成后,进入 Month 4 测试覆盖率提升,最终实现 Repository 模式 100% 覆盖 + 80%+ 测试覆盖率。
