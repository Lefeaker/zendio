# Analytics Configuration Guide

最后更新：2026-06-05

本文描述 owner 如何为 AiiinOB 配置公开 GA 参数与 server-side proxy。

## 当前配置真值

- tracked `src/shared/errors/analytics/analyticsConfig.ts` 只保留非敏感默认值。
- 真实 GA 公共配置通过 build-time 注入，不写回 tracked source。
- 生产默认推荐：
  - `AIIINOB_GA_TRANSPORT_MODE=proxy`
  - `AIIINOB_GA_MEASUREMENT_ID=G-...`
  - `AIIINOB_GA_PROXY_ENDPOINT=https://<owner-endpoint>/...`
- `api_secret` 只能存在于 server-side proxy。
- 如果没有 public build config，扩展会保持 `disabled`。

## Build-time Public Config

`scripts/build.mjs` 当前注入以下 public build 变量：

```bash
AIIINOB_GA_MEASUREMENT_ID=G-XXXXXXXXXX
AIIINOB_GA_TRANSPORT_MODE=proxy
AIIINOB_GA_PROXY_ENDPOINT=https://analytics.example.com/ga4
```

这些值在运行时由 `src/shared/analytics/analyticsEnvironment.ts` 读取，并装配到 `DEFAULT_ANALYTICS_CONFIG`。

## 生产 owner 配置步骤

### 1. 创建 GA4 property / data stream

- 在 GA4 创建专用 property
- 创建 web data stream
- 记录 `Measurement ID`

不要把 server credential 写入扩展代码或文档示例。

### 2. 部署 server-side proxy

proxy 至少应满足：

- 接收扩展发来的匿名事件 payload
- 仅在服务端持有并使用 `api_secret`
- 校验允许的 event name / params
- 记录请求结果、event name、版本、响应码
- 拒绝 secret-looking public config
- 不把 `api_secret` 回显给扩展

推荐额外做：

- 对 `measurement_id` 做 allowlist
- 对 `proxyEndpoint` 仅允许 HTTPS
- 对异常 payload 做 structured logging

### 3. 在 release 环境注入 public config

```bash
export AIIINOB_GA_MEASUREMENT_ID=G-ABCD1234
export AIIINOB_GA_TRANSPORT_MODE=proxy
export AIIINOB_GA_PROXY_ENDPOINT=https://analytics.example.com/ga4
```

然后执行正常 build / release 流程。

### 4. 保持 tracked config 非敏感

以下行为仍然禁止：

- 把真实 `measurementId` 写回 tracked `analyticsConfig.ts`
- 在扩展源码、构建产物模板、setup 脚本里要求填写 server credential
- 让扩展直接保存或提示 owner 输入 `api_secret`

## 本地验证模式

### 生产相同行为验证

优先使用 proxy：

```bash
export AIIINOB_GA_MEASUREMENT_ID=G-ABCD1234
export AIIINOB_GA_TRANSPORT_MODE=proxy
export AIIINOB_GA_PROXY_ENDPOINT=http://localhost:8787/ga4
```

这能验证真实 consent gating、public config 注入、proxy log 与 request body。

### DebugView 验证

只在本地使用：

```bash
export AIIINOB_GA_MEASUREMENT_ID=G-ABCD1234
export AIIINOB_GA_TRANSPORT_MODE=directDebug
unset AIIINOB_GA_PROXY_ENDPOINT
```

`directDebug` 只用于开发验证，不应作为生产发布默认值。

## Consent 验证清单

### 验证“consent off 不发事件”

1. 安装带 public config 的构建。
2. 在隐私设置中关闭 `analytics` 与 `errorReporting`。
3. 执行一次 options 操作、剪藏、reader 或 video 流程。
4. 确认：
   - 没有发往 owner proxy 的请求
   - local debug 模式下没有 DebugView 新事件
   - “清空全部分析数据”后 analytics storage keys 被移除

### 验证“consent on 后按类型发事件”

1. 打开 `analytics`，保留 `errorReporting` 关闭。
2. 执行 options / clip / reader / video 行为。
3. 只应看到产品事件，不应看到 `extension_error`。
4. 再打开 `errorReporting`，触发受控错误或测试错误。
5. 此时才应看到 `extension_error`。

## 验证工具

运行只读校验脚本：

```bash
node scripts/setup-error-analytics.js
```

该脚本当前只做以下事情：

- 校验当前 repo 的 public analytics wiring 是否存在
- 校验 tracked config 未包含 client-side secret
- 校验当前 privacy / build / transport 关键路径是否仍然存在
- 校验当前 shell 环境中的 public config 是否自洽

脚本不会改写 tracked source，也不会生成本地 secret 文件。

## 常见误区

### “只要一个 Measurement ID 就能完成生产集成”

不成立。生产推荐路径是 proxy。扩展公开侧确实只持有 `measurementId`、`transportMode`、`proxyEndpoint`，但 server-side forwarding 仍需要服务端 credential。

### “tracked analyticsConfig.ts 可以直接写 owner release 值”

不成立。tracked 文件必须保持非敏感默认值。

### “dashboard 需要 raw duration 才能做漏斗”

不成立。当前产品遥测只提供 `duration_bucket`，dashboard 设计必须按 bucket 工作。

## Owner-only residual checks

以下事项在当前 repo 验证通过后仍然属于 owner-only residual risk，不应被表述为已经在本地工程验证中完成：

- `GA4 DebugView`：`directDebug` 本地模式只能证明客户端事件路径和字段形状；真实 property 的 DebugView 可见性仍需要 owner 持有的 GA4 访问权限与 consent-enabled 测试 profile。
- `Proxy api_secret injection`：只有 owner 控制的 staging/production proxy log 或 server trace 才能证明 `api_secret` 由服务端注入，且没有回流到扩展源码、构建产物或客户端请求参数。
- `Chrome Web Store credentials`：repo 内只能安全验证 dry-run 与脚本接线；真实上传/发布仍需要 owner 的 Chrome Web Store dashboard credential 与人工确认。
- `Real Obsidian vault / proxy credentials`：任何涉及真实 local-folder handle、REST API key、vault name、proxy secret 或 owner endpoint 的联调都必须由 owner 在受控环境下执行，且不得回写到 tracked source、fixtures 或 handoff 日志。

## 最小 release 检查

- build-time env 已注入
- 扩展网络只访问 owner proxy，不直接依赖生产态 Google endpoint
- consent off 时无事件
- consent on 时能看到 options / clip / reader / video / error 事件
- proxy log 中不出现正文、路径、token、`api_secret` 泄露到客户端侧的迹象
