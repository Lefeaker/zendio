# LLM 分类错误处置手册

本文档针对 “LLM 分类请求缺乏错误处理导致静默失败” 的技术债务，给出排查、修复与验证的分阶段方案。目标是在保持现有解耦架构（背景服务、通知服务、内容脚本三层）下，补齐分类请求的错误链路与用户提示，避免继续向系统引入无声回退。

---

## 0. 适用范围与前置准备

- 涉及模块：`AiiinOB/src/background/llm/classifier.ts`、`AiiinOB/src/background/services/classificationService.ts`、`AiiinOB/src/background/application/clipProcessor.ts`、`AiiinOB/src/background/pipelines/clipPipeline.ts`、`AiiinOB/src/content/ui/supportPrompt.ts` 及其单元测试。
- 操作前请确认：
  - 已完成仓库依赖安装（`npm install`）。
  - 可运行 `npm run test:unit` 和 `npm run test:e2e`。
  - 开发环境可加载扩展并切换到使用自定义/错误的 API Key，便于复现分类失败。
- 全流程保持小步提交；若需新增通知或前端提示，请同步产品体验负责人确认文案与出现条件。

---

## 1. 现状复盘与静默路径确认

1. **复现静默回退**
   - 在开发环境将分类器配置改为无效 API Key 或断网；触发一次剪藏。
   - 观察后台日志：`classifyClip` 捕获异常后仅记录 `console.error` 并返回 `fallbackReason: 'error'`（见 `AiiinOB/src/background/services/classificationService.ts:42`）。
   - `processClipPayload`（`AiiinOB/src/background/application/clipProcessor.ts:20`）忽略 `fallbackReason`，继续生成路径并写入 vault。用户只看到剪藏成功提示。
2. **梳理耦合链路**
   - `classify` 当前返回 `unknown`，调用者无法分辨成功或失败的结构化信息。
   - 管线成功路径只触发 `notifyClipSuccess`，不会附带分类状态；`dispatchSupportPrompt` 在 `status: 'success'` 时忽略 `errorMessage`（`AiiinOB/src/content/ui/supportPrompt.ts:97`）。
   - 无端到端测试覆盖该分支，导致问题长期不可见。
3. **记录现有防护**
   - `postJson` 已实现超时与 `response.ok` 检查，应保留；增改时避免破坏现有解析逻辑。

> 产出：复现记录 + 代码路径笔记，为后续改造提供基线。

---

## 2. 服务层加固（classifier.ts）

1. **显式结果模型**
   - 在 `AiiinOB/src/background/llm/classifier.ts` 定义：
     ```ts
     export type ClassifierSuccess = { ok: true; payload: ClassificationResult };
     export type ClassifierFailure = {
       ok: false;
       error: { code: ClassifierErrorCode; message: string; provider: string };
     };
     export type ClassifierResponse = ClassifierSuccess | ClassifierFailure;
     ```
   - `ClassificationResult` 复用或提炼自 `ClassificationResult` 接口，禁止返回 `unknown`。
2. **规整错误翻译**
   - `postJson` 捕获异常后返回 `ClassifierFailure`，附带：
     - `code`: 例如 `HTTP_ERROR`、`TIMEOUT`、`PARSE_ERROR`。
     - `message`: 人类可读文本（保留状态码或 `AbortError` 信息）。
     - `provider`: `'openai' | 'ollama' | 'compatible'`，方便上层埋点。
   - 成功路径调用 `parseClassifierPayload`，失败时返回 `ClassifierFailure` 而非抛异常，便于调用方统一处理。
3. **补充结构校验**
   - 对解析出的 JSON 进行类型检查（推荐使用内联守卫函数而非新增依赖，保持项目轻量）：
     ```ts
     function isValidClassification(value: unknown): value is ClassificationResult { ... }
     ```
   - 对缺少关键字段的结果返回 `INVALID_SCHEMA` 错误。

> 产出：新的 `ClassifierResponse` 类型 + 单元测试（mock fetch，覆盖 2xx/4xx/超时/畸形 JSON）。

---

## 3. 调用链错误传递（classificationService → clipProcessor）

1. **扩展 ClassificationResult**
   - 调整 `AiiinOB/src/background/services/classificationService.ts`：
     - `classifyClip` 接受 `ClassifierResponse`，对 `ok: false` 的结果附带 `fallbackReason: 'error'` 以及 `errorDetail`（包含 `code` 与 `provider`）。
     - 对成功结果补齐缺失字段（如 topics 默认空数组），避免下游判断。
2. **保留业务回退但显式标志**
   - 返回结构新增布尔 `usedFallback` 或 `status: 'fallback' | 'success'`，供 pipeline 使用。
   - 继续保证剪藏流程不因分类失败中断（写入 vault 的逻辑保持不变）。
3. **管线层感知错误**
   - `processClipPayload` 接收结果后若 `usedFallback`，将错误上下文传递给调用者（可通过扩展返回值 `classificationWarning?: ClassificationErrorDetail`）。
   - `handleClipResult` 根据该字段决定是否触发警示通知或支持提示里的异常状态。

> 产出：服务层返回值调整 + 对应单元测试（`AiiinOB/tests/unit/classificationService.test.ts` 更新/新增用例覆盖错误详情）。

---

## 4. 用户提示与可观测性

1. **背景通知**
   - 在 `AiiinOB/src/background/services/notifications.ts` 内新增 `notifyClipWarning`（或重用现有接口，通过自定义标题表达“分类失败，已回退默认模板”）。
   - 继续使用平台服务 `notifications.create`，禁止直接依赖 `chrome.*`。
2. **内容脚本提示**
   - 扩展 `dispatchSupportPrompt` 支持 `status: 'warning'`，并向内容脚本发送错误描述。
   - 更新 `SupportPrompt` 允许展示第三种状态（例如 badge/文案 “成功，但分类失败”），保证无辅助技术时也可通过文本告知用户。
3. **日志打点**
   - 在分类失败分支追加结构化 `console.warn`，同时预留埋点接口（若未来接入遥测）。
   - 确认日志不会泄漏 API Key，仅记录状态码/错误类型。

> 产出：新的通知路径 + 支持提示 UI 调整 + 对应 e2e/手动验证脚本。

---

## 5. 自动化测试与验证策略

1. **单元测试**
   - `classifier.test.ts`：模拟 HTTP 429、401、500、超时、畸形 JSON，断言返回 `ok: false` 与正确错误码。
   - `classificationService.test.ts`：断言 `errorDetail` 透出，并在 `usedFallback` 时维持默认 type/topic。
   - `clipProcessor.test.ts`（可新增）：验证包含 `classificationWarning` 时依旧产出文件路径。
2. **端到端测试**
   - 在 `tests/e2e` 新增流程：通过 mock server 返回 401，确认剪藏成功但支持提示文案变为 “分类失败已回退”。
   - 若难以集成真实 HTTP，考虑在 e2e runner 中注入 service stub（使用 `configurePlatformServices`）模拟失败。
3. **手动验证脚本**
   - 参考：
     ```bash
     npm run dev
     # 浏览器中配置无效 API Key
     # 剪藏一篇文章，观察通知与页面 Support Prompt 是否展示警告
     ```
   - 恢复有效 Key，确保警告不再出现。

> 产出：测试用例 & 验证清单，确保改动可回归。

---

## 6. 发布与回滚计划

1. **分阶段合并**
   - 建议拆分为两次提交：服务层改造（含测试）与 UI/通知改动。
   - 每次提交运行 `npm run test:unit`；UI 提交额外运行 `npm run test:e2e`。
2. **QA 检查点**
   - 验证不同 provider（OpenAI/Ollama）均能在 Key 错误时触发提示。
   - 确认 WARN 状态不会阻塞剪藏，也不会重复弹出。
3. **回滚策略**
   - 若上线后发现通知干扰用户，可临时在 `classificationService` 中关闭 `notifyClipWarning` 调用但保留错误记录。
   - 保持老的 fallback 逻辑未删除，可一键回退到原行为。

> 产出：PR 描述包含问题、方案、测试结果及潜在后续工作（如接入遥测）。

---

通过以上步骤，我们能够把分类请求的错误从底层抓取、向上游传递，再以符合既有解耦策略的方式提示用户，避免继续积累隐性失败。
