# 测试 Gemini 图片捕捉功能

## 已实施的改进

### 1. 增强的图片处理逻辑

修改了 `parse.ts` 中的图片处理代码，现在支持：

- ✅ 标准的 `<img>` 标签
- ✅ 带有 `data-src`、`data-original-src`、`data-image-url` 等属性的图片
- ✅ 自动跳过 Blob URLs（临时链接）
- ✅ 支持 Gemini 的自定义图片元素（`<image-query>`, `<uploaded-image>` 等）
- ✅ 添加了详细的调试日志

### 2. 调试日志

代码现在会在浏览器控制台输出以下信息：

```
[Gemini] Found X img elements in total
[Gemini] Image 1: src="...", data-src="...", alt="..."
[Gemini] Found X custom image elements
[Gemini] Custom image 1: tagName="...", classes="..."
[Image] Skipping image with blob or empty URL (如果遇到无效图片)
```

## 测试步骤

### 步骤 1：准备测试环境

1. 确保已编译最新代码：

   ```bash
   cd AiiinOB/your-extension
   npm run build
   ```

2. 在浏览器中加载/重新加载扩展

### 步骤 2：在 Gemini 中测试

1. 打开 [Gemini](https://gemini.google.com/)
2. 上传一张图片到聊天中
3. 等待 Gemini 回复
4. 打开浏览器开发者工具（F12）
5. 切换到 Console 标签
6. 点击扩展图标进行剪藏

### 步骤 3：查看调试信息

在控制台中查找以下信息：

#### 3.1 图片元素统计

```
[Gemini] Found 5 img elements in total
```

- 如果数量为 0，说明 Gemini 没有使用 `<img>` 标签
- 如果数量 > 0，继续查看详细信息

#### 3.2 图片详细信息

```
[Gemini] Image 1: src="https://...", data-src="", alt="Uploaded image"
[Gemini] Image 2: src="blob:https://gemini.google.com/xxx", data-src="", alt=""
```

**关键信息**：

- ✅ 如果 `src` 是 `https://` 开头的完整 URL → 可以捕捉
- ❌ 如果 `src` 是 `blob:` 开头 → 无法捕捉（临时链接）
- ⚠️ 如果 `data-src` 有值 → 可能是延迟加载的图片

#### 3.3 自定义元素信息

```
[Gemini] Found 2 custom image elements
[Gemini] Custom image 1: tagName="IMAGE-QUERY", classes="uploaded-image"
```

### 步骤 4：检查生成的 Markdown

1. 查看剪藏后生成的 Markdown 文件
2. 搜索 `![` 来查找图片标记
3. 检查图片链接是否有效

**预期结果**：

```markdown
![Uploaded image](https://lh3.googleusercontent.com/...)
```

**问题情况**：

```markdown
# 没有图片标记，或者

![](blob:https://gemini.google.com/xxx) # 无效的 blob URL
```

## 常见问题排查

### 问题 1：没有找到任何图片元素

**可能原因**：

- Gemini 使用了 Shadow DOM
- 图片在 iframe 中
- 图片是通过 Canvas 渲染的

**排查方法**：

1. 在 Gemini 页面右键点击图片 → "检查元素"
2. 查看图片的实际 DOM 结构
3. 记录元素的标签名、类名、属性

**示例**：

```html
<!-- 如果看到这样的结构 -->
<div class="image-wrapper">
  <img src="https://..." alt="..." />
</div>

<!-- 或者这样 -->
<image-query>
  #shadow-root
  <img src="https://..." />
</image-query>
```

### 问题 2：找到了图片但都是 Blob URLs

**原因**：Gemini 可能只在客户端使用临时的 Blob URL，没有上传到服务器

**可能的解决方案**：

1. 等待图片完全加载后再剪藏
2. 检查是否有其他属性存储了永久链接
3. 可能需要通过 Gemini API 获取图片

**需要手动检查**：

```javascript
// 在控制台运行
const img = document.querySelector('img[src^="blob:"]');
console.log('All attributes:', img.attributes);
for (let attr of img.attributes) {
  console.log(`${attr.name}: ${attr.value}`);
}
```

### 问题 3：图片在 Shadow DOM 中

**识别方法**：
在开发者工具中看到 `#shadow-root` 标记

**解决方案**：
需要修改代码来访问 Shadow DOM：

```typescript
// 在 extractGeminiChatData 中添加
const shadowHosts = doc.querySelectorAll('*');
shadowHosts.forEach((host) => {
  if (host.shadowRoot) {
    const shadowImages = host.shadowRoot.querySelectorAll('img');
    console.log(`[Gemini] Found ${shadowImages.length} images in shadow DOM`);
  }
});
```

## 收集诊断信息

如果问题仍然存在，请收集以下信息：

### 1. 控制台日志

复制所有 `[Gemini]` 和 `[Image]` 开头的日志

### 2. DOM 结构

在 Gemini 页面中：

1. 右键点击上传的图片 → "检查元素"
2. 在开发者工具中右键点击图片元素 → "Copy" → "Copy outerHTML"
3. 保存到文本文件

### 3. 网络请求

1. 打开开发者工具 → Network 标签
2. 上传图片
3. 查找图片相关的请求
4. 记录请求 URL 和响应

### 4. 生成的 Markdown

复制剪藏后生成的 Markdown 内容

## 对比测试：ChatGPT vs Gemini

### ChatGPT 的图片处理（参考）

在 ChatGPT 中上传图片后：

```html
<img src="https://files.oaiusercontent.com/file-xxx/image.png" alt="Uploaded image" />
```

- ✅ 使用标准 `<img>` 标签
- ✅ `src` 是永久的 HTTPS URL
- ✅ 可以直接捕捉

### Gemini 的图片处理（待确认）

需要实际测试来确认 Gemini 的具体实现方式。

## 下一步计划

根据测试结果，可能需要：

1. **如果图片在 Shadow DOM 中**
   - 添加 Shadow DOM 访问代码
2. **如果只有 Blob URLs**
   - 研究是否可以通过 Gemini API 获取永久链接
   - 或者考虑将图片转换为 Base64 嵌入
3. **如果使用了特殊的自定义元素**
   - 添加对应的选择器和处理逻辑

## 临时解决方案

如果 Gemini 确实无法提供永久图片链接，可以考虑：

1. **手动下载图片**
   - 右键保存图片
   - 上传到图床
   - 手动添加到 Markdown

2. **使用截图**
   - 使用浏览器截图功能
   - 保存为本地文件

3. **Base64 嵌入**（不推荐，会使文件很大）
   - 将图片转换为 Base64
   - 直接嵌入到 Markdown 中

## 反馈

测试完成后，请提供：

1. 控制台日志截图
2. DOM 结构信息
3. 是否成功捕捉到图片
4. 图片 URL 的格式

这将帮助我们进一步改进代码。
