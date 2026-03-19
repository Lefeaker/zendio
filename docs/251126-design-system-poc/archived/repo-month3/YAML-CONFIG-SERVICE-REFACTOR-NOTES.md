# yamlConfigService 重构分析 (任务 3.1)

> 目标: 识别 `src/shared/services/yamlConfigService.ts` 中的架构债务,为 Month3 Repository 化提供输入

## chrome.* 调用清单

| 位置 | 调用 | 说明 |
| --- | --- | --- |
| `yamlConfigService.ts:600` | `chrome.storage.sync` guard | 直接访问 platform API,与 Shared 层职责冲突 |
| `yamlConfigService.ts:605` | `chrome.storage.sync.get` | 同步读取 `options`,并在回调里写入模块级 `overrides` |
| `yamlConfigService.ts:619` | `chrome.storage.onChanged` guard | 订阅 storage 更新 |
| `yamlConfigService.ts:621` | `chrome.storage.onChanged.addListener` | 监听 `options` 变更,回写全局 overrides |

以上调用均位于 Shared 层文件,违反“Shared 层零 chrome 依赖”要求,同时让调用者无法控制初始化时机。

## 纯函数逻辑分层

| 模块段 | 功能 | 是否纯函数 | 备注 |
| --- | --- | --- | --- |
| `normalizeDomainKey`, `normalizeDomain`, `mergeDomainOverrides` 等 | 字符串/域名规范化 | ✅ | 无副作用,可保留 |
| `sanitizeField*`, `sanitizeContentTypeOverrides`, `resolveBundle` | YAML 解析与深拷贝 | ✅ | 依赖 `DEFAULT_YAML_CONFIG`, 但无外部 IO |
| `resolveYamlConfig`, `mergeFields` | 根据 overrides 计算最终 schema | ⚠️ | 当前通过模块级 `overridesBundle` + `cache`, 需改造为显式输入/依赖注入 |
| `setYamlConfigOverrides`, `clearYamlConfigCache` | 管理模块级状态 | ❌ | 需替换为实例级缓存或调用方注入 |

结论: 字段校验/合并逻辑可以构成 `YamlConfigService` 纯函数 API; 与存储相关的初始化、缓存管理须外移。

## storage 访问点

1. `STORAGE_OPTIONS_KEY` 常量、`extractYamlOverrides`: 从 `chrome.storage.sync` 读取 `options` → 解析 `yamlConfig`.
2. `initializeOverridesFromStorage`: 模块加载即执行,触发 `chrome.storage.sync.get` 和 `chrome.storage.onChanged.addListener`.
3. `overridesBundle` + `cache`: 存储由 storage 驱动的数据,任何 resolve 行为都会隐式依赖该全局值。

这些访问逻辑需要迁移至 `ChromeYamlRepository`, 通过 `IOptionsRepository` 注入,再由上层在需要时将 overrides 传给 `YamlConfigService`.

## 重构方案摘要

1. **引入 `YamlConfigService` 类**  
   - 构造函数不依赖外部服务。  
   - `resolveConfig(contentType, overrides, options)` 返回 `ResolvedYamlConfig`, 内部维持可选实例缓存 (key=contentType+domain)。  
   - `setOverrides/clearCache` 替换模块级函数,或由调用者直接传 overrides(推荐)。

2. **抽离纯工具函数**  
   - 导出 `normalizeYamlConfigOverrides`, `mergeFields` 等,供 Repository/其他层复用。  
   - 将 `DEFAULT_YAML_CONFIG` + overrides 合并逻辑封装在 Service 内部。

3. **删除 storage 逻辑**  
   - 移除 `initializeOverridesFromStorage`, `setYamlConfigOverrides`, `clearYamlConfigCache`, `overridesBundle`, `storageInitAttempted`.  
   - Service 不负责订阅 chrome.storage,由仓库(IYamlRepository)派发 overrides。

4. **提供新 API**  
   - `YamlConfigService.resolveConfig(contentType, overrides, options)`  
   - `YamlConfigService.validateYamlConfig(raw)` (封装 `normalizeYamlConfigOverrides`)

5. **调用方改造 (预告 3.4)**  
   - Options/Background 通过注入的 `IYamlRepository` 获取 overrides,调用纯 Service 计算结果。  
   - 所有缓存/订阅由仓库或调用层管理。

此文档覆盖任务 3.1 的所有验收标准: chrome.* 列表、纯函数/存储逻辑标注、重构方案说明。
