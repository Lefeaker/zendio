# AI 聊天解析器模块化方案

## 背景与目标
- 现有 `src/third_party/ai-chat-exporter/parse.ts` 体量接近 2k 行，平台解析逻辑与 Markdown 转换紧耦合，维护成本高且难以测试。
- 目标是将各平台解析逻辑、通用转换工具、对外接口解耦，便于按平台扩展、单独测试与快速回归。

## 模块结构
```
src/third_party/ai-chat-exporter/
├── index.ts                // 对外暴露 parseChatDOM/chatHtmlToMarkdown
├── types.ts                // ParsedMessage/ParsedResult/ParseConfig 等类型
├── registry.ts             // ChatPlatformParser 注册表与查找函数
├── shared/
│   ├── markdown.ts         // chatHtmlToMarkdown 及其依赖
│   ├── dom.ts              // 公用 DOM/文本辅助函数
│   └── assets.ts           // 资产抽取、Blob 转换等逻辑
└── platforms/
    ├── chatgpt.ts
    ├── claude.ts
    ├── copilot.ts
    ├── gemini.ts
    ├── tongyi.ts
    ├── deepseek.ts
    └── kimi.ts
```
> 若未来新增平台，只需在 `platforms/` 内增添同构模块并在 `registry.ts` 注册。

## ChatPlatformParser 接口
```ts
export interface ChatPlatformParser {
  id: PlatformId;                  // 例如 'chatgpt'
  aliases?: string[];              // 可选别名，如 ['chat']
  parse(doc: Document, config: ParseConfig | undefined): ParsedResult;
}
```
- `PlatformId` 为联合类型：`'chatgpt' | 'claude' | 'copilot' | 'gemini' | 'tongyi' | 'deepseek' | 'kimi'`。
- `registry.ts` 内的 `resolveParser(platform: string)` 会统一小写、按 `id + aliases` 匹配，找不到时返回空结果。
- 平台模块内仅暴露 `parser: ChatPlatformParser` 常量。

## 公用工具拆分
- `shared/markdown.ts`：保留现有 `chatHtmlToMarkdown`、`nodeToMarkdown` 等转换函数，并将 `headingLevelOffset` 等状态封装成局部变量以避免跨调用污染。
- `shared/dom.ts`：抽取列表路径、表格处理、`cleanupUIElements` 等 DOM 工具，供多平台复用。
- `shared/assets.ts`：处理图片、Blob、附件列表等辅助逻辑，并暴露 `extractAssets(doc)` 等函数，便于 Gemini 等平台调用。

## 对外 API
- `index.ts` 保持原有函数签名：
  - `parseChatDOM(platform: string, doc: Document, config?: ParseConfig): ParsedResult`
  - `chatHtmlToMarkdown(html: string): string`
- 内部实现由注册表分发，保证现有调用方零改动。

## 测试策略
- 新增 `tests/unit/aiChatParsers/`：
  - 使用 `@vitest-environment jsdom`。
  - 针对每个平台准备 HTML fixture（存放于 `tests/fixtures/ai-chat/<platform>.html`），覆盖典型成功用例。
  - 重点验证标题提取、消息角色归类、附件解析、Deep Research pureMode 等核心分支。
- 为 `shared/markdown.ts` 编写针对列表、表格、KaTeX、图片的单元测试，确保转换输出稳定。
- 在 CI 中纳入新的测试文件，保证重构后回归覆盖率不下降。

## 迁移步骤
1. 落地本文档并在评审中确认接口与目录结构。（A1）
2. 拆分类型与工具模块，逐个平台迁移解析逻辑，保持功能一致。（A2）
3. 基于平台 fixture 增加单元测试与快照，验证各模块输出。（A3）
4. 编写维护指南记录如何接入新平台、调试与测试流程。（A4）
5. 更新 `docs/structure/tech-debt-remediation-plan.md` 的执行状态。

## 风险与对策
- **跨平台公共函数依赖**：模块化时若引用顺序不当易出现循环依赖；在 `shared/` 中集中导出，避免平台模块互相引用。
- **测试环境资源消耗**：大量 fixture 可能拖慢 Vitest；通过拆分测试文件并控制 fixture 体积，必要时采用 `beforeAll` 复用。
- **Blob 图片转换权限**：`Canvas` 可能在 jsdom 中不可用；测试中通过 mock `HTMLCanvasElement` 或将转换逻辑抽象，避免直接访问浏览器 API。

## 验收标准
- `parseChatDOM` API 对现有调用无破坏性变更。
- 每个平台解析逻辑独立文件且长度显著缩减。
- 新增单元测试覆盖主要路径，CI 通过。
- 维护文档交付，描述新增/更新平台的流程。
