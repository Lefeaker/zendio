# Bilibili 评论区捕捉修复指南

## 1. 背景与目标

- 当前版本在 B 站视频页进入「视频模式」后，评论区文本仍无法被成功捕捉到右侧面板，也无法在页面内恢复高亮。
- 早期尝试通过一次性观察所有 `bili-*` 自定义元素来解决 Shadow DOM 搜索问题，但引发了页面卡死（批量 `querySelectorAll('*')` + 深度递归导致频繁 reflow 与重复轮询）。
- 目标是在保证性能稳定的前提下，使评论区主评、回复、表情、@ 提及等内容都能被捕捉、保存并在后续重新定位/高亮。


## 2. 当前症状一览

| 阶段 | 现象 | 影响 |
| ---- | ---- | ---- |
| 触发捕捉 | 鼠标在评论区选中文本后点击悬浮球，右侧面板无新增条目 | 无法收集评论内容 |
| 高亮恢复 | 手动构造存量数据后刷新页面，侧边面板仍无法高亮对应评论 | 复现/分享时找不到原文位置 |
| 性能 | 大规模监听 `bili-*` 元素时页面卡死，刷新也无法恢复 | 视频页不可用 |


## 3. 根因梳理

### 3.1 选择触发阶段
- `video/session.ts` 仅在顶层 `document` 上监听 `mouseup`，Shadow DOM 内的选择在大多数浏览器会被重定向，但 B 站评论组件会在 `mouseup` 同帧内执行 `selection.removeAllRanges()`，导致我们读取到的 `Selection` 为空。
- `extractBilibiliSelection` 的兜底逻辑只接受我们已经拿到的 `Range`，一旦 `Selection` 被提前清空就拿不到可用的 `Range`。

### 3.2 Shadow Root 发现与性能
- 先前为了解决漏扫问题将 `BILIBILI_COMMENT_HOST_SELECTORS` 扩展到所有 `bili-*` 元素，并在 `observeShadowRoots` 中对每个节点递归 `querySelectorAll('*')`。B 站页面上同类节点数量大（推荐区、播放器、评论区共用前缀），这会触发数千次 DOM 查询。
- 当前代码虽然缩小了选择器，但仍然在每次评论加载时遍历整棵 DOM，缺少基于评论容器的作用域限定与重复观察的去重。

### 3.3 文本提取与语义恢复
- 页面示例（`docs/reference-fixtures/bilibili-page-source-complete.html`）显示主评在 `bili-rich-text` 中有 `span.text-node` 与 `bili-emoji` 混合；实际线上还会出现 `bili-link`, `bili-at`, `bili-dyn-content` 等节点。目前的 `extractBilibiliSelection` 仅处理 `.text-node`/`.reply-target`，遗漏其它文本入口。
- `data-content` 字段中包含 `[]` 表情占位与 JSON 片段，需要优先解析后再 fallback 至 DOM。
- 选中回复时需要保留引用的昵称（`@xxx`），与正文一起合并，避免高亮回放时文本丢失。

### 3.4 高亮恢复
- `findTextRangeInShadowDOM` 会遍历所有 ShadowRoot 的文本节点并拼接字符串匹配，但捕捉时生成的 `selectedText` 经过空格归一化，与页面实际的换行/全角符号不完全一致，导致匹配失败。
- 即使找到了 Range，`highlightSelectionRange` 会在 Shadow DOM 内注入 `<mark>`。Bilibili 的影子 DOM 样式表默认设置 `::slotted(*)` 或 `all: initial;`，导致我们插入的 `<mark>` 样式不可见，需要额外注入样式或改成外层高亮策略。


## 4. 修复总体策略

1. **事件桥接**：为评论区 Shadow DOM 注册 `selectionchange` 监听，拦截 B 站侧清空逻辑，在我们完成复制后再允许宿主重置。
2. **作用域化观察**：仅针对评论容器内的关键宿主（`bili-comment-thread-renderer`、`bili-comment-renderer`、`bili-comment-reply-renderer`、`bili-rich-text`）建立观察；使用 `WeakSet` 去重并限制轮询层数，避免扫描播放器、推荐区等不相关区域。
3. **富文本抽取器**：实现通用 `flattenBiliRichText(shadowRoot)` —— 统一遍历 `rich-text-content` 内的文本、表情 (`data-emoji`)、链接 (`data-title`)、@ 提及；并以结构化形式（纯文本 + markdown/HTML）返回。
4. **文本匹配策略**：捕捉阶段额外保存字面文本（原始顺序 + token 类型），重放时按 token 匹配而非整句匹配，增加容错（例如 `[doge]` 可在 DOM/属性中匹配）。
5. **高亮实现**：避免直接在 Shadow DOM 内注入 `<mark>`；推荐改为两种方式之一：
   - 使用 `Highlight API`（`CSSHighligh` + `Range`) 创建原生高亮；
   - 或在宿主上添加 `::part` 样式，通过组件暴露的 `part` 属性来控制高亮。
6. **性能防护**：所有定时轮询都要设定最大重试次数；MutationObserver 回调内进行队列合并与节流（`requestAnimationFrame` 或 `setTimeout`）。


## 5. 详细实施步骤

### Phase 0：调试与基线
1. 在 `video/session.ts` 中为 `window` 与评论 ShadowRoot 注册 `selectionchange` 与 `mouseup` 日志，确认何时 selection 被清空。
2. 复刻 `docs/reference-fixtures/bilibili-page-source-complete.html` 中的结构到本地 `test-bilibili-comments.html`，用于离线调试。
3. 在现有 `extractBilibiliSelection` 中加入失败监控（日志 + Sentry hook），收集真实页面上失败时的 `event.composedPath()`。

### Phase 1：安全的 Shadow DOM 监听
1. 编写 `registerShadowEventBridge(root: ShadowRoot)`，统一在根节点上绑定 `selectionchange`、`mouseup`、`keydown`。
2. MutationObserver 仅对 `.comment-list` 范围内新增的 `bili-comment-*` 元素调用该桥接函数；使用 `WeakSet` 记录已注册的 `ShadowRoot`。
3. 将 `observeShadowRoots` 调整为两段：
   - 直接处理静态存在的评论组件；
   - 针对新增节点使用小批量队列，每帧最多处理 N 个，避免主线程阻塞。

### Phase 2：富文本抽取与捕捉
1. 新建 `src/content/video/bilibiliRichText.ts`，暴露：
   ```ts
   interface BiliTextToken { kind: 'text' | 'emoji' | 'mention' | 'link'; value: string; meta?: Record<string, string>; }
   interface BiliExtractResult { plainText: string; tokens: BiliTextToken[]; html: string; }
   export function extractRichText(shadowRoot: ShadowRoot): BiliExtractResult;
   ```
2. 在 `extractBilibiliSelection` 中优先调用 `extractRichText`，只有在 shadowRoot 不存在或提取失败时才回退到原有逻辑。
3. 捕捉结构中新增 `tokens` 与 `sourceSelector` 字段，为后续高亮与持久化做准备。
4. 处理 `data-content` 含 JSON 的情况：先尝试 `JSON.parse`，再回退。

### Phase 3：文本匹配与高亮
1. 新增 `matchTokensInShadow(root, tokens)` 方法，通过逐 token 匹配而不是整句 `indexOf`，容忍空白/表情差异。
2. 采用 `CSSHighlight` 创建高亮，避免注入 `<mark>`：
   ```ts
   if ('CSSHighligh' in window) {
     const highlight = new window.CSSHighlight(range);
     document.highlights.set(`aiob-${capture.id}`, highlight);
   }
   ```
   - 对于不支持的浏览器，降级为临时包裹元素，但需确保移除时不会破坏 Shadow DOM。
3. 当捕捉删除或页面卸载时清理 highlight，防止残留。

### Phase 4：验证与回归
1. 手动测试用例：
   - 主评 + 回复（含多个段落、`@用户`、表情、链接）。
   - 滚动加载更多评论后继续捕捉。
   - 切换「热门/最新」排序后高亮是否还能定位。
   - 刷新页面后旧数据能否恢复高亮。
   - 对比开启/关闭「减少动态效果」系统设置下的表现。
2. 自动化测试：
   - 为 `extractRichText` 与 `matchTokensInShadow` 编写单元测试（基于 `reference-fixtures/bilibili-page-source-complete.html` 中的片段）。
   - 在 e2e 中构造包含 Shadow DOM 的伪页面（使用 jsdom + web-component polyfill 或 Puppeteer + 真实页面）。
3. 性能监测：
   - 使用 Performance API 记录 `observeShadowRoots` 调用耗时与数量。
   - 通过 Chrome Performance 面板检查 MutationObserver 回调内的脚本耗时是否 < 4ms。


## 6. 风险与缓解

| 风险 | 描述 | 缓解措施 |
| ---- | ---- | ---- |
| 影子 DOM 结构变更 | B 站更新组件命名 | 将选择器集中在配置中，提供灰度开关 |
| 高亮 API 兼容性 | CSS Highlight 仅 Chrome 105+ | 保留 `<mark>` 降级，同时限制在支持的 ShadowRoot 上使用 |
| 性能退化 | 评论加载时观察过多节点 | 节流 + WeakSet 去重 + 快速失败策略 |
| 选区冲突 | B 站脚本仍会清理 Selection | 在桥接层保存 `Range` 副本，必要时使用 `event.preventDefault()` |


## 7. 回滚预案

1. 所有新逻辑需挂在特性开关（如 `options.video.enableBilibiliShadowSupport`），允许线上即时关闭。
2. 保留旧的 DOM 文本遍历实现作为 fallback（在特性开关关闭时恢复到纯 `window.find` + walker）。
3. 文档化：记录本指南 + 代码注释，方便后续维护者定位 Shadow DOM 相关的手动注册点。


## 8. 相关文件与参考

- `src/content/video/session.ts`
- `src/content/video/prompt.ts`
- `docs/reference-fixtures/bilibili-page-source-complete.html`
- `docs/bilibili-comment-shadow-dom-fix.md`

> ⚠️ 本指南尚未在代码层面落地，执行前需与团队确认优先级与排期。完成实现后，请将测试结果与性能数据补充回本文件或另建跟进文档。
