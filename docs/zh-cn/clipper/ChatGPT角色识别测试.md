# ChatGPT 角色识别测试指南

## 🎯 测试目标

确保：
1. ✅ 用户消息显示为 `# 1 USER`
2. ✅ AI 回复显示为 `# 2 GPT-4`（或其他模型名称）
3. ✅ 用户消息有 `>` 引用格式
4. ✅ AI 回复没有 `>` 引用格式

---

## 🔍 调试步骤

### 步骤 1：检查 ChatGPT 页面结构

在 ChatGPT 页面打开 Console (F12)，运行：

```javascript
// 检查所有消息的 header
const articles = document.querySelectorAll('article');
console.log('=== 消息结构分析 ===');
articles.forEach((article, i) => {
  const header = article.querySelector('h5');
  const headerText = header?.textContent?.trim() || '';
  
  console.log(`\n消息 ${i+1}:`);
  console.log('  Header 文本:', headerText);
  console.log('  Header 小写:', headerText.toLowerCase());
  console.log('  包含 "you":', headerText.toLowerCase().includes('you'));
  console.log('  包含 "您":', headerText.includes('您'));
  console.log('  Article classes:', article.className);
  console.log('  data-message-author-role:', article.getAttribute('data-message-author-role'));
  
  // 检查子元素
  const userRole = article.querySelector('[data-message-author-role="user"]');
  console.log('  有 user role 子元素:', userRole !== null);
});
```

### 步骤 2：分析输出

根据输出判断：

#### 情况 A：Header 包含 "You" 或 "您"
```
消息 1:
  Header 文本: You
  包含 "you": true
  → 应该识别为 USER ✅
```

#### 情况 B：Header 包含其他文本
```
消息 1:
  Header 文本: 用户
  包含 "you": false
  包含 "您": false
  → 可能识别错误 ❌
```

#### 情况 C：使用 data 属性
```
消息 1:
  data-message-author-role: user
  → 应该识别为 USER ✅
```

---

## 🔧 根据情况修复

### 如果 Header 文本不是 "You" 或 "您"

请告诉我实际的 header 文本，例如：
- 中文："用户"、"我"、"提问"
- 英文："User"、"Me"、"Question"

我会添加这些关键词到识别逻辑中。

### 如果使用了不同的 DOM 结构

请提供：
1. Article 的 class 名称
2. 是否有 `data-message-author-role` 属性
3. 是否有其他可以区分用户/AI 的属性

---

## 📄 预期的正确格式

### 用户消息
```markdown
# 1 USER

> 你好，请帮我解释一下 React Hooks

> 我想了解 useState 的用法
```

**特点**：
- 标题：`# 1 USER`（序号在前，角色是 USER）
- 内容：每行都有 `>` 引用符号
- 多行文本：每行都单独加 `>`

### AI 回复
```markdown
# 2 GPT-4

当然！React Hooks 是 React 16.8 引入的新特性。

useState 是最常用的 Hook 之一，用法如下：

```javascript
const [count, setCount] = useState(0);
```

这样就创建了一个状态变量。
```

**特点**：
- 标题：`# 2 GPT-4`（序号在前，显示模型名称）
- 内容：直接显示，没有 `>` 引用符号
- 代码块：正常显示，不加 `>`

---

## 🧪 完整测试用例

### 测试用例 1：简单对话

**ChatGPT 对话**：
```
用户: 你好
AI: 你好！有什么我可以帮助你的吗？
用户: 介绍一下 Python
AI: Python 是一种高级编程语言...
```

**预期输出**：
```markdown
---
type: ai_chat
platform: chatgpt
model: GPT-4
url: "https://chat.openai.com/c/..."
message_count: 4
clipped_at: "2025-10-02T14:23:45"
tags: [ai, chat, chatgpt]
---

# 1 USER

> 你好

# 2 GPT-4

你好！有什么我可以帮助你的吗？

# 3 USER

> 介绍一下 Python

# 4 GPT-4

Python 是一种高级编程语言...
```

### 测试用例 2：多行用户输入

**ChatGPT 对话**：
```
用户: 
我有几个问题：
1. React 是什么？
2. 如何学习 React？
3. 有什么推荐的资源？

AI: 让我逐一回答...
```

**预期输出**：
```markdown
# 1 USER

> 我有几个问题：
> 1. React 是什么？
> 2. 如何学习 React？
> 3. 有什么推荐的资源？

# 2 GPT-4

让我逐一回答...
```

### 测试用例 3：包含代码的对话

**ChatGPT 对话**：
```
用户: 这段代码有什么问题？
const x = 1;

AI: 这段代码没有问题，但是...
```

**预期输出**：
```markdown
# 1 USER

> 这段代码有什么问题？
> const x = 1;

# 2 GPT-4

这段代码没有问题，但是...
```

---

## ✅ 验证清单

剪藏后，检查生成的文件：

### Frontmatter 检查
- [ ] `type: ai_chat`
- [ ] `platform: chatgpt`
- [ ] `model: GPT-4`（或其他模型，不是空的）
- [ ] `message_count` 正确

### 消息格式检查
- [ ] 用户消息标题：`# 1 USER`、`# 3 USER`（奇数）
- [ ] AI 消息标题：`# 2 GPT-4`、`# 4 GPT-4`（偶数）
- [ ] 序号连续递增：1, 2, 3, 4...
- [ ] 序号在最前面（不是 `# USER 1`）

### 内容格式检查
- [ ] 用户消息：每行都有 `>` 开头
- [ ] AI 消息：没有 `>` 开头
- [ ] 用户消息：多行文本每行都单独加 `>`
- [ ] AI 消息：代码块、列表等格式正常

### 清理检查
- [ ] 没有 "您说："
- [ ] 没有 "ChatGPT 说："
- [ ] 没有 "You said:"
- [ ] 没有 "ChatGPT said:"

---

## 🐛 常见问题

### 问题 1：所有消息都显示为同一个角色

**症状**：
```markdown
# 1 GPT-4
> 你好

# 2 GPT-4
你好！
```

**原因**：角色识别失败，所有消息都被识别为 assistant

**解决**：运行步骤 1 的调试代码，提供 header 文本

### 问题 2：用户消息没有 `>` 引用

**症状**：
```markdown
# 1 USER
你好
```

**原因**：这是代码逻辑问题

**检查**：查看 `src/content/formatters/markdown.ts` 第 30-32 行

### 问题 3：序号位置错误

**症状**：
```markdown
# USER 1
# GPT-4 2
```

**原因**：使用了旧版本的代码

**解决**：确认已重新构建并重新加载扩展

---

## 📊 对比表格

| 项目 | 错误示例 | 正确示例 |
|------|---------|---------|
| **用户标题** | `# USER 1` | `# 1 USER` |
| **AI 标题** | `# ASSISTANT 2` | `# 2 GPT-4` |
| **用户内容** | `你好` | `> 你好` |
| **AI 内容** | `> 你好！` | `你好！` |
| **多行用户** | `> 第一行\n第二行` | `> 第一行\n> 第二行` |

---

## 🔄 重新测试流程

1. **重新加载扩展**
   ```
   chrome://extensions/ → 刷新
   ```

2. **打开 ChatGPT**
   ```
   https://chat.openai.com/
   ```

3. **创建测试对话**
   ```
   用户: 你好
   AI: 你好！
   用户: 测试多行
   这是第二行
   AI: 收到
   ```

4. **剪藏对话**
   ```
   右键 → 剪藏到 Obsidian
   ```

5. **检查结果**
   ```
   在 Obsidian 中打开文件
   对照上面的验证清单检查
   ```

---

## 📝 反馈模板

如果仍有问题，请提供：

```
### 调试输出
[粘贴步骤 1 的 Console 输出]

### 生成的文件内容
[粘贴 Obsidian 中的文件内容]

### 问题描述
[描述具体的问题]

### 截图
[如果可能，提供 ChatGPT 页面和生成文件的截图]
```

---

**需要帮助？** 请运行调试代码并提供输出！

