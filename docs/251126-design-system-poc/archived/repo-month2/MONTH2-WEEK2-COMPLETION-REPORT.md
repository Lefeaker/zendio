# Month 2 Week 2 交付复核（Navigation + Onboarding + CS Repository Tests）

覆盖 Day 36-40 的任务 2.15-2.18，复核要点如下（包含源码与测试精确行号，方便审核核验）。

---

## 任务 2.15：创建 INavigationRepository

- `src/shared/repositories/INavigationRepository.ts:1-21`  
  - 新增统一的导航仓库接口，定义 `openVault/openOptions/openExternalLink` 三个方法，为不同环境的实现（Chrome/Mock）提供契约；接口文档清晰描述默认行为（如 Vault 链接默认 `obsidian://open`）。

## 任务 2.16：实现 ChromeNavigationRepository + MockNavigationRepository

- `src/infrastructure/repositories/ChromeNavigationRepository.ts:1-22`  
  - Chrome 实现通过 `getPlatformServices().tabs/runtime` 完成标签页创建与 Options 打开，满足 PLAN“禁止直连 chrome.*”的要求。
- `tests/utils/repositories/MockNavigationRepository.ts:1-25`  
  - 增加 Mock 版仓库，记录 `openedVaults/openedExternalLinks/optionsOpenedCount` 等测试探针，供 Content Scripts/Onboarding 单测核对调用次数。
- `src/shared/di/tokens.ts:6-76` & `src/shared/di/serviceRegistry.ts:258-329`  
  - 引入 `DI_TOKENS.INavigationRepository`，在默认/Mock 注册流程中注入 `ChromeNavigationRepository`/`MockNavigationRepository`，保证内容脚本和 E2E Harness 都能解析到仓库实例。
- 平台服务补充：`src/platform/chrome/runtime.ts:1-90`、`src/platform/firefox/runtime.ts:1-65` 与 `src/platform/chrome/tabs.ts:1-160`、`src/platform/firefox/tabs.ts:1-103`  
  - Runtime Service 新增 `openOptionsPage()`（包含 Chrome fallback 与 Firefox 兜底）；Tabs Service 扩展 `create/remove/getCurrent` 能力，供导航仓库及 Onboarding 复用。

## 任务 2.17：重构 Onboarding 引导页

- `src/onboarding/bootstrap.ts:28-205`  
  - 新增 `OnboardingController`，构造函数注入 `INavigationRepository`，所有 CTA（`#openVault/#configureApiBtn/...`）统一通过仓库实现导航；`closeOnboardingTab()` 也改为依赖 `tabs.getCurrent/remove` 而非直接 `chrome.*`；初始化时恢复 completed steps 并绑定事件，完全符合 PLAN 提出的解耦要求。

## 任务 2.18：补充内容脚本仓库 E2E

- `tests/e2e/content-scripts-repository.test.ts:1-393`  
  - 仿照“Week3-4 报告”格式集中验证仓库化链路：  
    1. **Clipper:** 用 `MockClipRepository` 验证对话框启动时会拉取/订阅 Fragment 配置（lines 95-136）。  
    2. **Video:** 使用真实 `VideoSessionExporter` & `MockVideoRepository` 校验剪藏 payload（lines 139-199）。  
    3. **Reader:** 通过自定义依赖构造 `ReaderSession`，断言成功/失败两个分支均调用 `sendReadingClip()` 并反馈面板提示（lines 201-344）。  
    4. **Onboarding:** 注入 `MockNavigationRepository`，模拟按钮点击确保 `openOptions/openVault/openExternalLink` 被正确调用（lines 346-392）。  
  - 该套用例直接覆盖 PLAN 要求的 “Clipper/Video/Reader/Onboarding 仓库路径 + 配置订阅” 场景。

---

## 验证

- `npm run typecheck`
- `npm run test:e2e -- tests/e2e/content-scripts-repository.test.ts`

上述命令均已在最新代码上执行，通过后再提交此复核报告。至此，Month 2 Week 2 任务（2.15-2.18）全部达标，可进入后续验收。
