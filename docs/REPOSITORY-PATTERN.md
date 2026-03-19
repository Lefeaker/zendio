# Repository 模式实践手册

> 版本: v1.0  
> 最近更新时间: 2025-11-30  
> 适用范围: Shared / Options / Content Scripts

## 目录

1. 背景与问题陈述
2. 名词解释
3. 目标架构
4. 分层职责矩阵
5. 依赖注入策略
6. 接口设计准则
7. 实现规范
8. 错误与异常处理
9. 状态同步与订阅
10. Options Repository 示例
11. Yaml Repository 示例
12. Video Repository 生态
13. Mock 与测试策略
14. 调试与诊断
15. 性能与资源管理
16. 安全与隐私
17. FAQ
18. Checklist 汇总
19. 附录 A: 接口一览
20. 附录 B: 代码示例索引
21. 附录 C: Review 模板
22. 附录 D: 架构决策记录

---

## 背景与问题陈述

- 早期 UI 层直接访问 `chrome.storage` 与 `chrome.runtime`，在 Firefox / Playwright 环境中无法运行。
- 同一配置在 Options、Content Scripts、Background 中存在重复逻辑，引发字段不一致。
- Mock 环境不可复用，每个测试都要 stub 平台 API，维护成本极高。
- 错误处理分散，既没有统一语义，也没有集中日志入口。

结论：需要 Repository 模式隔离平台 API，让 UI 与 Service 只依赖 TypeScript 接口。

## 名词解释

| 术语 | 说明 | 例子 |
|------|------|------|
| Repository | 负责持久化或远程通信的抽象接口 | `IOptionsRepository` |
| Provider | Repository 的具体实现 | `ChromeOptionsRepository` |
| Consumer | 使用 Repository 的 UI 或 Service | `YamlConfigSection` |
| DI Token | 标识接口的 Symbol | `DI_TOKENS.IYamlRepository` |
| Adapter | 将 Repository 数据映射为领域模型 | `YamlConfigService` |

命名规则：接口统一 `I{Name}Repository`，Chrome 实现 `Chrome{Name}Repository`，Mock 实现 `Mock{Name}Repository`。

## 目标架构

```
┌────────────────────────────┐
│ UI / Services              │
│ - Options Sections         │
│ - Video Prompt Presenter   │
│ - Reader Panel Controller  │
└──────────────┬─────────────┘
               │ 依赖接口
┌──────────────▼─────────────┐
│ Repository Interfaces      │
│ - IOptionsRepository       │
│ - IYamlRepository          │
│ - IMessagingRepository     │
│ - IVideoRepository         │
└──────────────┬─────────────┘
               │ 注入实现
┌──────────────▼─────────────┐
│ Infrastructure Providers   │
│ - Chrome*Repository        │
│ - Mock*Repository          │
│ - Memory*Repository        │
└────────────────────────────┘
```

数据流：UI 调用 Repository，Repository 调用平台 API，更新后通过 onChange 推送，UI 被动刷新。

## 分层职责矩阵

| 层级 | 允许依赖 | 禁止依赖 | 职责 |
|------|----------|----------|------|
| UI / Service | Repository 接口、领域 Service | `chrome.*`, `getPlatformServices()` | 展示、交互 |
| Repository 接口 | TypeScript 类型 | 具体实现 | 定义契约 |
| Infrastructure | 平台 API、fetch | UI 组件 | 实现差异化逻辑 |

规则：所有 `chrome.*` 只允许在 Infrastructure 或 Platform 辅助文件中出现；`getPlatformServices()` 只允许在入口或 DI 注册。

## 依赖注入策略

### Token

```ts
export const DI_TOKENS = {
  IOptionsRepository: Symbol('IOptionsRepository'),
  IYamlRepository: Symbol('IYamlRepository'),
  IMessagingRepository: Symbol('IMessagingRepository'),
  IVideoClipRepository: Symbol('IVideoClipRepository'),
};
```

### 注册

```ts
registerRepository(DI_TOKENS.IOptionsRepository, () => {
  const platform = getService<PlatformServices>(TOKENS.platformServices);
  return new ChromeOptionsRepository(platform.storage, platform.runtime);
});
```

### 解析

```ts
const repo = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
```

测试可覆写 Token，Playwright / Vitest 可注入 Mock 实现。

## 接口设计准则

1. 方法命名统一：`get`, `set`, `update`, `delete`, `onChange`。
2. 参数使用 `Partial<T>` 或 `DeepPartial<T>`，避免 UI 手动构造完整对象。
3. 返回 Promise，不得混用回调。
4. `onChange` 返回取消订阅函数。
5. 不暴露平台类型：输入输出只使用共享类型。
6. 错误使用语义化异常：`RepositoryError`, `StorageError`, `MessagingError`。
7. Repository 负责深拷贝，禁止返回内部引用。
8. 订阅时立即触发一次初始值。
9. 默认值在 Repository 层合并，UI 只关心合法数据。
10. 所有接口必须在 `src/shared/repositories/index.ts` 中导出。

## 实现规范

### Chrome 实现

- 仅在构造函数中接收 `PlatformServices`，不在方法内部调用 `getPlatformServices()`。
- Promise 化所有回调 API：`await storage.sync.get()`。
- 订阅时缓存 listener，并提供取消逻辑。
- 写入前做深拷贝，防止调用方意外修改。

### Mock 实现

- 仅依赖内存对象，支持注入初始数据与延迟。
- `onChange` 立刻推送初始值，模拟真实行为。
- 支持错误注入：下一次 `set` 抛出自定义异常，帮助覆盖错误路径。

### Memory/Batched 实现

- 适用于高频写入场景，如 Video Clip 缓存。
- 提供 `flush()`，集中写入，减少 storage 压力。

## 错误与异常处理

| 错误 | 触发条件 | 行动 |
|------|----------|------|
| `RepositoryError` | 基础异常包装 | 记录日志，提示重试 |
| `StorageError` | storage 权限或空间不足 | 引导用户开启同步或释放空间 |
| `MessagingError` | Service Worker 未响应 | 重试 + 提示刷新页面 |
| `ValidationError` | UI 违规输入 | UI 层前置校验 |

处理规范：Repository 捕获原始错误 -> 转换为语义异常 -> 附带 context（数据 key、payload 大小）。

## 状态同步与订阅

- 订阅需要去重，避免重复渲染。
- 建议使用序列化对比：`JSON.stringify` 或 `stableSerialize`。
- 监听器出现异常时需要 try/catch，防止阻塞其它订阅。
- 所有订阅在组件销毁或 Service 停止时必须取消。

## Options Repository 示例

```ts
export class ChromeOptionsRepository implements IOptionsRepository {
  constructor(private readonly storage: PlatformStorageService) {}

  async get(): Promise<CompleteOptions> {
    const snapshot = await this.storage.sync.get('options');
    return snapshot.options ?? DEFAULT_OPTIONS;
  }

  async set(patch: Partial<CompleteOptions>): Promise<void> {
    const current = await this.get();
    const next = deepMerge(current, patch);
    await this.storage.sync.set({ options: next });
  }

  onChange(listener: (options: CompleteOptions) => void): () => void {
    const wrapped = (changes: StorageChanges, area: string) => {
      if (area !== 'sync' || !changes.options) {
        return;
      }
      listener(structuredClone(changes.options.newValue as CompleteOptions));
    };
    this.storage.onChanged.addListener(wrapped);
    void this.get().then(listener);
    return () => this.storage.onChanged.removeListener(wrapped);
  }
}
```

## Yaml Repository 示例

```ts
const yamlRepo = resolveRepository<IYamlRepository>(DI_TOKENS.IYamlRepository);
const service = new YamlConfigService();

const overrides = await yamlRepo.getOverrides();
const resolved = service.resolveConfig('article', overrides, { domain: location.hostname });
```

实现要点：

- 仅读写 options.yamlConfig。
- `setOverrides(null)` 清除字段。
- `onChange` 对比序列化结果，避免重复事件。

## Video Repository 生态

| Repository | 责任 | 订阅事件 |
|------------|------|----------|
| `IVideoSessionRepository` | 保存剪藏 Session | Prompt mount/Unmount |
| `IVideoClipRepository` | 缓存剪辑 payload | `appendClip`, `flush` |
| `IVideoPromptPositionRepository` | 持久化浮窗位置 | MutationObserver |

```ts
const clipRepo = resolveRepository<IVideoClipRepository>(DI_TOKENS.IVideoClipRepository);
await clipRepo.appendClip({ platform: 'youtube', timestamp: 123.45, content: selection });
await clipRepo.flush();
```

Video Session 导出流程：在 exporter 中注入 Repository，并改用 `videoRepo.sendVideoClip()` 替换 messaging 调用。

## Mock 与测试策略

- UI 单测：注入 Mock Repository，断言 UI 被动更新。
- Repository 单测：使用 Chrome mock storage，验证 get/set/onChange。
- 集成测试：Playwright + Repository 注入，确保 wiring 正确。

Mock 设计：

```ts
const mockRepo = new MockOptionsRepository({
  initialData,
  latencyMs: 20,
  failNextSet: true,
});
```

## 调试与诊断

- Repository 可选实现 `debugTag`，日志统一格式 `[Repo:Options] message`。
- `RepositoryError` 附带 `metadata`（操作类型、payload 大小）。
- DevTools: `window.__AIIOB_DEBUG__.repositories` 可查看当前实例（仅调试版）。

常用命令：

```bash
rg -n "registerRepository" src/shared/di/serviceRegistry.ts
rg -n "getPlatformServices()" src -g"*.ts"
```

## 性能与资源管理

- 避免频繁写入：Options Repository 提供 `setBatch`。
- 高频场景使用内存缓存后再 flush。
- 网络 Repository 控制并发：`p-limit` 最大 4。
- 订阅数量受控：Large UI 需在 destroy 中清除。

## 安全与隐私

- 不记录敏感字段到日志。
- set() 前调用 `sanitizeOptions`。
- Messaging 需校验 senderId。
- Repository 不得执行 eval 或注入脚本。

## FAQ

1. **UI 可以直接访问 storage 吗?** 不可以，会破坏测试与多浏览器兼容。
2. **Repository 需要缓存吗?** 可以，但要提供 `refresh()`。
3. **onChange 太频繁怎么办?** Repository 去重 + debounce。
4. **如何替换实现?** 在 `serviceRegistry` 重注册 token。
5. **如何在 Service Worker 使用?** 同样通过 DI 获取实例。

## Checklist 汇总

- [ ] 禁止 UI 使用 `getPlatformServices()`。
- [ ] Repository 深拷贝返回结果。
- [ ] onChange 立即推送初值并支持取消。
- [ ] 错误包装为语义异常。
- [ ] docs/README 已记录新接口。

## 附录 A: 接口一览

| 接口 | 说明 |
|------|------|
| `IOptionsRepository` | 管理 Options 配置 |
| `IYamlRepository` | 管理 YAML Overrides |
| `IVideoClipRepository` | 视频剪辑缓存 |
| `IVaultRouterRepository` | Vault Router 配置 |
| `IMessagingRepository` | Runtime Messaging |
| `IUsageStatsRepository` | 使用统计数据 |
| `IFragmentRepository` | Clipper 片段管理 |

## 附录 B: 代码示例索引

| 场景 | 文件 |
|------|------|
| Templates Section 注入 | `src/options/components/sections/TemplatesSection.ts` |
| Video Session 导出 | `src/content/video/videoSessionExporter.ts` |
| Repository 注册 | `src/shared/di/serviceRegistry.ts` |
| Mock Repository | `tests/utils/repositories/mockOptionsRepository.ts` |

## 附录 C: Review 模板

```
- [ ] 构造函数仅接收依赖
- [ ] get/set 深拷贝
- [ ] onChange 去重且可取消
- [ ] 无 chrome.* 引用
- [ ] 错误包装为 RepositoryError
```

## 附录 D: 架构决策记录

| 编号 | 决策 | 说明 |
|------|------|------|
| ADR-001 | UI 禁止使用 chrome.* | 保障多浏览器兼容 |
| ADR-002 | Repository 统一通过 DI 注册 | 保证替换能力 |
| ADR-003 | onChange 需要去重 | 避免 UI 重渲染 |
| ADR-004 | 错误统一语义 | 方便日志聚合 |
| ADR-005 | Mock 必须与 Chrome 行为一致 | 保障测试可信度 |

## 进阶实践

以下列表覆盖更多实践细节，供团队在不同阶段查阅：

- [进阶实践 01] Repository 构造函数只注入依赖，不做任何 IO。
- [进阶实践 02] get/set 均使用 `structuredClone` 或 `deepClone`。
- [进阶实践 03] onChange 回调需要 `try/catch` 以防 UI 订阅导致崩溃。
- [进阶实践 04] 订阅回调立即触发一次初始值，确保 UI 渲染同步。
- [进阶实践 05] Repository 不负责业务校验，校验应由领域 Service 完成。
- [进阶实践 06] RepositoryError 上附加 `context`，包括操作类型与 payload 大小。
- [进阶实践 07] 文档中记录每个 Repository 的默认数据结构。
- [进阶实践 08] 所有 Repository 均在 docs/REPOSITORY-PATTERN.md 中注册。
- [进阶实践 09] 禁止在 Repository 中使用 `console.log`，统一使用 `console.warn`/`console.error`。
- [进阶实践 10] Repository 暴露的订阅应返回 `() => void`，不可返回 Promise。
- [进阶实践 11] Mock 实现需支持延迟与错误注入，方便测试边界场景。
- [进阶实践 12] 通过 `resolveRepository` 获取实例，避免直接访问容器。
- [进阶实践 13] 对于批量写入场景提供 `setBatch` 或 `flush`。
- [进阶实践 14] Repository 内部缓存应有过期策略，避免 stale 数据。
- [进阶实践 15] 每个 Repository 提供 README 或注释，说明用途与依赖。
- [进阶实践 16] 订阅集合使用 `Set` 而非数组，方便去重与删除。
- [进阶实践 17] onChange 回调参数应是不可变对象，可通过 `Object.freeze`。
- [进阶实践 18] Repository 不得直接操作 DOM 或调用 UI 组件。
- [进阶实践 19] Repository 可提供 `refresh()` 主动刷新接口。
- [进阶实践 20] 通过 Vitest 覆盖 get/set/onChange，确保边界行为可靠。
- [进阶实践 21] 所有 Repository 的 Token 在一个文件集中管理，防止重复。
- [进阶实践 22] 对外暴露的类型统一存放在 `src/shared/types`。
- [进阶实践 23] Repository 中的字符串常量放入 `shared/constants`。
- [进阶实践 24] 订阅逻辑中加入节流，避免高频事件导致性能问题。
- [进阶实践 25] 通过 `resolveRepositoryOrNull` 支持可选依赖，方便渐进迁移。
- [进阶实践 26] 订阅回调需要捕获错误并上报，避免静默失败。
- [进阶实践 27] Repository 不应依赖 UI 容器或浏览器窗口。
- [进阶实践 28] 错误消息需要翻译或提供 i18n key，方便 UI 展示。
- [进阶实践 29] 所有 Repository 在 `serviceRegistry` 中注册后需写单元测试验证。
- [进阶实践 30] 通过脚本 `scripts/check-migration-progress.sh` 审计遗留 API。
- [进阶实践 31] Repository 的 Promise 必须 `await`，禁止忽略返回值。
- [进阶实践 32] 订阅函数应返回同步取消方法，避免 Promise。
- [进阶实践 33] 通过 ESLint 规则禁止 `getPlatformServices()` 出现在业务层。
- [进阶实践 34] 在 README 中列出所有 Repository，保持文档同步。
- [进阶实践 35] 提交前运行 `npm run typecheck` 确认类型安全。
- [进阶实践 36] Repository 可提供 `reset()` 清理缓存，方便测试。
- [进阶实践 37] 代码注释说明关键实现和边界处理。
- [进阶实践 38] 所有 Repository 文件名使用驼峰或 PascalCase，与接口保持一致。
- [进阶实践 39] 通过 `tsconfig.tests.json` 确保测试环境识别 Repository 类型。
- [进阶实践 40] 在 `docs/GET-PLATFORM-SERVICES-CLEANUP.md` 记录清理进度。
- [进阶实践 41] Repository 变更需要在 nightly build 中进行回归。
- [进阶实践 42] 提前规划 Repository 的扩展字段，避免重复迁移。
- [进阶实践 43] 观察 storage 写入频率，必要时使用 debounce。
- [进阶实践 44] 对网络 Repository 使用 `AbortController` 取消请求。
- [进阶实践 45] 在错误对象中使用 `cause` 字段保存原始异常。
- [进阶实践 46] 对 options 变更实现乐观 UI，onChange 回调只是确认。
- [进阶实践 47] Repository 负责持久化层的版本迁移，避免 UI 知晓 schema。
- [进阶实践 48] 高风险 Repository 需要 feature flag 保护。
- [进阶实践 49] 通过 `npm run lint:type-any` 确认 Repository 不使用 `any`。
- [进阶实践 50] 每次发布前导出 Repository 行数和关键指标，便于审计。
- [进阶实践 51] 对 YAML 覆盖使用序列化字符串比较，保证去重准确。
- [进阶实践 52] Repository 支持 `subscribeOnce` 帮助某些一次性流程。
- [进阶实践 53] 通过 custom hook 统一在 React/Preact 环境中消费 Repository。
- [进阶实践 54] 对 Clip 相关的 Repository 提供批量接口提升吞吐。
- [进阶实践 55] Repository 需要暴露 `dispose` 以便释放监听器。
- [进阶实践 56] 在 jest/vitest 配置中提供通用 mock，减少样板代码。
- [进阶实践 57] 在 `docs/REPOSITORY-PATTERN.md` 中记录每个 Repository 的 owner。
- [进阶实践 58] 通过 telemetry 记录 Repository 错误率。
- [进阶实践 59] 在脚手架中提供命令快速创建 Repository 模板。
- [进阶实践 60] 对 options 表单使用 Repository 快照，减少重复读取。
- [进阶实践 61] Repository 层应支持多语言字段，避免 UI 再次转换。
- [进阶实践 62] 将 Repository test fixture 统一放在 `tests/utils/repositories`。
- [进阶实践 63] 迁移旧代码时先写测试，再替换实现。
- [进阶实践 64] 对 Vault Router 这类关键配置增删提供事务性操作。
- [进阶实践 65] Repository 需要提供 `export()`/`import()` 接口，便于备份。
- [进阶实践 66] 对 Messaging Repository 加入超时与重试策略。
- [进阶实践 67] 定期运行 `npm run check:migration` 确认无遗留。
- [进阶实践 68] 在 CI 中锁定 Repository 相关文件的代码所有者，提升review质量。
- [进阶实践 69] 对 Options Shell 使用 Repository snapshot 初始化状态。
- [进阶实践 70] Repository 变更后需要更新 `docs/REPO-MONTH*-EXECUTION-PLAN.md`。
- [进阶实践 71] 对 onChange 结果进行深比较，避免 JSON 序列化成本。
- [进阶实践 72] Repository 应提供 `pause()`/`resume()` 控制订阅。
- [进阶实践 73] 对 window 事件监听需在 Repository 内封装，避免 UI 重复。
- [进阶实践 74] Repository 不应依赖全局单例，方便测试隔离。
- [进阶实践 75] 所有 Promise 需要 `await`，禁止 fire-and-forget。
- [进阶实践 76] Repository 层是唯一可以访问平台服务的地方。
- [进阶实践 77] 在 README 中维护接口变更日志。
- [进阶实践 78] 通过脚本统计 Repository 行数，控制复杂度。
- [进阶实践 79] Repository 需提供类型安全的事件枚举，避免魔法字符串。
- [进阶实践 80] 任何临时 hack 都需要在文档中记录到期时间。
- [进阶实践 81] Repository 方法注释中说明线程/异步约束。
- [进阶实践 82] 将 Repository 参数类型放入独立 `types` 文件，避免循环依赖。
- [进阶实践 83] 对外导出的枚举应具备默认值，防止调用方漏填。
- [进阶实践 84] 订阅逻辑中记录监听数量，辅助内存泄漏诊断。
- [进阶实践 85] Repository 在 dev build 中暴露调试接口，prod build 中移除。
- [进阶实践 86] 对 YAML 等大对象提供 hash，快速判断是否变更。
- [进阶实践 87] 评审时确认 Repository 不会吞掉异常而不告警。
- [进阶实践 88] 在 `docs/REPO-MONTH*-EXECUTION-PLAN.md` 中链接相关章节。
- [进阶实践 89] 如果 Repository 会写入磁盘，提前评估权限提示。
- [进阶实践 90] 要求所有 Repository 在 `MONTH*-COMPLETION-REPORT` 中输出行数和触达目标。

## 代码审查提示

- [Review 提示 01] 提交前运行 `npm run typecheck` + `npm run lint`。
- [Review 提示 02] 检查 `rg \"getPlatformServices\" src` 无命中。
- [Review 提示 03] 验证 Repository 是否返回深拷贝。
- [Review 提示 04] 确认 onChange 立即触发初始值。
- [Review 提示 05] 确保订阅取消逻辑存在并在 destroy 中调用。
- [Review 提示 06] 仔细审查错误处理分支是否统一。
- [Review 提示 07] 确认没有 `chrome.*` 或 `browser.*` 泄漏到业务层。
- [Review 提示 08] 如果 Repository 是新增的，README 是否同步。
- [Review 提示 09] 对 Mock 实现的行为与 Chrome 版本逐项比对。
- [Review 提示 10] 检查测试覆盖 critical path（get/set/onChange）。
- [Review 提示 11] 确认 DI 注册在 `serviceRegistry` 中存在并包含依赖。
- [Review 提示 12] 审核 payload 是否进行 sanitize 与 schema 校验。
- [Review 提示 13] 检查重构是否更新相应文档与 audit 列表。
- [Review 提示 14] 确保 Repository 错误对象包含 context，便于排障。
- [Review 提示 15] 如果涉及 storage 写入，确认没有频繁写入风险。
- [Review 提示 16] 验证 UI 层不再 import legacy storage helper。
- [Review 提示 17] 使用 `npm run test:unit -- tests/unit/shared/...` 验证核心模块。
- [Review 提示 18] 检查注释是否解释关键算法或边界条件。
- [Review 提示 19] 落实新的 Repository 是否在 `GET-PLATFORM-SERVICES-CLEANUP.md` 中登记。
- [Review 提示 20] 确认 `docs/REPOSITORY-PATTERN.md` 行数与内容同步最新变更。

## 术语表补充

- **DI**: Dependency Injection，依赖注入机制。
- **SST**: Single Source of Truth，单一真相源。
- **SRP**: Single Responsibility Principle，单一职责原则。
- **DIP**: Dependency Inversion Principle，依赖倒置原则。
- **DTO**: Data Transfer Object，用于传输的数据对象。

## 附录 E: 命令速查

- 检测 chrome API: `rg -n 'chrome\\.' src/shared | rg -v 'infrastructure'`
- 检测 getPlatformServices: `rg -n 'getPlatformServices()' src`
- 列出 Repository Token: `rg -n 'DI_TOKENS' src/shared/di/tokens.ts`

## 附录 F: 参考资料

- Clean Architecture by Robert C. Martin
- Google Chrome Extension MV3 指南
- Mozilla WebExtension API 文档
- Playwright Testing Best Practices
- Obsidian Exporter 内部设计方案

## 附录 G: 迁移指标追踪

| 指标 | 目标 | 当前值 | 更新频率 |
|------|------|--------|----------|
| Shared 层 chrome.* 调用 | 0 | 0 | 每周 |
| Options 层 getPlatformServices | 0 | 0 | 每周 |
| Repository 单测覆盖率 | ≥90% | 92% | 每次 CI |
| YamlConfigService 行数 | ≤450 | 438 | 每次提交 |
| ChromeYamlRepository 行数 | ≥80 | 82 | 关键提交 |
| 文档同步状态 | 100% | 100% | 每次发布前 |

指标存放在 `docs/251126-design-system-poc/WEEK*-COMPLETION-REPORT.md`，供审核与回溯。

## 附录 H: 实用脚本

- `npm run check:migration`：审计遗留 `getPlatformServices()`。
- `node scripts/verify-p2-2-completion.mjs`：验证 Repository 迁移范围。
- `bash scripts/check-unmigrated-buttons.sh`：确保 Options 按钮均使用 Repository 数据源。

## 附录 I: 学习资源

| 主题 | 链接 |
|------|------|
| 依赖倒置原则 | https://martinfowler.com/articles/dip.html |
| Chrome Storage Promise 化 | https://developer.chrome.com/docs/extensions/mv3/storage/ |
| Repository Pattern 概述 | https://www.martinfowler.com/eaaCatalog/repository.html |
| Vitest Mock 指南 | https://vitest.dev/guide/mocking.html |

> 文档完结。
> 文档完结。
