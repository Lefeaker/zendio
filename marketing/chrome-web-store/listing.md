# Chrome Web Store Listing

## Basic Info

- **Name**: Zendio
- **Short Description**: Read. Clip. Think. Structured Markdown for Obsidian.
- **Tagline (EN)**: One-click: pages, highlights, comments & AI chats → structured Markdown in Obsidian.

## Long Description (ZH)

### 如何开始？

最初的设置或许有些繁琐。

1. 你需要安装一个 Obsidian 的插件 [Local Fast APILocal REST API 项目地址](https://github.com/coddingtonbear/obsidian-local-rest-api)，并把插件中的 API 填入本扩展；如果希望重点内容的评论可以友好显示，还需要安装另一个 Obsidian 插件 [Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights)。
2. 当你设置好这些之后，浏览器的内容就可以随时投入 Obsidian，不必舍不得关闭 Tab，不必复制粘贴，也不用担心丢失与任意 AI 的对话，更无需忍受官方插件的弹窗跳转。
3. 你需要保持目标 Vault 当前处于打开状态。扩展支持一键复制配置，可直接粘贴到另一浏览器的设置里。
4. 如果你同时使用 Chrome、Edge 甚至 Arc，你会需要它。暂未上架 Safari 的主要原因是尚未购买开发者账户，如果它帮到了你，欢迎[支持我](https://ko-fi.com/xiannian)。

### 具体功能？

扩展目前提供四个核心功能：

1. **网页文章剪藏**：在页面完全加载后，一键保存到 Obsidian，适合希望用 Obsidian 阅读和消化内容的朋友。
2. **AI 对话归档**：将多平台的 AI 聊天记录集中落地到 Obsidian，方便跨模型继续对话或复盘要点。
   - 支持 OpenAI、Gemini、Claude、Kimi、Deepseek、Tongyi 六大平台，完美适配消息格式，包括代码块、表格等。
3. **碎片摘录与批注**：选中网页中的任意句子即可保存到 Obsidian，可附加批注，并自动生成回链以便随时回到原文。
4. **阅读模式**：在浏览器内进入阅读模式，边读边批注，完成后一次性同步到 Obsidian。

后续会优先保持这几个功能的稳定。如果你有新的需求或想法，欢迎随时[联系我](https://github.com/Lefeaker/zendio/issues)。

### 传输过程中加入 AI 总结？

当前尚未内置，但未来会探索更合适的形态。我不希望简单叠加 LLM 总结，让仓库里产生大量你可能来不及阅读的摘要。若你对 AI 与本扩展进一步融合有更好的思路，欢迎交流。

我的目标是：在完成初始配置后，让你的使用体验尽量顺手、无感。

### 关于隐私？

Zendio 的核心工作流是 local-first：网页内容、AI 对话、阅读批注、视频时间戳笔记和 Obsidian 配置默认留在你的浏览器、本地 Vault 或本地 Obsidian REST API 环境里。

可选的 Usage analytics 和 Error reporting 默认关闭。只有你在设置页主动开启后，扩展才会通过维护者控制的 proxy 向 Google Analytics 4 发送低基数、匿名化的功能使用或错误事件，用来判断哪些功能真正有价值、哪些版本存在稳定性问题。

这些事件不会包含页面正文、完整 URL、URL 查询参数、Vault 名称、文件名、本地路径、截图数据、聊天内容、阅读批注正文、视频笔记正文、密码、token 或 cookie。你可以随时关闭这些开关，并在隐私设置里清除本地 analytics 数据。

谢谢你，[欢迎随时来交流](https://github.com/Lefeaker/zendio/issues)。

现在就安装，开始把阅读与思考一站式同步到 Obsidian。

## Long Description (EN)

### How to Get Started?

The initial setup might be a bit tedious.

1. You need to install an Obsidian plugin called [Local Rest API](https://github.com/coddingtonbear/obsidian-local-rest-api) and enter its API into this extension. If you want comments on highlighted content to display nicely, you’ll also need to install another Obsidian plugin called [Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights).
2. Once you’ve set these up, browser content can be saved to Obsidian any time. No more hesitation about closing tabs, no more copying and pasting, no worries about losing conversations with any AI, and no need to endure pop-ups or redirects from official plugins.
3. Keep your target Vault open while using this. The extension supports one-click configuration copying, which you can paste directly into another browser’s settings.
4. If you use Chrome, Edge, or even Arc simultaneously, you’ll appreciate this. The main reason it’s not yet available on Safari is the lack of a developer account. If it helps you, feel free to [support me](https://ko-fi.com/xiannian).

### Specific Features?

The extension currently offers four core features:

1. **Web Article Clipping**: Save fully loaded pages to Obsidian with one click, ideal for those who prefer reading and digesting content in Obsidian.
2. **AI Conversation Archiving**: Centralize AI chat logs from multiple platforms into Obsidian, making it easy to continue conversations across models or review key points.
   - Supports OpenAI, Gemini, Claude, Kimi, Deepseek, and Tongyi, perfectly adapting message formats, including code blocks, tables, etc.
3. **Fragment Highlighting & Annotation**: Select any sentence on a webpage to save it to Obsidian, add annotations, and automatically generate backlinks for easy reference.
4. **Reading Mode**: Enter reading mode in your browser, annotate while reading, and sync everything to Obsidian afterward.

Future updates will prioritize stabilizing these features. If you have new ideas or requests, [feel free to reach out](https://github.com/Lefeaker/zendio/issues).

### AI Summaries During Transfer?

This isn’t built-in yet, but future versions may explore better implementations. I don’t want to simply add LLM summaries and flood your vault with content you might not read. If you have better ideas for integrating AI with this extension, let’s discuss.

My goal: After initial setup, make the experience as seamless and effortless as possible.

### Privacy?

Zendio's core workflow is local-first: webpage content, AI conversations, reading annotations, video timestamp notes, and Obsidian configuration stay in your browser, local Vault, or local Obsidian REST API environment by default.

Optional Usage analytics and Error reporting are off by default. Only after you enable them in Settings will the extension send low-cardinality, anonymized usage or error events through an owner-controlled proxy to Google Analytics 4. The goal is to understand which features are useful and which releases need stability work.

Those events do not include page bodies, full URLs, URL query strings, Vault names, file names, local paths, screenshot data, chat content, reading annotation text, video note text, passwords, tokens, or cookies. You can turn the switches off at any time and clear local analytics data from the privacy settings.

Thank you, and [feel free to reach out anytime](https://github.com/Lefeaker/zendio/issues).

Install now to keep your reading and thinking in a single Obsidian workflow.

## Assets

- **Screenshots**: `marketing/screenshots/chrome-store-main-1280x800.png`
- **Icons & banners**: see `marketing/` directory for additional assets.

## Contact

- **Support Email**: zendio@sxnian.com
