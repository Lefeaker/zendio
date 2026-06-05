# 多语言功能快速开始

## 🎉 新功能：多语言支持

Zendio 现在支持 **简体中文**、**English** 和 **日本語**！

## 🚀 快速使用

### 1. 重新加载扩展

```
1. 打开 chrome://extensions/
2. 找到 "Zendio"
3. 点击 "重新加载" 按钮 🔄
```

### 2. 切换语言

```
1. 右键点击扩展图标 → 选择 "选项"
2. 在页面顶部找到 "语言设置" / "Language Settings" / "言語設定"
3. 从下拉菜单选择你喜欢的语言
4. 页面会自动更新！✨
```

### 3. 享受多语言体验

- ✅ 所有设置页面文字
- ✅ 右键菜单项
- ✅ 剪藏对话框
- ✅ 通知消息

全部支持你选择的语言！

## 📝 支持的语言

| 语言     | 代码  | 状态        |
| -------- | ----- | ----------- |
| 简体中文 | zh-CN | ✅ 完整支持 |
| English  | en    | ✅ 完整支持 |
| 日本語   | ja    | ✅ 完整支持 |

## 🔧 技术细节

### 文件结构

```
src/i18n/
├── index.ts       # i18n 工具函数
└── locales.ts     # 所有语言翻译
```

### 使用方法

#### 在 HTML 中

```html
<h2 data-i18n="apiConfigTitle">默认文本</h2>
<input data-i18n-placeholder="vaultNamePlaceholder" />
```

#### 在 TypeScript 中

```typescript
import { getMessages } from '../i18n';

const msgs = await getMessages();
console.log(msgs.saveSuccess);
```

## 📚 更多信息

- 详细说明：查看 `多语言功能说明.md`
- 测试指南：查看 `多语言测试指南.md`

## 🐛 问题反馈

如果发现翻译问题或有改进建议，欢迎反馈！

---

**Enjoy your multilingual experience! 🌍**
