# Analytics Operations Runbook

最后更新：2026-06-18

本文是 Zendio telemetry 的 public-safe 运维流程。它只记录可随产品代码一起维护的 contract、检查清单和排障路径。真实 GA4 property、Cloudflare account、dashboard 链接、部署证据、带账号或业务数据的截图、rollback 记录和 incident 记录必须保存在 owner private ops 资产中，不得进入产品仓库。

事件、字段、隐私边界与 dashboard 分析口径以这些文档为准：

- [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md)
- [`google-analytics-dashboard-setup.md`](./google-analytics-dashboard-setup.md)
- [`analytics-configuration-guide.md`](./analytics-configuration-guide.md)
- [`privacy-settings-usage.md`](./privacy-settings-usage.md)

## 分层边界

### 保留在 Zendio 仓库

- telemetry event / parameter contract
- GA4 custom dimensions / metrics 清单
- dashboard exploration 与 owner dashboard 的分析口径
- 不采集正文、URL、路径、secret、账号信息等隐私规则
- local validation、proxy smoke、DebugView smoke 与 release 前检查流程
- public-safe runbook，所有 owner-only 值使用占位符

### 保留在 owner private ops 资产

- 真实 GA4 account、property、data stream、dashboard、exploration 链接
- Cloudflare account、zone、route、Worker 名称、deployment ID 与 rollback 记录
- server-side `api_secret` 的存放位置引用；明文值不得写入 Git
- Cloudflare Worker secret `GA4_API_SECRET` 的存在性验证记录；明文值不得写入 Git
- 带账号、property、DebugView、report 或业务数据的截图
- deployment、incident、rollback、retention change 与 post-release smoke 证据

推荐 owner private ops 结构：

```text
<private-ops-repo>/
  ga4/
    property.md
    retention-policy.md
    custom-definitions.md
    dashboard-links.md
    debugview-smoke.md
  cloudflare/
    ga4-proxy-worker.md
    deploy-runbook.md
    rollback-runbook.md
    route-and-secret-inventory.md
  dashboards/
    ga4-product-dashboard.md
    ga4-reliability-dashboard.md
  releases/
    <yyyy-mm-dd>-ga-telemetry-production.md
  incidents/
    README.md
  evidence/
    <yyyy-mm-dd>-ga4-retention/
    <yyyy-mm-dd>-proxy-deploy/
  secrets/
    README.md
  templates/
    release-ga-checklist.md
    incident-report.md
    dashboard-change.md
```

## Platform Baseline Checklist

Owner 在 GA4 / proxy 平台变更后，必须在 private ops 资产中记录真实值和证据；Zendio 仓库只记录以下 baseline 规则。

### GA4 property

- Event data retention：`14 months`
- User data retention：按 owner privacy policy 保持当前 policy；如变更，必须在 private ops 记录旧值、新值和原因
- Reset user data on new activity：保持 owner 当前 policy；如变更，必须在 private ops 记录原因
- Measurement ID：只允许作为 public build config 注入，不是 secret
- Measurement Protocol server-side secret：只允许在 owner proxy / Cloudflare Worker secret store 中存在
- Dashboard custom definitions：必须与 [`google-analytics-dashboard-setup.md`](./google-analytics-dashboard-setup.md) 的推荐清单一致

### Proxy

- Production transport 使用 owner proxy endpoint
- Extension / client runtime 不得直连 Google Measurement Protocol endpoint
- Owner proxy 服务端注入 server-side `api_secret`
- Owner proxy allowlist 必须覆盖 [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md) 中 active telemetry contract
- Owner proxy 不得记录正文、路径、token、secret、raw URL 或截图 bytes

## Release Preflight

在发布包含 telemetry 变更的 build 前，按顺序运行：

```bash
npm run audit:ga:proxy-contract
npm run audit:ga:docs
npm run audit:ga:legacy-api
npm run analytics:validate:prod
npm run audit:ga:client-secret
npm run audit:ga:release-surface
npm run analytics:smoke:delivery -- --dry-run
npm run analytics:smoke:delivery -- --require-env
```

这些命令的边界：

- `audit:ga:proxy-contract` 证明 schema / proxy contract 静态对齐
- `audit:ga:docs` 证明 telemetry reference、dashboard spec 和本 runbook 没有明显 contract / secret guidance 漂移
- `analytics:validate:prod` 证明 public config、consent contract 和 negative guard 正常
- `audit:ga:client-secret` 与 `audit:ga:release-surface` 证明 client source / build output 没有 server-side secret 或 direct Google Measurement Protocol endpoint
- `analytics:smoke:delivery -- --require-env` 只证明 owner proxy 接受 synthetic allowlisted event；它不替代 GA4 DebugView、proxy log 或真实 property delivery evidence

## Owner Platform Smoke

这些步骤需要 owner 的 GA4 / proxy / Cloudflare 权限。平台证据只写入 private ops。

### Proxy smoke

1. 确认 `.env.production.local` 只包含 public build config。
2. 运行：

```bash
npm run analytics:smoke:delivery -- --require-env
```

3. 在 private ops 中记录：
   - Zendio commit hash
   - synthetic event name
   - proxy response status
   - GA4 Measurement Protocol forwarding status
   - proxy route / Worker deployment reference

### DebugView smoke

1. 使用 owner debug proxy，不得从 extension 直连 Google debug endpoint。
2. 运行：

```bash
node scripts/run-ga-owner-smoke.mjs --mode directDebug --event runtime_harness_open
```

3. 在 GA4 DebugView 中确认 `runtime_harness_open` 可见。
4. 在 private ops 中记录 DebugView 时间窗口、event name、property reference 和截图；截图不得进入产品仓库。

### No-consent smoke

1. 在测试 profile 中关闭 `analytics` 与 `errorReporting`。
2. 执行 options / clip / reader / video 典型路径。
3. 确认 owner proxy log、debug proxy 和 DebugView 没有新增事件。
4. 在 private ops 中记录检查时间和结果。

## Dashboard Delivery Checklist

正式 dashboard 必须按 [`google-analytics-dashboard-setup.md`](./google-analytics-dashboard-setup.md) 建立，并在 private ops 中保存真实链接。

最低交付页面：

- Activation / Retention
- Clip / Export Shapes
- Reader / Video Recovery
- Reliability

每个页面必须在 private ops 中记录：

- dashboard / exploration 链接
- 使用的 GA4 property reference
- 对应 Zendio commit hash
- 使用的事件和 custom definitions
- 图表解读口径
- 已知延迟：GA4 standard reporting 不是实时完整数据；DebugView 只用于 live smoke

## Incident Triage

### Symptom: proxy smoke fails

1. 运行 `npm run analytics:validate:prod`。
2. 确认 `.env.production.local` 只包含 public config。
3. 确认 proxy endpoint 是 owner proxy host，不是 Google Measurement Protocol host。
4. 查看 owner proxy log 和 Cloudflare Worker deployment 状态。
5. 在 private ops 中记录失败响应、deployment reference 和 rollback 决策。

### Symptom: DebugView has no event

1. 先确认 proxy smoke 成功。
2. 确认 DebugView 使用的 GA4 property 与 build public measurement ID 匹配。
3. 确认 owner proxy 服务端注入 server-side `api_secret`。
4. 重新发送 `runtime_harness_open` debug event。
5. 等待 GA4 DebugView 窗口刷新；仍失败时记录为 owner platform incident。

### Symptom: dashboard metric missing or zero

1. 确认相关 custom dimension / metric 已在 GA4 property 中创建。
2. 确认事件属于 active `emitted` / `error` contract。
3. 确认 GA4 reporting 延迟窗口。
4. 检查 `audit:ga:docs` 是否仍通过。
5. 如字段名或 event name 改动，先修正 Zendio contract，再同步 owner dashboard。

### Symptom: privacy or secret concern

1. 运行：

```bash
npm run audit:ga:client-secret
npm run audit:ga:release-surface
```

2. 查阅 [`privacy-settings-usage.md`](./privacy-settings-usage.md) 的不采集列表。
3. 检查 proxy log 是否包含正文、路径、token、secret、raw URL 或 screenshot bytes。
4. 如发现 owner platform log 泄漏，先在 owner platform 停止记录，再处理 incident；不要把敏感 log 复制进产品仓库。

## Change Control

任何 telemetry 变更都要同时维护：

1. schema / event emitter / sanitizer
2. proxy contract
3. [`ga4-telemetry-reference.md`](./ga4-telemetry-reference.md)
4. [`google-analytics-dashboard-setup.md`](./google-analytics-dashboard-setup.md)
5. 本 runbook 中受影响的 release / smoke / incident 流程
6. owner private ops 中的 dashboard / platform evidence

提交前至少运行：

```bash
npm run audit:ga:proxy-contract
npm run audit:ga:docs
npm run audit:ga:client-secret
```

如果变更会进入 release build，还要运行：

```bash
npm run analytics:validate:prod
npm run audit:ga:release-surface
```
