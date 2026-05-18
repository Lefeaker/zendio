# 隐私设置使用说明

## 概述

隐私设置功能已成功集成到 AiiinOB 扩展的选项页面中。用户可以通过这个界面控制数据收集和错误报告的设置。

## 功能特性

### ✅ 用户可见功能

1. **隐私设置界面**
   - 位置：扩展选项页面 → "隐私与数据" 部分
   - 包含两个主要开关：使用分析 和 错误报告
   - 详细说明收集和不收集的数据类型

2. **用户控制选项**
   - ✅ **使用分析**：收集匿名使用统计
   - ✅ **错误报告**：自动发送匿名错误报告
   - 🔘 **保存设置**：保存用户的隐私偏好
   - 🗑️ **清除所有数据**：删除已收集的分析数据

3. **透明度信息**
   - **收集的信息**：错误类型、浏览器版本、扩展版本、时间戳
   - **不收集的信息**：个人身份信息、访问网址、剪藏内容、密码

### 🔧 开发者功能

1. **错误分析系统**
   - 统一错误码方案
   - Google Analytics 4 集成
   - 数据匿名化处理
   - 实时错误监控

2. **隐私合规**
   - GDPR/CCPA 合规
   - 用户明确同意
   - 数据最小化原则
   - 随时撤销权利

## 使用方法

### 用户操作

1. **打开选项页面**
   - 右键点击扩展图标 → "选项"
   - 或者在扩展管理页面点击"选项"

2. **找到隐私设置**
   - 滚动到"隐私与数据"部分
   - 该部分有一个锁图标 🔒

3. **配置隐私偏好**
   - 勾选或取消勾选"使用分析"
   - 勾选或取消勾选"错误报告"
   - 点击"保存设置"按钮

4. **查看详细信息**
   - 点击"了解收集的信息"展开详情
   - 查看收集和不收集的数据类型

5. **清除数据（可选）**
   - 点击"清除所有数据"按钮
   - 确认删除所有已收集的分析数据

### 开发者操作

1. **配置 Google Analytics**

   ```typescript
   // 在 src/shared/errors/analytics/analyticsConfig.ts 中
   export const GA4_CONFIG = {
     MEASUREMENT_ID: 'G-YOUR-MEASUREMENT-ID',
     API_SECRET: 'YOUR_API_SECRET'
     // ...
   };
   ```

2. **初始化错误分析**

   ```typescript
   // 在扩展启动时
   import { initializeErrorAnalytics } from './shared/errors/analytics';
   await initializeErrorAnalytics();
   ```

3. **使用标准化错误码**

   ```typescript
   import { STANDARDIZED_ERROR_CODES } from './shared/errors/errorCodes';
   import { handleError } from './shared/errors';

   await handleError({
     code: STANDARDIZED_ERROR_CODES.EXTRACTION_CONTENT_NO_MARKDOWN,
     domain: 'extraction',
     message: 'Content extraction failed',
     severity: 'error',
     recoverable: true,
     context: { timestamp: Date.now() }
   });
   ```

## 技术实现

### 文件结构

```
AiiinOB/
├── src/options/components/
│   └── privacySettings.ts              # 隐私设置 UI 组件
├── src/shared/errors/analytics/
│   ├── analyticsConfig.ts              # GA4 配置管理
│   ├── googleAnalyticsReporter.ts      # GA4 错误报告器
│   ├── dataSanitizer.ts               # 数据匿名化工具
│   └── index.ts                       # 统一导出
├── src/i18n/
│   ├── messages.ts                    # 消息接口定义
│   └── locales/                       # 多语言翻译
└── docs/
    ├── error-analytics-integration-guide.md
    ├── google-analytics-dashboard-setup.md
    └── privacy-settings-usage.md      # 本文档
```

### 关键组件

1. **PrivacySettings 类**
   - 渲染隐私设置 UI
   - 处理用户交互
   - 管理同意状态

2. **AnalyticsConfigManager 类**
   - 存储用户同意状态
   - 管理 GA4 配置
   - 处理数据清理

3. **GoogleAnalyticsReporter 类**
   - 发送错误到 GA4
   - 自动匿名化数据
   - 批量处理机制

## 数据流程

```
用户操作 → 隐私设置组件 → AnalyticsConfigManager → Chrome Storage
                                    ↓
错误发生 → ErrorHandler → GoogleAnalyticsReporter → GA4 (匿名数据)
```

## 隐私保护措施

### 数据匿名化

- **自动清理**：邮箱、IP、用户名、文件路径等
- **最小化收集**：仅收集必要的错误诊断信息
- **无个人标识**：不收集任何可识别用户身份的信息

### 用户控制

- **明确同意**：用户必须主动同意才开始收集
- **细粒度控制**：可分别控制分析和错误报告
- **随时撤销**：用户可随时更改设置
- **数据清理**：提供一键清除所有数据的功能

### 合规性

- **GDPR 合规**：符合欧盟通用数据保护条例
- **CCPA 合规**：符合加州消费者隐私法案
- **透明度**：清楚说明收集的数据类型和用途
- **数据保留**：设置合理的数据保留期限

## 故障排除

### 常见问题

1. **隐私设置不显示**
   - 检查 `privacySettingsContainer` 元素是否存在
   - 确认 `initializePrivacySettings()` 是否被调用
   - 查看浏览器控制台是否有错误

2. **设置保存失败**
   - 检查 Chrome 存储权限
   - 确认 `analyticsConfig.ts` 配置正确
   - 查看网络连接状态

3. **错误报告不工作**
   - 验证 GA4 配置（Measurement ID 和 API Secret）
   - 检查用户是否同意错误报告
   - 确认网络请求是否被阻止

### 调试工具

1. **浏览器控制台**

   ```javascript
   // 检查隐私设置状态
   chrome.storage.local.get(['analytics_user_consent'], console.log);

   // 检查错误分析状态
   console.log('Analytics status:', getErrorAnalyticsStatus());
   ```

2. **GA4 DebugView**
   - 在 GA4 中启用 DebugView
   - 实时查看错误事件数据
   - 验证数据格式和内容

3. **测试脚本**
   ```bash
   # 运行集成测试
   node scripts/test-privacy-settings.cjs
   ```

## 更新和维护

### 添加新的隐私选项

1. 在 `Messages` 接口中添加新的消息定义
2. 在各语言文件中添加翻译
3. 在 `PrivacySettings` 组件中添加 UI 元素
4. 在 `AnalyticsConfigManager` 中添加配置管理

### 更新数据匿名化规则

1. 在 `dataSanitizer.ts` 中添加新的清理规则
2. 更新 `SENSITIVE_PATTERNS` 正则表达式
3. 添加相应的测试用例
4. 验证匿名化效果

通过这个完整的隐私设置系统，AiiinOB 现在为用户提供了透明、可控的数据收集体验，同时为开发者提供了有价值的错误监控数据。
