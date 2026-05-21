# Google Analytics 配置指南

## 概述

AiiinOB 的错误分析系统使用 Google Analytics 4 (GA4) 来收集匿名的错误数据。本指南将帮助你正确配置 GA4 集成。

## 为什么只需要 Measurement ID？

我们简化了配置，只需要 GA4 的 **Measurement ID**，不需要 API Secret。原因如下：

- **简化配置**：减少需要管理的敏感信息
- **基本功能足够**：对于错误跟踪，Measurement ID 已经足够
- **安全性**：减少敏感配置信息的暴露风险
- **易于维护**：开发者只需要一个配置项

## 配置步骤

### 1. 创建 Google Analytics 4 属性

1. **访问 Google Analytics**
   - 打开 [Google Analytics](https://analytics.google.com/)
   - 使用你的 Google 账号登录

2. **创建新属性**
   - 点击左下角的"管理"（齿轮图标）
   - 在"属性"列中点击"创建属性"
   - 选择"GA4"（Google Analytics 4）
   - 填写属性名称，例如："AiiinOB Extension Analytics"

3. **获取 Measurement ID**
   - 创建属性后，进入"管理" → "数据流"
   - 点击"添加流" → "网站"
   - 填写网站信息（可以填写扩展的相关信息）
   - 创建流后，你会看到 **Measurement ID**（格式：G-XXXXXXXXXX）

### 2. 配置扩展

1. **默认配置**
   `src/shared/errors/analytics/analyticsConfig.ts` 已提交为非敏感默认实现，默认 Measurement ID 为 `G-XXXXXXXXXX` 且 analytics disabled。clean checkout 不需要复制本地 ignored 文件也能完成 typecheck/build。

2. **发布/本地 Measurement ID 注入**
   `src/shared/errors/analytics/analyticsConfig.ts` 是 tracked placeholder-only 文件，只能保留默认占位值：

   ```typescript
   MEASUREMENT_ID: 'G-XXXXXXXXXX';
   ```

   不要把真实 GA4 Measurement ID 写入并提交到该 tracked 文件。真实 ID 只能通过 owner release 注入流程，或开发者本地未提交覆盖进行验证。

3. **发布配置验证**
   owner release 注入后的有效配置应等价于：

   ```typescript
   export const GA4_CONFIG = {
     MEASUREMENT_ID: '<owner-provided Measurement ID>' // owner release 注入示例，禁止提交到 tracked placeholder
     // 其他配置保持不变...
   };
   ```

### 3. 安全性说明

- **默认配置保护**：仓库内的 `analyticsConfig.ts` 只能保存非敏感默认值，不提交真实 GA4 Measurement ID
- **个人/发布配置**：真实 Measurement ID 必须通过单独 owner 流程注入或在本地修改后保持未提交
- **模板文件**：`analyticsConfig.template.ts` 是公共模板，可以安全提交

## 测试配置

### 1. 运行测试脚本

```bash
node scripts/test-privacy-settings.cjs
```

### 2. 检查扩展选项页面

1. 构建并加载扩展
2. 打开扩展的选项页面
3. 滚动到"隐私与数据"部分
4. 确认可以看到完整的隐私设置界面

### 3. 验证 GA4 数据接收

1. 在 GA4 中启用"DebugView"
2. 在扩展中触发一些错误（用于测试）
3. 检查 GA4 的实时报告是否收到数据

## 常见问题

### Q: 我需要 API Secret 吗？

**A:** 不需要。我们简化了配置，只使用 Measurement ID 就足够了。

### Q: 为什么仓库里有 analyticsConfig.ts？

**A:** 为了保证 clean checkout 可复现。该文件只包含非敏感 disabled default；真实 GA4 Measurement ID 不应提交。

### Q: 如何知道数据是否正确发送到 GA4？

**A:** 可以在 GA4 的"实时"报告中查看，或者启用 DebugView 进行详细调试。

### Q: 可以使用现有的 GA4 属性吗？

**A:** 可以，但建议为扩展创建专门的 GA4 属性，这样数据更清晰，不会与其他项目混合。

### Q: 如何禁用错误分析？

**A:** 用户可以在扩展的选项页面中关闭"使用分析"和"错误报告"选项。

## 高级配置

如果你需要自定义更多非敏感默认配置，tracked `analyticsConfig.ts` 只能保留 placeholder Measurement ID，并可调整以下非敏感选项：

```typescript
const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false, // 默认关闭，需要用户同意
  debugMode: false, // 是否启用调试模式
  reportingInterval: 30000, // 报告间隔（毫秒）
  maxErrorsPerSession: 50, // 每个会话最大错误数
  batchSize: 10 // 批量发送大小
};
```

## 数据隐私

我们的系统严格保护用户隐私：

- **完全匿名**：不收集任何个人身份信息
- **数据清理**：自动移除敏感信息（邮箱、IP、密码等）
- **用户控制**：用户可以选择是否参与数据收集
- **透明度**：清楚说明收集和不收集的数据类型
- **合规性**：符合 GDPR、CCPA 等隐私法规

## 支持

如果在配置过程中遇到问题：

1. 检查 tracked `analyticsConfig.ts` 是否仍为 placeholder-only
2. 确认 owner release 注入或本地未提交覆盖中的 Measurement ID 格式正确（G-XXXXXXXXXX）
3. 运行测试脚本验证集成
4. 查看浏览器控制台是否有错误信息

配置完成后，你的 AiiinOB 扩展就具备了完整的错误分析能力，可以帮助你更好地了解和改进扩展的稳定性！
