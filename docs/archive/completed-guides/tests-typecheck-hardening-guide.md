# Tests Typecheck Hardening Guide

> **目的**：帮助后续开发者系统解决 `npm run typecheck:tests` 中遗留的 TypeScript 报错。当前这些错误与 FormSectionRegistry 改造无直接关系，但会阻碍测试类型检查通过。本文梳理错误分类、修复建议以及粒度拆解，便于团队逐步消除历史问题。

---

## 1. 错误分类与处理建议

### 1.1 `browser` 全局未定义

**现象**

- 报错文件：`src/platform/firefox/*.ts`、`src/platform/services.ts`、`src/shared/utils/browserDetection.ts` 等。
- 错误信息：`Cannot find name 'browser'`、`Cannot find namespace 'browser'`。

**原因**

- Firefox 专用的 WebExtension API 由 `firefox-webext-browser` 类型包提供，需要在测试配置中引入。
- 虽然 `tsconfig.app.json` 已包含该类型，但测试项目单独的 `tsconfig.tests.json` 之前未声明。

**处理建议**

1. 已在本次修改中，将 `firefox-webext-browser` 类型加入测试配置；若仍有零散报错，可检查对应文件是否被测试 tsconfig include（必要时在 `tests/types` 下补充 `global` 声明）。
2. 对于运行在 Node 环境的测试，如不需要调用 Firefox API，可在测试中使用 `vi.spyOn` + 自定义 mock，而非直接访问 `browser`。

### 1.2 `chromeAction` 测试中的 Mock 类型不匹配

**现象**

- 报错文件：`tests/chrome/chromeAction.test.ts`。
- 错误信息包括：
  - `Event<(tab: Tab) => void>` 与 `Mock` 类型不兼容。
  - `chrome.action.setBadgeText` / `setBadgeBackgroundColor` 期望返回 `Promise<void>`，而当前 mock 只返回 `void`。
  - `chrome.runtime` 被 `Partial` mock 覆盖后缺少必需方法。

**原因**

- `@types/chrome` 对事件和 API 返回值有严格定义，直接使用裸 `vi.fn()` 不满足签名要求。

**处理建议**

1. 引入专用的辅助方法构造 `chrome.action` mock，例如：
   ```ts
   function createChromeActionMock(): typeof chrome.action {
     return {
       setBadgeText: vi.fn(async () => {}),
       setBadgeBackgroundColor: vi.fn(async () => {}),
       onClicked: {
         addListener: vi.fn(),
         removeListener: vi.fn(),
         hasListener: vi.fn(),
         hasListeners: vi.fn(),
         addRules: vi.fn(),
         getRules: vi.fn(),
         removeRules: vi.fn()
       }
       // ...根据测试需要补充其余字段
     } as unknown as typeof chrome.action;
   }
   ```
2. 将 `chrome.runtime`, `chrome.tabs` 等对象替换为满足类型签名的结构体，而非简单对象。
3. 可考虑在 `tests/setup/chrome.ts` 中集中管理这些 mock，避免多处重复定义。

### 1.3 JSDOM `Window` 类型不兼容

**现象**

- 报错文件：`tests/e2e/multilingualExpansion.test.ts`、`tests/e2e/optionsNavigationLazyLoad.test.ts` 等。
- 错误信息：`DOMWindow` 不可赋值给 `Window`，`HTMLElement` / `Node` 属性不存在。

**原因**

- JSDOM 返回的是 `dom.window` (`DOMWindow` 类型)，虽然运行时兼容，但 TypeScript 不认为它满足标准 `Window`。
- 项目测试中直接把 `dom.window` 赋值给全局 `window` / `globalThis`，或在类型检查中按 `Window` 使用。

**处理建议**

1. 在测试中通过类型断言处理，例如：
   ```ts
   const windowShim = dom.window as unknown as Window & typeof globalThis;
   globalThis.window = windowShim;
   ```
   同时显式断言 `HTMLElement`, `Node` 等：
   ```ts
   globalThis.HTMLElement = windowShim.HTMLElement;
   ```
2. 将该逻辑抽到公共 helper（如 `tests/utils/jsdomWindow.ts`），避免每个测试重复。

### 1.4 `Messages` 类型缺少字段

**现象**

- `tests/e2e/optionsLanguageSwitch.test.ts` 中，`currentResource` 被直接当作 `Messages`。

**原因**

- `I18nResource` 和 `Messages` 并非同一类型；测试中需要先调用 `resource.getMessages()` 或显式提供 mock 实现。

**处理建议**

1. 如果测试只用到部分字段，可在测试内构造符合 `Messages` 的对象，而不是直接传 `I18nResource`。
2. 或者在 `tests/utils/i18n.ts` 中封装工具函数，返回 `Messages` 结构体。

### 1.5 `vi` 命名空间未识别

**现象**

- `tests/e2e/optionsNavigationLazyLoad.test.ts` 中出现 `Cannot find namespace 'vi'`。

**原因**

- 该文件未显式引入 `vi`；虽然默认环境在单元测试中自动注入，但 E2E 配置（`vitest.e2e.config.ts`）基于 `environment: 'node'`，需要手动导入。

**处理建议**

- 在受影响文件顶部添加 `import { vi } from 'vitest';`。

### 1.6 Controller 私有方法被直接调用

**现象**

- `tests/e2e/optionsLanguageSwitch.test.ts` 调用了 `restSection.applySnapshot(...)`，而该方法在实现中是 `private`。

**处理建议**

1. 改为通过公共接口（例如 registry）完成快照应用。
2. 若确实需要直接挂载内部快照，可在 Section 暴露公共 helper 或调整测试策略。

---

## 2. 推荐的修复顺序

建议按照“外层环境 → 核心 mock → 单测/E2E 调整”的顺序逐步推进：

1. **环境准备**
   - 统一在 `tests/setup/global.ts`（或类似文件）中提供 `createJsdomWindowShim()` 帮助函数，解决 DOMWindow 类型问题。
   - 审查 `tsconfig.tests.json` 的 `types` 列表，确保包含 `firefox-webext-browser`, `chrome` 等必需类型。

2. **Mock 基础设施**
   - 在 `tests/utils/chromeMock.ts` 创建强类型 chrome mock；在各个测试中引用。
   - 提供 `createFirefoxBrowserMock()`（可选），或在需要的测试中注入 `browser` stub。

3. **逐个清理测试文件**
   - `tests/chrome/chromeAction.test.ts`：使用统一 mock；解决 Promise 返回值问题。
   - `tests/e2e/multilingualExpansion.test.ts` / `optionsNavigationLazyLoad.test.ts`：引入 JSDOM shim + `import { vi } from 'vitest'`。
   - `tests/e2e/optionsLanguageSwitch.test.ts`：改为通过 registry 或公共 API 操作 Section。
   - 其余零散报错（如 `tests/firefox/firefox.test.ts`）根据报错信息调整 mock。

4. **回归验证**
   - 每修复一类问题后执行 `npm run typecheck:tests`，确保没有回归。
   - 最终跑通 `npm run test:unit`、`npm run test:e2e` 验证逻辑正确。

---

## 3. 其它注意事项

- **lint 规则**：考虑在 ESLint 中禁止直接访问全局 `chrome` / `browser`，强制通过统一 mock 引入，以便在 Node 环境中运行的测试不会直接挂掉。
- **类型守卫**：对于只在浏览器环境存在的 API，可以引入 `isChromeAvailable()` / `isBrowserAvailable()` 等工具函数，既保证运行时安全，又方便测试中替换。
- **文档更新**：完成整改后，建议把本指南与最新实践同步到团队知识库（例如 `development-guidelines.md`），提醒后续编写测试时遵守约定。

---

## 4. 任务拆解建议

| 阶段    | 工作内容                                                                | 输出                                                                      |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Stage 1 | 搭建测试环境辅助（JSDOM shim、chrome/firefox mock 工具、`vi` 导入约定） | `tests/utils/` 目录下的工具函数、更新后的 tsconfig                        |
| Stage 2 | Chrome 单测修复（`chromeAction.test.ts`）                               | 通过类型检查的 mock 结构、回归测试记录                                    |
| Stage 3 | E2E JSDOM 类型修复                                                      | 每个 E2E 文件引入 shim 和 `vi` 导入，`npm run test:e2e` 通过              |
| Stage 4 | I18n / Section API 调整                                                 | `optionsLanguageSwitch` 等测试改用公共接口                                |
| Stage 5 | Firefox Mock/其它零散错误                                               | `tests/firefox/*.test.ts`、`tests/chrome` 相关补全                        |
| Stage 6 | 最终回归                                                                | `npm run typecheck:tests`、`npm run test:unit`、`npm run test:e2e` 均通过 |

可根据团队资源拆分成多个 PR，逐步合并。

---

如需进一步支持（例如提供示例 shim / mock 实现），欢迎随时补充需求。祝修复顺利！ 💪
