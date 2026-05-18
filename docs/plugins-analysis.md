# 三个插件代码逻辑拆解

本文对仓库中的三款浏览器插件进行代码层面的拆解，帮助快速理解它们的整体架构、关键流程与核心模块。三个目录分别是：

- `markdownload`（MarkDownload - Markdown Web Clipper）
- `chatgpt-to-markdown`（ChatGPT to Markdown）
- `obsidian-clipper`（Obsidian Web Clipper）

---

## MarkDownload（markdownload）

- 目标：将网页内容（或所选内容）转为 Markdown，并支持下载/复制、图片下载与路径重写、Obsidian 友好链接等。
- 技术点：WebExtension API、Readability 内容提取、Turndown HTML→Markdown、自定义 Turndown 规则、后台脚本统一调度。

### 架构与关键文件

- 后台脚本：`markdownload/src/background/background.js:1`
- 内容脚本：`markdownload/src/contentScript/contentScript.js:1`
- 前端弹窗：`markdownload/src/popup/popup.html:1`、`markdownload/src/popup/popup.js:1`
- 选项页：`markdownload/src/options/options.html:1`、`markdownload/src/options/options.js:1`
- Readability 与 Turndown：`markdownload/src/background/Readability.js:1`、`markdownload/src/background/turndown.js:1`

### 主要流程

1. 触发动作
   - 通过右键菜单、快捷键或弹窗发起剪藏。上下文事件在后台处理：`markdownload/src/background/background.js:540` 之后的 contextMenus 与 commands。
2. 获取网页 DOM
   - 内容脚本负责采集整页 HTML 与当前选择区：`markdownload/src/contentScript/contentScript.js:1` 的 `getHTMLOfDocument()` 与 `getHTMLOfSelection()`。
   - 将 DOM/选区发消息给后台：`notifyExtension()`。
3. 文章解析
   - 后台使用 Readability 提取“正文+元信息”：见 `getArticleFromDom`（定义在同文件稍后位置，调用内置 Readability），并组合 `article`（包含 `title/baseURI/keywords/...`）。
4. HTML → Markdown
   - `turndown(content, options, article)` 执行 Turndown 转换并应用一系列自定义规则：
     - 图片：重写 `src` 为绝对路径；若开启下载，将生成图片文件名，且根据 `imageStyle` 输出 Obsidian 链接、Base64 或普通 Markdown：`markdownload/src/background/background.js:17` 起“images”规则。
     - 链接：按需“去超链接，仅保留文本”或保留：`links` 规则。
     - 代码块：标准化为围栏代码块，自动探测内部围栏冲突长度：`fencedCodeBlock`、`pre` 规则：`markdownload/src/background/background.js:83` 起。
     - MathJax：将提取到的数学式按行内/多行包裹：`mathjax` 规则。
   - 前后插入 frontmatter/backmatter 模板，清理不可见控制字符：`markdownload/src/background/background.js:200` 左右。
5. 下载与复制
   - 下载 Markdown：
     - Downloads API 模式：新建 Blob URL 下载 `.md`，并逐个下载图片：`downloadMarkdown()` 于 `markdownload/src/background/background.js:615` 起。
     - 链接触发模式：在页面注入 `downloadMarkdown(filename, base64Data)` 并触发 a 链接：`markdownload/src/background/background.js:700` 起。
   - 复制 Markdown 或生成 Markdown 链接到剪贴板：`copyMarkdownFromContext()`、`copyTabAsMarkdownLink*()`。
6. 图片下载与扩展名修复
   - 下载图片前先用 XHR 拿 blob 判定 MIME → 扩展名，修正 `.idunno`：`markdownload/src/background/background.js:470` 起。

### 选项与动态占位

- 文件名、图片名、模板的动态变量替换：`textReplace()` 可处理日期格式、`{keywords:sep}`、大小写/命名风格等：`markdownload/src/background/background.js:246` 起。

---

## ChatGPT to Markdown（chatgpt-to-markdown）

- 目标：在 ChatGPT 页面（`https://chat.openai.com/*`）上，一键导出当前对话为 Markdown 文件。
- 技术点：MV3 Service Worker 注入脚本、直接遍历 DOM 节点生成 Markdown、简单标签转义、代码块/列表/表格处理、自带文件保存（Blob+a.click）。

### 架构与关键文件

- 背景脚本：`chatgpt-to-markdown/background.js:1`（仅在 ChatGPT 域名注入执行脚本）
- 主逻辑入口：`chatgpt-to-markdown/src/chatGptToMarkdown.js:1`
- DOM 解析工具：
  - `parseElements`：`chatgpt-to-markdown/src/utils/parseElements.js:1`
  - `parseNode`：`chatgpt-to-markdown/src/utils/parseNode.js:1`
  - 字符替换：`chatgpt-to-markdown/src/utils/replaceString.js:1`
  - 保存文件：`chatgpt-to-markdown/src/utils/consoleSave.js:1`

### 主要流程

1. 触发与注入
   - 点击扩展图标或快捷键后，背景脚本校验 URL 并注入打包后的脚本 `dist/minimizedChatGptToMarkdown.js`：`chatgpt-to-markdown/background.js:11`。
2. DOM 抓取
   - 页面上按 ChatGPT 布局选择所有对话块：`document.querySelectorAll("[class*='min-h-[20px]']")`：`src/chatGptToMarkdown.js:4`。
3. Markdown 构建
   - 逐节点深度遍历：`parseNode(node, level)` 根据标签输出：
     - 标题/段落/强调/删除线：映射为 `#`/空行/`**`/`_`/`~~` 等。
     - 引用块：递归添加 `>` 前缀，处理嵌套层级与换行：`parseBlockQuote()`。
     - 有序/无序列表：根据层级对齐缩进，`OL` 使用 `start` 与序号：`parseOrderedList()`、`parseUnorderedList()`。
     - 代码块：按 ChatGPT 的“Copy code + 语言 + 代码”结构拆分，输出 ```lang 包裹：`parseCodeBlock()`。
     - 表格：遍历 `THEAD/TBODY` → 行/列，构造 `|` 分隔及 `---` 分隔行：`parseTable()`。
   - 行内链接/强调/代码等使用 `replaceString()` 将 `<a>/<strong>/<em>/<code>` 等转为 Markdown，并抽取纯文本。
4. 文件保存
   - 通过 `consoleSave(console, 'md')` 注册 `console.save()` 并以页面 `<title>` 生成文件名，创建 Blob 触发下载：`src/utils/consoleSave.js:22`。

### 界面内容格式化细节（gpt-to-markdown）

- 元素选择与入口：页面注入后选取 ChatGPT 对话块 `document.querySelectorAll("[class*='min-h-[20px]']")`，逐个交给 `parseNode(firstChild, level=0)`：`chatgpt-to-markdown/src/chatGptToMarkdown.js:4`、`src/utils/parseElements.js:1`。
- 问答分段：
  - 若块 `className == 'empty:hidden'`，插入分隔线与 `# _Question_` 标题。
  - 若包含 `markdown prose`，插入 `# _Answer_` 标题：`src/utils/parseNode.js:20` 起。
- 行内格式：`replaceString()` 将 `<strong>/<em>/<del>/<code>` 转 `**/_/~~/\``；`<a>`先被`convertUrlToMarkdown()`转`[text](url)`，再提取纯文本，避免残留标签：`src/utils/replaceString.js:1`。
- 引用块：`parseBlockQuote()` 递归解析并通过 `blockQuoteUtils` 生成 `> ` 前缀、去重多余前缀、修正结尾：`src/utils/blockQuoteUtils.js:1`。
- 列表：
  - 有序 `<ol>` 使用 `start` 属性与索引生成 `1. / 2. ...`；无序 `<ul>` 使用 `- `。
  - 缩进规则：`getSpaces(level)` 采用“每层 3 个空格”，兼容有序列表序号宽度且避免误形成代码块：`src/utils/parseNode.js:240` 起。
- 代码块：依据 ChatGPT UI 文本将 `"Copy code"` 前后拆分为语言与代码体，输出为围栏 ```lang：`src/utils/parseNode.js:198` 起。
- 表格：遍历 `THEAD/TBODY` 按行/列输出管道表格，并生成 `---` 表头分隔行：`src/utils/parseNode.js:148` 起。
- 输出清理：`cleanUpString()` 去掉开头多余分隔线、合并 3+ 空行为 2、整体修剪并为每行去尾随空格：`src/utils/cleanUpString.js:1`。

---

## Obsidian Web Clipper（obsidian-clipper）

- 目标：官方剪藏扩展，提供阅读视图、模板编译、Markdown 转换、侧边面板/内嵌 iframe、页面/元素高亮与同步到 Obsidian（支持 Advanced URI、剪贴板、每日笔记 append/prepend 等）。
- 技术点：TypeScript + WebExtension API、多浏览器（Chrome/Firefox/Safari）打包、Defuddle 抽取结构化内容、Turndown 深度定制（表格/数学/嵌入/Callout）、模板语言（变量/选择器/schema/prompt/for 循环）、高亮持久化与渲染、侧栏/嵌入面板。

### 架构与关键文件

- 背景页（事件与状态中枢）：`obsidian-clipper/src/background.ts:1`
- 内容脚本（页面侧逻辑/高亮/内嵌面板）：`obsidian-clipper/src/content.ts:1`
- Markdown 转换：`obsidian-clipper/src/utils/markdown-converter.ts:1`
- 模板编译：`obsidian-clipper/src/utils/template-compiler.ts:1`
- 保存到 Obsidian：`obsidian-clipper/src/utils/obsidian-note-creator.ts:1`
- 其他工具：选择器/过滤器/字符串/日期等 `obsidian-clipper/src/utils/*`

### 主要流程

1. 注入与上下文菜单
   - 安装/激活后创建上下文菜单，按页/选区/媒体提供“保存”“高亮”等命令：`obsidian-clipper/src/background.ts:620` 起。
   - 针对不同浏览器做兼容，监听活动标签页切换与加载完成，动态刷新菜单/高亮：`obsidian-clipper/src/background.ts:548` 起。
2. 内容脚本初始化
   - 单例保护，挂载内嵌容器与 iframe（`side-panel.html?context=iframe`），支持拖拽缩放并持久存储尺寸：`obsidian-clipper/src/content.ts:22` 起。
   - 与背景通信，响应 ping/toggle-iframe/toggleReaderMode 等动作，并提供 `copy-text-to-clipboard` 等能力：`obsidian-clipper/src/content.ts:97` 起。
3. 页面内容提取
   - 先用 Defuddle 在真实 DOM 上抽取结构化字段（标题、描述、favicon、作者、发布时间、schema、主图等）：`obsidian-clipper/src/content.ts:143`。
   - 克隆与清洗整页 HTML：移除 `script/style`、清掉内联 `style`、统一相对 URL 为绝对 URL：`obsidian-clipper/src/content.ts:168` 起。
   - 返回结果含：正文 HTML/选中 HTML/高亮列表/站点元信息/清洗后的整页 HTML 等。
4. HTML → Markdown（深度规则）
   - 基于 Turndown 并大量自定义规则：`obsidian-clipper/src/utils/markdown-converter.ts:1`
     - 表格：支持简单表格转 Markdown；复杂 `rowspan/colspan` 回退为清理过的 HTML；支持 arXiv 公式表格内的数学处理：`obsidian-clipper/src/utils/markdown-converter.ts:20` 起、`200` 起。
     - 嵌入：YouTube/Twitter 转 Obsidian 兼容链接：`obsidian-clipper/src/utils/markdown-converter.ts:230`。
     - 高亮/删除线：`mark` → `==text==`，`DEL/S/STRIKE` → `~~text~~`。
     - 任务列表、嵌套列表使用 Tab 缩进对齐：`obsidian-clipper/src/utils/markdown-converter.ts:77` 起。
     - 数学：MathJax/MathML/KaTeX 一并覆盖，自动区分行内 `$...$` 与块级 `$$...$$` 并尽量保持周围空格合理：`obsidian-clipper/src/utils/markdown-converter.ts:328` 起、`500` 起。
     - 图片/figure 与说明文字、脚注收集与尾注输出、去除无效链接/多余换行等善后：`obsidian-clipper/src/utils/markdown-converter.ts:120`、`700` 起。
5. 模板编译
   - 类似 Liquid 的轻量语法：
     - 变量类型：简单变量、CSS 选择器抓取（文本/HTML）、schema 解析、prompt 变量。
     - 逻辑：`{% for x in arr %}...{% endfor %}` 循环：`obsidian-clipper/src/utils/template-compiler.ts:15` 起。
     - 统一入口：`compileTemplate(tabId, text, variables, currentUrl)` 先处理逻辑再填充变量：`obsidian-clipper/src/utils/template-compiler.ts:21`。
6. 写入 Obsidian
   - 生成 YAML frontmatter（类型感知：多值/数字/勾选/日期、键名自动加引号规避歧义）：`obsidian-clipper/src/utils/obsidian-note-creator.ts:7`。
   - 通过 Obsidian Advanced URI 协议写入文件，支持：新建/覆盖、附加/前置、每日笔记等；
     - 非 legacy：优先复制内容到剪贴板后以 `obsidian://new?...&clipboard` 触发；
     - legacy：直接以 `&content=...` 传输：`obsidian-clipper/src/utils/obsidian-note-creator.ts:63` 起。
7. 高亮系统
   - 背景维护“高亮模式”开关与状态，内容脚本负责绘制与交互；支持从右键菜单将选区或媒体加入高亮：`obsidian-clipper/src/background.ts:562` 起、`obsidian-clipper/src/content.ts:248` 起。
   - 支持持久化与按需重绘：`obsidian-clipper/src/background.ts:511`、`obsidian-clipper/src/content.ts:232`。
8. 阅读视图
   - 注入 `reader.css` + `reader-script.js`，通过消息切换阅读模式：`obsidian-clipper/src/background.ts:715` 起、`obsidian-clipper/src/content.ts:309` 起。

### 通信技术与事件流（obsidian-clipper）

- 统一封装：使用 `webextension-polyfill` 提供的 `browser.*` API 做跨浏览器兼容。
- 背景 ↔ 内容脚本：
  - 消息：`browser.runtime.onMessage.addListener` + `browser.tabs.sendMessage`；动作如 `toggle-iframe`、`paintHighlights`、`setHighlighterMode`、`copy-text-to-clipboard` 等：`obsidian-clipper/src/background.ts:520, 585, 612`；`obsidian-clipper/src/content.ts:97, 200`。
  - 注入：`ensureContentScriptLoadedInBackground(tabId)` 先 `sendMessage({action:'ping'})` 探测，无响应则通过 `browser.scripting.executeScript` 注入：`obsidian-clipper/src/background.ts:12, 35, 58`。
- 背景 ↔ 弹窗（popup）：
  - 长连接端口：`browser.runtime.onConnect`/`port.postMessage` 跟踪弹窗是否打开并同步高亮 UI：`obsidian-clipper/src/background.ts:26` 起。
- 背景 ↔ 侧边面板/内嵌 iframe：
  - 侧栏：Chrome 下用 `chrome.sidePanel.open`，并在后台维护 `sidePanelOpenWindows` 集合，配合标签激活事件联动：`obsidian-clipper/src/background.ts:666` 起。
  - 内嵌 iframe：通过 `toggle-iframe` 通知内容脚本创建/移除容器并存储窗口尺寸：`obsidian-clipper/src/content.ts:116` 起。
- 上下文菜单与快捷键：`browser.contextMenus.create/onClicked`、`browser.commands` 建立入口，事件在后台转发到内容脚本执行业务：`obsidian-clipper/src/background.ts:590, 704`。
- 剪贴板与外部应用：
  - 复制：内容脚本用 `document.execCommand('copy')` 写入剪贴板（后台受限），再由后台/内容脚本组合 `obsidian://` Advanced URI 调起 Obsidian 新建/追加：`obsidian-clipper/src/content.ts:200`、`obsidian-clipper/src/utils/obsidian-note-creator.ts:63`。

---

## 对比与取舍建议

- 若仅需“把网页/选区变成 Markdown 并下载/复制”，`markdownload` 足够，图片下载/重命名规则很完善。
- 若仅在 ChatGPT 导出会话，`chatgpt-to-markdown` 体量最小、逻辑清晰，按页面结构直出 Markdown。
- 若需要模板、结构化字段、阅读视图、与 Obsidian 紧密协作（含高亮、侧面板、URI 写入、多浏览器支持），选 `obsidian-clipper`。

---

## 可扩展点（示例）

- markdownload：
  - 在 `turndown()` 中新增自定义规则（例如 callout、任务列表）或增强图片命名策略。
- chatgpt-to-markdown：
  - `parseNode()` 内按新 UI 结构调整选择器与处理逻辑；支持代码块语言自动识别；增加图片/附件处理。
- obsidian-clipper：
  - 模板引擎可扩更多逻辑块（if/else）；Markdown 转换规则继续扩展（如更多站点适配）。

以上为三款插件的代码级拆解与关键流程概览，便于后续二次开发或定制集成。

---

## AI Chat Exporter（ai-chat-exporter）

- 目标：以用户脚本（UserScript）的方式，在多个 AI 聊天网站（ChatGPT/Claude/Copilot/Gemini）上采集并导出会话为 Markdown 或 JSON，带目录、YAML Frontmatter、可筛选消息、可自定义文件名格式。
- 技术点：纯前端用户脚本（Tampermonkey/Greasemonkey）注入，内联自定义 Turndown 实现 HTML→Markdown，多站点 DOM 选择器适配，UI 悬浮控制面板与大纲、选择导出、文件名模板、局部状态存储（GM_getValue/GM_setValue）。

### 架构与关键文件

- 用户脚本主文件：`ai-chat-exporter/ai-chat-exporter.user.js:1`
- 测试脚本与演示：`ai-chat-exporter/test-ai-chat-exporter.user.js:1`、`ai-chat-exporter/sample.md:1`
- 文档与参考 DOM：`ai-chat-exporter/README.md:1`、`ai-chat-exporter/reference-html-dom/*`

### 主要流程

1. 站点识别与常量配置
   - 基于 `window.location.hostname` 判定平台：ChatGPT/Claude/Copilot/Gemini：`ai-chat-exporter/ai-chat-exporter.user.js:236` 起。
   - 针对每站点配置标题清洗、消息容器选择器、语言标识位置与特殊 UI 节点：`ai-chat-exporter/ai-chat-exporter.user.js:224` 起。
2. UI 注入
   - 在页面右下角注入“导出控制按钮组”和“对话大纲浮窗”，包含“全选/搜索/勾选指定消息”等交互；样式通过 `applyStyles` 逐属性写入：`ai-chat-exporter/ai-chat-exporter.user.js:66` 起、`405` 起部分下载函数、以及多处常量样式定义。
   - 大纲浮窗记录折叠状态、自动滚动提示条，使用本地存储键值如 `OUTLINE_COLLAPSED_STATE_KEY`、`HIDE_ALERT_FLAG`：顶部常量区。
3. 抽取会话
   - 按平台分别解析 DOM：
     - ChatGPT：遍历 `<article>`，聚合 `h5` 与 `div.text-base` 文本，生成消息数组，作者角色由头部语句判断（含 “you said”）：`ai-chat-exporter/ai-chat-exporter.user.js:535` 起。
     - Claude：过滤“thinking/artifact”块，仅保留真实回复内容，聚合 `.grid-cols-1`：`ai-chat-exporter/ai-chat-exporter.user.js:599` 起。
     - Copilot：依据 `data-content="user-message"/"ai-message"` 选择器拆分消息：`ai-chat-exporter/ai-chat-exporter.user.js:248`、后续抽取函数段。
     - Gemini：通过 `user-query, model-response` 等结构抽取（参考 README 与 DOM 示例）。
   - 标题与标签：从页面标题中解析 `#tag` 前缀组合作为 tags，余下为清洗后的标题：`parseChatTitleAndTags()` 于 `ai-chat-exporter/ai-chat-exporter.user.js:612` 起。
   - 为每条消息生成稳定 ID，供大纲复选与过滤使用：`ai-chat-exporter/ai-chat-exporter.user.js:560` 起。
4. Turndown 转换与规则集
   - 内联定制的 `TurndownService` 简化实现，支持规则注册与遍历节点转 Markdown：`ai-chat-exporter/ai-chat-exporter.user.js:292` 起。
   - 通用规则：换行（br→两空格换行）、标题、列表项缩进修正、图片、弹窗 HTML 转代码块等：`ai-chat-exporter/ai-chat-exporter.user.js:1105` 起。
   - 站点特有规则：
     - ChatGPT：移除“ChatGPT said”等辅助元素、按钮文本包装为强调等：`ai-chat-exporter/ai-chat-exporter.user.js:1000` 起。
     - Copilot：专门适配代码块容器结构，一次性识别语言与 `<pre><code>` 内容输出 ```lang；移除反应条、页脚链接组装为 Markdown 链接：`ai-chat-exporter/ai-chat-exporter.user.js:1016` 起。
     - Gemini：移除代码块语言标识的 UI 装饰节点：`ai-chat-exporter/ai-chat-exporter.user.js:1163` 起。
5. 导出格式化
   - Markdown：
     - 先对“用户消息”编号并构建目录（TOC），正文将用户消息按引用块 `> ` 包裹，AI 回复通过 Turndown 转换后在末尾追加返回顶部链接：`ai-chat-exporter/ai-chat-exporter.user.js:1309` 起。
     - 生成 YAML Frontmatter：包含 title/tags/author/count/exporter/date/url：同段落。
     - 文件名模板：`{platform}_{title}_{timestampLocal}.md` 为默认，支持 `{tag1..tag9}`、`{tags}`、`{exporter}` 等占位：`formatFileName()` 于 `ai-chat-exporter/ai-chat-exporter.user.js:452` 起。
   - JSON：输出结构化消息数组，AI 消息先 Turndown 再入 JSON：`ai-chat-exporter/ai-chat-exporter.user.js:1350` 起。
6. 选择与筛选导出
   - 大纲勾选“问题”（用户消息）时，自动包含其后第一个可见 AI 回复；支持搜索过滤，仅导出“可见且勾选”的消息；勾选集合 `_selectedMessageIds` 实时解析：`ai-chat-exporter/ai-chat-exporter.user.js:1386` 起。
7. 下载
   - 通过 Blob + a.click 触发下载；支持选择导出 Markdown 或 JSON：`downloadFile()` 于 `ai-chat-exporter/ai-chat-exporter.user.js:407`。

### 与现有三个插件的差异与互补

- 运行形态：UserScript（无需打包/上架），注入于目标站点；相比浏览器扩展，更轻量但缺少扩展级权限与后台通信。
- 站点适配：面向四家平台的 DOM 差异做了细粒度规则；相比 `chatgpt-to-markdown` 仅针对 ChatGPT，适配范围更广。
- 输出结构：附带 YAML Frontmatter 与 TOC、“返回顶部”导航；相比 `markdownload` 的通用网页剪藏，此脚本更聚焦对话语义结构。
