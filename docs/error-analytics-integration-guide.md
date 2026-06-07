# Error Analytics Integration Guide

最后更新：2026-06-05

本文面向 owner / release 维护者，说明当前错误遥测如何接入 GA4 proxy 流。

## 当前错误遥测真值

- 错误事件名固定为 `extension_error`
- 错误事件通过 `GoogleAnalyticsReporter` 发送
- 与产品事件共享 transport contract
- 生产推荐走 owner proxy
- `errorReporting` consent 关闭时，不应发送错误事件
- 扩展内不保存服务端 credential

关键源码：

- `src/shared/errors/analytics/googleAnalyticsReporter.ts`
- `src/shared/errors/analytics/dataSanitizer.ts`
- `src/shared/errors/analytics/analyticsConfig.ts`
- `src/shared/analytics/analyticsTransport.ts`

## 集成步骤

### 1. 配置 public build analytics 参数

```bash
export AIIINOB_GA_MEASUREMENT_ID=G-ABCD1234
export AIIINOB_GA_TRANSPORT_MODE=proxy
export AIIINOB_GA_PROXY_ENDPOINT=https://analytics.example.com/ga4
```

### 2. 在 server-side proxy 持有 forwarding credential

要求：

- server 端自行持有 `api_secret`
- 扩展只发送匿名 payload 给 owner proxy
- proxy 转发前可做 allowlist、rate limit、logging、payload validation

### 3. 保持错误匿名化链路开启

当前 reporter 会在发送前执行：

- `sanitizeErrorForAnalytics`
- safe-context 提取
- 浏览器类型 / 主版本提取
- transport-level payload 构建

这意味着 owner 应看到的是匿名错误元数据，而不是原始用户内容。

### 4. 验证 consent gating

验证顺序：

1. 打开 `analytics`，关闭 `errorReporting`
2. 触发一次受控错误
3. proxy / debug proxy / DebugView 不应收到 `extension_error`
4. 再打开 `errorReporting`
5. 重试同样错误
6. 此时才应收到 `extension_error`

### 5. 运行只读 setup 校验

```bash
node scripts/setup-error-analytics.js
```

该脚本不会生成本地配置文件，也不会写入 tracked source。

## Error payload contract

### 必填字段

- `error_code`
- `error_domain`
- `error_severity`
- `error_recoverable`

### 允许的补充字段

- `error_category`
- `extension_version`
- `browser_name`
- `browser_version`
- `failure_category`

当前 error telemetry reference 详见 [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md)。

## 隐私边界

错误事件不应包含：

- 完整 URL / 查询参数
- 文件系统路径、vault 名称
- 正文、markdown、聊天文本、用户输入正文
- 账号、邮箱、IP、cookie、token、密码
- 客户端侧服务端 credential

stack trace 也会被裁剪，只保留有限的函数名 / 行号信息。

## 本地与生产验证方式

### 本地

- `directDebug` 可用于 owner debug proxy 验证
- 只在开发验证中使用；扩展仍只发往配置的 proxy endpoint，不直连 Google debug endpoint

### 生产 / staging

- 以 proxy log 为准
- 检查 `extension_error` 的 response code、版本、错误域、严重度
- 检查 payload 中无隐私泄露

## 常见误区

### “错误遥测是独立配置，不需要共享 transport”

不是。错误遥测与产品遥测共享 analytics transport contract，只是 consent gate 不同。

### “error reporter 可以直接读取服务端 credential”

不是。client-side 只读 public config。

### “只要 proxy 通了，就说明隐私边界正确”

不是。还必须验证匿名化、字段 allowlist 与 consent gating。
