# 剪藏上下文 & REST Sink 重构说明（C4）

## 新模块边界

### 内容脚本：剪藏上下文

- `src/content/clipper/shared/contextDom.ts`
  - 负责 Selection/Range 解析、列表路径提取、前置块查找和安全文本读取。
  - 提供 `resolveContextRange`、`collectListPath`、`findPreviousBlockElement`、`getCleanTextContent`。
- `src/content/clipper/shared/contextSerialization.ts`
  - 负责列表祖先 Markdown、片段包裹、元素序列化等格式化逻辑。
  - 与 Turndown 结合，输出 Markdown 片段，同时不直接依赖 contextCapture。
- `src/content/clipper/services/contextCapture.ts`
  - 通过 `resolveContextContainer`、`collectBeforeSegments`、`collectAfterSegments` 等纯函数组合上下文，便于针对性测试。
  - 支持 Shadow DOM、列表嵌套等复杂 DOM 结构的截取。
- `src/content/extractors/selectionExtractor.ts`
  - 引入新的共享模块，避免再直接依赖 contextCapture 内部细节。

### 后台：Obsidian REST Sink

- `src/background/utils/restCandidates.ts`
  - 管理 URL 构造、协议候选、API Key 脱敏。
  - 输出 `createRestCandidates`、`maskApiKey`、`buildVaultUrl` 等，可在其他 REST 调用中复用。
- `src/background/sinks/obsidianRest.ts`
  - 聚焦写入流程，使用候选列表逐一尝试并输出最小化日志。
  - 保持与旧版 API 兼容，新增的安全日志不再泄露 API Key 部分。

## 调试建议

1. **上下文提取**
   - 在内容脚本调试时，可直接引入 `contextDom`/`contextSerialization` 函数验证单个步骤。
   - 单元测试入口：`tests/unit/contextDom.test.ts`、`contextSerialization.test.ts`、`contextCapture.test.ts`，可仿照现有示例扩展更多场景。
2. **REST 写入**
   - `restCandidates.test.ts` 模拟不同配置组合，调试写入失败时优先确认生成的候选 URL。
   - 日志中已使用 `maskApiKey`，可在 DevTools 中搜索 `✅ Write successful`、`❌ ... failed` 了解重试情况。
3. **整体冒烟**
   - `npm run test` 保障所有单测；`npm run build` 验证构建。
   - 如需浏览器侧调试，可在控制台执行 `window.fetch` 拦截或替换，观察候选 URL 顺序。

## 后续 TODO（可选）

- 将 `dialog.ts` 中的拖拽逻辑迁移到独立模块，并补充测试。
- 评估是否引入真实浏览器端 E2E 校验，确认复杂页面结构与分段策略一致。
