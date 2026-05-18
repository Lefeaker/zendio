# 错误分析系统集成指南

本指南详细说明如何在 AiiinOB 项目中集成和使用统一的错误码方案配合 Google Analytics 进行错误日志收集。

## 概述

我们的错误分析系统提供：

1. **统一错误码方案** - 标准化的错误分类和命名
2. **Google Analytics 集成** - 自动收集匿名错误数据
3. **隐私保护** - 完全匿名化的数据处理
4. **用户控制** - 用户可选择是否参与数据收集

## 系统架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   应用错误      │───▶│   错误处理器     │───▶│  错误报告器     │
│   (AppError)    │    │ (ErrorHandler)   │    │ (ErrorReporter) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   控制台日志     │    │ Google Analytics│
                       │   通知系统       │    │   (匿名数据)    │
                       └──────────────────┘    └─────────────────┘
```

## 快速开始

### 1. 配置 Google Analytics

#### 1.1 创建 GA4 属性

1. 访问 [Google Analytics](https://analytics.google.com/)
2. 创建新的 GA4 属性
3. 获取 **Measurement ID**（格式：G-XXXXXXXXXX）

#### 1.2 设置配置文件

1. **复制模板文件**：

   ```bash
   cp src/shared/errors/analytics/analyticsConfig.template.ts src/shared/errors/analytics/analyticsConfig.ts
   ```

2. **更新配置**：
   在 `src/shared/errors/analytics/analyticsConfig.ts` 中更新你的 Measurement ID：

   ```typescript
   export const GA4_CONFIG = {
     MEASUREMENT_ID: 'G-YOUR-MEASUREMENT-ID' // 替换为你的实际 Measurement ID
     // ... 其他配置保持不变
   };
   ```

3. **安全说明**：
   - `analyticsConfig.ts` 文件已被添加到 `.gitignore` 中
   - 不会被提交到版本控制，保护你的配置信息
   - 每个开发者需要创建自己的配置文件

### 2. 初始化错误分析系统

在扩展的主入口文件中初始化系统：

```typescript
// src/background/index.ts
import { initializeErrorAnalytics } from '../shared/errors/analytics';

// 在扩展启动时初始化
async function initializeExtension() {
  try {
    // 初始化错误分析系统
    await initializeErrorAnalytics();

    // 其他初始化代码...
  } catch (error) {
    console.error('Extension initialization failed:', error);
  }
}

initializeExtension();
```

### 3. 集成隐私控制

在选项页面中集成隐私设置组件：

```typescript
// src/options/index.ts
import { PrivacySettings } from './components/controls/privacySettings';

async function initializeOptionsPage() {
  // 初始化隐私设置
  const privacyContainer = document.getElementById('privacySettingsContainer');
  if (privacyContainer) {
    const privacySettings = new PrivacySettings(privacyContainer);
    await privacySettings.render();
  }
}

initializeOptionsPage();
```

### 4. 使用标准化错误码

更新现有的错误定义以使用新的标准化错误码：

```typescript
// 旧的错误定义
export const oldErrors = {
  extractionFailed(): AppError {
    return {
      code: 'EXTRACTION_FAILED', // 旧的错误码
      domain: 'extraction'
      // ...
    };
  }
};

// 新的错误定义
import { STANDARDIZED_ERROR_CODES } from '../errorCodes';

export const newErrors = {
  extractionFailed(): AppError {
    return {
      code: STANDARDIZED_ERROR_CODES.EXTRACTION_CONTENT_NO_MARKDOWN, // 标准化错误码
      domain: 'extraction'
      // ...
    };
  }
};
```

## 错误码规范

### 命名规范

错误码采用以下格式：`{DOMAIN}_{CATEGORY}_{SPECIFIC_ERROR}`

- **DOMAIN**: 功能域（如 EXTRACTION, REST, CHROME_API）
- **CATEGORY**: 错误类别（如 CONTENT, NETWORK, PERMISSION）
- **SPECIFIC_ERROR**: 具体错误（如 NO_MARKDOWN, REQUEST_FAILED）

### 示例错误码

```typescript
// 内容提取错误
EXTRACTION_CONTENT_NO_MARKDOWN; // 内容提取未产生 Markdown
EXTRACTION_SELECTION_NO_SELECTION; // 未找到有效选区
EXTRACTION_CONTENT_UNSUPPORTED; // 不支持的内容类型

// 网络请求错误
REST_NETWORK_REQUEST_FAILED; // 网络请求失败
REST_NETWORK_TIMEOUT; // 请求超时
REST_VALIDATION_UNEXPECTED_RESPONSE; // 意外的响应格式

// Chrome API 错误
CHROME_API_PERMISSION_DENIED; // 权限被拒绝
CHROME_API_RUNTIME_ERROR; // 运行时错误
CHROME_API_STORAGE_ACCESS_DENIED; // 存储访问被拒绝
```

### 创建新错误码

使用 `generateErrorCode` 函数创建新的错误码：

```typescript
import { generateErrorCode } from '../errorCodes';

// 生成新的错误码
const newErrorCode = generateErrorCode('content', 'RENDERING', 'UI_FAILED');
// 结果: 'CONTENT_RENDERING_UI_FAILED'
```

## 数据隐私保护

### 自动匿名化

系统会自动清理以下敏感信息：

- 邮箱地址 → `[EMAIL_REDACTED]`
- IP 地址 → `[IP_REDACTED]`
- 用户名 → `[USERNAME_REDACTED]`
- 文件路径 → `[PATH_REDACTED]`
- URL 参数 → `[PARAM_REDACTED]`

### 验证匿名化

可以使用验证函数检查数据是否已充分匿名化：

```typescript
import { validateSanitization, generateSanitizationReport } from '../analytics/dataSanitizer';

const originalError = {
  /* 包含敏感信息的错误 */
};
const sanitizedError = sanitizeErrorForAnalytics(originalError);

// 验证匿名化
const validation = validateSanitization(sanitizedError);
if (!validation.isValid) {
  console.warn('Sanitization issues:', validation.issues);
}

// 生成报告
const report = generateSanitizationReport(originalError, sanitizedError);
console.log('Data reduction:', report.reductionPercentage + '%');
```

## 用户同意管理

### 设置用户同意

```typescript
import { setAnalyticsConsent } from '../analytics/analyticsConfig';

// 用户同意分析和错误报告
await setAnalyticsConsent(true, true);

// 用户只同意错误报告，不同意分析
await setAnalyticsConsent(false, true);

// 用户拒绝所有数据收集
await setAnalyticsConsent(false, false);
```

### 检查同意状态

```typescript
import { getAnalyticsConfigManager } from '../analytics/analyticsConfig';

const configManager = getAnalyticsConfigManager();
const consent = await configManager.getUserConsent();

if (consent?.errorReporting) {
  console.log('User has consented to error reporting');
}
```

## 监控和调试

### 检查系统状态

```typescript
import { getErrorAnalyticsStatus } from '../analytics';

const status = getErrorAnalyticsStatus();
console.log('Analytics Status:', {
  enabled: status.enabled,
  hasReporter: status.hasReporter,
  configLoaded: status.configLoaded
});
```

### 调试模式

在开发环境中启用调试模式：

```typescript
import { getAnalyticsConfigManager } from '../analytics/analyticsConfig';

const configManager = getAnalyticsConfigManager();
await configManager.updateConfig({
  debugMode: true // 启用调试模式
});
```

### 测试错误报告

在开发环境中测试错误报告：

```typescript
import { reportTestError } from '../analytics';

// 发送测试错误（仅在开发模式下工作）
await reportTestError();
```

## 最佳实践

### 1. 错误处理

```typescript
// ✅ 好的做法：使用标准化错误码和丰富的上下文
import { STANDARDIZED_ERROR_CODES } from '../errorCodes';

try {
  await someOperation();
} catch (error) {
  await handleError({
    code: STANDARDIZED_ERROR_CODES.REST_NETWORK_REQUEST_FAILED,
    domain: 'rest',
    message: 'Failed to connect to Obsidian API',
    severity: 'error',
    recoverable: true,
    userMessage: '连接 Obsidian 失败，请检查网络设置',
    context: {
      url: sanitizeUrl(apiUrl),
      method: 'POST',
      retryCount: 3,
      timestamp: Date.now()
    },
    cause: error
  });
}
```

### 2. 上下文信息

```typescript
// ✅ 提供有用的上下文，但避免敏感信息
context: {
  operation: 'clip_article',
  contentType: 'text/html',
  contentLength: 1024,
  extractorUsed: 'readability',
  timestamp: Date.now()
}

// ❌ 避免包含敏感信息
context: {
  userEmail: 'user@example.com',    // 敏感信息
  fullUrl: 'https://site.com/user/123', // 可能包含用户ID
  apiKey: 'secret123'               // 敏感凭据
}
```

### 3. 错误恢复

```typescript
// ✅ 标记错误是否可恢复
{
  code: STANDARDIZED_ERROR_CODES.REST_NETWORK_TIMEOUT,
  recoverable: true,  // 网络超时通常可以重试
  // ...
}

{
  code: STANDARDIZED_ERROR_CODES.CHROME_API_PERMISSION_DENIED,
  recoverable: false, // 权限问题需要用户手动解决
  // ...
}
```

## 故障排除

### 常见问题

1. **错误未出现在 GA4 中**
   - 检查 Measurement ID 和 API Secret
   - 确认用户已同意错误报告
   - 查看浏览器控制台是否有网络错误

2. **数据格式错误**
   - 确认 GA4 中已创建相应的自定义维度
   - 检查事件参数名称是否匹配

3. **隐私设置不生效**
   - 确认隐私设置组件已正确初始化
   - 检查存储权限是否正常

### 调试工具

- 使用 GA4 的 DebugView 查看实时事件
- 启用扩展的调试模式查看详细日志
- 使用浏览器开发者工具检查网络请求

## 更新和维护

### 添加新错误类型

1. 在 `errorCodes.ts` 中添加新的错误码常量
2. 在 `ERROR_CODE_DESCRIPTIONS` 中添加描述
3. 更新相关的错误工厂函数
4. 在 GA4 中创建对应的自定义维度（如需要）

### 版本升级

1. 更新 `analyticsConfig.ts` 中的配置
2. 运行数据迁移脚本（如有）
3. 测试新版本的错误报告功能
4. 更新文档和用户指南

通过遵循本指南，你可以成功集成和使用 AiiinOB 的错误分析系统，获得全面的错误监控和用户隐私保护。
