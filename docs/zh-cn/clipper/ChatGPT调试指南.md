# ChatGPT 剪藏调试指南

## 🔍 如何检查问题

如果您仍然看到 "您说"、"ChatGPT 说：" 或 "ASSISTANT"，请按照以下步骤调试：

---

## 步骤 1：确认扩展已更新

### 1.1 重新加载扩展

```
1. 打开 chrome://extensions/
2. 找到 "All in Ob"
3. 点击刷新按钮 🔄
4. 确认扩展已重新加载
```

### 1.2 检查构建时间

```
1. 在扩展目录运行：ls -la dist/
2. 确认文件的修改时间是最新的
3. 如果不是，重新运行：npm run build
```

---

## 步骤 2：检查 ChatGPT 页面结构

### 2.1 打开开发者工具

```
1. 在 ChatGPT 页面按 F12
2. 切换到 Console 标签
```

### 2.2 检查消息结构

在 Console 中运行以下代码：

```javascript
// 检查文章元素
const articles = document.querySelectorAll('article');
console.log('找到的文章数量:', articles.length);

// 检查每个文章的 header
articles.forEach((article, i) => {
  const header = article.querySelector('h5');
  console.log(`文章 ${i+1} header:`, header?.textContent);
  console.log(`文章 ${i+1} HTML:`, article.innerHTML.substring(0, 200));
});
```

### 2.3 检查模型名称

```javascript
// 检查按钮中的模型名称
const buttons = document.querySelectorAll('button, [role="button"]');
buttons.forEach(btn => {
  const text = btn.textContent?.trim();
  if (text && text.match(/GPT|o1|ChatGPT/i)) {
    console.log('找到可能的模型按钮:', text);
  }
});

// 检查页面中的模型信息
const bodyText = document.body.textContent;
const modelMatch = bodyText.match(/(?:Model|模型)[:\s]*(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?)/i);
console.log('页面中的模型信息:', modelMatch);
```

---

## 步骤 3：手动测试解析

### 3.1 在 Console 中测试

```javascript
// 获取第一个消息的内容
const firstArticle = document.querySelector('article');
if (firstArticle) {
  const header = firstArticle.querySelector('h5')?.textContent;
  const html = firstArticle.innerHTML;
  
  console.log('Header:', header);
  console.log('HTML 前 500 字符:', html.substring(0, 500));
  
  // 检查是否包含 "您说" 或 "You said"
  console.log('包含 "您说":', html.includes('您说'));
  console.log('包含 "You said":', html.toLowerCase().includes('you said'));
  console.log('包含 "ChatGPT 说":', html.includes('ChatGPT 说'));
  console.log('包含 "ChatGPT said":', html.toLowerCase().includes('chatgpt said'));
}
```

---

## 步骤 4：检查剪藏结果

### 4.1 剪藏一个对话

```
1. 在 ChatGPT 页面右键
2. 选择 "剪藏到 Obsidian"
3. 等待通知
```

### 4.2 检查生成的文件

在 Obsidian 中打开生成的文件，检查：

```markdown
---
type: ai_chat
platform: chatgpt
model: ???  # 这里应该是 GPT-4 等，而不是空的
---

# 1 USER  # 应该是这个格式，不是 # USER 1
> 你好  # 不应该有 "您说："

# 2 GPT-4  # 应该是模型名称，不是 ASSISTANT
你好！  # 不应该有 "ChatGPT 说："
```

---

## 步骤 5：常见问题排查

### 问题 1：仍然显示 "ASSISTANT"

**可能原因**：
- 模型名称提取失败
- ChatGPT 页面结构变化

**解决方案**：

1. 在 Console 中运行：
```javascript
// 查找所有可能包含模型名称的元素
const allText = [];
document.querySelectorAll('*').forEach(el => {
  const text = el.textContent?.trim();
  if (text && text.length < 50 && text.match(/GPT|o1/i)) {
    allText.push({
      tag: el.tagName,
      class: el.className,
      text: text
    });
  }
});
console.table(allText);
```

2. 找到包含模型名称的元素后，告诉我：
   - 元素的标签名
   - 元素的 class
   - 元素的文本内容

### 问题 2：仍然有 "您说："、"ChatGPT 说："

**可能原因**：
- 这些文本在 HTML 结构中的位置不同
- 正则表达式没有匹配到

**解决方案**：

1. 在 Console 中运行：
```javascript
const firstArticle = document.querySelector('article');
const html = firstArticle.innerHTML;

// 查找 "您说" 的位置
const index1 = html.indexOf('您说');
const index2 = html.indexOf('You said');
const index3 = html.indexOf('ChatGPT 说');
const index4 = html.indexOf('ChatGPT said');

console.log('您说 位置:', index1, index1 > 0 ? html.substring(index1-50, index1+50) : '未找到');
console.log('You said 位置:', index2, index2 > 0 ? html.substring(index2-50, index2+50) : '未找到');
console.log('ChatGPT 说 位置:', index3, index3 > 0 ? html.substring(index3-50, index3+50) : '未找到');
console.log('ChatGPT said 位置:', index4, index4 > 0 ? html.substring(index4-50, index4+50) : '未找到');
```

2. 将输出结果告诉我，我可以调整正则表达式

### 问题 3：用户消息显示为 ASSISTANT

**可能原因**：
- header 文本不包含 "you said"
- ChatGPT 更新了 UI

**解决方案**：

1. 在 Console 中运行：
```javascript
const articles = document.querySelectorAll('article');
articles.forEach((article, i) => {
  const header = article.querySelector('h5');
  const headerText = header?.textContent?.toLowerCase() || '';
  console.log(`消息 ${i+1}:`, {
    header: headerText,
    isUser: headerText.includes('you said') || headerText.includes('您说')
  });
});
```

2. 如果 header 文本不是 "you said" 或 "您说"，告诉我实际的文本

---

## 步骤 6：提供调试信息

如果以上步骤都无法解决问题，请提供以下信息：

### 6.1 页面信息

```javascript
// 在 ChatGPT 页面的 Console 中运行
console.log('页面 URL:', window.location.href);
console.log('页面标题:', document.title);
console.log('文章数量:', document.querySelectorAll('article').length);

// 第一个消息的详细信息
const first = document.querySelector('article');
if (first) {
  console.log('第一个消息 header:', first.querySelector('h5')?.textContent);
  console.log('第一个消息 HTML (前 1000 字符):', first.innerHTML.substring(0, 1000));
}
```

### 6.2 剪藏结果

将生成的 Markdown 文件内容复制给我，特别是：
- frontmatter 中的 `model` 字段
- 消息标题（`# 1 USER` 还是 `# USER 1`）
- 是否有 "您说："、"ChatGPT 说："

### 6.3 浏览器信息

```
- 浏览器：Chrome / Edge / 其他
- 版本：
- ChatGPT 语言：中文 / 英文
```

---

## 🔧 临时解决方案

如果问题紧急，您可以手动编辑生成的文件：

### 使用查找替换

在 Obsidian 中：

1. **删除 "您说："**
   - 查找：`您说：`
   - 替换：（空）

2. **删除 "ChatGPT 说："**
   - 查找：`ChatGPT 说：`
   - 替换：（空）

3. **替换 ASSISTANT**
   - 查找：`# ASSISTANT`
   - 替换：`# GPT-4`（或您使用的模型）

4. **调整序号位置**
   - 查找：`# USER (\d+)`
   - 替换：`# $1 USER`
   - 查找：`# GPT-4 (\d+)`
   - 替换：`# $1 GPT-4`

---

## 📝 反馈模板

如果需要报告问题，请使用以下模板：

```
### 问题描述
[描述您看到的问题]

### 重现步骤
1. 打开 ChatGPT
2. [具体步骤]
3. 右键剪藏

### 预期结果
[应该看到什么]

### 实际结果
[实际看到什么]

### 调试信息
[粘贴上面步骤 6 中的信息]

### 截图
[如果可能，提供截图]
```

---

## ✅ 验证修复

修复后，请验证：

- [ ] 模型名称正确显示（不是 ASSISTANT）
- [ ] 没有 "您说："、"ChatGPT 说："
- [ ] 用户消息显示为 USER
- [ ] 序号在最前面（`# 1 USER`）
- [ ] 所有消息格式统一

---

**需要帮助？** 请提供上面的调试信息！

