# AI Chat 解析器抽离、抽象简化与同步策略

## 目的

本文档总结当前 `AiiinOB` 中多 AI 平台 DOM 解析逻辑的现状，并回答三个问题：

1. 这部分是否适合抽成独立开源项目
2. 当前实现是否存在较多重复，能否进一步抽象简化
3. 如果做成独立项目，后续应如何让主项目自动同步更新，而不是走风险较高的“远程热注入”

---

## 当前结论

### 1. 可以抽成独立项目

可以，而且比较适合。

当前多平台解析逻辑已经具备独立库的基本形态：

- 有统一的解析器契约：`parse(doc, config) => ParsedResult`
- 有统一入口：`parseChatDOM(platform, doc, config)`
- 有平台 parser 注册表：`registry.ts`
- 有轻量平台元数据注册表：`platformRegistry.ts`
- 各平台实现基本都在 `src/third_party/ai-chat-exporter/platforms/*`

当前产品面展示的支持列表、Options 链接、URL host detection、alias 与 fallback title policy 均从 `platformRegistry.ts` 的轻量元数据派生；parser 实现注册仍由 `registry.ts` 与 runtime lazy parser map 负责。当前支持列表为 ChatGPT、Claude、Copilot、Gemini、Tongyi/Qianwen、DeepSeek、Kimi、Doubao、Monica、Perplexity。

因此，这部分完全可以抽为一个独立的 DOM 解析库。

### 2. 存在明显重复，适合继续收敛

当前平台文件中重复最多的逻辑主要有：

- 标题提取
- 模型提取
- 消息容器扫描
- 角色判断
- 内容节点选择
- UI 噪音清理
- HTML 转 Markdown 前的常规预处理

其中 `doubao`、`monica`、`deepseek` 这几类平台的结构很接近，最适合优先抽成共享骨架。

### 3. 不建议做“远程自动注入”

如果独立开源后希望主项目自动用上最新解析器，推荐做法是：

- 解析器仓库单独发布 npm 包
- 主项目作为依赖引用
- 通过 CI 自动创建升级 PR、跑测试、再发布扩展

不建议让浏览器扩展运行时直接从 GitHub 或远程地址拉最新解析脚本并注入页面。原因包括：

- MV3 / 扩展安全模型不鼓励远程执行代码
- 商店审核风险高
- 调试和回归不可控
- 用户实际运行版本不可追踪

主项目的 Options、文档和 telemetry 只同步 `platformRegistry.ts` 中的轻量产品面信息，不导入平台 parser 实现或运行时 parser registry。解析器实现继续通过 lazy runtime parser boundary 加载，避免把平台解析代码压入 Options 或 content 主入口。

AI 对话输出路径不新增默认域名映射。当前模板依赖 `meta.platform` 等导出元数据，域名到 vault 的映射继续由用户在设置中维护，避免升级后静默改变现有 vault 路由语义。

Telemetry 暂不扩展平台枚举。ChatGPT、Claude、Gemini 保持具名 analytics platform，Copilot、Tongyi/Qianwen、DeepSeek、Kimi、Doubao、Monica、Perplexity 等非核心 AI 平台继续归入 `other`，直到后续单独完成 GA schema、dashboard 和 docs contract 迁移。`platformRegistry.ts` 中的 `analyticsPlatform` 仅是轻量元数据字段，不得绕过 GA schema / dashboard / docs contract 扩展流程。

---

## 建议的抽离边界

适合抽到独立项目中的内容：

- `types.ts`
- `parse.ts`
- `registry.ts`
- `platforms/*`
- `shared/dom.ts`
- `shared/markdown.ts`
- `shared/assets.ts`
- 可选的 profile parser helper，例如 `shared/profileEngine.ts`，但前提是它继续保持 fail-closed role contract

不建议一起抽出去的内容：

- `src/content/extractors/aiChatExtractor.ts` 中的业务整合逻辑
- 需要产品语义的轻量平台元数据，例如 Options 展示链接、fallback title policy 和 Zendio 的 URL host detection 默认策略
- Options 仓储兼容逻辑
- Obsidian 输出格式拼装
- 时间格式化、扩展侧 meta 构造
- live DOM preparation / hydration，例如 DeepSeek virtual list scrolling

原因很简单：独立库应只负责把 DOM 解析成标准化聊天数据，而不应耦合 `AiiinOB` 自己的业务上下文。

也就是说，独立库更适合提供这样的能力：

```ts
parseChatDOM(platform, document, config?)
listParsers()
registerParser(parser)
```

而不是直接负责：

- 识别当前是不是 AI 聊天页
- 读取扩展配置
- 生成最终导出的业务 Markdown
- 处理 Obsidian 侧字段和元数据
- 操作 live page 滚动或等待 frame 以补齐虚拟列表 DOM

---

## 建议的抽象方向

### 原则

不要试图把所有平台变成纯配置驱动。

合理的抽象上限应该是：

- 共享骨架
- 平台自定义钩子

而不是：

- 一个超大的声明式 schema 试图覆盖所有平台特殊行为

因为复杂平台仍然需要定制代码，例如：

- Gemini：深层 DOM / Shadow DOM / Deep Research
- Tongyi：代码块语言和行号清理
- Kimi：块头部、表格标签、动作区清洗

当前健康边界是：

- `platformRegistry.ts` 是轻量平台元数据唯一来源，覆盖 host detection、alias、Options label/link 与 fallback title policy。
- `registry.ts` 与 `runtimePlatformParsers.ts` 仍只负责 parser 实现注册；必须通过测试与轻量元数据保持一致，但不反向驱动 Options。
- `profileEngine.ts` 是 opt-in 共享骨架。默认未知 role 必须 fail closed；只有平台 profile 显式声明 `fallbackRole` 时才允许降级为默认角色。
- live DOM hydration 属于 content extraction 层，当前通过 `AI_CHAT_DOCUMENT_PREPARERS` 显式注册。它不属于独立 parser 库，因为它需要滚动、等待 animation frame 和操作 live page。
- Perplexity、Gemini、Tongyi、Kimi 等复杂平台可以保留定制 parser，只复用底层 DOM/Markdown/helper；不要强行迁入通用 profile engine。

### 推荐的两层结构

#### 第一层：共享 helper / 骨架

可抽出的通用能力包括：

- `resolveTitle(...)`
- `resolveModel(...)`
- `pickFirst(...)`
- `extractMessagesByContainers(...)`
- `cloneAndCleanup(...)`
- `toParsedMessage(...)`
- `queryAllDeep(...)`

#### 第二层：平台 spec + hooks

每个平台只声明：

- message container selectors
- user / assistant role 识别方式
- content selectors
- title 清理规则
- model 候选 selectors
- 可选 `sanitizeContent` hook
- 可选 `customParse` hook

### 最适合优先收敛的平台

优先级建议如下：

1. `doubao`
2. `monica`
3. `deepseek`
4. `chatgpt`
5. `claude`

这些平台的共同结构较多，抽象收益最高。

### 不建议强行套入通用骨架的平台

- `gemini`
- `tongyi`
- `kimi`

这几类平台应允许保留自定义实现，只复用底层 helper，不强制塞进统一模板。

---

## 建议的独立仓库结构

可以采用如下结构：

```text
llm-chat-dom-parser/
  src/
    index.ts
    parse.ts
    registry.ts
    types.ts
    shared/
      dom.ts
      markdown.ts
      assets.ts
      parserUtils.ts
    platforms/
      chatgpt.ts
      claude.ts
      deepseek.ts
      doubao.ts
      gemini.ts
      kimi.ts
      monica.ts
      tongyi.ts
  tests/
    fixtures/
      chatgpt.html
      claude.html
      deepseek.html
      ...
    parsers/
      chatgpt.test.ts
      claude.test.ts
      ...
  package.json
  README.md
```

如果后续要保持 fixture 驱动测试，建议把各平台 HTML 样例和预期结果一起沉淀在独立仓库里，作为主回归资产。

## Fixture 治理要求

在解析器仍以内置 `src/third_party/ai-chat-exporter/**` 维护期间，`AiiinOB` 的主回归资产位于：

- HTML fixture：`tests/fixtures/ai-chat/*.html`
- current-DOM fixture lane：`tests/fixtures/ai-chat/current-dom/*.html`
- executable fixture manifest：`tests/fixtures/ai-chat/fixtureManifest.ts`
- fixture 索引与治理说明：`tests/fixtures/ai-chat/README.md`
- 解析器回归测试：`tests/unit/third_party/parsers.test.ts`
- current-DOM matrix：`tests/unit/third_party/parserCurrentDomMatrix.test.ts`
- Gemini 重点行为测试：`tests/unit/third_party/gemini.test.ts`
- Markdown 规则测试：`tests/unit/third_party/markdownRules.test.ts`
- 内容抽取接入测试：`tests/unit/content/aiChatExtractor.test.ts`

新增或修复 parser drift 时，必须在同一个提交中同时更新 fixture 与对应单测断言。不能只改 parser 代码，也不能只替换 fixture 而不说明预期输出变化。

每个 fixture 在 `tests/fixtures/ai-chat/fixtureManifest.ts` 与
`tests/fixtures/ai-chat/README.md` 中必须登记：

- fixture 文件名
- 来源采集日期，格式为 `YYYY-MM-DD`；旧 fixture 无法追溯时只能标为 `legacy-unknown`
- 平台与预期 `parseChatDOM` parser id
- 预期标题、消息数量或关键 Markdown sentinel
- 隐私剥离状态
- `active` / `pending` 状态；`pending` 只用于尚未提交 sanitized HTML 的
  current-DOM 预留槽位，不能被 parser matrix 当作可解析 fixture

提交 fixture 前必须剥离账号名、邮箱、token、workspace 名称、私有 URL、用户标识和真实对话内容。保留按钮、工具栏、广告或动作区文本时，必须是为了证明 parser 会把这些 UI 噪音从输出 Markdown 中移除。

真实站点 DOM 只能先保存到 ignored 本地证据目录：

```text
/Users/mac/Documents/Dev/AI2OB_Plg/.tmp/ai-chat-parser-productionization-2026-06-24/live-dom-snapshots/
```

提交到 `tests/fixtures/ai-chat/current-dom/` 前必须完成隐私剥离，并保留会触发
drift 的 DOM shape、class、attribute、role marker、toolbar 结构。已提交的
`current-dom/*.html` 不允许使用 `legacy-unknown`，必须记录具体 `YYYY-MM-DD`
capture date。

---

## 推荐的同步方式

### 推荐方案：依赖升级 + CI 自动同步

推荐主流程：

1. 独立解析器仓库发布 npm 版本
2. `AiiinOB` 依赖该包
3. GitHub Actions 检测到新版本
4. 自动创建升级 PR
5. 自动执行：
   - parser tests
   - 主项目 unit tests
   - 主项目相关 E2E / fixture tests
6. 通过后人工合并或自动合并
7. 主项目重新构建并发布扩展

这是“自动同步”的正确做法。

### 不推荐方案：运行时远程热更新 / 远程注入

不建议：

- 扩展运行时从 GitHub 下载最新 parser JS
- 然后直接注入到 content script 或页面里执行

主要问题：

- 扩展安全边界变差
- 与 MV3 / 商店审核模型冲突
- 用户运行版本不可追踪
- 出问题难以复现
- 一次 parser 更新可能直接破坏线上用户体验

因此，如果需要“自动”，应自动化发布链路，而不是自动化远程执行。

---

## 推荐的主项目接入方式

主项目中建议保留一个轻量适配层，例如：

```ts
import { parseChatDOM } from '@your-scope/llm-chat-dom-parser';

export async function extractAIChat(document: Document, url: string) {
  const platform = detectPlatform(url);
  const parsed = parseChatDOM(platform, document, {
    deepResearch: { pureMode: false }
  });

  return mapParsedResultToAiiinOB(parsed, url);
}
```

这样有几个好处：

- 独立库只负责解析
- 主项目保留平台识别和业务拼装控制权
- 未来即使替换解析库，主项目适配层也不会太大

---

## 实施建议

建议按下面顺序做，不要一步到位大迁移。

### Phase 1：先做仓库边界切分

- 在当前仓库内先把 parser 相关代码聚拢
- 明确哪些文件属于“独立库候选”
- 给 parser 侧补独立 fixture 测试

### Phase 2：先抽简单平台

先抽 `doubao` / `monica` / `deepseek` 的共享 helper，验证抽象是否真正减重。

如果这一步做完之后：

- 新平台接入更快
- 老平台代码变短
- fixture 回归更稳

再继续扩。

### Phase 3：独立仓库

- 搬运 parser 内核
- 保留 `AiiinOB` 中的适配层
- 主项目改为引用独立包

### Phase 4：自动同步

- 解析器仓库发版
- 主项目自动提升级 PR
- 自动跑测试
- 合并后随扩展版本发布

---

## 最终建议

如果目标是长期维护和开源影响力，这部分值得独立。

但要注意两点：

1. 抽的是“解析内核”，不是整个 `aiChatExtractor`
2. 做的是“自动依赖同步”，不是“运行时远程自动注入”

一句话总结：

这部分很适合做成一个独立的开源解析库；当前确实有重复，尤其在中等复杂度平台中；最佳路线是“共享骨架 + 平台钩子 + CI 自动升级依赖”，而不是远程热更新扩展里的解析逻辑。
