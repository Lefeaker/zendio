# 设计系统咨询需求文档 | Design System Consultation Brief

> **目的**：为 "All in Ob" 浏览器扩展项目引入合适的设计系统，提升 UI 一致性、开发效率和用户体验

---

## 📋 项目概况 | Project Overview

### 项目信息
- **项目名称**：All in Ob
- **项目类型**：浏览器扩展（Chrome Extension / Firefox Add-on）
- **版本**：v0.2.0
- **开发阶段**：活跃开发中，已有用户使用
- **开源状态**：开源项目
- **许可证**：MIT（待确认）

### 一句话描述
一个将网页内容、高亮片段、评论和 AI 对话捕获为结构化 Markdown 笔记的浏览器扩展。

### 核心功能
1. **网页剪藏**：右键保存选中文本或整篇文章
2. **片段评论**：直接在浮动面板中标注剪藏内容
3. **AI 助手**：生成标题、摘要和标签
4. **阅读会话**：将多个片段合并为单个"阅读笔记"
5. **多 Vault 智能路由**：根据规则将内容路由到不同的 Obsidian 库
6. **多语言支持**：中文、英文、日文即时切换

### 目标用户
- 研究人员、工程师、作家、知识工作者
- 重度 Obsidian 用户
- 需要高效知识管理的专业人士

---

## 🛠️ 技术栈 | Tech Stack

### 前端框架与工具
```json
{
  "核心框架": "原生 TypeScript（无 React/Vue/Svelte）",
  "样式方案": "Tailwind CSS 3.4.14 + CSS Variables",
  "构建工具": "esbuild 0.23.0",
  "类型检查": "TypeScript 5.5.4",
  "测试框架": "Vitest 1.6.0 + Playwright 1.49.1",
  "国际化": "intl-messageformat 10.7.18",
  "代码规范": "ESLint + Prettier + Stylelint",
  "包管理器": "npm"
}
```

### 浏览器扩展特性
- **Manifest V3**（最新标准）
- **多浏览器支持**：Chrome、Firefox（使用不同的 manifest 文件）
- **运行环境**：
  - Background Service Worker（后台脚本）
  - Content Scripts（内容脚本，注入到网页）
  - Options Page（独立标签页的设置页面）
  - Popup（暂未实现）

### 架构模式
- **分层架构**：Platform → Infrastructure → Application → UI
- **依赖注入**：使用自定义的 ServiceRegistry
- **组件化**：基于 `BaseComponent` 和 `BaseSection` 的组件系统
- **状态管理**：本地 `StateManager`（无 Redux/Zustand）

---

## 🎨 当前样式系统现状 | Current Styling System

### 现有样式架构
```
设计令牌（CSS Variables）
    ↓
Tailwind 配置（主题扩展）
    ↓
Tailwind Utilities（工具类）
    ↓
自定义组件类（.aobx-*）
    ↓
组件 HTML（TypeScript 生成）
```

### 样式文件结构
```
src/
├── styles/
│   ├── design-tokens.css         # 全局 CSS 变量（旧版）
│   ├── components.css             # 全局组件样式
│   └── clipper/                   # Clipper 专用样式
│       ├── tailwind.input.css
│       └── clipper.tailwind.css
│
└── options/
    └── styles/
        ├── design-tokens.css      # Options 专用 CSS 变量（使用 --aobx-* 命名）
        ├── tailwind.input.css     # Tailwind 输入文件
        ├── tailwind.css           # 生成的 Tailwind 工具类
        └── aob-options.css        # 结构 hook 样式
```

### 设计令牌示例（Options 页面）
```css
:root {
  /* 颜色 */
  --aobx-accent: hsl(257 86% 63%);         /* 主色调：紫色 */
  --aobx-surface-0: hsl(220 12% 97%);     /* 背景：浅灰 */
  --aobx-surface-1: hsl(220 12% 95%);     /* 卡片背景 */
  --aobx-text: hsl(220 18% 24%);          /* 主文字 */

  /* 间距 */
  --aobx-space-4: 16px;
  --aobx-space-6: 24px;

  /* 圆角 */
  --aobx-radius-lg: 18px;
  --aobx-radius-md: 12px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --aobx-surface-0: hsl(220 8% 11%);    /* 深色背景 */
    --aobx-text: hsl(0 0% 92%);           /* 浅色文字 */
  }
}
```

### 现有问题
1. ❌ **缺乏系统性**：设计令牌和组件样式分散，没有统一的设计语言
2. ❌ **组件库不完整**：大量使用 Tailwind 工具类直接拼接，可复用性低
3. ❌ **深色模式不完善**：仅基于 `prefers-color-scheme`，无手动切换
4. ❌ **无障碍性欠缺**：部分组件缺少 ARIA 标签和键盘导航
5. ❌ **样式一致性差**：不同页面（Options vs Content Scripts）样式风格不统一
6. ❌ **没有设计文档**：缺少组件使用指南和设计原则文档

---

## 🧩 UI 组件清单 | UI Components Inventory

### Options 页面组件（~38 个 TS 文件）

#### 布局组件（Layout）
- `OptionsApp`：主应用容器（Sidebar + MainContent）
- `Sidebar`：侧边导航栏
- `MainContent`：主内容区（懒加载 Sections）
- `Navigation`：导航项列表
- `NavigationController`：导航逻辑控制器

#### Section 组件（页面区块）
- `UsageSection`：使用统计仪表板
- `RestSection`：REST API 配置
- `RoutingSection`：多 Vault 路由规则
- `TemplatesSection`：模板编辑器
- `YamlConfigSection`：YAML 字段配置
- `FragmentSection`：片段设置
- `VideoSection`：视频模式设置
- `ReadingSection`：阅读模式设置
- `AiSection`：AI 配置
- `ClassifierSection`：分类器设置
- `PrivacySection`：隐私设置
- `LanguageSection`：语言切换
- `DiagnosisSection`：诊断工具
- `TransferSection`：导入导出
- `DeepResearchSection`：深度研究模式（实验性）

#### 控件组件（Controls）
- `ConnectionTest`：连接测试按钮 + 状态显示
- `ConfirmDialog`：确认对话框
- `VaultRouterController`：Vault 路由表编辑器
- `DomainMappings`：域名映射表
- `YamlConfigTable`：YAML 字段表格
- `ReadingTemplateControls`：阅读模板控制器
- `PrivacySettings`：隐私设置表单

#### 基础组件（Shared）
- `AobFormGroup`：表单组包装器
- `AobTable`：数据表格
- `ListBuilder`：列表构建器
- `BaseComponent`：所有组件的基类
- `BaseSection`：所有 Section 的基类

#### 基础设施组件（Infrastructure）
- `ModalController`：模态框管理器
- `FormSectionRegistry`：表单区块注册表
- `StateManager`：状态管理器

### Content Scripts 组件（~76 个 TS 文件）

#### Clipper 组件
- `ClipperDialog`：剪藏对话框（浮动面板）
- `CommentForm`：评论表单
- `SelectionController`：选择控制器
- `ContextCapture`：上下文捕获
- `FragmentBuilder`：片段构建器

#### Reader 组件
- `ReaderPanel`：阅读面板
- `ReaderSession`：阅读会话管理
- `MarkdownBuilder`：Markdown 构建器

#### Video 组件
- `VideoPanel`：视频笔记面板
- `VideoSession`：视频会话管理
- `FragmentHighlighter`：片段高亮器

### 需要的通用组件（目前缺失）
- ✅ **Button**：主要按钮、次要按钮、危险按钮、图标按钮
- ✅ **Input**：文本输入、数字输入、密码输入
- ✅ **Select**：下拉选择器
- ✅ **Checkbox / Radio**：复选框 / 单选框
- ✅ **Textarea**：多行文本输入
- ✅ **Switch / Toggle**：开关切换
- ✅ **Badge / Tag**：徽章 / 标签
- ✅ **Tooltip**：提示气泡
- ✅ **Toast / Notification**：轻量级通知
- ✅ **Alert / Banner**：警告横幅
- ✅ **Card**：卡片容器
- ✅ **Tabs**：标签页切换
- ✅ **Accordion**：折叠面板
- ✅ **Progress Bar**：进度条
- ✅ **Spinner / Loading**：加载动画
- ✅ **Divider**：分隔线

---

## 🎯 设计需求与约束 | Design Requirements & Constraints

### 技术约束

#### ✅ 必须满足（Hard Requirements）
1. **无框架依赖**：
   - ❌ 不使用 React、Vue、Svelte、Angular
   - ✅ 必须兼容原生 TypeScript + DOM API
   - ✅ 组件系统基于类（Class-based）或函数（Function-based）

2. **浏览器扩展环境**：
   - ❌ 无法使用需要构建服务器的方案（如 Storybook Live）
   - ✅ 组件必须能在 Content Scripts 中注入（Shadow DOM 环境）
   - ✅ 样式必须支持 Shadow DOM 隔离
   - ⚠️ 包体积敏感（扩展大小需控制在合理范围）

3. **CSS 方案**：
   - ✅ 已使用 Tailwind CSS，希望继续使用
   - ✅ 支持 CSS Variables（Design Tokens）
   - ✅ 支持 PostCSS 处理

4. **构建工具**：
   - ✅ 使用 esbuild（不使用 Webpack/Vite）
   - ✅ 必须兼容现有构建流程

#### 🎨 设计偏好（Soft Preferences）
1. **视觉风格**：
   - 现代、简约、专业
   - 适合知识管理工具的调性
   - 支持深色模式（用户可切换）

2. **交互体验**：
   - 流畅的过渡动画（但不过度）
   - 清晰的交互反馈
   - 键盘友好（快捷键支持）

3. **无障碍性**：
   - WCAG 2.1 AA 级别
   - 屏幕阅读器支持
   - 键盘导航完整

4. **国际化**：
   - 支持中文、英文、日文
   - RTL 布局支持（未来可能）

### 功能需求

#### 页面类型与使用场景
1. **Options Page（设置页面）**
   - 独立标签页，桌面端体验
   - 复杂表单、数据表格、导航系统
   - 需要响应式设计（最小 800px 宽度）

2. **Content Scripts（内容脚本）**
   - 注入到任意网页中
   - 需要与宿主页面样式隔离（Shadow DOM）
   - 浮动对话框、临时面板
   - 需要轻量级、快速加载

3. **Background Scripts（后台脚本）**
   - 无 UI，仅逻辑

### 参考设计系统（可能喜欢的风格）
- **Obsidian UI**：简约、深色友好、细腻的过渡
- **GitHub Primer**：清晰的层次、良好的表单设计
- **Radix UI**：无障碍性优先、Headless 理念
- **Arc 浏览器**：现代、流畅、精致

---

## 🔍 设计系统候选方案考量 | Design System Considerations

### 我们需要什么类型的设计系统？

#### 选项 A：Headless UI 库 + 自定义样式
**优点**：
- 灵活性高，完全控制视觉风格
- 无障碍性开箱即用
- 包体积小（仅逻辑，无样式）

**缺点**：
- 需要自行设计所有视觉样式
- 初期开发成本高

**候选库**：
- [Radix UI](https://www.radix-ui.com/) - 无障碍优先，原生 TS
- [Headless UI](https://headlessui.com/) - Tailwind 官方，但依赖 React/Vue
- [Kobalte](https://kobalte.dev/) - Solid.js 版本
- [Zag.js](https://zagjs.com/) - 状态机驱动，框架无关

#### 选项 B：完整的组件库（原生 / Web Components）
**优点**：
- 开箱即用，快速迭代
- 成熟的设计语言
- 文档和示例完善

**缺点**：
- 样式定制受限
- 包体积可能较大
- 可能与 Tailwind 冲突

**候选库**：
- [Shoelace](https://shoelace.style/) - Web Components，现代、轻量
- [Lion Web Components](https://lion-web.netlify.app/) - ING 开源，无障碍性强
- [Vaadin Components](https://vaadin.com/components) - 企业级，成熟稳定
- [Fluent UI Web Components](https://github.com/microsoft/fluentui/tree/master/packages/web-components) - 微软 Fluent 设计

#### 选项 C：设计系统框架 / 工具
**优点**：
- 提供设计规范和工具链
- 文档化和协作友好
- 长期维护性好

**缺点**：
- 学习曲线陡峭
- 可能过度工程化

**候选方案**：
- [Style Dictionary](https://amzn.github.io/style-dictionary/) - 设计令牌管理
- [Storybook](https://storybook.js.org/) - 组件文档和开发环境
- [Fractal](https://fractal.build/) - 组件库构建工具
- [Zero Height](https://zeroheight.com/) - 设计系统文档平台

#### 选项 D：基于 Tailwind 的组件库
**优点**：
- 与现有技术栈无缝集成
- Utility-first 理念一致
- 样式定制简单

**缺点**：
- 大多依赖 React/Vue
- 原生 TS 版本较少

**候选库**：
- [daisyUI](https://daisyui.com/) - Tailwind 插件，纯 CSS（无 JS）
- [Flowbite](https://flowbite.com/) - 有原生 JS 版本
- [Preline UI](https://preline.co/) - 原生 JS，轻量
- [Hyper UI](https://www.hyperui.dev/) - 免费组件集合，复制粘贴

---

## 📊 决策矩阵 | Decision Matrix

| 方案 | 与技术栈兼容性 | 开箱即用程度 | 定制灵活性 | 包体积 | 无障碍性 | 学习成本 | 综合评分 |
|------|----------------|--------------|------------|--------|----------|----------|----------|
| Headless UI + 自定义 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | **22/30** |
| 完整组件库（Web Components） | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **21/30** |
| 设计系统框架 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | **16/30** |
| Tailwind 组件库（原生） | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **25/30** |

---

## ❓ 咨询问题清单 | Questions for Design Expert

### 核心问题
1. **给定我们的技术约束（原生 TS + Tailwind + 浏览器扩展），你推荐哪种设计系统方案？**
   - Headless UI + 自定义样式？
   - Web Components 组件库？
   - Tailwind 原生组件库？
   - 其他方案？

2. **如何平衡"设计一致性"和"开发速度"？**
   - 是否应该先建立设计令牌和基础组件，再逐步迁移现有代码？
   - 还是应该直接引入成熟的组件库，快速覆盖现有功能？

3. **浏览器扩展的设计系统有何特殊考量？**
   - Shadow DOM 环境下的样式隔离策略？
   - Content Scripts 的性能优化建议？
   - 如何处理宿主页面样式冲突？

### 具体建议
4. **设计令牌（Design Tokens）的最佳实践？**
   - 我们当前的 CSS 变量命名（`--aobx-*`）是否合理？
   - 如何组织颜色、间距、字体等令牌？
   - 是否应该使用 Style Dictionary 等工具？

5. **组件库的构建方式？**
   - 是否应该创建一个独立的 `@all-in-ob/ui` 包？
   - 如何组织组件文件结构？
   - 如何编写组件文档（考虑到无法使用 Storybook Live）？

6. **深色模式的实现策略？**
   - 基于 `prefers-color-scheme` + 手动切换？
   - 如何管理深色/浅色主题的令牌？
   - 是否应该支持自定义主题？

7. **无障碍性（A11y）的实施路径？**
   - 哪些是最优先需要改进的无障碍问题？
   - 如何在原生 TS 组件中实现 ARIA 标签和键盘导航？
   - 有哪些自动化测试工具推荐？

8. **动画和过渡的设计原则？**
   - 哪些交互应该有动画？
   - 动画时长和缓动函数的推荐？
   - 如何尊重 `prefers-reduced-motion`？

9. **响应式设计的断点策略？**
   - Options 页面的最小支持宽度？
   - 移动端是否需要支持（考虑到是浏览器扩展）？

10. **长期维护和扩展性？**
    - 如何确保新加入的开发者能快速理解设计系统？
    - 设计系统文档应该包含哪些内容？
    - 如何处理设计系统的版本迭代？

---

## 📎 附加资源 | Additional Resources

### 项目链接
- **GitHub 仓库**：（请补充）
- **在线演示**：（如有）
- **设计稿**：（如有 Figma/Sketch）

### 现有文档
- `docs/development-guidelines.md`：开发规范指南
- `docs/options-style-customization-guide.md`：样式自定义指南
- `docs/options-tailwind-style-loading-guide.md`：Tailwind 样式加载指南

### 可参考的代码片段
- `src/options/components/shared/FormComponents.ts`：表单组件示例
- `src/options/styles/design-tokens.css`：设计令牌定义
- `tailwind.config.cjs`：Tailwind 配置

### 视觉参考
- `marketing/banner.png`：品牌 Banner
- `public/icons/`：图标资源

---

## 🎯 期望输出 | Expected Deliverables

希望设计专家提供：

1. **设计系统方案推荐**
   - 具体的技术选型建议
   - 实施路线图（MVP → 完整版）
   - 预估的工作量和时间线

2. **设计令牌规范**
   - 颜色、间距、字体等令牌的命名规范
   - 深色/浅色模式的管理策略
   - CSS 变量 vs Style Dictionary 的选择

3. **组件库架构建议**
   - 组件的分类和组织方式
   - 基础组件 → 复合组件的层级
   - 文档和示例的编写规范

4. **无障碍性改进清单**
   - 当前最紧迫的 A11y 问题
   - 优先级排序（P0 / P1 / P2）
   - 具体的实施指南

5. **迁移策略**
   - 从现有代码迁移到设计系统的步骤
   - 如何在不影响功能的情况下逐步重构
   - 新旧代码的共存策略

---

## 📝 补充说明 | Additional Notes

### 当前痛点（按优先级）
1. **P0 - 样式不一致**：不同页面和组件的视觉风格差异大
2. **P1 - 开发效率低**：每次新增组件都需要重复编写样式逻辑
3. **P1 - 深色模式不完善**：仅支持自动检测，无手动切换
4. **P2 - 无障碍性欠佳**：部分组件缺少键盘导航和 ARIA 标签
5. **P2 - 文档缺失**：没有设计规范和组件使用指南

### 短期目标（3 个月内）
- ✅ 建立基础的设计令牌系统
- ✅ 实现 10-15 个核心组件（Button、Input、Select 等）
- ✅ Options 页面完成设计系统迁移
- ✅ 编写组件使用文档

### 长期愿景（1 年内）
- ✅ 完整的组件库（30+ 组件）
- ✅ Content Scripts 也统一使用设计系统
- ✅ 达到 WCAG 2.1 AA 标准
- ✅ 支持自定义主题（社区贡献）

---

**文档版本**：v1.0
**更新日期**：2025-11-25
**联系方式**：（请补充项目维护者联系方式）
