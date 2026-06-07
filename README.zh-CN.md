<p align="center">
  <img src="marketing/banner.png" alt="Zendio Banner" width="600"/>
</p>

---

## 简介 | What & Why

- **一句话定位**：Zendio 是一款浏览器插件，帮你把网页、片段、评论、AI 对话高效捕捉为结构化 Markdown 笔记。
- **解决的问题**：
  - 不再手工复制粘贴网页和对话内容
  - 连同上下文、批注、源链接一并保存，防止信息丢失
  - 自动生成 YAML / Properties，完美适配 Obsidian Bases 与 [Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights)
- **适合谁**：研究者、工程师、写作者、知识管理者、重度 Obsidian 用户

## 最新更新 | Latest Enhancements

- ♿ 剪藏对话框内置焦点陷阱、屏幕阅读器标签，并可通过 `Alt` + 方向键精准移动位置。
- 🌐 选项页重构为模块化组件，新增自定义确认弹窗，并完整覆盖中 / 英 / 日文案。
- 🤖 AI 会话解析器模块化，首发支持通义千问、DeepSeek、Kimi，同时保持 ChatGPT / Claude / Copilot / Gemini 稳定输出。
- 📌 片段上下文捕获支持嵌套列表、Shadow DOM 与 Text Fragment，确保周边信息完整保留。
- 🔐 Obsidian REST 写入加固重试机制，日志自动掩码 API Key，并在 HTTPS / HTTP 之间智能回退。

## 功能清单 | Features

### 📑 网页剪藏

- 选中网页文字即可右键保存，支持整篇文章或任意片段
- 自动提取标题、URL、作者、捕获时间等元数据
- 基于 Mozilla Readability 清洗正文，保留任务列表、代码块、数学公式
- 生成 Text Fragment URL，回到原文位置只需一键

### 💬 片段评论

- 剪藏浮窗支持即时注释，记录当下思考
- 评论与正文结构化展示，便于后续整理
- 多次剪藏同一页面自动使用时间戳命名，避免覆盖
- 浮窗支持键盘无障碍焦点循环，可使用 `Alt` + 方向键微调位置

### 🤖 AI 辅助

- 支持 OpenAI、Ollama、本地 WebLLM 等模型，自动生成标题、摘要、标签
- 适配 ChatGPT、Claude、Gemini、Copilot、Perplexity、通义千问、DeepSeek、Kimi 等平台
- 模块化平台解析器按站点剥离噪音，未来新增平台更轻松
- 智能过滤多余内容（如 Claude thinking、Copilot 反应条），保留格式

### 📚 阅读会话模式

- 将多个片段合并成一篇“阅读笔记”，支持跨网页整合
- 会话视图展示阅读顺序，适合长文研究与主题整理
- 支持 AI 对话与文章混合导出，形成完整知识链

### 🗂️ 多仓库智能路由

- 支持配置多个 Obsidian Vault，依据域名、关键词、URL 模式自动分流
- 自定义规则优先级与回退策略，实时通知目标仓库
- 全新本地化选项构建器提供安全预览与确认流程，避免配置误操作

### 🔗 [Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights) 兼容

- 导出高亮与片段时自动补充 [Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights) 所需字段
- YAML frontmatter 可直接用于 Bases、Dataview 等插件

### 🌍 多语言与自定义

- 内置简体中文 / English / 日本語 UI，可实时切换
- 自定义路径模板与 Markdown 规则，满足不同工作流

## 安装与配置 | Install & Setup

1. **安装 Chrome 扩展**  
   目前处于开发阶段，可下载源码后在 Chrome “开发者模式”中加载 `dist/` 目录。（发布链接预留）
2. **配置 [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)**
   - 在 Obsidian 中安装 [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) 插件
   - 启用插件、设置 API Key，并确认监听地址（默认 `https://127.0.0.1:27124`）
3. **完成扩展设置**
   - 右键扩展图标 → 选项页
   - 填写 Vault 路径、REST API 配置、AI API Key
   - 配置路由规则与模板（文章 / 片段 / AI 对话 / 阅读会话）

### 权限说明

| 权限                                    | 用途                                                                                      | 隐私承诺                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| `activeTab`                             | 捕获当前浏览页面内容                                                                      | 仅在你主动剪藏时使用，不发送到第三方 |
| `scripting`                             | 向页面注入内容脚本，实现浮窗与标注                                                        | 代码开源，逻辑可审查                 |
| `storage`                               | 保存插件配置、路由规则、临时队列                                                          | 数据仅保存在本地浏览器               |
| `contextMenus`                          | 添加右键菜单项“保存到 Obsidian”                                                           | 不跟踪历史点击，仅用于触发操作       |
| `notifications`                         | 剪藏完成后推送桌面通知                                                                    | 不发送外部请求，提示即刻消失         |
| `host_permissions: <all_urls>`          | 允许在任意页面运行剪藏脚本                                                                | 只在用户触发时访问页面内容           |
| `host_permissions: https://127.0.0.1/*` | 调用 [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) | 仅与本机 Obsidian 实例通信           |

## 使用指南 | Quick Start

### 快速入门

1. 选中文本 → 右键 → `保存到 Obsidian`
2. 在浮窗中补充评论、标签或选择目标 Vault
3. 完成阅读后打开扩展面板，合并片段生成阅读会话笔记
4. 打开 Obsidian，即可看到包含元数据与附件的 Markdown 文件

### YAML 模板示例

**文章 Article**

```markdown
---
type: article
title: '阅读笔记标题'
url: 'https://example.com'
author: '作者'
clipped_at: '2024-01-01T12:00:00'
tags: [clipping]
---

正文内容...
```

**片段 Fragment**

```markdown
---
type: fragment
source_title: '原网页标题'
source_url: 'https://example.com#~:text=fragment'
comment: '我的批注'
clipped_at: '2024-01-01T12:05:00'
route: 'Research Vault'
---

> 选中的原文片段
```

**AI 对话 AI Chat**

```markdown
---
type: ai-chat
platform: 'ChatGPT'
model: 'gpt-4o'
started_at: '2024-01-01T13:00:00'
tags: [ai, research]
---

### user

请帮我总结最近的论文进展

### assistant

为你总结关键要点...
```

**阅读会话 Reading Session**

```markdown
---
type: reading-session
sources:
  - title: '文章 A'
    url: 'https://example.com/a'
  - title: '片段 B'
    url: 'https://example.com/b#fragment'
compiled_at: '2024-01-01T14:00:00'
---

1. 第一阶段阅读记录...
2. 第二阶段洞见...
```

### 示例截图

- 浮窗操作、Bases 表格视图等截图预留，可在后续版本补充

## Roadmap

- ✅ 已上线：网页剪藏、片段批注、AI 对话导出、阅读会话、多仓库路由、多语言 UI、无障碍剪藏对话框、模块化 AI 解析器
- 🚧 进行中：高级模板管理、更多 AI 模型适配、批量回放阅读会话、Vault 级分析与批量清理工具
- 💡 欢迎提交 Issue 或 PR，提出你的工作流需求

## 支持项目 | Support

- [Ko-fi：Buy me a coffee](https://ko-fi.com/xiannian)
- [爱发电：支持作者](https://afdian.com/a/LefShi)

## 致谢与许可 | Credits

- 灵感来源：[Readwise](https://github.com/readwiseio/obsidian-readwise)、[Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights)、[Dataview](https://github.com/blacksmithgu/obsidian-dataview)、[Obsidian Bases](https://github.com/hadynz/obsidian-bases)
- 第三方组件：[AI Chat Exporter](https://github.com/revivalstack/chatgpt-exporter)、[Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)、[Mozilla Readability](https://github.com/mozilla/readability)、[Turndown](https://github.com/mixmark-io/turndown)
- License：MIT（详见 `LICENSE`）
- 作者：Zendio 团队 · 欢迎通过 Issue / PR / Discussions 与我们交流

---

让知识管理更简单，让思考更专注。🧠✨
