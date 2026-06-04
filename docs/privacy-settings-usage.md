# Privacy Settings Usage

最后更新：2026-06-05

本文描述 AiiinOB 当前隐私与数据设置的用户行为、实现边界与验证方式。

## 当前 UI 归属

当前隐私设置不再由旧的 options control path 驱动。当前真值入口：

- `src/options/stitch/schema/settings/overview.ts`
- `src/ui/domains/privacy/PrivacySettingsView.ts`
- `src/options/app/productionStitchPersistence.ts`

## 用户可控制的内容

### 匿名使用统计

- 控制产品事件是否可发送
- 影响 options、onboarding、clip、reader、video、usage dashboard 等产品遥测

### 错误报告

- 控制 `extension_error` 是否可发送
- 仅用于匿名错误诊断

### 调试模式

- 仅开发环境可见
- 需要 `analytics` 和 `errorReporting` 同时为 `on`
- 任一 consent 关闭时，debug mode 会被自动关闭

### 清空全部分析数据

- 清除 analytics 相关 storage keys
- 同时关闭 `analytics`、`errorReporting`、`debugMode`
- 记录 `analytics_data_cleared`，但只有在清理动作完成前仍有 analytics consent 时才会走正常产品遥测路径

## 会收集什么

按当前 catalog / sanitizer 真值，产品与错误遥测只收集：

- 事件名与有限枚举参数
- bucket 化后的次数与时长
- 扩展版本、会话 ID、调试标志
- 匿名错误码、错误域、严重度、可恢复性
- 必要的浏览器大类 / 主版本信息

## 不会收集什么

- 页面正文、聊天正文、阅读高亮正文、视频片段正文
- Obsidian 文件路径、vault 名称、导出笔记路径
- 完整 URL、查询参数、cookie、token、密码、secret
- 邮箱、IP、用户名、电话、支付信息
- 原始 `duration_ms`
- 服务端 credential，包括 `api_secret`

## Consent 行为真值

### `analytics = off`

- `trackUsageEvent` 会直接退出
- options / onboarding / clip / reader / video / usage dashboard 不发事件

### `errorReporting = off`

- `extension_error` 不应发送
- 其他产品事件是否发送仍由 `analytics` 决定

### `analytics = off` 且 `errorReporting = off`

- 用户侧应视为完全关闭 telemetry
- 即使 build-time public config 存在，也不应有实际事件流出

## 如何证明 “consent off 不发事件”

1. 在概览页的“隐私与数据”卡片中关闭两个 consent。
2. 执行一组典型行为：
   - 打开 options 并切换 section
   - 执行一次 clip / reader / video 流程
   - 触发一次连接测试
3. 同时检查：
   - owner proxy 没有接收到新事件
   - 本地 `directDebug` 模式没有 DebugView 新事件
   - 控制台不会出现 sent telemetry log

如果需要重置本地状态，使用“清空全部分析数据”。

## 如何证明 “error 只在 errorReporting on 时发送”

1. 打开 `analytics`，关闭 `errorReporting`。
2. 触发一次受控错误。
3. 应只看到普通产品事件，不应看到 `extension_error`。
4. 再打开 `errorReporting` 并重复。
5. 只有这时 `extension_error` 才应出现。

## 用户说明建议

对外说明应统一为：

- analytics 用于匿名功能使用统计
- error reporting 用于匿名错误诊断
- 用户可以随时关闭或清空
- 任何 server-side credential 都不在扩展内保存

不要再沿用旧说法，例如旧 control path、旧 options component 路径，或要求用户在扩展内填写服务端 credential 的说明。
