# Gemini 图片捕捉功能改进说明

## 问题分析

### 为什么 OpenAI 可以捕捉图片但 Gemini 不行？

#### OpenAI (ChatGPT) 的实现方式
- ✅ 使用标准的 HTML `<img>` 标签
- ✅ 图片上传到 OpenAI 服务器，返回永久 HTTPS URL
- ✅ URL 格式：`https://files.oaiusercontent.com/file-xxx/image.png`
- ✅ 可以直接通过 `img.getAttribute('src')` 获取

#### Gemini 的实现方式（推测）
- ⚠️ 可能使用自定义 Web Components
- ⚠️ 可能使用 Shadow DOM 封装图片
- ⚠️ 可能使用临时的 Blob URLs：`blob:https://gemini.google.com/xxx`
- ⚠️ 图片可能存储在 `data-src` 等非标准属性中
- ❌ 原有代码只处理标准 `<img>` 标签的 `src` 属性

## 已实施的改进

### 1. 增强图片元素处理（parse.ts 第 1294-1346 行）

#### 改进前的代码
```typescript
// Images
if (tagName === 'img') {
  const src = elem.getAttribute('src') || '';
  const alt = elem.getAttribute('alt') || '';
  return `![${alt}](${src})`;
}
```

**问题**：
- 只检查 `src` 属性
- 不处理 Blob URLs
- 不支持自定义图片元素

#### 改进后的代码
```typescript
// Images
if (tagName === 'img') {
  let src = elem.getAttribute('src') || '';
  const alt = elem.getAttribute('alt') || '';
  
  // For Gemini: Try alternative attributes if src is empty or is a blob URL
  if (!src || src.startsWith('blob:')) {
    // Try common alternative attributes
    src = elem.getAttribute('data-src') || 
          elem.getAttribute('data-original-src') ||
          elem.getAttribute('data-image-url') ||
          elem.getAttribute('data-url') || '';
    
    // If still no valid URL, skip this image
    if (!src || src.startsWith('blob:')) {
      console.log('[Image] Skipping image with blob or empty URL');
      return '';
    }
  }
  
  return `![${alt}](${src})`;
}

// Handle Gemini custom image elements
if (tagName === 'image-query' || tagName === 'uploaded-image' || 
    elem.classList.contains('uploaded-image') || 
    elem.classList.contains('image-container')) {
  // ... 处理自定义元素
}
```

**改进点**：
- ✅ 检查多个可能的属性：`data-src`, `data-original-src`, `data-image-url`, `data-url`
- ✅ 自动跳过无效的 Blob URLs
- ✅ 支持 Gemini 的自定义图片元素
- ✅ 添加调试日志

### 2. 添加详细的调试日志（parse.ts 第 694-735 行）

```typescript
// Debug: Log all images found in the document (including Shadow DOM)
const allImages = doc.querySelectorAll('img');
console.log(`[Gemini] Found ${allImages.length} img elements in light DOM`);

// 检查每个图片的详细信息
allImages.forEach((img, index) => {
  const src = img.getAttribute('src') || '';
  const dataSrc = img.getAttribute('data-src') || '';
  const alt = img.getAttribute('alt') || '';
  const isBlobUrl = src.startsWith('blob:');
  console.log(`[Gemini] Image ${index + 1}: src="${src.substring(0, 100)}" ${isBlobUrl ? '(BLOB URL - will be skipped)' : ''}, ...`);
});

// 检查 Shadow DOM 中的图片
let shadowImageCount = 0;
const allElements = doc.querySelectorAll('*');
allElements.forEach(elem => {
  if (elem.shadowRoot) {
    const shadowImages = elem.shadowRoot.querySelectorAll('img');
    // ... 记录 Shadow DOM 中的图片
  }
});

// 检查自定义图片元素
const customImageElements = doc.querySelectorAll('image-query, uploaded-image, ...');
console.log(`[Gemini] Found ${customImageElements.length} custom image elements`);
```

**调试信息包括**：
- ✅ Light DOM 中的图片数量和详情
- ✅ Shadow DOM 中的图片（如果有）
- ✅ 自定义图片元素
- ✅ Blob URL 标记
- ✅ 所有相关属性的值

## 使用方法

### 1. 重新编译扩展

```bash
cd AiiinOB/your-extension
npm run build
```

### 2. 重新加载扩展

在浏览器中：
1. 打开扩展管理页面
2. 找到 "AI2OB" 扩展
3. 点击"重新加载"按钮

### 3. 测试

1. 打开 [Gemini](https://gemini.google.com/)
2. 上传一张图片
3. 等待 Gemini 回复
4. 打开浏览器开发者工具（F12）
5. 切换到 Console 标签
6. 点击扩展图标进行剪藏
7. 查看控制台输出的调试信息

### 4. 查看结果

在控制台中查找：
```
[Gemini] Found X img elements in light DOM
[Gemini] Image 1: src="..." (BLOB URL - will be skipped)
[Gemini] Image 2: src="https://..." 
```

## 预期效果

### 场景 1：Gemini 使用永久 HTTPS URLs
如果 Gemini 将图片上传到服务器并返回永久链接：
- ✅ **应该可以成功捕捉**
- ✅ 生成的 Markdown 包含有效的图片链接

### 场景 2：Gemini 只使用 Blob URLs
如果 Gemini 只在客户端使用临时 Blob URLs：
- ❌ **无法捕捉**（Blob URLs 在页面关闭后失效）
- ⚠️ 控制台会显示 "(BLOB URL - will be skipped)"
- 💡 需要其他解决方案（见下文）

### 场景 3：图片在 Shadow DOM 中
如果图片封装在 Shadow DOM 中：
- ⚠️ **当前版本可以检测但可能无法捕捉**
- 📊 控制台会显示 Shadow DOM 中的图片信息
- 🔧 需要进一步修改代码来访问 Shadow DOM

## 如果仍然无法捕捉

### 可能的原因

1. **Gemini 只使用 Blob URLs**
   - Blob URLs 是临时的，无法持久化
   - 需要在图片上传时拦截并保存

2. **图片在 Shadow DOM 中**
   - 当前的 `innerHTML` 转换无法访问 Shadow DOM
   - 需要特殊处理

3. **图片通过 Canvas 渲染**
   - 不是真正的 `<img>` 元素
   - 需要截图或其他方式

### 进一步的解决方案

#### 方案 A：拦截图片上传（需要更多开发）
```typescript
// 在 content script 中监听网络请求
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.url.includes('upload') && details.type === 'image') {
      // 保存图片 URL
    }
  },
  { urls: ["https://gemini.google.com/*"] }
);
```

#### 方案 B：转换为 Base64（会增加文件大小）
```typescript
async function convertBlobToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
```

#### 方案 C：访问 Shadow DOM
```typescript
function extractImagesFromShadowDOM(elem: Element): string[] {
  const urls: string[] = [];
  if (elem.shadowRoot) {
    const images = elem.shadowRoot.querySelectorAll('img');
    images.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('blob:')) {
        urls.push(src);
      }
    });
  }
  return urls;
}
```

## 下一步

### 立即行动
1. ✅ 测试改进后的代码
2. ✅ 查看控制台调试信息
3. ✅ 确认 Gemini 的实际图片存储方式

### 根据测试结果
- 如果看到永久 HTTPS URLs → 应该已经解决
- 如果只有 Blob URLs → 需要实施方案 A 或 B
- 如果图片在 Shadow DOM → 需要实施方案 C

## 相关文件

- `图片捕捉问题分析.md` - 详细的问题分析
- `测试Gemini图片捕捉.md` - 完整的测试指南
- `src/third_party/ai-chat-exporter/parse.ts` - 修改的代码文件

## 技术细节

### 修改的函数
1. `nodeToMarkdown()` - 第 1294-1346 行
   - 增强了图片元素处理
   - 添加了自定义元素支持

2. `extractGeminiChatData()` - 第 694-735 行
   - 添加了详细的调试日志
   - 检查 Shadow DOM

### 新增的选择器
```typescript
// 标准图片属性
'src', 'data-src', 'data-original-src', 'data-image-url', 'data-url'

// 自定义元素
'image-query', 'uploaded-image', '.uploaded-image', '.image-container'
```

## 总结

### 已完成
- ✅ 增强了图片元素的识别和处理
- ✅ 添加了对多种属性的支持
- ✅ 自动过滤无效的 Blob URLs
- ✅ 添加了详细的调试日志
- ✅ 支持检测 Shadow DOM 中的图片

### 待确认
- ⏳ Gemini 实际使用的图片存储方式
- ⏳ 是否需要额外的处理逻辑

### 可能需要
- 🔧 如果 Gemini 只用 Blob URLs，需要实施拦截或转换方案
- 🔧 如果图片在 Shadow DOM，需要添加 Shadow DOM 访问代码

请按照 `测试Gemini图片捕捉.md` 中的步骤进行测试，并反馈结果！

