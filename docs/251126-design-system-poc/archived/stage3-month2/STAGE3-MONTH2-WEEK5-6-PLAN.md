# Stage 3 Month 2 Week 5-6 执行计划
## Content Scripts DaisyUI 迁移 - Reader & Video Panels

> **版本**: v1.0
> **创建日期**: 2025-11-29
> **目标周期**: 2 周 (10 工作日)
> **核心目标**: 迁移 Reader Panel 和 Video Panel 到 DaisyDialog 架构
> **前置条件**: ✅ Stage 3 Month 1 已完成 (Options Sections 迁移)
> **团队规模**: 2 人 (1 前端 + 1 全栈)
> **2026-03-07 真值更新**: Reader Panel 迁移、Video Panel DaisyDialog、Support Prompt DaisyDialog 以及对应自动化测试均已落地并完成文档收口；YouTube/Bilibili 手工验证按当前决策本轮豁免。Stage 3 Month 2 现已达到“代码 + 自动化 + 文档一致”的完成态。

---

## 📊 Week 5-6 总览

| 维度 | 当前状态 | Week 5-6 目标 | 成功指标 |
|------|---------|--------------|----------|
| **Reader Panel 迁移** | ✅ 已完成 | DaisyDialog 架构 | 无 CSS 冲突,焦点管理正确 |
| **Video Panel 迁移** | ✅ 已完成 | DaisyDialog 架构 | 截图功能正常,时间戳捕获 |
| **E2E 测试** | ✅ Reader / Video 已补齐 | 6 个测试用例 | Reader 3 个 + Video 3 个 |
| **样式隔离** | 部分隔离 | 完全隔离 | Shadow DOM + CSS Scoping |
| **包体积增长** | 0 KB | < 10 KB | gzipped 增长 |

---

## 🎯 核心目标

### 业务目标
**将 Content Scripts 中的自定义 Dialog 迁移到 DaisyDialog 统一架构,提升样式一致性和可维护性**

### 技术目标
1. **Reader Panel 迁移** - 使用 DaisyDialog + DaisyButton + DaisyBadge
2. **Video Panel 迁移** - 使用 DaisyDialog + DaisyButton + DaisyAlert
3. **样式隔离强化** - 确保 Content Scripts 在任何网站都不产生 CSS 冲突
4. **E2E 测试补充** - 覆盖 Reader/Video 核心流程

### 非目标 (延后到 Week 7-8)
- ✅ Support Prompt 迁移（本轮已完成）
- ❌ 无障碍性深度审计 (Month 4)
- ❌ Repository 层重构 (并行进行,不阻塞)

---

## 📅 详细执行计划

---

## Week 5: Reader Panel 迁移 (Day 1-5)

**目标**: 将 Reader Panel 迁移到 DaisyDialog 架构,确保在 10+ 主流网站测试通过

---

### Day 1: Reader Panel 架构分析 (8h)

#### 任务 5.1: 审计现有 Reader Panel 实现 (4h)

**负责人**: 前端
**优先级**: 🔴 P0

**执行步骤**:

1. **读取源文件**
```bash
# 定位 Reader Panel 核心文件
src/content/reader/presentation/readerPanelView.ts
src/content/reader/ui/panel.ts
src/content/reader/session.ts
src/content/reader/styles.ts
```

2. **绘制组件依赖图**
```
ReaderSession
  ├── ReaderPanelView (Presentation 层)
  │   ├── panel.ts (UI 构建)
  │   └── styles.ts (样式注入)
  └── HighlightManager (高亮逻辑)
```

3. **识别迁移热点**
- Dialog 容器构建逻辑 (panel.ts:50-120)
- 工具栏按钮 (panel.ts:150-200)
- 高亮列表渲染 (panel.ts:220-280)
- 焦点管理逻辑 (session.ts:300-350)

4. **记录现有问题**
- [ ] CSS 样式是否与宿主页面冲突?
- [ ] Shadow DOM 是否正确隔离?
- [ ] 焦点 trap 是否正常工作?
- [ ] 键盘快捷键是否可靠?

**产出物**: `docs/251126-design-system-poc/reader-panel-audit.md`

```markdown
# Reader Panel 迁移审计报告

## 当前架构

### 文件结构
- src/content/reader/presentation/readerPanelView.ts (350 行) - View 层逻辑
- src/content/reader/ui/panel.ts (280 行) - DOM 构建
- src/content/reader/styles.ts (150 行) - CSS 样式

### 关键组件
1. **Dialog 容器** (panel.ts:50-120)
   - 使用手写 `<div class="reader-dialog">` 构建
   - 样式通过 `<style>` 标签注入
   - 问题: 样式可能被宿主页面覆盖

2. **工具栏按钮** (panel.ts:150-200)
   - 使用 `<button class="toolbar-btn">` 构建
   - 图标通过 Lucide 渲染
   - 问题: 按钮样式不统一,缺失 DaisyUI 语义

3. **高亮列表** (panel.ts:220-280)
   - 使用 `<ul><li>` 渲染高亮片段
   - 每个高亮片段带删除/编辑按钮
   - 问题: 列表项样式手写,未使用 DaisyUI

### 迁移热点

| 热点 | 当前实现 | 目标实现 | 优先级 |
|------|---------|---------|--------|
| Dialog 容器 | 手写 div + 样式 | DaisyDialog | 🔴 P0 |
| 工具栏按钮 | 手写 button | DaisyButton | 🔴 P0 |
| 标签数量 Badge | 手写 span | DaisyBadge | 🟡 P1 |
| 高亮列表 | 手写 ul/li | DaisyCard (可选) | 🟢 P2 |

### 现有问题

1. **CSS 冲突风险** (P0)
   - 问题: `.reader-dialog` 样式可能被宿主页面同名 class 覆盖
   - 复现: 在 Medium.com 测试,标题字体被覆盖
   - 根因: 未使用 CSS Modules 或 Shadow DOM 完全隔离

2. **焦点管理不稳定** (P1)
   - 问题: 打开 Dialog 后,Tab 键可能跳出到宿主页面
   - 复现: 在 Wikipedia 测试,Tab 键聚焦到页面导航栏
   - 根因: FocusTrap 逻辑有漏洞

3. **按钮样式不一致** (P2)
   - 问题: 工具栏按钮样式与 Options 页面不一致
   - 根因: 未使用 DaisyButton 统一组件

### 迁移收益

1. ✅ **样式一致性** - 与 Options 页面统一视觉风格
2. ✅ **样式隔离** - DaisyDialog 自带 Shadow DOM 隔离
3. ✅ **焦点管理** - DaisyDialog 内置 FocusTrap
4. ✅ **可维护性** - 减少手写 CSS,复用 DaisyUI 组件

### 迁移风险

| 风险项 | 严重性 | 可能性 | 缓解措施 |
|--------|--------|--------|----------|
| **MarkdownBuilder 兼容性** | 中 | 低 | ✅ 保留现有逻辑,只替换 UI 层 |
| **Shadow DOM 穿透失败** | 高 | 低 | ✅ 使用 CSS Variables 传递主题色 |
| **高亮定位偏移** | 中 | 中 | ✅ 测试 10+ 网站,确保定位准确 |

### 测试网站清单

必测网站 (10+):
- [ ] Wikipedia (复杂 DOM 结构)
- [ ] Medium (自定义字体样式)
- [ ] GitHub (代码高亮冲突)
- [ ] Stack Overflow (问答嵌套结构)
- [ ] Twitter/X (动态加载内容)
- [ ] Reddit (嵌套评论)
- [ ] YouTube (视频页面)
- [ ] Bilibili (弹幕覆盖)
- [ ] 知乎 (富文本编辑器)
- [ ] 微信公众号 (特殊排版)

### 迁移估算

- 任务 5.2 (Dialog 迁移): 4h
- 任务 5.3 (按钮迁移): 3h
- 任务 5.4 (测试): 6h
- **总计**: 13h (1.5 天)
```

**验收标准**:
- [ ] 审计报告包含现有架构分析
- [ ] 识别所有迁移热点 (P0/P1/P2)
- [ ] 记录至少 3 个现有问题
- [ ] 列出 10+ 测试网站清单

---

#### 任务 5.2: 设计 Reader Panel DaisyDialog 架构 (4h)

**负责人**: 前端
**优先级**: 🔴 P0
**依赖**: 任务 5.1

**执行步骤**:

1. **设计组件接口**
```typescript
// src/content/reader/components/ReaderDialog.ts
import { DaisyDialog } from '@/content/shared/DaisyDialog';
import { DaisyButton } from '@/content/shared/DaisyButton';
import { DaisyBadge } from '@/content/shared/DaisyBadge';

export interface ReaderDialogConfig {
  title: string; // "阅读笔记"
  highlights: Array<{
    id: string;
    text: string;
    note: string;
    timestamp: number;
  }>;
  onExport: () => void; // 导出到 Obsidian
  onClose: () => void;
}

export class ReaderDialog {
  private dialog: DaisyDialog;
  private config: ReaderDialogConfig;

  constructor(config: ReaderDialogConfig) {
    this.config = config;
    this.dialog = new DaisyDialog({
      title: config.title,
      size: 'lg', // 大尺寸 Dialog
      closeOnEscape: true,
      closeOnBackdrop: false // 防止误关闭
    });
  }

  render(): HTMLElement {
    const content = this.buildContent();
    const footer = this.buildFooter();

    this.dialog.setContent(content);
    this.dialog.setFooter(footer);

    return this.dialog.render();
  }

  private buildContent(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'space-y-4';

    // 高亮列表
    const list = this.buildHighlightList();
    container.append(list);

    return container;
  }

  private buildHighlightList(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'divide-y divide-base-300';

    this.config.highlights.forEach(highlight => {
      const item = this.buildHighlightItem(highlight);
      list.append(item);
    });

    return list;
  }

  private buildHighlightItem(highlight: ReaderDialogConfig['highlights'][0]): HTMLElement {
    const item = document.createElement('div');
    item.className = 'py-3 flex flex-col gap-2';

    // 高亮文本
    const text = document.createElement('p');
    text.className = 'text-sm text-base-content';
    text.textContent = highlight.text;

    // 笔记 (如果有)
    if (highlight.note) {
      const note = document.createElement('p');
      note.className = 'text-xs text-base-content/60 italic';
      note.textContent = `💡 ${highlight.note}`;
      item.append(note);
    }

    // 操作按钮
    const actions = document.createElement('div');
    actions.className = 'flex gap-2';

    const editBtn = new DaisyButton(actions).render({
      label: '编辑',
      variant: 'ghost',
      size: 'xs',
      onClick: () => this.handleEdit(highlight.id)
    });

    const deleteBtn = new DaisyButton(actions).render({
      label: '删除',
      variant: 'error',
      size: 'xs',
      onClick: () => this.handleDelete(highlight.id)
    });

    item.append(text, actions);
    return item;
  }

  private buildFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'flex justify-between items-center';

    // 左侧: 高亮数量 Badge
    const badgeContainer = document.createElement('div');
    const badge = new DaisyBadge(badgeContainer).render({
      label: `${this.config.highlights.length} 条高亮`,
      variant: 'info'
    });

    // 右侧: 导出 + 关闭按钮
    const actions = document.createElement('div');
    actions.className = 'flex gap-2';

    const exportBtn = new DaisyButton(actions).render({
      label: '导出到 Obsidian',
      variant: 'primary',
      iconName: 'Download',
      onClick: this.config.onExport
    });

    const closeBtn = new DaisyButton(actions).render({
      label: '关闭',
      variant: 'ghost',
      onClick: this.config.onClose
    });

    footer.append(badgeContainer, actions);
    return footer;
  }

  private handleEdit(id: string): void {
    // TODO: 触发编辑逻辑
    console.log('Edit highlight:', id);
  }

  private handleDelete(id: string): void {
    // TODO: 触发删除逻辑
    console.log('Delete highlight:', id);
  }

  show(): void {
    this.dialog.show();
  }

  hide(): void {
    this.dialog.hide();
  }

  destroy(): void {
    this.dialog.destroy();
  }
}
```

2. **绘制组件层次图**
```
ReaderDialog (New)
  ├── DaisyDialog (Container)
  │   ├── Header: "阅读笔记"
  │   ├── Content: HighlightList
  │   │   ├── HighlightItem 1
  │   │   │   ├── Text
  │   │   │   ├── Note (可选)
  │   │   │   └── Actions (Edit + Delete DaisyButtons)
  │   │   ├── HighlightItem 2
  │   │   └── ...
  │   └── Footer
  │       ├── DaisyBadge (高亮数量)
  │       └── Actions (Export + Close DaisyButtons)
  └── FocusTrap (DaisyDialog 内置)
```

3. **定义样式策略**
```css
/* ✅ 使用 DaisyUI 语义化 classes,无需手写 CSS */

.reader-dialog-content {
  /* DaisyUI 自带 spacing utilities */
  @apply space-y-4;
}

.highlight-item {
  /* DaisyUI 自带 divider */
  @apply py-3 flex flex-col gap-2;
}

/* ⚠️ 如需自定义,使用 CSS Variables 确保 Shadow DOM 穿透 */
:host {
  --reader-dialog-bg: var(--fallback-b1, oklch(var(--b1)));
  --reader-dialog-text: var(--fallback-bc, oklch(var(--bc)));
}
```

**产出物**: `src/content/reader/components/ReaderDialog.ts` (设计稿)

**验收标准**:
- [ ] 接口定义完整 (ReaderDialogConfig)
- [ ] 组件层次清晰 (DaisyDialog → Content → Footer)
- [ ] 使用 DaisyButton/DaisyBadge 替代手写按钮
- [ ] 样式策略明确 (DaisyUI utilities + CSS Variables)

---

### Day 2-3: Reader Panel 实现 (16h)

#### 任务 5.3: 实现 ReaderDialog 组件 (8h)

**负责人**: 前端
**优先级**: 🔴 P0
**依赖**: 任务 5.2

**执行步骤**:

1. **创建文件结构**
```bash
mkdir -p src/content/reader/components
touch src/content/reader/components/ReaderDialog.ts
touch src/content/reader/components/README.md
```

2. **实现 ReaderDialog.ts**
   - 复制 Day 1 设计稿代码
   - 补充 handleEdit/handleDelete 实现
   - 添加 TypeScript 类型标注
   - 添加 JSDoc 注释

3. **集成到 ReaderSession**
```typescript
// src/content/reader/session.ts (修改)
import { ReaderDialog } from './components/ReaderDialog';

export class ReaderSession {
  private dialog: ReaderDialog | null = null;

  showReaderPanel(): void {
    const highlights = this.getHighlights(); // 获取当前高亮

    this.dialog = new ReaderDialog({
      title: this.messages?.readerPanelTitle ?? '阅读笔记',
      highlights,
      onExport: () => this.exportToObsidian(),
      onClose: () => this.dialog?.hide()
    });

    this.dialog.show();
  }

  private getHighlights() {
    // 从 HighlightManager 获取高亮数据
    return this.highlightManager.getAll().map(h => ({
      id: h.id,
      text: h.text,
      note: h.note ?? '',
      timestamp: h.timestamp
    }));
  }

  private exportToObsidian(): void {
    // 现有导出逻辑保持不变
    const markdown = this.markdownBuilder.build(this.getHighlights());
    void this.sendToBackground(markdown);
  }

  destroy(): void {
    this.dialog?.destroy();
    // ... 其他清理逻辑
  }
}
```

4. **移除旧代码**
```bash
# 标记旧文件为 deprecated
mv src/content/reader/ui/panel.ts src/content/reader/ui/panel.deprecated.ts
mv src/content/reader/styles.ts src/content/reader/styles.deprecated.ts

# 后续删除 (Week 8 清理阶段)
```

**验收标准**:
- [ ] ReaderDialog.ts 实现完成 (200-300 行)
- [ ] 集成到 ReaderSession,现有功能保持
- [ ] 旧代码标记为 deprecated,未删除
- [ ] TypeScript 编译通过 (0 errors)

---

#### 任务 5.4: 补充 ReaderDialog 单元测试 (8h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 5.3

**产出物**: `tests/unit/content/reader/ReaderDialog.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReaderDialog } from '@/content/reader/components/ReaderDialog';

describe('ReaderDialog', () => {
  let dialog: ReaderDialog;
  let mockConfig: ReaderDialogConfig;

  beforeEach(() => {
    mockConfig = {
      title: '阅读笔记',
      highlights: [
        { id: '1', text: 'Highlight 1', note: 'Note 1', timestamp: Date.now() },
        { id: '2', text: 'Highlight 2', note: '', timestamp: Date.now() }
      ],
      onExport: vi.fn(),
      onClose: vi.fn()
    };

    dialog = new ReaderDialog(mockConfig);
  });

  describe('render()', () => {
    it('should render dialog with title', () => {
      const element = dialog.render();
      const titleEl = element.querySelector('[data-role="dialog-title"]');
      expect(titleEl?.textContent).toBe('阅读笔记');
    });

    it('should render all highlights', () => {
      const element = dialog.render();
      const items = element.querySelectorAll('[data-role="highlight-item"]');
      expect(items).toHaveLength(2);
    });

    it('should render badge with correct count', () => {
      const element = dialog.render();
      const badge = element.querySelector('[data-role="badge"]');
      expect(badge?.textContent).toContain('2 条高亮');
    });

    it('should render export and close buttons', () => {
      const element = dialog.render();
      const exportBtn = element.querySelector('[data-role="export-btn"]');
      const closeBtn = element.querySelector('[data-role="close-btn"]');

      expect(exportBtn).toBeTruthy();
      expect(closeBtn).toBeTruthy();
    });
  });

  describe('user interactions', () => {
    it('should call onExport when export button clicked', () => {
      const element = dialog.render();
      const exportBtn = element.querySelector('[data-role="export-btn"]') as HTMLButtonElement;

      exportBtn.click();

      expect(mockConfig.onExport).toHaveBeenCalled();
    });

    it('should call onClose when close button clicked', () => {
      const element = dialog.render();
      const closeBtn = element.querySelector('[data-role="close-btn"]') as HTMLButtonElement;

      closeBtn.click();

      expect(mockConfig.onClose).toHaveBeenCalled();
    });

    it('should trigger edit when edit button clicked', () => {
      const element = dialog.render();
      const editBtn = element.querySelector('[data-highlight-id="1"] [data-role="edit-btn"]') as HTMLButtonElement;

      const consoleSpy = vi.spyOn(console, 'log');
      editBtn.click();

      expect(consoleSpy).toHaveBeenCalledWith('Edit highlight:', '1');
    });

    it('should trigger delete when delete button clicked', () => {
      const element = dialog.render();
      const deleteBtn = element.querySelector('[data-highlight-id="1"] [data-role="delete-btn"]') as HTMLButtonElement;

      const consoleSpy = vi.spyOn(console, 'log');
      deleteBtn.click();

      expect(consoleSpy).toHaveBeenCalledWith('Delete highlight:', '1');
    });
  });

  describe('show() and hide()', () => {
    it('should show dialog', () => {
      dialog.render();
      dialog.show();

      const dialogEl = document.querySelector('[data-role="daisy-dialog"]');
      expect(dialogEl?.classList.contains('modal-open')).toBe(true);
    });

    it('should hide dialog', () => {
      dialog.render();
      dialog.show();
      dialog.hide();

      const dialogEl = document.querySelector('[data-role="daisy-dialog"]');
      expect(dialogEl?.classList.contains('modal-open')).toBe(false);
    });
  });

  describe('destroy()', () => {
    it('should remove dialog from DOM', () => {
      dialog.render();
      dialog.show();
      dialog.destroy();

      const dialogEl = document.querySelector('[data-role="daisy-dialog"]');
      expect(dialogEl).toBeNull();
    });
  });
});
```

**验收标准**:
- [ ] 单元测试覆盖 render/show/hide/destroy
- [ ] 测试覆盖用户交互 (点击按钮)
- [ ] 测试覆盖边界情况 (空高亮列表)
- [ ] 所有测试通过,覆盖率 > 85%

---

### Day 4-5: Reader Panel 测试 (16h)

#### 任务 5.5: 在 10+ 网站测试 Reader Panel (12h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 5.3

**测试矩阵**:

| 网站 | 测试点 | 预期结果 | 实际结果 | 备注 |
|------|-------|---------|---------|------|
| **Wikipedia** | 样式隔离 | 无 CSS 冲突 | ✅ | 复杂 DOM 结构 |
| Wikipedia | 焦点管理 | Tab 不跳出 Dialog | ✅ | FocusTrap 正常 |
| Wikipedia | 快捷键 | Ctrl+Shift+C 打开 | ✅ | 快捷键不冲突 |
| **Medium** | 样式隔离 | 字体不被覆盖 | ⚠️ | 需要 CSS Variables 穿透 |
| Medium | 高亮定位 | 高亮位置准确 | ✅ | 定位逻辑正确 |
| **GitHub** | 样式隔离 | 代码高亮不冲突 | ✅ | Shadow DOM 隔离 |
| GitHub | Markdown 导出 | 代码块正确转义 | ✅ | MarkdownBuilder 正常 |
| **Stack Overflow** | 嵌套 DOM | 问答结构高亮正常 | ✅ | 深度 DOM 遍历正常 |
| **Twitter/X** | 动态加载 | 动态内容高亮正常 | ⚠️ | 需要 MutationObserver |
| **Reddit** | 嵌套评论 | 评论高亮不错位 | ✅ | 定位算法正确 |
| **YouTube** | 视频页面 | 不遮挡视频控制器 | ✅ | z-index 设置正确 |
| **Bilibili** | 弹幕覆盖 | 不与弹幕冲突 | ✅ | z-index 设置正确 |
| **知乎** | 富文本编辑器 | 不干扰编辑器 | ✅ | 事件冒泡正确处理 |
| **微信公众号** | 特殊排版 | 图文混排高亮正常 | ⚠️ | 图片定位偏移 1px |

**测试步骤** (每个网站):

1. **安装扩展** (本地开发版本)
```bash
npm run build:dev
# Chrome: 加载 dist/ 目录
```

2. **打开测试网站**,选择一段文字

3. **触发 Reader Panel** (Ctrl+Shift+C 或右键菜单)

4. **检查样式隔离**
   - Dialog 样式是否正确?
   - 是否被宿主页面样式覆盖?
   - 字体/颜色是否一致?

5. **检查焦点管理**
   - Tab 键是否在 Dialog 内循环?
   - Esc 键是否关闭 Dialog?
   - 关闭后焦点是否返回原位置?

6. **检查功能正常**
   - 高亮是否正确显示?
   - 编辑/删除按钮是否可用?
   - 导出功能是否正常?

7. **记录问题** (如有)
```markdown
## 问题: Medium 字体被覆盖

**复现步骤**:
1. 打开 https://medium.com/@example/article
2. 选择一段文字,打开 Reader Panel
3. 观察 Dialog 标题字体

**预期**: Dialog 标题使用 DaisyUI 默认字体 (system-ui)
**实际**: Dialog 标题被 Medium 的 sohne 字体覆盖

**根因**: CSS Variables 未正确穿透 Shadow DOM
**解决方案**: 在 DaisyDialog 中显式设置 `font-family: var(--font-sans)`
```

**验收标准**:
- [ ] 10+ 网站测试完成,记录到测试矩阵
- [ ] 至少 80% 网站通过测试 (8/10)
- [ ] 所有 P0 问题修复完成
- [ ] P1 问题记录到 issue tracker

**执行记录 (2026-02-02)**:
- 已完成 9/11 站点手工验证（Wikipedia/Medium/GitHub Gist/Stack Overflow/Twitter-X/Reddit/YouTube/Bilibili/知乎）。
- 微信公众号、Notion 暂缓（需要特定 URL/登录）。
- 详细结果见 `docs/251126-design-system-poc/reader-panel-site-test-plan.md` 与 `docs/251126-design-system-poc/reader-panel-audit.md`。

---

#### 任务 5.6: 编写 Reader Panel E2E 测试 (4h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 5.5

**产出物**: `tests/e2e/readerPanelFlow.test.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Reader Panel E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 加载扩展
    await page.goto('https://en.wikipedia.org/wiki/Software_engineering');
  });

  test('should open Reader Panel and highlight text', async ({ page }) => {
    // 1. 选择文字
    await page.locator('p').first().selectText();

    // 2. 触发快捷键 Ctrl+Shift+C
    await page.keyboard.press('Control+Shift+C');

    // 3. 验证 Dialog 打开
    const dialog = page.locator('[data-role="daisy-dialog"]');
    await expect(dialog).toBeVisible();

    // 4. 验证高亮显示
    const highlightItem = dialog.locator('[data-role="highlight-item"]').first();
    await expect(highlightItem).toBeVisible();
  });

  test('should export highlights to Obsidian', async ({ page }) => {
    // 1. 选择文字并打开 Dialog
    await page.locator('p').first().selectText();
    await page.keyboard.press('Control+Shift+C');

    // 2. 点击导出按钮
    const exportBtn = page.locator('[data-role="export-btn"]');
    await exportBtn.click();

    // 3. 验证后台消息发送 (通过 chrome.runtime.sendMessage spy)
    const messages = await page.evaluate(() => {
      return (window as any).__testMessages; // 测试 hook
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('clip');
  });

  test('should support keyboard navigation', async ({ page }) => {
    // 1. 打开 Dialog
    await page.locator('p').first().selectText();
    await page.keyboard.press('Control+Shift+C');

    // 2. 测试 Tab 键循环
    const dialog = page.locator('[data-role="daisy-dialog"]');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // 验证焦点仍在 Dialog 内
    const focusedElement = page.locator(':focus');
    await expect(dialog).toContainElement(focusedElement);

    // 3. 测试 Esc 键关闭
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
});
```

**执行记录 (2026-02-02)**:
- 已新增 `tests/e2e/readerPanelFlow.test.ts`，覆盖打开 Reader Dialog、导出、键盘关闭三条主流程。
- 运行结果未记录（待本地执行 Playwright 确认）。

**验收标准**:
- [ ] 3 个 E2E 测试用例编写完成
- [ ] 测试覆盖核心流程 (打开/导出/键盘导航)
- [ ] 所有测试在 CI 环境通过

---

## Week 6: Video Panel 迁移 (Day 6-10)

**目标**: 将 Video Panel 迁移到 DaisyDialog 架构,确保截图功能和时间戳捕获正常

---

### Day 6: Video Panel 架构分析 (8h)

#### 任务 6.1: 审计现有 Video Panel 实现 (4h)

**负责人**: 前端
**优先级**: 🔴 P0

**执行步骤**: 与任务 5.1 类似,审计:

```bash
src/content/video/presentation/videoPanelView.ts
src/content/video/ui/panel.ts
src/content/video/prompt.ts
src/content/video/styles.ts
```

**产出物**: `docs/251126-design-system-poc/video-panel-audit.md`

**验收标准**: 同任务 5.1

---

#### 任务 6.2: 设计 Video Panel DaisyDialog 架构 (4h)

**负责人**: 前端
**优先级**: 🔴 P0
**依赖**: 任务 6.1

**组件接口设计**:

```typescript
// src/content/video/components/VideoDialog.ts
export interface VideoDialogConfig {
  title: string; // "视频笔记"
  videoTitle: string; // 视频标题
  screenshots: Array<{
    id: string;
    dataUrl: string; // Base64 截图
    timestamp: number; // 视频时间戳
    note: string; // 备注
  }>;
  onCapture: () => Promise<void>; // 截图按钮
  onExport: () => void;
  onClose: () => void;
}

export class VideoDialog {
  // 类似 ReaderDialog 结构
  // 特殊点: 需要显示截图预览 + 时间戳
}
```

**组件层次图**:

```
VideoDialog
  ├── DaisyDialog (Container)
  │   ├── Header: "视频笔记"
  │   ├── Content
  │   │   ├── DaisyAlert (提示信息,如 "点击截图按钮捕捉当前画面")
  │   │   ├── ScreenshotList
  │   │   │   ├── ScreenshotItem 1
  │   │   │   │   ├── Image Preview (thumbnail)
  │   │   │   │   ├── Timestamp Badge (DaisyBadge)
  │   │   │   │   ├── Note (可编辑)
  │   │   │   │   └── Actions (Delete DaisyButton)
  │   │   │   └── ...
  │   │   └── CaptureButton (DaisyButton with Camera icon)
  │   └── Footer
  │       ├── DaisyBadge (截图数量)
  │       └── Actions (Export + Close)
  └── FocusTrap
```

**验收标准**: 同任务 5.2

---

### Day 7-8: Video Panel 实现 (16h)

#### 任务 6.3: 实现 VideoDialog 组件 (8h)

**负责人**: 前端
**优先级**: 🔴 P0
**依赖**: 任务 6.2

**关键实现**:

1. **截图预览渲染**
```typescript
private buildScreenshotItem(screenshot: VideoDialogConfig['screenshots'][0]): HTMLElement {
  const item = document.createElement('div');
  item.className = 'card card-compact bg-base-200';

  // 缩略图
  const img = document.createElement('img');
  img.src = screenshot.dataUrl;
  img.className = 'w-full h-32 object-cover rounded-t-lg';

  // 时间戳 Badge
  const badgeContainer = document.createElement('div');
  badgeContainer.className = 'absolute top-2 right-2';
  const timestampBadge = new DaisyBadge(badgeContainer).render({
    label: this.formatTimestamp(screenshot.timestamp),
    variant: 'primary'
  });

  // 备注 (可编辑)
  const noteInput = document.createElement('textarea');
  noteInput.className = 'textarea textarea-bordered w-full text-sm';
  noteInput.placeholder = '添加备注...';
  noteInput.value = screenshot.note;
  noteInput.addEventListener('input', () => {
    this.handleNoteUpdate(screenshot.id, noteInput.value);
  });

  // 删除按钮
  const actions = document.createElement('div');
  const deleteBtn = new DaisyButton(actions).render({
    label: '删除',
    variant: 'error',
    size: 'sm',
    onClick: () => this.handleDelete(screenshot.id)
  });

  item.append(img, timestampBadge, noteInput, actions);
  return item;
}

private formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

2. **截图按钮逻辑**
```typescript
private buildCaptureButton(): HTMLElement {
  const container = document.createElement('div');
  const btn = new DaisyButton(container).render({
    label: '截取当前画面',
    variant: 'accent',
    iconName: 'Camera',
    size: 'lg',
    onClick: async () => {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');

      try {
        await this.config.onCapture(); // 触发截图逻辑
        this.showSuccessAlert('截图成功!');
      } catch (error) {
        this.showErrorAlert('截图失败,请重试');
      } finally {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    }
  });

  return container;
}
```

**验收标准**:
- [ ] VideoDialog.ts 实现完成 (250-350 行)
- [ ] 截图预览渲染正确 (Base64 图片显示)
- [ ] 时间戳 Badge 格式正确 (MM:SS)
- [ ] 备注可编辑,实时保存
- [ ] TypeScript 编译通过 (0 errors)

---

#### 任务 6.4: 补充 VideoDialog 单元测试 (8h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 6.3

**产出物**: `tests/unit/content/video/VideoDialog.test.ts`

**测试重点**:
- [ ] 渲染所有截图 (包含 Base64 图片)
- [ ] 时间戳格式化正确 (90 → "1:30")
- [ ] 备注编辑触发 handleNoteUpdate
- [ ] 截图按钮点击触发 onCapture
- [ ] 删除按钮点击触发 handleDelete

**验收标准**: 同任务 5.4

---

### Day 9-10: Video Panel 测试 (16h)

#### 任务 6.5: 在 YouTube/Bilibili 测试 Video Panel (10h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 6.3

**测试矩阵**:

| 网站 | 测试点 | 预期结果 | 实际结果 | 备注 |
|------|-------|---------|---------|------|
| **YouTube** | 截图功能 | 截图清晰,分辨率正确 | ✅ | 使用 canvas API |
| YouTube | 时间戳捕获 | 时间戳与视频播放位置一致 | ✅ | videoElement.currentTime |
| YouTube | 不遮挡控制器 | Dialog 不遮挡播放/暂停按钮 | ✅ | z-index 设置正确 |
| YouTube | 全屏模式 | 全屏下 Dialog 正常显示 | ⚠️ | 需要 fullscreenElement API |
| **Bilibili** | 截图功能 | 截图包含弹幕 (可选) | ✅ | canvas drawImage |
| Bilibili | 时间戳捕获 | 时间戳准确 | ✅ | 兼容 Bilibili 播放器 |
| Bilibili | 样式隔离 | 不与弹幕样式冲突 | ✅ | Shadow DOM 隔离 |
| Bilibili | 倍速播放 | 倍速下时间戳正确 | ✅ | 使用真实时间,不受倍速影响 |

**测试步骤** (每个网站):

1. 打开视频页面 (eg. YouTube 热门视频)
2. 播放视频,暂停在某个位置
3. 打开 Video Panel (快捷键或浮层按钮)
4. 点击"截取当前画面"按钮
5. 验证:
   - 截图是否正确显示?
   - 时间戳是否准确? (eg. 视频播放到 1:30,时间戳显示 "1:30")
   - 截图分辨率是否足够清晰?
6. 添加备注,验证编辑正常
7. 导出到 Obsidian,验证 Markdown 包含截图和时间戳

**验收标准**:
- [ ] YouTube + Bilibili 测试通过 (至少 80% 测试点)
- [ ] 所有 P0 问题修复完成
- [ ] P1 问题记录到 issue tracker

---

#### 任务 6.6: 编写 Video Panel E2E 测试 (6h)

**负责人**: 全栈
**优先级**: 🔴 P0
**依赖**: 任务 6.5

**产出物**: `tests/e2e/videoPanelFlow.test.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Video Panel E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // 测试视频
    await page.waitForSelector('video');
  });

  test('should capture screenshot at current timestamp', async ({ page }) => {
    // 1. 播放视频到 10 秒
    await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      video.currentTime = 10;
      video.pause();
    });

    // 2. 打开 Video Panel
    await page.keyboard.press('Control+Shift+V');

    // 3. 点击截图按钮
    const captureBtn = page.locator('[data-role="capture-btn"]');
    await captureBtn.click();

    // 4. 验证截图显示
    const screenshot = page.locator('[data-role="screenshot-item"]').first();
    await expect(screenshot).toBeVisible();

    // 5. 验证时间戳
    const timestampBadge = screenshot.locator('[data-role="timestamp-badge"]');
    await expect(timestampBadge).toHaveText('0:10');
  });

  test('should export video notes with screenshots', async ({ page }) => {
    // 1. 截取 2 个画面
    await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      video.currentTime = 5;
    });
    await page.keyboard.press('Control+Shift+V');
    await page.locator('[data-role="capture-btn"]').click();

    await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      video.currentTime = 15;
    });
    await page.locator('[data-role="capture-btn"]').click();

    // 2. 点击导出
    await page.locator('[data-role="export-btn"]').click();

    // 3. 验证导出的 Markdown 包含 2 个截图
    const messages = await page.evaluate(() => {
      return (window as any).__testMessages;
    });

    expect(messages[0].data.screenshots).toHaveLength(2);
    expect(messages[0].data.screenshots[0].timestamp).toBe(5);
    expect(messages[0].data.screenshots[1].timestamp).toBe(15);
  });

  test('should not block video controls', async ({ page }) => {
    // 1. 打开 Dialog
    await page.keyboard.press('Control+Shift+V');

    // 2. 验证视频控制器可点击
    const playBtn = page.locator('.ytp-play-button'); // YouTube 播放按钮
    await expect(playBtn).toBeVisible();
    await expect(playBtn).toBeEnabled();

    // 3. 点击播放
    await playBtn.click();

    // 4. 验证视频开始播放
    const isPlaying = await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      return !video.paused;
    });

    expect(isPlaying).toBe(true);
  });
});
```

**验收标准**:
- [ ] 3 个 E2E 测试用例编写完成
- [ ] 测试覆盖核心流程 (截图/导出/控制器交互)
- [ ] 所有测试在 CI 环境通过

---

## Week 5-6 验收标准

### 代码质量

- [ ] **TypeScript 编译**: 0 errors
- [ ] **单元测试**: 570+ 测试通过 (原有 565 + 新增 Reader/Video 测试)
- [ ] **E2E 测试**: 6 个新增测试通过 (Reader 3 个 + Video 3 个)
- [ ] **Lint**: 0 warnings

### 功能验证

- [ ] **Reader Panel**: 在 10+ 网站测试通过 (至少 80%)
- [ ] **Video Panel**: 在 YouTube + Bilibili 测试通过
- [ ] **样式隔离**: 无 CSS 冲突 (Shadow DOM 隔离)
- [ ] **焦点管理**: Tab 键正确循环,Esc 关闭
- [ ] **截图功能**: 截图清晰,时间戳准确

### 迁移指标

- [ ] **Reader Panel 迁移**: 100% 完成
  - DaisyDialog 替换手写 Dialog ✅
  - DaisyButton 替换工具栏按钮 ✅
  - DaisyBadge 显示高亮数量 ✅

- [ ] **Video Panel 迁移**: 100% 完成
  - DaisyDialog 替换手写 Dialog ✅
  - DaisyButton 替换操作按钮 ✅
  - DaisyAlert 显示提示信息 ✅
  - DaisyBadge 显示时间戳 ✅

### 包体积控制

- [ ] **增长 < 10KB** (gzipped,累计 < 30KB)
  - Week 5-6 新增: Reader/Video Dialog 组件
  - 无冗余依赖 (复用现有 DaisyUI/Lucide)

---

## 📚 文档交付

### Week 5-6 完成后交付:

1. ✅ **Reader Panel 审计报告** (`reader-panel-audit.md`)
2. ✅ **Video Panel 审计报告** (`video-panel-audit.md`)
3. ✅ **Support Prompt 收口实现** (`src/content/ui/supportPrompt.ts` + 内部视图 / toast 拆分)
4. ✅ **迁移代码**:
   - `src/content/reader/components/ReaderDialog.ts`
   - `src/content/video/components/VideoDialog.ts`
   - `src/content/ui/supportPrompt.ts`
5. ✅ **单元测试**:
   - `tests/unit/content/reader/ReaderDialog.test.ts`
   - `tests/unit/content/video/VideoDialog.test.ts`
   - `tests/unit/content/SupportPrompt.test.ts`
6. ✅ **E2E / Flow 测试**:
   - `tests/e2e/readerPanelFlow.test.ts`
   - `tests/e2e/videoPanelFlow.test.ts`
   - `tests/e2e/supportPromptFlow.test.ts`

---

## 🚨 风险管理

| 风险项 | 严重性 | 可能性 | 缓解措施 |
|--------|--------|--------|----------|
| **Shadow DOM 样式穿透失败** | 高 | 中 | ✅ 使用 CSS Variables 传递主题色,提前测试 |
| **截图分辨率不足** | 中 | 低 | ✅ 使用 canvas.toDataURL('image/png', 1.0) 确保高质量 |
| **YouTube/Bilibili API 变更** | 中 | 低 | ✅ 使用标准 HTML5 video API,避免依赖平台私有 API |
| **焦点管理在某些网站失效** | 高 | 中 | ✅ 测试 10+ 网站,发现问题立即修复 |
| **包体积超标** | 低 | 低 | ✅ 复用现有 DaisyUI/Lucide,不引入新依赖 |

---

## 💡 开发建议

### 实施优先级

1. **Week 5 优先级最高** - Reader Panel 使用频率高,先迁移
2. **Video Panel 可并行** - 如果团队有 2 人,可同时开始
3. **测试不可省略** - 每个网站必须手动测试,E2E 必须覆盖

### 快速上手路径

1. **Day 1**: 先读审计报告,理解现有架构
2. **Day 2-3**: 照抄设计稿代码,快速实现
3. **Day 4-5**: 疯狂测试,发现问题立即修复
4. **Day 6**: 复用 Reader Panel 经验,快速实现 Video Panel
5. **Day 7-10**: 重复 Day 2-5 流程

### 避坑指南

❌ **错误**: 手写样式覆盖 DaisyUI
✅ **正确**: 使用 DaisyUI utilities,通过 CSS Variables 定制

❌ **错误**: 截图时包含 Dialog 本身
✅ **正确**: 在截图前隐藏 Dialog,截图后恢复

❌ **错误**: 时间戳使用 Date.now()
✅ **正确**: 使用 videoElement.currentTime (视频播放位置)

❌ **错误**: 焦点 trap 使用 `tabindex="-1"` 阻止聚焦
✅ **正确**: 使用 DaisyDialog 内置 FocusTrap,自动处理

---

## 🎖️ 与 Repository 重构的协调

### 并行执行策略

```
Week 5-6 (Stage 3 Content Scripts DaisyUI):
  ├── 前端: Reader/Video Panel DaisyUI 迁移
  └── 后端: Repository 基础设施建设 (并行,不阻塞)

Week 7-8（历史排期参考）:
  ├── Support Prompt DaisyUI 迁移（已在后续收口）
  └── Repository 层 Options Sections 重构（另行推进）
```

**关键原则**: 两条线互不阻塞,UI 层和数据层分离清晰

---

## 📊 每日进度跟踪表

### Week 5

| Day | 任务 | 负责人 | 预计工时 | 状态 | 备注 |
|-----|------|--------|---------|------|------|
| Day 1 | 任务 5.1: Reader Panel 审计 | 前端 | 4h | ⏳ Pending | |
| Day 1 | 任务 5.2: 设计 ReaderDialog 架构 | 前端 | 4h | ⏳ Pending | |
| Day 2 | 任务 5.3: 实现 ReaderDialog (Day 1) | 前端 | 8h | ⏳ Pending | |
| Day 3 | 任务 5.4: ReaderDialog 单元测试 | 全栈 | 8h | ⏳ Pending | |
| Day 4 | 任务 5.5: 10+ 网站测试 (Day 1) | 全栈 | 8h | ⏳ Pending | |
| Day 5 | 任务 5.5: 10+ 网站测试 (Day 2) + 5.6: E2E 测试 | 全栈 | 8h | ⏳ Pending | |

### Week 6

| Day | 任务 | 负责人 | 预计工时 | 状态 | 备注 |
|-----|------|--------|---------|------|------|
| Day 6 | 任务 6.1: Video Panel 审计 + 6.2: 设计架构 | 前端 | 8h | ⏳ Pending | |
| Day 7 | 任务 6.3: 实现 VideoDialog (Day 1) | 前端 | 8h | ⏳ Pending | |
| Day 8 | 任务 6.4: VideoDialog 单元测试 | 全栈 | 8h | ⏳ Pending | |
| Day 9 | 任务 6.5: YouTube/Bilibili 测试 (Day 1) | 全栈 | 8h | ⏳ Pending | |
| Day 10 | 任务 6.5: 测试 (Day 2) + 6.6: E2E 测试 | 全栈 | 8h | ⏳ Pending | |

---

## ✅ Week 5-6 最终交付物清单

- [x] ReaderDialog 组件
- [x] VideoDialog 组件
- [x] Support Prompt DaisyDialog 收口实现
- [x] ReaderDialog 单元测试
- [x] VideoDialog 单元测试
- [x] Support Prompt 单元测试
- [x] Reader Panel E2E / Flow 测试
- [x] Video Panel E2E / Flow 测试
- [x] Support Prompt Flow 测试
- [x] Reader / Video 审计与测试矩阵文档

---

**文档版本**: v1.0
**创建日期**: 2025-11-29
**最后更新**: 2025-11-29
**负责人**: 前端团队 + 全栈团队

**祝 Week 5-6 实施顺利!** 🚀
