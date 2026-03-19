# Month3 Week1 交付复核（YamlConfig Repository 化）

覆盖 Month3 Week1（Day 41-50）中任务 3.1-3.4。逐项列出源码与测试改动位置，便于审核核对。

---

## 任务 3.1：yamlConfigService 架构债务分析

- `docs/251126-design-system-poc/YAML-CONFIG-SERVICE-REFACTOR-NOTES.md:1-86`  
  - 汇总原文件内所有 `chrome.storage.*` 调用点、全局状态/副作用问题，并拆分“纯函数逻辑 vs storage 访问”清单。
  - 给出 Phase-by-Phase 重构方案，为后续任务提供统一准绳。

## 任务 3.2：yamlConfigService 纯函数化

- `src/shared/services/yamlConfigService.ts:224-580`  
  - 删除 `overridesBundle`/`cache`/`initializeOverridesFromStorage()` 等模块级副作用，新增 `YamlConfigService` 类（`resolveConfig`、`validateYamlConfig` 纯函数 API）。
- `src/shared/state/yamlConfigOverridesStore.ts:1-104`  
  - 新建 overrides store，集中管理 overrides 快照与订阅，后续调用方通过 `get/set/subscribe` 访问。
- `src/shared/utils/yamlGenerator.ts:1-215`  
  - 注入 `YamlConfigService` + overrides store，在生成 front matter 前实时解析配置。
- **测试**  
  - `tests/unit/shared/yamlConfigService.test.ts:1-84` 更新为直接实例化 `YamlConfigService` 验证纯函数行为。  
  - `tests/unit/shared/yamlGenerator.test.ts:1-173` 及 `tests/unit/content/{articleExtractor,fragmentBuilder,videoSessionExporter}.test.ts` 等全部改用 overrides store Hooks。  
  - `npm run test:e2e -- yamlOverridesFlow` 验证 YAML 配置流在浏览器环境通过。

## 任务 3.3：ChromeYamlRepository 接管 storage

- `src/infrastructure/repositories/ChromeYamlRepository.ts:1-135`  
  - 实现新的仓库：依赖 `IOptionsRepository.get/set/onChange`，只在 `yamlConfig` 发生真实变动时通知监听者，并在写入失败时抛出 `RepositoryError('YamlRepositoryError')`。
- `src/shared/di/serviceRegistry.ts:271-280`  
  - 默认注册改为向 DI 请求 `IOptionsRepository` 实例后构建 `ChromeYamlRepository`。
- **测试**  
  - `tests/unit/infrastructure/ChromeYamlRepository.test.ts:1-120` 新增单测，覆盖读取、错误包装、订阅去重等路径。  
  - `npx vitest run tests/unit/infrastructure/ChromeYamlRepository.test.ts`

## 任务 3.4：调用方迁移至 Repository + 纯函数服务

- `src/options/components/sections/YamlConfigSection.ts:1-330`  
  - Section 构造函数注入 `IYamlRepository` + `YamlConfigService`；启动时订阅仓库、异步拉取 overrides，并在标题下方展示实时字段数量摘要。  
  - collect/save 走仓库，避免直接访问共享全局；销毁时统一清理 repo 订阅。
- `src/shared/state/yamlConfigOverridesStore.ts:1-104`  
  - 再次更新以适配 `IOptionsRepository.get/onChange` 接口，消除了测试环境缺少 `load/subscribe` 的告警。
- `tests/e2e/yamlOverridesFlow.test.ts:1-317`  
  - 仍作为端到端回归，确认新的 Section + Repository 联动过程中保存/读取无回归。
- `npm run test:e2e -- yamlOverridesFlow`

---

## 验证

- `npx vitest run tests/unit/infrastructure/ChromeYamlRepository.test.ts`
- `npm run test:e2e -- yamlOverridesFlow`

两条命令均已在最新代码运行通过；TypeScript `npm run typecheck` 亦无报错，确认任务 3.1-3.4 满足 `REPO-MONTH3-EXECUTION-PLAN.md` 的验收标准。
