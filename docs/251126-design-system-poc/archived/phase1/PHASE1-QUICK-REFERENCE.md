# Phase 1 迁移快速参考

**用途**: 开发者迁移组件时的快速查询手册
**完整文档**: [PHASE1-MIGRATION-GUIDE.md](./PHASE1-MIGRATION-GUIDE.md)

---

## 🚀 快速开始

```bash
# 1. 创建分支
git checkout -b feat/daisyui-<component>-migration

# 2. 安装依赖（如果需要）
npm install

# 3. 构建测试
npm run tailwind:build
npm run build:dev

# 4. 开始迁移
# 参考下面的映射表
```

---

## 📋 类名映射速查表

### Button 映射

| Before (Tailwind Utilities) | After (DaisyUI) | 说明 |
|------------------------------|-----------------|------|
| `px-4 py-2 bg-accent text-white rounded-md` | `btn btn-primary` | 主要按钮 |
| `px-4 py-2 border border-gray-300 rounded-md` | `btn btn-outline` | 描边按钮 |
| `px-4 py-2 hover:bg-gray-100` | `btn btn-ghost` | 幽灵按钮 |
| `px-2 py-1 text-sm ...` | `btn btn-sm` | 小按钮 |
| `px-6 py-3 text-lg ...` | `btn btn-lg` | 大按钮 |
| `w-8 h-8 rounded-full ...` | `btn btn-circle` | 圆形按钮 |
| `disabled:opacity-50` | `btn` + `disabled` 属性 | 禁用状态 |

### Input 映射

| Before (Tailwind Utilities) | After (DaisyUI) | 说明 |
|------------------------------|-----------------|------|
| `w-full px-3 py-2 border rounded-md` | `input input-bordered w-full` | 标准输入框 |
| `border-none bg-transparent` | `input input-ghost w-full` | 无边框输入 |
| `text-sm px-2 py-1` | `input input-sm w-full` | 小输入框 |
| `text-lg px-4 py-3` | `input input-lg w-full` | 大输入框 |
| `focus:ring-2 focus:ring-accent` | `input input-bordered` | Focus 自动处理 |

### Alert 映射

| Before (Tailwind Utilities) | After (DaisyUI) | 说明 |
|------------------------------|-----------------|------|
| `p-4 bg-blue-50 border-blue-200 text-blue-800` | `alert alert-info` | 信息提示 |
| `p-4 bg-green-50 border-green-200 text-green-800` | `alert alert-success` | 成功提示 |
| `p-4 bg-yellow-50 border-yellow-200 text-yellow-800` | `alert alert-warning` | 警告提示 |
| `p-4 bg-red-50 border-red-200 text-red-800` | `alert alert-error` | 错误提示 |

### Card 映射

| Before (Tailwind Utilities) | After (DaisyUI) | 说明 |
|------------------------------|-----------------|------|
| `p-4 border rounded-lg shadow-sm` | `card bg-base-100 shadow-xl` | 标准卡片 |
| `p-2 border rounded` | `card card-compact` | 紧凑卡片 |
| `border-2 border-accent` | `card card-bordered` | 边框卡片 |
| `flex-row ...` | `card card-side` | 水平卡片 |

### Modal 映射

| Before (Custom) | After (DaisyUI) | 说明 |
|-----------------|-----------------|------|
| `fixed inset-0 bg-black/50` | `<dialog class="modal">` | 原生 dialog |
| `aobx-modal__dialog` | `modal-box` | 对话框内容 |
| `aobx-modal__header` | `modal-box` 内的标题 | 标题区域 |
| `aobx-modal__body` | `modal-box` 内的内容 | 内容区域 |
| `aobx-modal__actions` | `modal-action` | 操作按钮区域 |

---

## 🛠️ 代码模板

### Button 创建

```typescript
import { createButton } from '../shared/DaisyUIHelpers';

// 基础按钮
const btn = createButton('Save', { variant: 'primary' });

// 小按钮
const smallBtn = createButton('Cancel', { variant: 'ghost', size: 'sm' });

// 加载状态
const loadingBtn = createButton('Processing', { variant: 'primary', loading: true });

// 禁用状态
const disabledBtn = createButton('Submit', { variant: 'primary', disabled: true });
```

### Input 创建

```typescript
import { createInput } from '../shared/DaisyUIHelpers';

// 标准输入框
const input = createInput({ type: 'text', placeholder: 'Enter text...' });

// 小输入框
const smallInput = createInput({ type: 'email', size: 'sm', placeholder: 'Email' });

// 无边框输入
const ghostInput = createInput({ type: 'text', ghost: true });
```

### Alert 创建

```typescript
import { createAlert } from '../shared/DaisyUIHelpers';

// 信息提示
const infoAlert = createAlert('操作成功', { type: 'info' });

// 成功提示（可关闭）
const successAlert = createAlert('保存成功', {
  type: 'success',
  dismissible: true
});

// 错误提示（带图标）
const errorAlert = createAlert('操作失败', {
  type: 'error',
  icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"/>'  // Lucide icon path
});
```

### Card 创建（使用现有 AobFormGroup）

```typescript
import { AobFormGroup } from '../shared/FormComponents';

const cardGroup = new AobFormGroup(container);
cardGroup.render({
  label: '连接设置',
  description: '配置 Obsidian REST API 连接',
  control: inputElement,
  hint: '请确保 Obsidian Local REST API 插件已启用'
});
```

### Modal 创建

```typescript
// HTML 结构
const dialog = document.createElement('dialog');
dialog.className = 'modal';
dialog.innerHTML = `
  <div class="modal-box">
    <h3 class="font-bold text-lg">对话框标题</h3>
    <p class="py-4">对话框内容</p>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">关闭</button>
      </form>
    </div>
  </div>
`;

// 打开/关闭
dialog.showModal();  // 打开
dialog.close();      // 关闭
```

---

## ✅ 自查清单

**迁移前**:
- [ ] 阅读完整迁移指南
- [ ] 了解要迁移的组件当前实现
- [ ] 创建功能分支

**迁移中**:
- [ ] 使用 DaisyUI 语义类替换 Tailwind utilities
- [ ] 移除冗余的 hover/focus 样式
- [ ] 保持现有 API 不变（或提供适配层）
- [ ] 添加代码注释

**迁移后**:
- [ ] 运行 `npm run lint` - 无错误
- [ ] 运行 `npm run typecheck:app` - 无错误
- [ ] 运行 `npm run test:unit` - 全部通过
- [ ] 运行 `npm run build` - 构建成功
- [ ] 检查包体积增幅 < 5%
- [ ] 手动测试所有变体（hover、focus、disabled）
- [ ] 测试暗色模式
- [ ] 更新文档
- [ ] 提交 PR

---

## 🎯 测试命令

```bash
# 代码质量
npm run lint                      # ESLint 检查
npm run lint:options-css          # Stylelint 检查
npm run typecheck:app             # TypeScript 类型检查

# 测试
npm run test:unit                 # 所有单元测试
npm run test:unit -- Button       # 特定组件测试
npm run test:unit -- --coverage   # 带覆盖率

# 构建
npm run tailwind:build            # 构建 Tailwind CSS
npm run build:dev                 # 开发构建
npm run build                     # 生产构建

# 包体积检查
ls -lh build/dist/options/index.js
ls -lh build/dist/options/styles/tailwind.css
```

---

## 🐛 常见问题速查

### Q: DaisyUI 类不生效？

```bash
# 解决方案
npm run tailwind:build           # 重新构建
grep "\.btn{" src/options/styles/tailwind.css  # 验证类存在
# 清除浏览器缓存并重载扩展
```

### Q: 颜色不正确？

```typescript
// ❌ 错误
button.className = 'btn bg-purple-600';

// ✅ 正确
button.className = 'btn btn-primary';
```

### Q: 暗色模式异常？

```typescript
// ❌ 避免硬编码颜色
.my-button { background: #ffffff; }

// ✅ 使用 DaisyUI 语义类（自动适配）
<button class="btn btn-primary">Button</button>
```

### Q: 测试失败？

```bash
# 检查是否缺少依赖
npm install

# 清除缓存重新测试
npm run test:unit -- --clearCache
```

---

## 📦 工厂函数 API

### createButton(text, options)

```typescript
createButton('保存', {
  variant: 'primary' | 'secondary' | 'accent' | 'ghost' | 'outline',
  size: 'xs' | 'sm' | 'md' | 'lg',
  shape: 'circle' | 'square',
  disabled: boolean,
  loading: boolean
});
```

### createInput(options)

```typescript
createInput({
  type: 'text' | 'number' | 'email' | 'password' | 'search',
  placeholder: string,
  bordered: boolean,  // 默认 true
  ghost: boolean,
  size: 'xs' | 'sm' | 'md' | 'lg',
  disabled: boolean
});
```

### createAlert(message, options)

```typescript
createAlert('操作成功', {
  type: 'info' | 'success' | 'warning' | 'error',
  icon: string,  // SVG 字符串或 Lucide icon name
  dismissible: boolean
});
```

---

## 📖 参考资源

- **完整指南**: [PHASE1-MIGRATION-GUIDE.md](./PHASE1-MIGRATION-GUIDE.md)
- **POC 总结**: [POC-SUMMARY.md](./POC-SUMMARY.md)
- **DaisyUI 官方文档**: https://daisyui.com/components/
- **Tailwind 文档**: https://tailwindcss.com/docs
- **项目 README**: `src/options/README.md`

---

## 💡 提示

**优先级记忆**:
- 🚨 P0 = 必须先做（Button、Input）
- 🔥 P1 = 尽快完成（Alert、Card）
- ⚠️ P2 = 可以延后（Modal）

**质量门禁记忆（5个零）**:
1. ✅ 0 lint errors
2. ✅ 0 typecheck errors
3. ✅ 0 test failures
4. ✅ ~0% bundle size increase
5. ✅ 0 visual regressions

**迁移口诀**:
> 语义类优先，utilities 补充，
> 自定义最少，文档要同步。

---

**最后更新**: 2025-11-26
