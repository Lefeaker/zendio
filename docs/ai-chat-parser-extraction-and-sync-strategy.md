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
- 有平台注册表：`registry.ts`
- 各平台实现基本都在 `src/third_party/ai-chat-exporter/platforms/*`

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

不建议一起抽出去的内容：

- `src/content/extractors/aiChatExtractor.ts` 中的业务整合逻辑
- 平台 URL 检测默认策略
- Options 仓储兼容逻辑
- Obsidian 输出格式拼装
- 时间格式化、扩展侧 meta 构造

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
