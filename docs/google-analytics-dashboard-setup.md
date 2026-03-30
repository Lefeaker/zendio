# Google Analytics 4 错误监控仪表板设置指南

本文档提供了为 AiiinOB 扩展设置 Google Analytics 4 错误监控仪表板的完整指南。

## 目录

1. [GA4 配置](#ga4-配置)
2. [自定义事件设置](#自定义事件设置)
3. [仪表板创建](#仪表板创建)
4. [关键指标监控](#关键指标监控)
5. [报警设置](#报警设置)

## GA4 配置

### 1. 创建 GA4 属性

1. 登录 [Google Analytics](https://analytics.google.com/)
2. 创建新的 GA4 属性
3. 记录 `Measurement ID` (格式: G-XXXXXXXXXX)
4. 在"数据流"中创建"网络"数据流（用于接收扩展数据）

### 2. 配置 Measurement Protocol

1. 进入"管理" > "数据流" > 选择你的数据流
2. 点击"Measurement Protocol API 密钥"
3. 创建新的 API 密钥
4. 记录 `API Secret`

### 3. 更新扩展配置

在 `AiiinOB/src/shared/errors/analytics/analyticsConfig.ts` 中更新配置：

```typescript
export const GA4_CONFIG = {
  MEASUREMENT_ID: 'G-YOUR-MEASUREMENT-ID', // 替换为实际的 Measurement ID
  API_SECRET: 'YOUR_API_SECRET',           // 替换为实际的 API Secret
  // ... 其他配置
};
```

## 自定义事件设置

### 1. 错误事件结构

我们的错误报告使用以下事件结构：

```javascript
{
  "name": "extension_error",
  "params": {
    "error_code": "EXTRACTION_CONTENT_NO_MARKDOWN",
    "error_domain": "extraction",
    "error_category": "CONTENT",
    "error_severity": "error",
    "error_severity_level": 3,
    "error_recoverable": false,
    "error_description": "Content extraction produced no markdown",
    "extension_version": "0.2.0",
    "browser_name": "chrome",
    "browser_version": "120",
    "timestamp": 1703123456789,
    "session_id": "abc123-def456"
  }
}
```

### 2. 自定义维度设置

在 GA4 中创建以下自定义维度：

1. **错误代码** (`error_code`)
   - 范围：事件
   - 描述：标准化的错误代码

2. **错误域** (`error_domain`)
   - 范围：事件
   - 描述：错误发生的功能域

3. **错误类别** (`error_category`)
   - 范围：事件
   - 描述：错误的分类类别

4. **错误严重程度** (`error_severity`)
   - 范围：事件
   - 描述：错误的严重程度级别

5. **扩展版本** (`extension_version`)
   - 范围：事件
   - 描述：发生错误时的扩展版本

6. **浏览器名称** (`browser_name`)
   - 范围：事件
   - 描述：用户使用的浏览器类型

### 3. 自定义指标设置

创建以下自定义指标：

1. **错误严重程度级别** (`error_severity_level`)
   - 范围：事件
   - 单位：标准
   - 描述：数值化的错误严重程度（1-4）

## 仪表板创建

### 1. 错误概览仪表板

创建一个综合性的错误监控仪表板，包含以下组件：

#### 关键指标卡片
- **总错误数**：过去 7 天的错误总数
- **严重错误数**：严重程度为 "critical" 的错误数
- **错误率**：错误数 / 总会话数
- **影响用户数**：遇到错误的唯一用户数

#### 趋势图表
- **错误趋势**：过去 30 天的每日错误数量
- **严重程度分布**：不同严重程度错误的占比
- **域分布**：各功能域的错误分布

#### 详细分析表格
- **热门错误代码**：按频率排序的错误代码列表
- **版本对比**：不同扩展版本的错误率对比
- **浏览器分析**：不同浏览器的错误分布

### 2. 仪表板配置示例

```json
{
  "dashboard_name": "AiiinOB 错误监控",
  "widgets": [
    {
      "type": "scorecard",
      "title": "总错误数",
      "metric": "extension_error",
      "time_range": "last_7_days"
    },
    {
      "type": "time_series",
      "title": "错误趋势",
      "metric": "extension_error",
      "dimension": "date",
      "time_range": "last_30_days"
    },
    {
      "type": "pie_chart",
      "title": "错误严重程度分布",
      "metric": "extension_error",
      "dimension": "error_severity"
    },
    {
      "type": "table",
      "title": "热门错误代码",
      "metric": "extension_error",
      "dimension": "error_code",
      "sort": "descending",
      "limit": 20
    }
  ]
}
```

## 关键指标监控

### 1. 错误率阈值

设置以下错误率阈值进行监控：

- **正常**：< 1% 的会话遇到错误
- **警告**：1-5% 的会话遇到错误
- **严重**：> 5% 的会话遇到错误

### 2. 关键错误类型

重点监控以下类型的错误：

- **CRITICAL 级别错误**：所有严重错误都需要立即关注
- **网络相关错误**：REST_NETWORK_* 类型的错误
- **Chrome API 错误**：CHROME_API_* 类型的错误
- **内容提取错误**：EXTRACTION_* 类型的错误

### 3. 版本回归检测

监控新版本发布后的错误率变化：

- 对比新版本与前一版本的错误率
- 识别新版本引入的新错误类型
- 监控特定错误代码的频率变化

## 报警设置

### 1. 实时报警

在 GA4 中设置以下实时报警：

#### 严重错误报警
- **条件**：error_severity = "critical"
- **阈值**：> 10 次/小时
- **通知**：邮件 + Slack

#### 错误率激增报警
- **条件**：错误总数相比前一小时增长 > 200%
- **阈值**：> 50 次/小时
- **通知**：邮件

#### 新错误类型报警
- **条件**：出现新的 error_code
- **阈值**：> 5 次/小时
- **通知**：Slack

### 2. 每日报告

设置每日错误摘要报告：

- **发送时间**：每天上午 9:00
- **内容**：
  - 昨日错误总数和趋势
  - 新出现的错误类型
  - 热门错误代码 Top 10
  - 版本和浏览器分布

### 3. 周报设置

设置每周错误分析报告：

- **发送时间**：每周一上午 10:00
- **内容**：
  - 周错误趋势分析
  - 错误率变化对比
  - 用户影响分析
  - 改进建议

## 数据隐私合规

### 1. 数据匿名化验证

定期验证发送到 GA4 的数据已正确匿名化：

- 检查是否包含个人身份信息
- 验证敏感数据已被清理
- 确认 URL 和路径信息已脱敏

### 2. 数据保留设置

在 GA4 中配置适当的数据保留期：

- **事件数据保留**：14 个月
- **用户数据保留**：14 个月
- **自动删除**：启用

### 3. 用户同意管理

确保错误报告符合隐私法规：

- 用户明确同意后才开始收集
- 提供随时撤销同意的选项
- 同意撤销后立即停止数据收集

## 故障排除

### 1. 常见问题

**数据未出现在 GA4 中**
- 检查 Measurement ID 和 API Secret 是否正确
- 验证网络连接和防火墙设置
- 查看浏览器开发者工具中的网络请求

**数据格式错误**
- 确认自定义维度和指标已正确创建
- 检查事件参数名称是否匹配
- 验证数据类型是否正确

### 2. 调试工具

使用以下工具进行调试：

- **GA4 DebugView**：实时查看事件数据
- **Measurement Protocol Validation**：验证请求格式
- **浏览器开发者工具**：检查网络请求和错误

## 最佳实践

1. **渐进式部署**：先在小范围用户中测试错误报告
2. **定期审查**：每月审查错误模式和趋势
3. **版本标记**：确保每个版本都有正确的版本标识
4. **文档更新**：及时更新错误代码文档和处理指南
5. **团队培训**：确保团队成员了解如何使用仪表板

通过遵循本指南，您可以建立一个全面的错误监控系统，帮助快速发现和解决 AiiinOB 扩展中的问题，提升用户体验。
