# 中国AI平台支持说明

## 概述

已成功添加对三个主流中国AI平台的支持：
- **通义千问** (Tongyi Qianwen)
- **DeepSeek**
- **Kimi** (月之暗面)

现在插件可以识别并导出这些平台的对话内容到 Obsidian。

## 支持的所有平台

### 国际平台
1. **ChatGPT** - `chatgpt.com`, `chat.openai.com`
2. **Claude** - `claude.ai`
3. **Gemini** - `gemini.google.com`
4. **Copilot** - `copilot.microsoft.com`

### 中国平台 ✨ 新增
5. **通义千问** - `tongyi.aliyun.com`
6. **DeepSeek** - `chat.deepseek.com`
7. **Kimi** - `kimi.moonshot.cn`

## 实现细节

### 1. 平台检测

在 `src/content/adapters/chat.ts` 中添加了URL检测逻辑：

```typescript
function detectPlatform(url: string): string {
  if (/chatgpt/.test(url)) return 'chatgpt';
  if (/claude/.test(url))  return 'claude';
  if (/gemini/.test(url))  return 'gemini';
  if (/copilot/.test(url)) return 'copilot';
  if (/tongyi/.test(url)) return 'tongyi';        // 通义千问
  if (/deepseek/.test(url)) return 'deepseek';    // DeepSeek
  if (/kimi|moonshot/.test(url)) return 'kimi';   // Kimi
  if (/perplexity/.test(url)) return 'perplexity';
  return 'chat';
}
```

### 2. DOM 解析策略

每个平台都实现了专门的解析函数：

#### 通义千问 (extractTongyiChatData)
- **选择器策略**：支持多种可能的消息容器选择器
- **角色识别**：通过 data-role、data-type 属性和 CSS 类名识别
- **模型识别**：匹配 "通义千问"、"Qwen"、"qwen-max"、"qwen-plus"、"qwen-turbo"
- **标题处理**：移除 " - 通义"、" - 通义千问" 后缀

#### DeepSeek (extractDeepSeekChatData)
- **选择器策略**：包括 article 标签在内的多种选择器
- **角色识别**：支持多种属性和类名模式
- **模型识别**：匹配 "DeepSeek"、"deepseek-chat"、"deepseek-coder"
- **标题处理**：移除 " - DeepSeek"、" - DeepSeek Chat" 后缀

#### Kimi (extractKimiChatData)
- **选择器策略**：与 DeepSeek 类似的多选择器策略
- **角色识别**：特别支持 "kimi" 类名识别
- **模型识别**：匹配 "Kimi"、"moonshot"、"kimi-k2"、"kimi-k1"
- **标题处理**：移除 " - Kimi"、" - Kimi Chat" 后缀

### 3. 通用选择器模式

所有中国平台都使用了相似的选择器策略，以应对页面结构变化：

```typescript
const possibleSelectors = [
  '[class*="message-item"]',
  '[class*="messageItem"]',
  '[class*="chat-message"]',
  '[class*="chatMessage"]',
  '[class*="Message"]',
  '[data-role="user"], [data-role="assistant"]',
  '[data-type="user"], [data-type="assistant"]',
  'article',
];
```

### 4. 角色识别逻辑

多层次的角色识别机制：

1. **属性检查**：data-role、data-type
2. **类名检查**：user、User、assistant、Assistant、bot、Bot
3. **子元素检查**：查找特定的用户/助手指示器
4. **默认值**：如果无法确定，默认为 assistant

## 使用方法

### 通义千问
1. 访问 https://tongyi.aliyun.com
2. 登录并进行对话
3. 点击浏览器扩展图标
4. 选择"剪藏到 Obsidian"

### DeepSeek
1. 访问 https://chat.deepseek.com
2. 登录并进行对话
3. 点击浏览器扩展图标
4. 选择"剪藏到 Obsidian"

### Kimi
1. 访问 https://kimi.moonshot.cn
2. 登录并进行对话
3. 点击浏览器扩展图标
4. 选择"剪藏到 Obsidian"

## 导出格式

导出的 Markdown 文件包含：

```markdown
---
title: 对话标题
platform: tongyi/deepseek/kimi
model: 模型名称（如果可用）
url: 原始对话URL
messageCount: 消息数量
clippedAt: 导出时间
---

# 对话标题

## USER
用户的问题...

## ASSISTANT
AI的回答...
```

## 测试建议

### 基本功能测试
1. **简单对话**：测试基本的问答导出
2. **长对话**：测试多轮对话的完整导出
3. **标题提取**：验证对话标题是否正确

### 内容格式测试
1. **代码块**：包含代码的对话
2. **列表**：有序和无序列表
3. **表格**：复杂表格结构
4. **链接和图片**：富文本内容
5. **数学公式**：LaTeX 公式（如果支持）

### 模型识别测试
- **通义千问**：qwen-max, qwen-plus, qwen-turbo
- **DeepSeek**：deepseek-chat, deepseek-coder
- **Kimi**：kimi-k2, kimi-k1

## 注意事项

### 1. 登录状态
所有平台都需要登录才能访问完整的对话历史。请确保：
- 已登录相应平台
- 会话未过期
- 有权限访问对话内容

### 2. 页面加载
某些平台使用动态加载：
- 等待页面完全加载后再导出
- 如果对话很长，可能需要滚动到底部加载所有内容
- 确保所有消息都已显示

### 3. 页面结构变化
AI平台经常更新UI，如果导出失败：
1. 检查浏览器控制台的错误信息
2. 查看页面的实际DOM结构
3. 可能需要更新选择器

### 4. 特殊内容
某些特殊内容可能需要特别处理：
- 思考过程（如果平台支持）
- 附件和文件
- 交互式组件
- 实时搜索结果

## 故障排查

### 问题：无法识别平台
**解决方案**：
- 检查URL是否正确
- 确认在支持的域名下
- 查看控制台是否有错误

### 问题：消息角色识别错误
**解决方案**：
- 检查页面的实际DOM结构
- 更新选择器以匹配新的类名或属性
- 在 parse.ts 中调整角色识别逻辑

### 问题：内容格式混乱
**解决方案**：
- 检查 HTML 到 Markdown 的转换
- 查看是否有特殊的HTML结构
- 可能需要在 chatHtmlToMarkdown 函数中添加特殊处理

### 问题：模型信息缺失
**解决方案**：
- 检查页面上是否显示模型信息
- 更新模型识别的正则表达式
- 添加更多的查找位置

## 后续优化方向

### 1. 更精确的选择器
在实际使用中收集真实的DOM结构，优化选择器以提高准确性和性能。

### 2. 思考过程提取
如果平台支持显示AI的思考过程（类似Claude），可以添加提取支持。

### 3. 附件支持
- 图片下载和本地保存
- 文件附件处理
- 代码文件导出

### 4. 批量导出
支持一次性导出多个对话。

### 5. 增量更新
支持更新已导出的对话，只添加新的消息。

### 6. 更多平台
可以考虑添加的其他中国AI平台：
- **文心一言** - yiyan.baidu.com
- **智谱清言** - chatglm.cn
- **讯飞星火** - xinghuo.xfyun.cn
- **腾讯混元** - hunyuan.tencent.com

## 技术架构

### 文件结构
```
src/
├── content/
│   └── adapters/
│       └── chat.ts              # 平台检测
└── third_party/
    └── ai-chat-exporter/
        └── parse.ts             # DOM解析和内容提取
```

### 添加新平台的步骤

1. **在 chat.ts 中添加URL检测**
```typescript
if (/newplatform/.test(url)) return 'newplatform';
```

2. **在 parse.ts 中添加常量**
```typescript
const NEWPLATFORM = "newplatform";
const NEWPLATFORM_MESSAGE_SELECTOR = '...';
```

3. **在 parseChatDOM 中添加 case**
```typescript
case 'newplatform':
  return extractNewPlatformChatData(doc);
```

4. **实现提取函数**
```typescript
function extractNewPlatformChatData(doc: Document): ParsedResult {
  // 实现逻辑
}
```

## 相关文件

- `src/content/adapters/chat.ts` - 平台检测
- `src/third_party/ai-chat-exporter/parse.ts` - DOM解析
- `src/content/formatters/markdown.ts` - Markdown格式化
- `通义千问支持说明.md` - 通义千问详细说明

## 贡献指南

如果你想改进对这些平台的支持或添加新平台：

1. Fork 项目
2. 创建特性分支
3. 测试你的更改
4. 提交 Pull Request

请确保：
- 代码风格一致
- 添加适当的注释
- 更新相关文档
- 测试所有功能

## 许可证

本项目遵循 MIT 许可证。

