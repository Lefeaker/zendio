# Privacy Settings Usage

最后更新：2026-08-26

本文描述 Zendio 当前隐私与数据设置的用户行为、生产实现边界与验证方式。

## 当前生产归属

- UI schema：`src/options/stitch/schema/settings/overview.ts`
- canonical schema：`src/shared/schemas/options.schema.ts`
- schema-derived type：`src/shared/types/options.ts`
- consent mutation：`src/options/app/actions/privacyConsentAction.ts`
- Options persistence/runtime wiring：`src/options/app/productionStitchPersistence.ts`
- onboarding consent wiring：`src/onboarding/bootstrap.ts`
- repository contract：`src/shared/repositories/IOptionsRepository.ts`

Options 和 onboarding 都读写同一 `privacyPreferences` 对象。生产 action 通过
`IOptionsRepository.patch` 更新 analytics、errorReporting、debugMode 三个字段；
Options persistence 随后同步运行时 analytics/error reporter 状态并调度保存。
不存在第二套 privacy view/controller/persistence 实现。

UI ownership manifest 在当前 intermediate 状态保留恰好两条 U02C4
`deferred-state-convergence` 类型契约。它们只维持编译边界，不拥有运行时行为；
最终状态会删除这两条记录，并继续使用 schema-derived
`PrivacyPreferencesOptions` 与 repository patch contract。

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
CompleteOptions 推导，action、onboarding dependency 和 repository boundary
不得重新声明另一套运行时 snapshot 类型。

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
