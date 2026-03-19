# Chrome API 解耦实施手册

这份手册用于指导如何在 AiiinOB 项目中逐步消除 “Chrome API 直接依赖散布全项目” 问题，目标是在可控风险下完成统一抽象，确保功能稳定。

---

## 0. 适用范围与前置准备

- 适用于 `AiiinOB/src` 下所有直接调用 `chrome.*` 的 TypeScript 模块。
- 操作前确认本地有完整的自动化测试环境，并能在 Chrome/Edge 开发者模式下加载扩展进行手动验证。
- 全程保持小步提交；若仓库启用变更日志或 CI，需要提前告知团队这一重构计划。

---

## 1. 建立 Chrome API 使用清单

1. 在仓库根目录执行初步扫描：
   ```bash
   rg "chrome\." AiiinOB/src --type ts --no-heading --line-number
   ```
   将输出重定向到临时文件，便于后续统计：
   ```bash
   rg "chrome\." AiiinOB/src --type ts --no-heading --line-number > tmp/chrome-usages.txt
   ```
2. 以功能域分类整理结果（建议汇总到共享文档 / issue）：
   - 内容脚本：`src/content/**`
   - 选项页：`src/options/**`
   - 后台：`src/background/**`
   - 公共模块：`src/shared/**`、`src/platform/**`（若已存在）
3. 为每条调用补充元数据，可使用下列表格模板：

   | 文件 | 行号 | API | 主要用途 | 返回值模式 | 错误处理 | 备注 |
   |------|------|-----|----------|------------|----------|------|
   | `src/content/extractors/aiChatExtractor.ts` | 42 | `chrome.storage.sync.get` | 读取 AI Chat 选项 | Promise 包装 | 无显式处理 | 可与缓存策略合并 |

   - “返回值模式”用于标注该调用当前是同步、回调还是通过自定义 Promise。
   - “错误处理”记录是否访问 `chrome.runtime.lastError` 或使用 `try/catch`。
4. 统计高频 API：
   ```bash
   rg "chrome\." AiiinOB/src --type ts --no-heading -o | sort | uniq -c | sort -nr
   ```
   根据统计结果标记优先抽象对象，当前重点包括 `storage`、`runtime.sendMessage`、`contextMenus`、`notifications`。
5. 输出结果后进行团队评审，确认是否存在业务上必须保留的直接调用（例如仅在 content script 可用的 API）。

> 产出：Chrome API 调用矩阵表（建议随 PR 上传），为后续抽象定义提供依据。

---

## 2. 设计统一抽象层

1. **确定服务边界**：参考清单，将 API 分组为独立服务接口：
   - `storage`: `sync/local` 存储读写、监听。
   - `messaging`: runtime 消息、长连接（`connect`）。
   - `contextMenus`: 菜单注册、更新、移除。
   - `notifications`: 创建/清理通知。
   - `runtime`: 获取 manifest、管理安装事件等。
   记录每组依赖的浏览器权限与可用上下文（background/content/options）。
2. **定义接口契约**：在 `src/platform`（可新建）下建立 `interfaces/` 目录，按服务拆分文件。示例：
   ```ts
   // src/platform/interfaces/storage.ts
   export interface StorageService {
     get<T>(key: string): Promise<T | undefined>;
     set<T>(key: string, value: T): Promise<void>;
     remove(key: string): Promise<void>;
     subscribe<T>(key: string, callback: (value: T | undefined) => void): () => void;
   }
   ```
   - 接口仅暴露 Promise/同步返回，禁止传出裸回调。
   - 对监听类函数约定返回解除订阅的函数，便于调用方释放资源。
3. **约定错误模型与 logging**：
   - 统一封装 `chrome.runtime.lastError`，转化为 `Error` 并附带 `code` 字段。
   - 约定日志尺寸：接口层仅在抛出前记录 debug 级别日志，业务层再决定是否上报。
   - 将所有接口的错误类型集中定义在 `src/platform/errors.ts`。
4. **定义平台服务聚合类型**：
   ```ts
   export interface PlatformServices {
     storage: StorageService;
     messaging: MessagingService;
     // ...
   }
   ```

   **P2-3 接口抽象整治后的扩展**：平台容器现已新增业务级接口，提供更高层次的抽象：
   ```ts
   export interface PlatformServices {
     // 基础平台服务
     storage: StorageService;
     messaging: MessagingService;
     runtime: RuntimeService;
     contextMenus: ContextMenusService;
     notifications: NotificationsService;
     tabs: TabsService;
     action: ActionService;
     scripting: ScriptingService;

     // 业务级服务（P2-3 新增）
     optionsRepository: OptionsRepository;
     restClient: RestClient;
   }
   ```

   业务级接口的优势：
   - `OptionsRepository`: 提供统一的选项存储抽象，支持深拷贝、缓存和订阅
   - `RestClient`: 抽象REST写入逻辑，支持HTTPS/HTTP fallback和错误处理
   - 通过工厂函数创建，便于测试时注入mock实现
   - 与底层Chrome API解耦，未来可扩展到其他平台

5. **评审与签字**：接口设计完成后发起单独 PR，与团队确认命名、返回类型、后续平台扩展方式。

> 产出：接口定义 PR（仅新增接口 & 类型，不修改现有业务），附带使用守则说明。

---

## 3. 实现 Chrome 适配器（不接入业务）

1. 在 `src/platform/chrome/` 下按服务划分文件，例如：
   - `storage.ts`
   - `messaging.ts`
   - `contextMenus.ts`
   - `notifications.ts`
2. 编写通用工具函数，复用回调转 Promise、错误转换逻辑：
   ```ts
   function wrapChromeCall<T>(invoke: (resolve: (value: T) => void, reject: (error: Error) => void) => void): Promise<T> {
     return new Promise((resolve, reject) => {
       invoke(resolve, (error) => reject(error));
     });
   }

   function translateLastError(): Error | null {
     const lastError = chrome.runtime.lastError;
     if (!lastError) {
       return null;
     }
     return Object.assign(new Error(lastError.message ?? 'UNKNOWN_CHROME_ERROR'), {
       code: 'CHROME_ERROR'
     });
   }
   ```
   确保所有适配器都调用这些辅助方法，避免重复实现。
3. 对监听类 API（如 `chrome.storage.onChanged`、`chrome.runtime.onMessage`）提供封装注册/注销逻辑：
   ```ts
    subscribe<T>(key, callback) {
      const handler = (changes, area) => {
        if (area === 'sync' && key in changes) {
          callback(changes[key].newValue as T | undefined);
        }
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    }
   ```
4. 增补单元测试：
   - 使用 `sinon` 或内置 mock 模拟 `chrome` 对象。
   - 覆盖成功路径、`lastError` 出现、监听取消的场景。
   - 对工具函数单独测试，保证 Promise/错误行为一致。
5. 适配器 PR 不修改任何业务文件，但需要更新 `tsconfig`（若添加新别名）及 lint 配置。

> 产出：Chrome 适配器实现 + 单元测试 + 复用工具函数。

---

## 4. 引入依赖注入容器（或服务管理器）

1. 新建 `src/platform/services.ts`，集中暴露默认实现：
   ```ts
   import { chromeStorageService } from './chrome/storage';
   import { chromeMessagingService } from './chrome/messaging';
   import { createCompatibilityOptionsRepository } from '../infrastructure/optionsRepository';
   import { createFetchRestClient } from '../infrastructure/restClient';
   // ...

   export const services: PlatformServices = {
     // 基础平台服务
     storage: chromeStorageService,
     messaging: chromeMessagingService,
     // ...

     // 业务级服务（P2-3 新增）
     optionsRepository: createCompatibilityOptionsRepository(chromeStorageService),
     restClient: createFetchRestClient(),
   };
   ```

   **P2-3 整治后的依赖注入容器**：现在使用更完善的DI容器和配置机制：
   ```ts
   import { getPlatformServices, configurePlatformServices } from '../platform/services';

   // 获取默认服务
   const { optionsRepository, restClient } = getPlatformServices();

   // 测试时配置覆盖
   configurePlatformServices({
     storage: mockStorageService,
     optionsRepository: mockOptionsRepository
   });
   ```

   若未来要支持测试专用实现，可以改写为工厂函数 `createServices(overrides?)`。
2. 调整各入口文件（`content/index.ts`、`background/index.ts`、`options/index.ts`）：
   - 在顶层 import `services`，并在初始化阶段将其挂载到当前上下文（如 `window.__aiobServices`），便于调试。
   - 若已有全局单例，考虑统一迁移到 `services`。
3. 为了降低后续 diff，可在每个使用文件内部新增微型代理：
   ```ts
   function getStorage() {
     return services.storage;
   }
   ```
   在完全迁移完成前不要删除旧的 `chrome` 引用，确保编译通过。
4. 引入 lint 规则防止直接使用 `chrome`（例如自定义 `eslint` 规则或 `ban-types` 注释），后续步骤中再开启。

> 产出：服务定位器/容器基线代码，搭配入口注入，仍未改动业务逻辑。

---

## 5. 渐进式业务迁移

建议以“模块簇”为单位推进（例如“AI Chat 抽取相关文件”、“视频模式内容脚本”），每批迭代遵循以下 Checklist：

1. **准备阶段**
   - 确定批次范围、列出受影响文件。
   - 明确该批次的自动化测试、手动验证步骤。
   - 如果需要 feature flag，约定 flag 名称与默认值（默认 true 表示新实现）。
2. **代码迁移**
   - 将直接 `chrome.*` 调用替换为 `services.<service>`。
   - 对监听/订阅类逻辑，补充取消订阅代码并使用服务返回的解除函数。
   - 删除冗余的 `chrome` 类型导入，确保 TypeScript 类型依赖来自接口层。
3. **本地验证**
   - 单元测试：通过依赖注入传入 stub（可使用 `vitest.mock` / `jest.mock`）验证行为。
   - 集成测试：运行 `pnpm test:e2e`（示例命令，根据项目实际脚本调整）。
   - 手动测试（记录在 PR 描述中）：
     - 剪藏文章 / 对话 / 视频
     - 选项页保存配置
     - 弹出支持提示 / 通知
4. **回归与评审**
   - 在 PR 模板中附上 Checklist 勾选项、影响范围、手动测试结果。
   - 专门请熟悉该模块的同事评审，关注异常处理与性能影响。
   - 合并前再执行一次冒烟，确认 feature flag 关闭时仍可回退。
5. **落地后记录**
   - 在迁移矩阵中标记该模块“已完成”。
   - 如发现新的封装需求（例如额外 API），及时更新接口设计。

> 要点：保持每个批次 diff 可控（建议 < 500 行），确保问题定位与回滚成本最低。

---

## 6. 全局验证与清理

1. **彻底扫描残留调用**：
   ```bash
   rg "chrome\." AiiinOB/src --type ts
   ```
   - 对于必须直接调用的场景（例如 content script 专属 API），在代码旁添加注释说明并在矩阵中标记“豁免”。
2. **移除过渡逻辑**：
   - 删除 feature flag，或将默认值设置为新实现并记录在变更日志。
   - 移除不再使用的临时代理函数（例如 `getStorage()`），直接注入 `services`。
3. **全量冒烟与回归**：
   - 打包并在 Chrome 开发者模式安装扩展。
   - 执行一次完整业务流程：
     - 剪藏文章、AI 对话、视频片段。
     - 选项页打开、保存、刷新后校验数据。
     - 打开上下文菜单/快捷键、弹出通知。
   - 若有监控/埋点，确认数据未异常。
4. **文档与培训**：
   - 更新 `README` 或架构文档，记录新的依赖注入方式、如何 mock `services`。
   - 在团队例会上同步迁移成果与注意事项，提醒后续开发遵循新准则。

---

## 7. 回滚预案

若在迁移过程中出现严重回归，请按以下顺序处理：

1. **即时止血**：通过 feature flag 或 `services` 覆盖，在入口层回退到旧实现（可在 `services` 创建 `legacy` 版本）。
2. **版本控制回滚**：若 flag 也无法解决，直接回滚最近 merge 的 PR；保持迁移批次独立，可降低回滚影响面。
3. **问题复盘**：
   - 记录故障场景、触发路径、缺失的测试覆盖。
   - 更新迁移 Checklist，补上导致问题的缺口。
4. **恢复迁移**：在问题解决并补齐测试后，再继续下一批迁移。

---

## 8. 持续优化建议

- 在 `docs/` 下新增 FAQ 或 cookbook，示范常见用法（如“如何在测试中注入 fake messaging service”）。
- 配置 ESLint 自定义规则，禁止在业务代码中出现 `chrome.`（保留豁免路径）。
- 在 CI 中增加 smoke 测试脚本，确保关键流程不受后续提交影响。
- 如果未来支持 Firefox / Edge，可新增 `src/platform/firefox` 适配器，并在 `createServices` 中按 `browser` 对象存在与否选择实现。

---

执行以上流程，可最大限度降低 Chrome API 解耦对现有功能的影响，确保逐步迁移、随时回滚、可观测的重构节奏。祝顺利完成升级。  
