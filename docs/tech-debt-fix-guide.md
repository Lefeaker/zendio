# 技术债务修复指南（按优先级）

下列任务按照紧急程度排序：优先级越高，越可能直接影响剪藏成功率或线上稳定性。每项包含影响说明、根因分析、修复步骤及验证建议，便于并行推进。

## 1. 文章提取在无效 URL 场景下崩溃 / 输出未净化 HTML
- **优先级**：P0（立即处理）
- **影响**：当页面 URL 无法被 `new URL()` 解析（如内嵌 `about:blank`、部分阅读模式页、站内重定向）时，`extractArticle` 会抛错导致剪藏失败；Readability 解析失败时会直接回落到 `innerHTML`，可能带入脚本样式噪声。
- **触发位置**：`src/content/extractors/articleExtractor.ts:9`, `src/content/extractors/articleExtractor.ts:20`, `src/content/extractors/articleExtractor.ts:36`
- **修复路径**：
  1. 为 URL 解析包裹 `try/catch`，对失败场景返回空域名并跳过 `new URL` 调用。
  2. 在 Readability 结果缺失时只转换 `doc.body.innerHTML` 经过的清洗结果，或降级为简化文本。
  3. 添加对 `about:`、`chrome-extension:` 等协议的白名单判断，必要时将源 URL 降级为 `document.baseURI`。
  4. 引入最小清洗函数，过滤 `<script>`,`<style>` 元素后再传给 Turndown。
- **验收/测试**：
  - 新增 Vitest 用例覆盖 `about:blank`、`data:`、`chrome-extension:` URL。
  - 手动在 Chrome 阅读模式 / Instapaper 等页面测试剪藏流程。
  - 回归现有 `articleExtractor` 测试确保未引入回归。

## 2. LLM 分类请求缺乏错误处理导致静默失败
- **优先级**：P0
- **影响**：`src/background/llm/classifier.ts` 在网络错误或 API Key 错误时依旧尝试解析 JSON，返回默认分类而不提示用户；多次失败会污染日志并掩盖配置问题。
- **触发位置**：`src/background/llm/classifier.ts:24`, `src/background/llm/classifier.ts:58`
- **修复路径**：
  1. 在 `fetch` 之后检查 `response.ok`，对非 2xx 抛出包含状态码的错误。
  2. 为 OpenAI/Ollama 设置超时（`AbortController`），防止长时间挂起。
  3. 捕获 JSON 解析异常，返回结构化错误并记录 `console.error`，同时让调用方向用户提示分类已回退。
  4. 在 `classifyClip` 中区分「回退」与「错误」，必要时向通知服务发送提示。
- **验收/测试**：
  - Mock `fetch` 返回 401/500/超时并断言错误路径。
  - 现有分类功能正常返回时不受影响。

## 3. 端到端测试未被执行，回归风险高
- **优先级**：P1
- **影响**：`vitest.config.ts` 只包含 `tests/unit/**/*.test.ts`，`tests/e2e/clipperFlow.test.ts` 等模拟流程永远不会跑，导致管线无法捕获跨模块回归。
- **触发位置**：`vitest.config.ts:7`, `tests/e2e/clipperFlow.test.ts:1`
- **修复路径**：
  1. 拆分测试配置：保留 `vitest.config.ts` 为单元测试，新建 `vitest.e2e.config.ts` 指向 `tests/e2e/**/*`，使用 `jsdom` 环境。
  2. 在 `package.json` 增加脚本 `"test:e2e": "vitest run --config vitest.e2e.config.ts"`，并更新 CI 任务串行执行 `test` 与 `test:e2e`。
  3. 审视 e2e 测试依赖的 mocks，补齐断言，确保其运行稳定。
- **验收/测试**：
  - 本地运行新脚本确保通过。
  - 在 CI 中验证失败时能阻断合并。

## 4. 构建流程缺失类型校验与静态质量检查
- **优先级**：P1
- **影响**：`npm run build` 仅调用自制 esbuild 脚本，未执行 `tsc --noEmit`、Lint、风格检查，容易让类型错误或未引用代码进入产物；产出的 bundle 也未压缩。
- **触发位置**：`package.json:6`, `scripts/build.mjs:8`
- **修复路径**：
  1. 引入 `npm-run-all` 或自定义脚本，在 `build` 前执行 `tsc --noEmit` 与 ESLint（需补充 `.eslintrc`）。
  2. 为生产构建提供 `--minify` 选项，或新增 `build:prod` 开启压缩与 tree-shaking。
  3. 在 CI 中区分快速开发构建与发布构建，避免阻塞开发体验。
- **验收/测试**：
  - 故意引入类型错误验证能被阻止。
  - 检查最终 `dist` 体积与 sourcemap 仍可用。

## 5. 聊天提取频繁访问 chrome.storage.sync 产生性能/配额风险
- **优先级**：P2
- **影响**：`extractAIChat` 每次调用都同步拉取 `chrome.storage.sync`，高频剪藏会触发跨线程 IO，增加延迟并可能接近配额限制。
- **触发位置**：`src/content/extractors/aiChatExtractor.ts:19`
- **修复路径**：
  1. 在 content script 初始化时缓存配置，或通过背景页发送一次初始化消息。
  2. 监听 `chrome.storage.onChanged` 更新缓存，保证设置变化实时生效。
  3. 为 `extractAIChat` 提供注入式依赖，便于在测试中 mock。
- **验收/测试**：
  - 增加单元测试验证缓存命中。
  - 手动检查快速多次剪藏时无明显延迟。

## 6. 打包脚本依赖 POSIX 命令，跨平台失败
- **优先级**：P2
- **影响**：`scripts/package.mjs` 与 `scripts/create-release.mjs` 使用 `rm`、`zip` shell 命令，在 Windows 环境无法执行；异常未捕获时直接 `process.exit(1)`。
- **触发位置**：`scripts/package.mjs:30`, `scripts/create-release.mjs:34`
- **修复路径**：
  1. 使用 Node 标准库（`fs.promises.rm`）/第三方压缩库（如 `archiver`）实现跨平台压缩。
  2. 封装公共的错误处理与日志函数，避免大量重复 `console.log`。
  3. 补充参数校验（版本号、输出目录）及友好提示。
- **验收/测试**：
  - 在 macOS、Windows 下各执行一次验证结果一致。
  - 引入最小化的自动化测试（例如使用 `vitest` 调用脚本主函数）。

---

### 推进建议
- P0 事项纳入最近一次补丁版本交付，完成后立即发布。
- P1 事项以工作流形式在同一迭代完成，可和 CI/工具链调整一起安排。
- P2 项可放入下一轮基础设施优化或贡献任务中，有空档再处理。

请根据团队资源在迭代计划中排期。如需更多背景，可参考 `docs/structure/tech-debt-remediation-plan.md`。
