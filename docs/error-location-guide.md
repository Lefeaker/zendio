# 错误精确定位指南

## 概述

AiiinOB 的错误分析系统在保护用户隐私的前提下，提供了强大的错误定位能力。本指南详细说明了如何通过 GA4 数据精确定位和诊断问题。

## 🎯 可以精确定位的信息

### 1. 功能模块定位

#### 📊 错误域（Domain）分析

通过 `error_domain` 字段，可以精确知道错误发生在哪个功能模块：

| 错误域          | 功能模块   | 典型场景               |
| --------------- | ---------- | ---------------------- |
| `extraction`    | 内容提取   | 网页内容解析、选区处理 |
| `rest`          | 网络请求   | API 调用、数据同步     |
| `chrome-api`    | 浏览器 API | 存储访问、标签页操作   |
| `classifier`    | 内容分类   | AI 分类、标签识别      |
| `notifications` | 通知系统   | 用户提醒、状态通知     |
| `options`       | 设置页面   | 配置保存、界面渲染     |
| `background`    | 后台服务   | 生命周期、消息传递     |
| `content`       | 内容脚本   | 页面注入、UI 渲染      |
| `i18n`          | 国际化     | 语言加载、文本解析     |

#### 🏷️ 错误类别（Category）分析

通过 `error_category` 字段，可以知道具体的错误类型：

| 类别         | 含义     | 示例               |
| ------------ | -------- | ------------------ |
| `SELECTION`  | 选区相关 | 用户选择内容问题   |
| `NETWORK`    | 网络相关 | 请求失败、超时     |
| `STORAGE`    | 存储相关 | 数据保存、读取失败 |
| `PERMISSION` | 权限相关 | API 访问被拒绝     |
| `PARSING`    | 解析相关 | 数据格式错误       |
| `RENDERING`  | 渲染相关 | UI 显示问题        |

### 2. 技术上下文定位

#### 🔧 系统环境信息

```json
{
  "browser_name": "Chrome",
  "browser_version": "120",
  "extension_version": "1.2.3",
  "platform": "MacOS",
  "locale": "zh-CN"
}
```

#### 🌐 网络环境信息

```json
{
  "domain": "github.com", // 网站域名（不含路径）
  "protocol": "https:",
  "connectionType": "wifi",
  "isOnline": true,
  "statusCode": 404,
  "timeout": 5000,
  "duration": 1250
}
```

#### 📱 界面环境信息

```json
{
  "viewportSize": "1920x1080",
  "screenResolution": "2560x1440",
  "theme": "dark",
  "component": "content-script",
  "extensionContext": "content"
}
```

### 3. 执行流程定位

#### 🔄 执行步骤追踪

```json
{
  "step": "extract", // 当前执行步骤
  "method": "selection", // 使用的方法
  "extractor": "readability", // 使用的提取器
  "retryCount": 2, // 重试次数
  "duration": 850 // 执行时长
}
```

#### 📊 性能指标

```json
{
  "memoryUsage": 45.2, // 内存使用（MB）
  "itemCount": 15, // 处理项目数
  "batchSize": 10, // 批处理大小
  "cacheHit": false // 缓存命中状态
}
```

## 🔍 具体定位示例

### 示例 1：内容提取失败

**GA4 收到的数据：**

```json
{
  "error_code": "EXTRACTION_CONTENT_NO_MARKDOWN",
  "error_domain": "extraction",
  "error_category": "CONTENT",
  "error_severity": "error",
  "domain": "medium.com",
  "extractor": "readability",
  "method": "fullpage",
  "step": "process",
  "duration": 2340,
  "retryCount": 1,
  "elementTag": "article",
  "viewportSize": "1920x1080"
}
```

**可以定位到：**

- ✅ **功能模块**：内容提取系统
- ✅ **具体问题**：Readability 提取器无法生成 Markdown
- ✅ **网站类型**：Medium.com（已知的复杂网站）
- ✅ **提取方式**：全页面提取
- ✅ **失败步骤**：内容处理阶段
- ✅ **性能数据**：耗时 2.34 秒，重试了 1 次
- ✅ **环境信息**：桌面端，大屏幕

### 示例 2：网络请求超时

**GA4 收到的数据：**

```json
{
  "error_code": "REST_NETWORK_TIMEOUT",
  "error_domain": "rest",
  "error_category": "NETWORK",
  "error_severity": "warning",
  "method": "POST",
  "statusCode": 0,
  "timeout": 10000,
  "duration": 10001,
  "connectionType": "4g",
  "isOnline": true,
  "retryCount": 3,
  "apiVersion": "v2"
}
```

**可以定位到：**

- ✅ **功能模块**：网络请求系统
- ✅ **具体问题**：POST 请求超时
- ✅ **网络环境**：4G 网络，在线状态
- ✅ **超时设置**：10 秒超时
- ✅ **重试情况**：已重试 3 次
- ✅ **API 版本**：使用 v2 API

### 示例 3：Chrome API 权限错误

**GA4 收到的数据：**

```json
{
  "error_code": "CHROME_API_STORAGE_ACCESS_DENIED",
  "error_domain": "chrome-api",
  "error_category": "PERMISSION",
  "error_severity": "critical",
  "component": "background",
  "action": "save",
  "feature": "settings",
  "browser_name": "Chrome",
  "browser_version": "119",
  "extensionContext": "background"
}
```

**可以定位到：**

- ✅ **功能模块**：Chrome API 调用
- ✅ **具体问题**：存储权限被拒绝
- ✅ **执行环境**：后台脚本
- ✅ **操作类型**：保存设置
- ✅ **浏览器版本**：Chrome 119（可能的兼容性问题）

## 📈 GA4 仪表板设置

### 1. 创建自定义维度

在 GA4 中创建以下自定义维度：

| 维度名称     | 参数名              | 用途         |
| ------------ | ------------------- | ------------ |
| 错误域       | `error_domain`      | 功能模块分析 |
| 错误类别     | `error_category`    | 错误类型分析 |
| 错误严重程度 | `error_severity`    | 优先级排序   |
| 浏览器版本   | `browser_version`   | 兼容性分析   |
| 扩展版本     | `extension_version` | 版本对比     |
| 网站域名     | `domain`            | 网站兼容性   |
| 组件         | `component`         | 代码定位     |
| 执行步骤     | `step`              | 流程分析     |

### 2. 创建有用的报告

#### 🔥 热点错误报告

- **维度**：错误码、错误域、严重程度
- **指标**：事件数量、用户数量
- **筛选**：最近 7 天
- **排序**：按事件数量降序

#### 📊 功能模块健康度

- **维度**：错误域、错误类别
- **指标**：错误率、影响用户数
- **可视化**：饼图或柱状图

#### 🌐 网站兼容性分析

- **维度**：网站域名、错误码
- **指标**：错误频率
- **筛选**：提取相关错误

#### 🔄 版本对比分析

- **维度**：扩展版本、错误严重程度
- **指标**：错误数量变化
- **时间范围**：版本发布前后

## 🚨 告警设置

### 1. 严重错误告警

- **条件**：`error_severity = "critical"`
- **阈值**：5 分钟内超过 10 次
- **通知**：邮件 + Slack

### 2. 功能模块异常告警

- **条件**：特定 `error_domain` 错误率突增
- **阈值**：比前一天增长 50%
- **通知**：邮件

### 3. 新版本质量监控

- **条件**：新版本发布后 24 小时内
- **监控**：错误总数、新错误类型
- **阈值**：错误数比上版本增长 20%

## 🔒 隐私保护说明

### ✅ 发送的安全信息

- 错误类型和严重程度
- 功能模块和执行步骤
- 技术环境信息
- 性能指标
- 网站域名（不含路径）
- 匿名化的堆栈跟踪

### ❌ 不发送的隐私信息

- 具体 URL 路径和参数
- 用户选择的文本内容
- 个人身份信息
- 文件路径和用户名
- 密码和敏感数据
- 完整的堆栈跟踪

## 🛠️ 开发者工具

### 1. 本地调试

```javascript
// 在浏览器控制台中查看错误分析状态
chrome.storage.local.get(['analytics_config'], console.log);

// 查看最近的错误队列
chrome.storage.local.get(['analytics_error_queue'], console.log);
```

### 2. 测试错误报告

```typescript
// 手动触发测试错误
import { handleError } from './shared/errors';
import { STANDARDIZED_ERROR_CODES } from './shared/errors/errorCodes';

await handleError({
  code: STANDARDIZED_ERROR_CODES.EXTRACTION_SELECTION_NO_SELECTION,
  domain: 'extraction',
  message: 'Test error for debugging',
  severity: 'warning',
  recoverable: true,
  context: {
    extractor: 'test',
    method: 'manual',
    step: 'debug',
    component: 'developer-tools'
  }
});
```

通过这个完整的错误定位系统，你可以在保护用户隐私的前提下，精确诊断和修复扩展中的问题！
