# ChatGPT 剪藏优化说明

## 🎯 修复的问题

### 1. ✅ 显示模型名称而不是 "ASSISTANT"

**问题**：

- 之前 ChatGPT 对话剪藏时，AI 回复显示为 "ASSISTANT"
- 没有提取实际的模型名称（如 GPT-4、GPT-4o、o1 等）

**解决方案**：

- 从页面中提取模型名称
- 支持的模型格式：
  - `GPT-4`
  - `GPT-4o`
  - `GPT-3.5`
  - `o1`
  - `o1-mini`
  - `o1-preview`
  - 等等

**效果**：

```markdown
# 1 USER

> 你好

# 2 GPT-4

你好！有什么我可以帮助你的吗？
```

---

### 2. ✅ 删除 "您说："、"ChatGPT 说：" 等前缀

**问题**：

- 消息内容开头有 "您说："、"ChatGPT 说："
- 英文版本有 "You said:"、"ChatGPT said:"
- 这些前缀是冗余的，因为已经有标题了

**解决方案**：

- 自动删除这些前缀
- 支持中英文版本
- 使用正则表达式匹配和清理

**优化前**：

```markdown
# 1 USER

> 您说：
> 你好

# 2 GPT-4

ChatGPT 说：
你好！有什么我可以帮助你的吗？
```

**优化后**：

```markdown
# 1 USER

> 你好

# 2 GPT-4

你好！有什么我可以帮助你的吗？
```

---

### 3. ✅ 用户输入正确显示为 USER

**问题**：

- 用户输入有时也显示为 ASSISTANT
- 角色识别不准确

**解决方案**：

- 改进角色识别逻辑
- 通过 header 文本判断是否为用户消息
- 匹配 "you said" 关键词（不区分大小写）

**效果**：

- 用户消息：`# 1 USER`
- AI 回复：`# 2 GPT-4`

---

### 4. ✅ 序号放在最前面

**问题**：

- 之前格式：`# USER 1`、`# GPT-4 2`
- 当模型名称以数字结尾时（如 GPT-5），会造成混淆：`# GPT-5 2`

**解决方案**：

- 将序号放在最前面
- 新格式：`# 1 USER`、`# 2 GPT-4`

**优势**：

- ✅ 避免与模型名称中的数字混淆
- ✅ 更清晰的层次结构
- ✅ 易于快速定位消息序号
- ✅ 统一所有平台的格式

**对比**：

| 旧格式                 | 新格式                 | 说明     |
| ---------------------- | ---------------------- | -------- |
| `# USER 1`             | `# 1 USER`             | 用户消息 |
| `# GPT-4 2`            | `# 2 GPT-4`            | AI 回复  |
| `# GPT-5 3`            | `# 3 GPT-5`            | 避免混淆 |
| `# Gemini 2.0 Flash 4` | `# 4 Gemini 2.0 Flash` | 清晰明了 |

---

## 📄 完整示例

### ChatGPT 对话剪藏

**文件名**：

```
2025-10-02_如何学习 React.md
```

**文件内容**：

```markdown
---
type: ai_chat
platform: chatgpt
model: GPT-4
url: 'https://chat.openai.com/c/...'
message_count: 4
clipped_at: '2025-10-02T14:23:45'
tags: [ai, chat, chatgpt]
---

# 1 USER

> 如何学习 React？

# 2 GPT-4

学习 React 可以按照以下步骤进行：

1. **掌握 JavaScript 基础**
   - ES6+ 语法
   - 箭头函数
   - 解构赋值
   - Promise 和 async/await

2. **学习 React 核心概念**
   - 组件
   - Props 和 State
   - 生命周期
   - Hooks

3. **实践项目**
   - 从简单的 Todo App 开始
   - 逐步增加复杂度

# 3 USER

> Hooks 有哪些常用的？

# 4 GPT-4

React 中常用的 Hooks 包括：

1. **useState** - 管理组件状态
2. **useEffect** - 处理副作用
3. **useContext** - 访问 Context
4. **useReducer** - 复杂状态管理
5. **useCallback** - 缓存函数
6. **useMemo** - 缓存计算结果
7. **useRef** - 访问 DOM 或保存可变值

每个 Hook 都有特定的使用场景。
```

---

## 🔧 技术实现

### 1. 模型名称提取

```typescript
// Extract model name from the page
let model = '';
const modelButtons = doc.querySelectorAll('button');
for (const btn of modelButtons) {
  const text = btn.textContent?.trim() || '';
  // Match patterns like "GPT-4", "GPT-4o", "GPT-3.5", "o1", "o1-mini", etc.
  if (text.match(/^(GPT-[0-9.]+[a-z]*|o1(-mini|-preview)?|ChatGPT)$/i)) {
    model = text;
    break;
  }
}

// If no model found in buttons, try to find it in the page
if (!model) {
  const bodyText = doc.body.textContent || '';
  const modelMatch = bodyText.match(
    /(?:Model|模型)[:\s]*(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?)/i
  );
  if (modelMatch) {
    model = modelMatch[1];
  }
}
```

### 2. 删除前缀

```typescript
// Remove "您说：" or "ChatGPT 说：" or "You said:" or "ChatGPT said:" from the beginning
markdown = markdown
  .replace(/^您说[：:]\s*/m, '')
  .replace(/^ChatGPT\s*说[：:]\s*/m, '')
  .replace(/^You\s+said[：:]\s*/im, '')
  .replace(/^ChatGPT\s+said[：:]\s*/im, '')
  .trim();
```

### 3. 角色识别

```typescript
const isUser = header.toLowerCase().includes(CHATGPT_USER_MESSAGE_INDICATOR);
const role = isUser ? 'user' : 'assistant';
```

### 4. 序号在前的标题格式

```typescript
const body = messages
  .map((m, i) => {
    // Put number first to avoid confusion with model names ending in numbers (e.g., GPT-5)
    let heading = '';
    if (m.role === 'user') {
      heading = `# ${i + 1} USER`;
    } else {
      const modelName = model || 'ASSISTANT';
      heading = `# ${i + 1} ${modelName}`;
    }

    const content =
      m.role === 'user'
        ? m.text
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        : m.text;
    return `${heading}\n\n${content}\n`;
  })
  .join('\n');
```

---

## 🎨 所有平台的统一格式

### ChatGPT

```markdown
# 1 USER

> 问题

# 2 GPT-4

回答
```

### Claude

```markdown
# 1 USER

> 问题

# 2 Claude Sonnet 4.5

回答
```

### Gemini

```markdown
# 1 USER

> 问题

# 2 Gemini 2.0 Flash

回答
```

### Copilot

```markdown
# 1 USER

> 问题

# 2 Copilot

回答
```

---

## 📊 优化对比

| 项目         | 优化前     | 优化后 | 改进            |
| ------------ | ---------- | ------ | --------------- |
| **模型名称** | ASSISTANT  | GPT-4  | ✅ 显示实际模型 |
| **前缀清理** | 有冗余前缀 | 无前缀 | ✅ 更简洁       |
| **角色识别** | 有时错误   | 准确   | ✅ 更可靠       |
| **序号位置** | 在后面     | 在前面 | ✅ 避免混淆     |
| **格式统一** | 不一致     | 统一   | ✅ 更规范       |

---

## 🚀 使用方法

1. **重新加载扩展**

   ```
   chrome://extensions/ → 刷新按钮
   ```

2. **打开 ChatGPT 对话**

   ```
   https://chat.openai.com/
   ```

3. **剪藏对话**

   ```
   右键 → "剪藏到 Obsidian"
   ```

4. **查看结果**
   ```
   在 Obsidian 中查看生成的文件
   检查模型名称、格式、序号等
   ```

---

## ✅ 测试检查清单

### ChatGPT 特定测试

- [ ] 模型名称正确显示（GPT-4、GPT-4o、o1 等）
- [ ] 没有 "您说："、"ChatGPT 说：" 前缀
- [ ] 没有 "You said:"、"ChatGPT said:" 前缀
- [ ] 用户消息显示为 USER
- [ ] AI 回复显示为模型名称
- [ ] 序号在最前面（`# 1 USER`、`# 2 GPT-4`）

### 通用测试

- [ ] 所有平台格式统一
- [ ] 序号连续递增
- [ ] 用户消息有引用格式（`> `）
- [ ] AI 回复无引用格式
- [ ] Markdown 格式正确
- [ ] 代码块保留
- [ ] 列表格式保留

---

## 🐛 已知限制

### 1. 模型名称提取

**限制**：

- 依赖页面 DOM 结构
- 如果 ChatGPT 更新 UI，可能需要调整选择器

**回退方案**：

- 如果无法提取模型名称，显示 "ASSISTANT"

### 2. 前缀清理

**限制**：

- 只支持常见的前缀格式
- 如果 ChatGPT 使用新的前缀格式，可能需要更新正则表达式

**支持的前缀**：

- 中文：`您说：`、`ChatGPT 说：`
- 英文：`You said:`、`ChatGPT said:`

---

## 📝 总结

这次优化主要解决了 ChatGPT 剪藏的以下问题：

1. ✅ **显示实际模型名称**（GPT-4、o1 等）
2. ✅ **删除冗余前缀**（"您说："、"ChatGPT 说："）
3. ✅ **正确识别用户角色**（USER vs ASSISTANT）
4. ✅ **序号放在最前面**（避免与模型名称混淆）

通过这些优化，ChatGPT 对话剪藏的格式更加清晰、简洁、统一！

---

**版本**：v0.2.2  
**更新日期**：2025-10-02  
**状态**：✅ 已完成

🎉 享受更好的 ChatGPT 剪藏体验！
