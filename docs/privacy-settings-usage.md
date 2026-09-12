# Privacy Settings Usage

最后更新：2026-08-28

本文描述 Zendio 当前隐私与数据设置的用户行为、生产实现边界与验证方式。

## 当前生产归属

- UI schema：`src/options/stitch/schema/settings/overview.ts`
- canonical schema：`src/shared/schemas/options.schema.ts`
- schema-derived type：`src/shared/types/options.ts`
- consent mutation：`src/options/app/actions/privacyConsentAction.ts`
- Options persistence/runtime wiring：`src/options/app/productionStitchPersistence.ts`
- onboarding consent wiring：`src/onboarding/bootstrap.ts`
- typed repository contract：`src/shared/repositories/IOptionsRepository.ts`
- raw read/observe adapter：`src/infrastructure/repositories/ChromeOptionsRepository.ts`
- cross-context mutation client：`src/infrastructure/repositories/OptionsMutationClient.ts`
- sole production write owner：`src/background/services/optionsMutationCoordinator.ts`

Options 和 onboarding 都消费同一 schema-derived `privacyPreferences` 对象。生产 action
调用 typed `IOptionsRepository.patch`；Options/onboarding 中的
`OptionsMutationClient` 将 patch/strict replace 发给 background，唯一
`OptionsMutationCoordinator` 以 FIFO 顺序读取 raw snapshot、应用 schema codec、写入并
read-back 验证。`ChromeOptionsRepository` 在 UI context 只提供 read/observe，不给 caller
raw-write authority。不存在第二套 privacy view/controller/persistence 实现。

UI ownership manifest 已进入 final 状态，不再保留 privacy UI-domain compatibility 类型。
当前唯一契约为 schema-derived `PrivacyPreferencesOptions`、typed patch/strict replace
message contract 与 background coordinator。message failure、invalid response、quota/storage
failure 或 external sync conflict 都 fail closed；调用方保留上一个 durable snapshot，不得
fallback 为直接 storage 写入。

## 用户可控制的内容

### 匿名使用统计

- 控制产品事件是否可发送。
- 影响 Options、onboarding、clip、reader、video、usage dashboard 等产品遥测。

### 错误报告

- 控制 `extension_error` 是否可发送。
- 仅用于经过清洗的匿名错误诊断。

### 调试模式

- 仅在 capability 允许时显示。
- 需要 analytics 与 errorReporting 同时开启。
- 任一 consent 关闭时会自动关闭 debug mode。

### 清空全部分析数据

- 清除 analytics 相关 storage keys。
- 同时关闭 analytics、errorReporting、debugMode。
- 清理成功后记录一次 `analytics_data_cleared`；最终事件只使用清理前已授权的 public GA 配置快照。
- 清理失败时不发送 completed 结果。

## Canonical schema

`PrivacyPreferencesOptionsSchema` 是三项 consent 的唯一结构真值：

- analytics: boolean
- errorReporting: boolean
- debugMode: boolean

StoredOptions 允许该对象部分存在；CompleteOptions 要求完整对象。共享类型从
CompleteOptions 推导，action、onboarding dependency、client 与 coordinator boundary
不得重新声明另一套运行时 snapshot 类型。Patch 只修改声明路径；strict replace 在写入
前重新编码完整 replacement，失败时不得部分提交。

## Consent 行为真值

### analytics = off

- 使用/产品事件直接停止。
- Options、onboarding、clip、reader、video、usage dashboard 不发送产品遥测。

### errorReporting = off

- `extension_error` 不发送。
- 其他产品事件仍由 analytics consent 决定。

### 两项都关闭

- 用户侧视为完全关闭 telemetry。
- 即使 public build config 存在，也不应有实际事件流出。
- debugMode 必须归一化为 false。

## 数据边界

允许发送的内容限于低基数事件名/枚举参数、bucket 后的次数或时长、扩展版本、
匿名会话标识和经过清洗的错误分类。

不得发送页面/聊天/阅读/视频正文、Obsidian 路径或 vault 名、完整 URL、cookie、
token、密码、secret、邮箱、IP、用户名、支付信息、原始 duration_ms 或服务端 credential。

## 验证

```bash
node scripts/test-privacy-settings.cjs
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts \
  tests/unit/options/productionStitchShell.actions.test.ts \
  tests/unit/options/productionStitchShell.renderLifecycle.test.ts \
  tests/unit/options/productionStitchSchemaPresence.test.ts \
  tests/unit/shared/schemas/optionsBoundarySchemas.test.ts
```

`scripts/test-privacy-settings.cjs` 只读取 production schema、action/persistence、
onboarding、i18n 和 ownership manifest。它同时自测 intermediate/final manifest
模式，并在任何缺失、错误 disposition 或 final repository boundary 漂移时返回非零。

## 手动 consent-off 证明

1. 在 Options 概览页或 onboarding 中关闭 analytics 与 errorReporting。
2. 执行 Options 导航、clip/reader/video 和连接测试。
3. 确认 owner proxy 没有新事件、debug proxy 没有请求、控制台没有 sent telemetry log。
4. 单独打开 analytics、保持 errorReporting 关闭，确认普通产品事件允许而
   `extension_error` 仍被拒绝。
5. 再打开 errorReporting，受控错误才允许产生经过清洗的 `extension_error`。

对外说明统一为：遥测默认关闭、两项 consent 可独立控制、用户可随时关闭或清空，
任何 server-side credential 都不会保存在扩展内。
