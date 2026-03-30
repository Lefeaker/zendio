# Options Runtime & 测试类型安全整改指南

> 版本：v0.1（草案）  
> 更新日期：2025-11-25  
> 适用范围：AiiinOB 选项页运行时与 Vitest 测试类型治理

---

## 1. 背景

近期在执行 `npm run typecheck:tests` 时暴露出多处类型残留问题，同时 `initializeOptionsRuntime()` 在二次执行时可能遗留旧实例，存在热刷新/调试时组件复用失败的风险。为了满足《development-guidelines.md》中关于生命周期管理与测试夹具复用的要求，需要统一补齐清理流程、测试环境 Helper 以及 WebExtension Mock 的类型定义。

---

## 2. 目标

1. **运行时安全**：确保多次调用 `bootstrapOptionsApp()` 之前，旧的 options shell、controller 与注册的 cleanup handler 被完整释放。
2. **测试类型对齐**：为使用 JSDOM 的 E2E/Vitest 测试提供类型安全的 DOM Helper，避免直接覆盖全局对象导致的告警。
3. **表单驱动一致性**：禁止测试直接访问 Section 的私有方法，改走 `FormSectionRegistry` 正规流程，并保证 `formAdapter`/`OptionsPersistence` 返回完整的 `StoredOptions`。
4. **浏览器 Mock 完整**：Chrome/Firefox 平台测试使用统一的 Mock 工厂，符合 `@types/chrome` 与 `@types/firefox-webext-browser` 的签名。
5. **质量闭环**：整改后跑通 `typecheck:tests`、`lint`、`test:unit`、`test:e2e`，并记录验证结果。

---

## 3. 目录与责任分工

| 模块               | 负责人         | 涉及路径                                                                 |
| ------------------ | -------------- | ------------------------------------------------------------------------ |
| Options 运行时清理 | Options 小组   | `src/options/app/bootstrap.ts`                                           |
| DOM Helper 重构    | 测试基础组     | `tests/utils/domEnvironment.ts`（新建）及相关测试                        |
| Section 测试改造   | Options 测试组 | `tests/e2e/options*.test.ts`                                             |
| WebExtension Mock  | 平台组         | `tests/utils/browserMocks.ts`（新建）、`tests/chrome/`、`tests/firefox/` |

---

## 4. 实施步骤

### 4.1 运行时清理顺序修复

1. 在 `bootstrapOptionsApp()` 中、`initializeOptionsRuntime()` 之前显式调用 `disposeCleanupHandlers()`。
2. 若 `mountedShell` 不为空，先执行 `mountedShell.cleanup()` 并将引用置空。
3. 调整 `initializeOptionsRuntime()`：
   - 移除 `else if (formSectionRegistry)` 分支，改为统一依赖前置的 `disposeCleanupHandlers()`；
   - 确认 `registerCleanup()` 顺序仍然保证 controller → registry 的释放。
4. 补充注释说明二次启动流程，防止后续回归。

### 4.2 DOM 环境 Helper

1. 在 `tests/utils/` 新建 `domEnvironment.ts`，提供：
   - `withDomEnvironment(html, options, callback)`：封装 JSDOM 创建、全局覆写、测试完成后恢复；
   - 返回 `Window & typeof globalThis`，对 `setTimeout` 等 API 做类型收窄。
2. 更新涉及 JSDOM 的 E2E 测试（`optionsLanguageSwitch.test.ts`、`optionsTemplatesAutoSave.test.ts`、`optionsNavigationLazyLoad.test.ts`、`optionsFragmentAutoSave.test.ts`、`multilingualExpansion.test.ts` 等），统一通过 Helper 获取 `window/document`。
3. Helper 内集中处理 `navigator/HTMLElement/Node` 等常用构造，减少每个测试的重复代码。

### 4.3 Section 快照调用规范

1. 逐个排查测试中对 Section 私有方法的访问：
   - `RestSection`：使用 `formRegistry.apply()` 或公开的测试代理，而不是 `section.applySnapshot()`。
   - `TemplatesSection`：调用 `controller.applyToForm()` 后，从 DOM 触发事件，再由 controller 负责自动保存。
2. 修正 `formAdapter.read` Mock，确保返回的 `StoredOptions` 含必要的 `rest`、`templates` 等字段，避免 `Partial` 类型逃逸。
3. 在测试 teardown 阶段，调用 `formRegistry.clear()`、`controller.dispose()`，保持生命周期一致。

### 4.4 WebExtension Mock 工厂

1. 新建 `tests/utils/browserMocks.ts`，导出：
   - `createChromeRuntimeMock()`：覆盖 `chrome.action`、`chrome.runtime`、`chrome.storage` 常用 API，返回带有 `reset()` 方法的 Mock 句柄。
   - `createFirefoxRuntimeMock()`：模拟 `browser.runtime`、`browser.storage`、`browser.action/browserAction` 等接口，符合 `Promise` 返回约定。
2. 重写 `tests/chrome/chromeAction.test.ts`、`tests/firefox/firefox.test.ts` 等文件，使用工厂并通过 Vitest 的 `beforeEach/afterEach` 注册/销毁。
3. 如果其他测试存在 `globalAny.chrome?.foo = vi.fn()`，统一迁移至新 Helper。

### 4.5 验收

1. 本地运行：
   ```bash
   npm run typecheck:tests
   npm run lint
   npm run test:unit
   npm run test:e2e
   ```
2. 记录执行时间、失败重试情况，并在 MR 描述中附上总结。
3. 若新增 Helper/Mock 引入 `eslint` 例外，务必写明原因并限制作用域。

---

## 5. 风险与回退方案

| 风险                           | 缓解措施                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 清理顺序调整导致首轮初始化失败 | 在 QA 环境中模拟热刷新流程，验证首次与二次启动均无异常                                                |
| Helper 重构影响现有测试        | 分批提交：先引入 Helper 并迁移单个测试文件，通过后再扩散                                              |
| Mock 工厂覆盖不全              | 参考 `@types/chrome`/`@types/firefox-webext-browser` 的定义补齐接口，必要时在 Helper 内添加运行时断言 |

---

## 6. 后续维护建议

1. 将 `withDomEnvironment`、浏览器 Mock 工厂收录到《tests-typecheck-hardening-guide.md》附录，形成统一使用规范。
2. 在 CI 的 `npm run test:ci` 中增加 `typecheck:tests` 阶段，防止类型残留。
3. 对 Options Shell 未来若引入热刷新能力，优先扩展本指南而不是新增散落文档。

---

> 文档维护人：Options 质量负责人  
> 反馈渠道：在 `AiiinOB/docs/archive/completed-guides/tests-typecheck-hardening-guide.md` 所列群组或提交 issue
