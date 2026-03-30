# Bilibili评论区Shadow DOM问题修复方案

## 🎯 问题描述

用户反馈Bilibili视频页面的评论区文本无法被正确抓取到右侧边栏，也无法被正确高亮显示。

## 📋 网页结构分析

### **页面整体结构**

```html
<div id="app">
  <div class="bili-header">...</div>
  <div class="video-container">
    <div class="left-container">
      <div class="video-info-container">
        <!-- 视频播放器 -->
        <div class="bpx-player-container">...</div>
        <!-- 视频信息 -->
        <div class="video-info-meta">...</div>
      </div>
      <!-- 评论区容器 -->
      <div class="comment-container">
        <div class="comment-header">...</div>
        <div class="comment-send">...</div>
        <div class="comment-list">
          <!-- 这里是关键的Shadow DOM评论组件 -->
        </div>
      </div>
    </div>
    <div class="right-container">...</div>
  </div>
</div>
```

## 🔍 根本原因分析

### **Shadow DOM结构复杂**

Bilibili评论区使用了多层嵌套的Shadow DOM Web Components：

#### **完整的评论区DOM结构**

```html
<div class="comment-container">
  <div class="comment-list">
    <!-- 评论线程渲染器 -->
    <bili-comment-thread-renderer>
      #shadow-root (open)
      <div class="comment-thread">
        <!-- 主评论渲染器 -->
        <bili-comment-renderer data-comment-id="123456">
          #shadow-root (open)
          <div class="comment-item">
            <div class="comment-avatar">
              <bili-avatar>
                #shadow-root (open)
                <img src="avatar.jpg" class="avatar-img" />
              </bili-avatar>
            </div>
            <div class="comment-content">
              <div class="comment-user-info">
                <span class="comment-user-name">用户名</span>
                <span class="comment-user-level">LV6</span>
              </div>
              <!-- 评论文本内容 -->
              <bili-rich-text>
                #shadow-root (open)
                <div class="rich-text-content">
                  <span class="text-node">这是评论内容</span>
                  <bili-emoji data-emoji="[doge]">
                    #shadow-root (open)
                    <img src="doge.png" alt="[doge]" />
                  </bili-emoji>
                  <span class="text-node">更多文本</span>
                </div>
              </bili-rich-text>
              <div class="comment-actions">
                <span class="comment-time">2024-10-18 12:00</span>
                <span class="comment-like">👍 123</span>
                <span class="comment-reply">回复</span>
              </div>
            </div>
          </div>
        </bili-comment-renderer>

        <!-- 回复列表 -->
        <div class="comment-replies">
          <bili-comment-reply-renderer data-reply-id="789012">
            #shadow-root (open)
            <div class="reply-item">
              <div class="reply-avatar">
                <bili-avatar>
                  #shadow-root (open)
                  <img src="reply-avatar.jpg" class="avatar-img" />
                </bili-avatar>
              </div>
              <div class="reply-content">
                <div class="reply-user-info">
                  <span class="reply-user-name">回复用户</span>
                </div>
                <bili-rich-text>
                  #shadow-root (open)
                  <div class="rich-text-content">
                    <span class="reply-target">@原评论用户</span>
                    <span class="text-node">这是回复内容</span>
                  </div>
                </bili-rich-text>
                <div class="reply-actions">
                  <span class="reply-time">2024-10-18 12:30</span>
                  <span class="reply-like">👍 45</span>
                </div>
              </div>
            </div>
          </bili-comment-reply-renderer>
        </div>
      </div>
    </bili-comment-thread-renderer>

    <!-- 更多评论线程... -->
  </div>
</div>
```

### **关键Web Components识别**

基于实际网页分析，B站评论区使用的主要Web Components包括：

#### **评论相关组件**

- `bili-comment-thread-renderer` - 评论线程渲染器（最外层）
- `bili-comment-renderer` - 主评论渲染器
- `bili-comment-reply-renderer` - 回复评论渲染器
- `bili-rich-text` - 富文本内容组件
- `bili-emoji` - 表情组件
- `bili-avatar` - 头像组件

#### **其他可能的组件**

- `bili-comment-area` - 评论区域容器
- `bili-comment-list` - 评论列表
- `bili-comment-item` - 评论项
- `bili-dynamic-content` - 动态内容
- `bili-user-info` - 用户信息组件

### **当前实现的问题**

#### 1. **选择器不完整**

```typescript
const BILIBILI_COMMENT_HOST_SELECTORS = [
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  'bili-rich-text'
] as const;
```

**缺少的关键选择器：**

- `bili-emoji` - 表情组件，包含alt文本
- `bili-avatar` - 头像组件
- `bili-user-info` - 用户信息
- 其他动态加载的组件

#### 2. **文本查找算法局限**

- `window.find()` 无法搜索Shadow DOM内容
- `traverseShadowInclusive` 可能存在遍历不完整的问题
- 没有处理表情符号的alt文本
- 没有正确处理@用户的回复引用

#### 3. **Shadow Root观察不及时**

- 评论区是动态加载的，滚动时才加载更多评论
- Shadow Root创建时没有及时观察到
- 新回复的动态插入没有被监控

#### 4. **文本内容提取不完整**

- 表情符号只显示为图片，丢失了原始文本（如[doge]）
- @用户引用的处理不正确
- 多段文本节点的合并问题

## ✅ 解决方案

### **方案1：增强Shadow DOM选择器**

#### 1.1 扩展选择器列表

```typescript
const BILIBILI_COMMENT_HOST_SELECTORS = [
  // 核心评论组件
  'bili-comment-thread-renderer', // 评论线程渲染器（最外层）
  'bili-comment-renderer', // 主评论渲染器
  'bili-comment-reply-renderer', // 回复评论渲染器
  'bili-rich-text', // 富文本内容组件

  // 内容相关组件
  'bili-emoji', // 表情组件（包含alt文本）
  'bili-avatar', // 头像组件
  'bili-user-info', // 用户信息组件

  // 可能的其他组件
  'bili-comment-area', // 评论区域容器
  'bili-comment-list', // 评论列表
  'bili-comment-item', // 评论项
  'bili-comment-content', // 评论内容
  'bili-comment-text', // 评论文本
  'bili-comment-reply-list', // 回复列表
  'bili-comment-reply-item', // 回复项
  'bili-dynamic-content', // 动态内容
  'bili-at-user', // @用户组件
  'bili-link', // 链接组件
  'bili-video-card' // 视频卡片组件
] as const;
```

#### 1.2 动态发现Shadow Host

```typescript
private discoverShadowHosts(): HTMLElement[] {
  const hosts: HTMLElement[] = [];

  // 查找所有自定义元素
  const customElements = this.doc.querySelectorAll('*');
  Array.from(customElements).forEach(element => {
    if (element.tagName.toLowerCase().startsWith('bili-') &&
        element.shadowRoot) {
      hosts.push(element as HTMLElement);
    }
  });

  return hosts;
}
```

### **方案2：改进文本查找算法**

#### 2.1 增强Shadow DOM遍历

```typescript
private findTextRangeInShadowDOM(text: string): Range | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  // 收集所有Shadow Root
  const shadowRoots = this.collectAllShadowRoots();

  // 在每个Shadow Root中搜索
  for (const root of shadowRoots) {
    const range = this.searchInShadowRoot(root, normalized);
    if (range) return range;
  }

  return null;
}

private collectAllShadowRoots(): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const visited = new Set<ShadowRoot>();

  const traverse = (node: Node) => {
    if (node instanceof Element && node.shadowRoot && !visited.has(node.shadowRoot)) {
      roots.push(node.shadowRoot);
      visited.add(node.shadowRoot);

      // 递归遍历Shadow Root内的元素
      Array.from(node.shadowRoot.querySelectorAll('*')).forEach(traverse);
    }

    // 遍历子节点
    Array.from(node.childNodes).forEach(traverse);
  };

  traverse(this.doc.documentElement);
  return roots;
}
```

#### 2.2 专门的评论文本提取

```typescript
private extractCommentText(element: Element): string[] {
  const texts: string[] = [];

  // 直接文本内容
  const textContent = element.textContent?.trim();
  if (textContent) {
    texts.push(textContent);
  }

  // 查找特定的文本容器
  const textSelectors = [
    '.comment-text',
    '.reply-content',
    '.rich-text-content',
    '[data-text]',
    '.bili-comment-text',
    '.text-node',                    // B站富文本节点
    '.reply-target',                 // 回复目标用户
    '.comment-user-name',            // 用户名
    '.reply-user-name'               // 回复用户名
  ];

  textSelectors.forEach(selector => {
    const textElements = element.querySelectorAll(selector);
    Array.from(textElements).forEach(el => {
      const text = el.textContent?.trim();
      if (text && !texts.includes(text)) {
        texts.push(text);
      }
    });
  });

  return texts;
}

// 专门处理B站评论的文本提取
private extractBilibiliCommentText(shadowRoot: ShadowRoot): string[] {
  const texts: string[] = [];

  // 提取富文本内容
  const richTextElements = shadowRoot.querySelectorAll('.rich-text-content');
  richTextElements.forEach(richText => {
    // 提取文本节点
    const textNodes = richText.querySelectorAll('.text-node');
    textNodes.forEach(node => {
      const text = node.textContent?.trim();
      if (text) texts.push(text);
    });

    // 提取表情符号的alt文本
    const emojiElements = richText.querySelectorAll('bili-emoji');
    emojiElements.forEach(emoji => {
      const altText = emoji.getAttribute('data-emoji') ||
                     emoji.getAttribute('alt') ||
                     emoji.querySelector('img')?.getAttribute('alt');
      if (altText) texts.push(altText);
    });

    // 提取@用户引用
    const atUsers = richText.querySelectorAll('.reply-target, .at-user');
    atUsers.forEach(at => {
      const text = at.textContent?.trim();
      if (text) texts.push(text);
    });
  });

  // 提取用户信息
  const userInfo = shadowRoot.querySelector('.comment-user-info, .reply-user-info');
  if (userInfo) {
    const userName = userInfo.querySelector('.comment-user-name, .reply-user-name')?.textContent?.trim();
    if (userName) texts.push(userName);
  }

  // 提取时间和操作信息
  const actions = shadowRoot.querySelector('.comment-actions, .reply-actions');
  if (actions) {
    const timeText = actions.querySelector('.comment-time, .reply-time')?.textContent?.trim();
    if (timeText) texts.push(timeText);
  }

  return texts.filter(text => text.length > 0);
}
```

### **方案3：实时监控评论区变化**

#### 3.1 增强MutationObserver

```typescript
private initCommentObserver(): void {
  if (this.commentObserver) return;

  this.commentObserver = new MutationObserver((mutations) => {
    let shouldUpdate = false;

    mutations.forEach(mutation => {
      // 检查新增的评论元素
      mutation.addedNodes.forEach(node => {
        if (node instanceof Element) {
          if (node.tagName.toLowerCase().startsWith('bili-comment') ||
              node.querySelector('[class*="comment"]')) {
            shouldUpdate = true;
          }
        }
      });

      // 检查Shadow Root的创建
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element && node.shadowRoot) {
            this.observeSingleShadowRoot(node.shadowRoot);
            shouldUpdate = true;
          }
        });
      }
    });

    if (shouldUpdate) {
      // 延迟更新，等待Shadow DOM完全渲染
      setTimeout(() => {
        this.observeShadowRoots();
        this.scheduleFragmentHighlightRestore();
      }, 100);
    }
  });

  // 观察整个文档的变化
  this.commentObserver.observe(this.doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-*']
  });
}

// 专门观察评论区容器
private initCommentContainerObserver(): void {
  const commentContainer = this.doc.querySelector('.comment-container, .comment-list');
  if (!commentContainer) return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element && node.tagName.toLowerCase().startsWith('bili-comment')) {
            // 新的评论组件被添加，等待其Shadow DOM创建
            setTimeout(() => {
              this.observeShadowRoots();
              this.scheduleFragmentHighlightRestore();
            }, 200);
          }
        });
      }
    });
  });

  observer.observe(commentContainer, {
    childList: true,
    subtree: true
  });
}
```

### **方案4：调试和诊断工具**

#### 4.1 添加调试日志

````typescript
private debugShadowDOMStructure(): void {
  if (!window.__AIOB_DEBUG__) return;

  console.group('[VideoSession] Shadow DOM Structure Analysis');

  // 分析所有Shadow Host
  const hosts = this.discoverShadowHosts();
  console.log(`Found ${hosts.length} shadow hosts:`, hosts.map(h => h.tagName));

  // 分析评论相关元素
  hosts.forEach(host => {
    if (host.tagName.toLowerCase().includes('comment')) {
      console.log(`Comment host: ${host.tagName}`, {
        shadowRoot: !!host.shadowRoot,
        textContent: host.textContent?.substring(0, 100),
        children: Array.from(host.children).map(c => c.tagName),
        attributes: Array.from(host.attributes).map(attr => `${attr.name}="${attr.value}"`),
        shadowRootMode: host.shadowRoot?.mode
      });

      // 分析Shadow Root内部结构
      if (host.shadowRoot) {
        this.analyzeShadowRootContent(host.shadowRoot, host.tagName);
      }
    }
  });

  console.groupEnd();
}

private analyzeShadowRootContent(shadowRoot: ShadowRoot, hostTag: string): void {
  console.group(`[${hostTag}] Shadow Root Content`);

  // 分析内部元素
  const elements = shadowRoot.querySelectorAll('*');
  console.log(`Elements in shadow root: ${elements.length}`);

  // 分析文本内容
  const textContent = shadowRoot.textContent?.trim();
  if (textContent) {
    console.log(`Text content (${textContent.length} chars):`, textContent.substring(0, 200));
  }

  // 分析特定的评论相关元素
  const commentElements = shadowRoot.querySelectorAll('[class*="comment"], [class*="reply"], [class*="text"]');
  if (commentElements.length > 0) {
    console.log('Comment-related elements:', Array.from(commentElements).map(el => ({
      tagName: el.tagName,
      className: el.className,
      textContent: el.textContent?.substring(0, 50)
    })));
  }

  // 分析嵌套的Shadow DOM
  const nestedHosts = shadowRoot.querySelectorAll('*');
  Array.from(nestedHosts).forEach(el => {
    if (el.shadowRoot) {
      console.log(`Nested shadow host found: ${el.tagName}`);
      this.analyzeShadowRootContent(el.shadowRoot, el.tagName);
    }
  });

  console.groupEnd();
}

#### 4.2 实时监控工具
```typescript
private startShadowDOMMonitoring(): void {
  if (!window.__AIOB_DEBUG__) return;

  // 定期检查Shadow DOM结构变化
  setInterval(() => {
    const currentHosts = this.discoverShadowHosts();
    const commentHosts = currentHosts.filter(h =>
      h.tagName.toLowerCase().includes('comment') ||
      h.tagName.toLowerCase().includes('rich-text') ||
      h.tagName.toLowerCase().includes('emoji')
    );

    if (commentHosts.length !== this.lastCommentHostCount) {
      console.log(`[Monitor] Comment hosts changed: ${this.lastCommentHostCount} -> ${commentHosts.length}`);
      this.lastCommentHostCount = commentHosts.length;
      this.debugShadowDOMStructure();
    }
  }, 2000);
}

private lastCommentHostCount = 0;
````

### **方案5：B站特定优化**

#### 5.1 针对B站评论区的特殊处理

````typescript
// B站特定的评论区检测和处理
private initBilibiliSpecificHandling(): void {
  // 检测是否为B站页面
  if (!this.isBilibiliPage()) return;

  // 等待评论区容器出现
  this.waitForCommentContainer().then(() => {
    this.setupBilibiliCommentObserver();
    this.patchBilibiliCommentRendering();
  });
}

private isBilibiliPage(): boolean {
  return window.location.hostname.includes('bilibili.com') &&
         (window.location.pathname.includes('/video/') ||
          window.location.pathname.includes('/bangumi/'));
}

private async waitForCommentContainer(): Promise<Element> {
  return new Promise((resolve) => {
    const checkContainer = () => {
      const container = this.doc.querySelector('.comment-container, .comment-list, #comment');
      if (container) {
        resolve(container);
      } else {
        setTimeout(checkContainer, 500);
      }
    };
    checkContainer();
  });
}

private setupBilibiliCommentObserver(): void {
  // 监听滚动事件，B站评论是懒加载的
  let scrollTimeout: number;
  const handleScroll = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = window.setTimeout(() => {
      this.observeShadowRoots();
      this.scheduleFragmentHighlightRestore();
    }, 300);
  };

  window.addEventListener('scroll', handleScroll, { passive: true });

  // 监听评论区的点击事件（展开回复等）
  this.doc.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.closest('.comment-reply, .reply-btn, .show-more')) {
      // 延迟处理，等待新内容渲染
      setTimeout(() => {
        this.observeShadowRoots();
        this.scheduleFragmentHighlightRestore();
      }, 500);
    }
  });
}

private patchBilibiliCommentRendering(): void {
  // 拦截B站的评论渲染，在渲染完成后立即观察Shadow DOM
  const originalCustomElementsDefine = customElements.define;
  customElements.define = function(name: string, constructor: any, options?: any) {
    if (name.startsWith('bili-comment') || name.includes('rich-text')) {
      // 包装构造函数，在连接到DOM后立即观察
      const WrappedConstructor = class extends constructor {
        connectedCallback() {
          super.connectedCallback?.();
          // 延迟观察，确保Shadow DOM完全创建
          setTimeout(() => {
            if (this.shadowRoot) {
              window.videoSession?.observeSingleShadowRoot(this.shadowRoot);
            }
          }, 50);
        }
      };
      return originalCustomElementsDefine.call(this, name, WrappedConstructor, options);
    }
    return originalCustomElementsDefine.call(this, name, constructor, options);
  };
}

#### 5.2 B站评论文本的特殊处理
```typescript
private extractBilibiliCommentTextAdvanced(element: Element): string[] {
  const texts: string[] = [];

  // 处理B站特有的数据属性
  const dataContent = element.getAttribute('data-content');
  if (dataContent) {
    try {
      // B站可能在data-content中存储JSON格式的内容
      const parsed = JSON.parse(dataContent);
      if (parsed.text) texts.push(parsed.text);
      if (parsed.content) texts.push(parsed.content);
    } catch {
      // 如果不是JSON，直接使用
      texts.push(dataContent);
    }
  }

  // 处理表情符号的多种格式
  const emojis = element.querySelectorAll('bili-emoji, .emoji, [data-emoji]');
  emojis.forEach(emoji => {
    const emojiText = emoji.getAttribute('data-emoji') ||
                     emoji.getAttribute('alt') ||
                     emoji.getAttribute('title') ||
                     emoji.textContent;
    if (emojiText) texts.push(emojiText);
  });

  // 处理@用户的多种格式
  const atUsers = element.querySelectorAll('.at-user, [data-user-id], .reply-target');
  atUsers.forEach(at => {
    const userName = at.getAttribute('data-user-name') ||
                    at.getAttribute('data-username') ||
                    at.textContent;
    if (userName) texts.push(userName);
  });

  // 处理链接和视频卡片
  const links = element.querySelectorAll('a, .link, .video-card');
  links.forEach(link => {
    const linkText = link.textContent?.trim();
    const linkTitle = link.getAttribute('title');
    if (linkText) texts.push(linkText);
    if (linkTitle && linkTitle !== linkText) texts.push(linkTitle);
  });

  return texts.filter(text => text && text.length > 0);
}
````

## 🚀 实施计划

### **阶段1：诊断和分析（预计1-2天）**

1. **启用调试模式**
   - 在开发环境中设置 `window.__AIOB_DEBUG__ = true`
   - 添加调试工具，分析Bilibili评论区的实际DOM结构
   - 使用浏览器开发者工具检查Shadow DOM结构

2. **结构分析**
   - 确定缺失的Shadow Host选择器
   - 分析评论区的动态加载机制
   - 测试当前文本查找算法的覆盖范围
   - 记录不同类型评论的DOM结构差异

3. **问题定位**
   - 确认哪些评论无法被选择
   - 分析高亮失效的具体原因
   - 测试滚动加载对功能的影响

### **阶段2：增强选择器和观察（预计2-3天）**

1. **扩展选择器列表**
   - 更新 `BILIBILI_COMMENT_HOST_SELECTORS`
   - 实现动态Shadow Host发现
   - 添加B站特有的组件选择器

2. **增强观察机制**
   - 实现专门的评论区MutationObserver
   - 添加滚动事件监听
   - 实现Shadow DOM创建的实时监控

3. **B站特定优化**
   - 实现B站页面检测
   - 添加评论区容器等待逻辑
   - 拦截Web Components的注册过程

### **阶段3：改进文本查找（预计2-3天）**

1. **增强文本提取**
   - 实现专门的Shadow DOM文本查找算法
   - 添加B站评论文本提取逻辑
   - 处理表情符号和@用户引用

2. **优化高亮机制**
   - 改进Range查找算法
   - 支持跨Shadow DOM的文本高亮
   - 处理动态内容的高亮恢复

3. **性能优化**
   - 实现文本缓存机制
   - 优化Shadow DOM遍历性能
   - 减少不必要的DOM查询

### **阶段4：测试和优化（预计2-3天）**

1. **功能测试**
   - 在实际Bilibili页面测试所有功能
   - 验证评论选择和高亮功能
   - 测试不同类型的评论（文本、表情、@用户、链接）

2. **兼容性测试**
   - 测试不同浏览器的兼容性
   - 验证移动端和桌面端的表现
   - 测试不同视频页面的兼容性

3. **性能和稳定性**
   - 性能优化和内存泄漏检查
   - 错误处理和异常恢复
   - 长时间使用的稳定性测试

### **阶段5：部署和监控（预计1天）**

1. **代码审查和部署**
   - 代码审查和文档更新
   - 创建测试用例和回归测试
   - 部署到生产环境

2. **监控和反馈**
   - 添加使用统计和错误监控
   - 收集用户反馈
   - 持续优化和改进

## 📋 详细测试清单

### **基础功能测试**

- [ ] **评论文本选择**
  - [ ] 主评论文本可以被选择
  - [ ] 回复评论文本可以被选择
  - [ ] 多行评论文本选择正确
  - [ ] 包含表情符号的评论可以选择
  - [ ] 包含@用户的评论可以选择
  - [ ] 包含链接的评论可以选择

- [ ] **边栏显示功能**
  - [ ] 选中的评论文本出现在右侧边栏
  - [ ] 边栏显示的文本内容完整准确
  - [ ] 表情符号在边栏中正确显示（显示为[表情名]）
  - [ ] @用户引用在边栏中正确显示
  - [ ] 长评论在边栏中正确截断和显示

- [ ] **高亮功能**
  - [ ] 点击边栏项目可以正确高亮对应评论
  - [ ] 高亮样式正确应用
  - [ ] 高亮位置准确定位
  - [ ] 多个高亮项目可以正确切换
  - [ ] 高亮在页面滚动后仍然有效

### **动态内容测试**

- [ ] **滚动加载**
  - [ ] 向下滚动加载的新评论可以被选择
  - [ ] 新加载的评论高亮功能正常
  - [ ] 滚动过程中不影响已有功能

- [ ] **交互操作**
  - [ ] 点击"展开回复"后的回复可以被选择
  - [ ] 点击"查看更多回复"后的内容正常
  - [ ] 评论排序切换（热门/最新）后功能正常
  - [ ] 发布新评论后功能不受影响

### **特殊内容测试**

- [ ] **表情符号**
  - [ ] 标准B站表情（如[doge]）正确处理
  - [ ] 自定义表情正确处理
  - [ ] 表情与文本混合的评论正确处理

- [ ] **用户引用**
  - [ ] @用户名的引用正确识别
  - [ ] 回复中的用户引用正确处理
  - [ ] 多个@用户的情况正确处理

- [ ] **特殊格式**
  - [ ] 包含链接的评论正确处理
  - [ ] 包含视频卡片的评论正确处理
  - [ ] 包含图片的评论正确处理
  - [ ] 长文本评论的处理正确

### **性能和稳定性测试**

- [ ] **性能表现**
  - [ ] 页面加载时无明显卡顿
  - [ ] 滚动过程中性能良好
  - [ ] 大量评论时功能仍然流畅
  - [ ] 内存使用合理，无内存泄漏

- [ ] **错误处理**
  - [ ] 网络错误时功能优雅降级
  - [ ] Shadow DOM结构变化时自动适应
  - [ ] 异常情况下不影响页面正常使用
  - [ ] 控制台无错误日志

### **兼容性测试**

- [ ] **浏览器兼容性**
  - [ ] Chrome浏览器功能正常
  - [ ] Firefox浏览器功能正常
  - [ ] Safari浏览器功能正常
  - [ ] Edge浏览器功能正常

- [ ] **页面类型**
  - [ ] 普通视频页面功能正常
  - [ ] 番剧页面功能正常
  - [ ] 直播回放页面功能正常
  - [ ] 不同UP主的视频页面功能正常

### **用户体验测试**

- [ ] **交互体验**
  - [ ] 选择操作响应及时
  - [ ] 高亮效果自然流畅
  - [ ] 边栏内容更新及时
  - [ ] 无意外的页面跳转或滚动

- [ ] **视觉效果**
  - [ ] 高亮颜色与页面风格协调
  - [ ] 边栏样式与整体设计一致
  - [ ] 不同主题下显示正常
  - [ ] 移动端适配良好

## 🔧 相关文件

### **主要修改文件**

- `AiiinOB/src/content/video/session.ts` - 视频会话管理，主要的Shadow DOM处理逻辑
- `AiiinOB/src/content/index.ts` - Shadow DOM选择器定义和初始化
- `AiiinOB/src/content/video/ui/panel.ts` - 右侧边栏显示逻辑
- `AiiinOB/src/content/video/ui/highlight.ts` - 文本高亮功能实现

### **新增文件建议**

- `AiiinOB/src/content/video/bilibili-adapter.ts` - B站特定的适配器
- `AiiinOB/src/content/shadow-dom/observer.ts` - Shadow DOM观察器
- `AiiinOB/src/content/shadow-dom/text-extractor.ts` - 文本提取器
- `AiiinOB/src/utils/debug.ts` - 调试工具

### **配置文件**

- `AiiinOB/src/config/selectors.ts` - 选择器配置
- `AiiinOB/src/config/sites.ts` - 站点特定配置

### **测试文件**

- `AiiinOB/tests/bilibili-comments.test.ts` - B站评论功能测试
- `AiiinOB/tests/shadow-dom.test.ts` - Shadow DOM处理测试

## 📄 参考文档

### **网页结构分析**

- `AiiinOB/docs/reference-fixtures/bilibili-page-source-complete.html` - 完整的B站视频页面源码结构
- `AiiinOB/docs/reference-fixtures/bilibili-page-source-initial.html` - 初始页面结构

### **技术文档**

- [Shadow DOM API文档](https://developer.mozilla.org/en-US/docs/Web/API/Shadow_DOM_API)
- [Web Components规范](https://www.w3.org/TR/components-intro/)
- [MutationObserver API](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)

## 🎯 总结

这个修复方案通过以下几个关键改进来解决Bilibili评论区Shadow DOM的问题：

### **核心改进**

1. **完整的选择器覆盖** - 识别所有B站评论相关的Web Components
2. **智能的Shadow DOM观察** - 实时监控Shadow DOM的创建和变化
3. **专门的文本提取算法** - 正确处理表情符号、@用户引用等特殊内容
4. **B站特定优化** - 针对B站的页面结构和加载机制进行优化
5. **强大的调试工具** - 帮助开发者快速定位和解决问题

### **预期效果**

- ✅ 评论区所有文本内容都可以被正确选择
- ✅ 选中的文本准确显示在右侧边栏
- ✅ 高亮功能在所有评论类型中都能正常工作
- ✅ 动态加载的评论也能被正确处理
- ✅ 性能优化，用户体验流畅

### **长期维护**

- 🔧 模块化的代码结构，便于维护和扩展
- 🔧 完善的测试覆盖，确保功能稳定
- 🔧 详细的调试工具，快速定位问题
- 🔧 灵活的配置系统，适应未来变化

这个修复方案将显著改善Bilibili评论区的文本抓取和高亮功能，为用户提供更好的视频模式体验。通过系统性的分析和针对性的优化，确保功能的稳定性和可维护性。
