# Error Analytics System Overview

最后更新：2026-06-14

本文给出 AiiinOB 当前错误遥测系统的结构化总览。P06 起，错误事件文档也受
同一条 schema -> proxy contract -> docs contract 校验链保护，不再依赖手写表格
自行保持同步。

## 系统目标

- 让 owner 看到匿名错误趋势
- 与产品 telemetry 共用一套 transport / consent / config contract
- 不在扩展内保存服务端 credential
- 不发送正文、路径、token 等敏感数据

## 架构概览

### 1. Build-time public config

来源：

- `scripts/build.mjs`
- `src/shared/analytics/analyticsEnvironment.ts`
- `src/shared/errors/analytics/analyticsConfig.ts`

扩展只读取：

- `measurementId`
- `transportMode`
- `proxyEndpoint`

### 2. Consent / runtime config

来源：

- `AnalyticsConfigManager`
- options privacy persistence

职责：

- 管理 `analytics` / `errorReporting` / `debugMode`
- 管理 `clientId` / `sessionId`
- 关闭 consent 时阻断发送

### 3. Error capture and sanitization

来源：

- `src/shared/errors/analytics/googleAnalyticsReporter.ts`
- `src/shared/errors/analytics/dataSanitizer.ts`

职责：

- 规范化错误字段
- 清洗用户隐私
- 仅提取安全上下文

### 4. Shared transport

来源：

- `src/shared/analytics/analyticsTransport.ts`
- `src/shared/analytics/analyticsProxyContract.ts`

职责：

- 构建 GA payload
- 按 `proxy` / owner debug proxy (`directDebug`) 发送
- 对 payload 做最终合法性判断
- 为 owner proxy 与 docs checker 提供同一份 event/param contract

## 数据流

1. build 注入 public analytics config
2. runtime 初始化 analytics config manager
3. 用户在隐私设置中授予或撤销 consent
4. 错误发生时 reporter 构建匿名 `extension_error`
5. transport 根据 mode 发往 owner proxy 或 owner debug proxy path

## 当前边界条件

- `extension_error` 是正式生产错误事件
- 它不走 runtime message event path，因此 event catalog 中 `runtimeAllowed=false`
- 错误发送仍受 consent 控制
- 生产主路径是 `proxy`

## 与产品事件的关系

- 产品事件需要 `analytics` consent
- 错误事件需要 `errorReporting` consent
- 两者共享版本、会话、transport、build-time config 结构
- dashboard 侧可在同一个 GA property 中汇总，但分析逻辑要分开

## Owner 维护入口

- 事件真值：[`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md)
- owner 配置：[`analytics-configuration-guide.md`](./analytics-configuration-guide.md)
- dashboard：[`google-analytics-dashboard-setup.md`](./google-analytics-dashboard-setup.md)
- owner 接入步骤：[`error-analytics-integration-guide.md`](./error-analytics-integration-guide.md)

## 校验入口

```bash
node scripts/setup-error-analytics.js
npm run analytics:validate:prod
node tools/report-ga-proxy-contract.mjs
node tools/report-ga-docs-contract.mjs --check
```

这些命令当前都是只读 validator，不再生成本地配置文件，也不会改写 tracked source。
它们验证的是静态/public-config contract 与 owner env sanity，不是对真实
GA4 property delivery、DebugView 可见性或服务端 `api_secret` 注入的证明。

## 不应再出现的旧行为

- 要求在扩展里填写服务端 credential
- 把 tracked analytics config 当作 owner release 配置文件
- 用旧 options/privacy path 作为当前 UI 真值
- 把 direct debug transport 当作生产默认路径
