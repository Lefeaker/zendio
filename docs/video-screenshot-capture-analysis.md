# 视频截图捕获、缓存与导出边界

最后更新：2026-08-28

## 1. 当前行为

Zendio 的 Video session 已实现可见标签页截图、异步准备、draft 恢复、background
IndexedDB Blob cache 与 Markdown 附件导出。截图失败不会阻塞时间戳/片段 capture；用户可在
Options 中控制截图行为与附件模板。

当前不变量：

- draft 只持久化 `screenshotRequested` 与 metadata-only `screenshotRef`；不得保存
  `screenshot`、data URL、base64 或其他 binary bytes。
- screenshot bytes 的 durable owner 是 background-owned extension IndexedDB Blob cache。
- runtime/message/export/write 边界使用 JSON-safe serialized binary content；需要 Blob 时通过
  `serializedAttachmentContentToBlob()` 恢复。
- source manifest 不声明 `unlimitedStorage`、`message_serialization` 或 `tabCapture`。
- 当前没有 idle ZIP/archive packing。

## 2. 有限 owner 闭包

| 边界                               | 当前 owner                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| capture intent / session lifecycle | `src/content/video/videoSessionRuntime.ts`, `videoSessionCaptureMutations.ts`, `screenshotIntent.ts`                                                  |
| visible-tab frame capture          | `src/background/listeners/visibleTabScreenshot.ts` 与 runtime message dependencies                                                                    |
| lazy preparation                   | `videoScreenshotPreparationCoordinator.ts`, `videoScreenshotPreparationQueueOwner.ts`, lazy `videoScreenshotPreparationQueue.ts` 与 request store     |
| durable draft                      | background `sessionDraftMutationQueue.ts`, `sessionDraftStore.ts`, storage/receipt owners；content draft clients/persisters                           |
| screenshot cache message boundary  | `videoScreenshotCacheClientRepository.ts`, `videoScreenshotCacheMessages.ts`, background `videoScreenshotCacheService.ts`                             |
| Blob durability                    | background `videoScreenshotCacheIndexedDbStore.ts`                                                                                                    |
| legacy compatibility               | `videoScreenshotCacheLegacyRepository.ts`; legacy `storage.local` base64 rows only read/migrate/clean                                                 |
| export attachment                  | `videoScreenshotExportAttachments.ts`, background `videoScreenshotAttachmentPlanner.ts`, `clipProcessor.ts`, shared attachment templates/binary codec |

## 3. 捕获与准备生命周期

Content session 将 screenshot intent 与 capture identity 交给 lazy preparation owner。可见标签页
路径通过 background `tabs.captureVisibleTab` 获取当前窗口图像；queue 控制 visible request、hidden
duplicate retry、capture index 与 callback 生命周期，避免 routine session runtime 静态导入完整实现。

- success：截图写入 cache 后获得 normalized `screenshotRef`，再同步 capture/draft。
- failure：保留 capture 与可见错误状态；无截图导出仍可继续。
- cancel/dismiss/dispose：停止当前 owner 的后续 UI 安装；已取消 request 的 late completion
  不得覆盖新 generation。
- supersede：同一 capture 的新 request 取代旧 request；旧 completion 只按 queue 的 current
  request state 判定，不创建额外 receipt/nonce 协议。
- hidden/missing frame：使用现有低并发 fallback/retry；不申请 `tabCapture` 权限。

截图状态切换不得 seek/pause/play 用户当前可见视频；note、capture 与 session draft mutation
继续使用现有 commit/rollback owner。

## 4. Draft 与 lease/receipt 边界

Reader/Video draft mutation 通过 background queue 串行写入。store/storage/receipt/liveness owners
负责 exact-key envelope、幂等结果、租约存活与 terminal state；content 侧不得直接写
`storage.local`。

- active draft 可持有 `screenshotRequested` 与 `screenshotRef`。
- `discarded` / `exported` terminal envelope 不可被 restore candidate 重新选择。
- cancel/export success 必须先 durable terminal write，再 cleanup 或发送 success telemetry。
- terminal write failure 保留 mounted session 与可重试状态。
- 已知 exact storage key 时不得只按 draft id 扩大 cleanup 范围。

默认开源 retention 为最近 `48` 小时、最新 `5` 个 Reader/Video 页面身份、每页最新
`20` 条 recoverable item；`SESSION_DRAFT_MAX_ENTRIES=100` 与单 envelope `512 KiB`
仍是独立技术保护。20-item cap 只裁剪 durable draft，不删除当前页面 live state，也不立即
删除可能成为 orphan 的 screenshot Blob。

## 5. IndexedDB Blob cache

截图数据库当前 schema version 为 v2：

- v1 `entries` store、`key` keyPath、四个索引和 row `schemaVersion: 1` 保持不变。
- v2 只新增 `metadata` store 与 maintenance row；v1→v2 不读取、重写或删除截图 Blob。
- fresh install 使用相同 0→1→2 upgrade 顺序。
- repeated v2 open 验证 store/keyPath/index/maintenance shape；future version 或结构漂移
  fail closed，绝不 delete/reset database。

共享 IndexedDB lifecycle 处理 blocked timeout、late-success close、`versionchange` close、
upgrade abort 与 settle-once。Request success 只是 provisional result；read/write API 必须等所属
transaction `complete` 才 resolve，transaction error/abort 必须 reject 并关闭 owned connection。

Cache 受 TTL、全局条目数、单页面条目数与单截图 bytes 上限约束。Prune 在同一个
`entries + metadata` readwrite transaction 中提交 rows 与 `lastPrunedAt`；abort 同时保留旧
rows/metadata。每次成功 prune（包括零删除）才推进 maintenance timestamp。

## 6. Restore、兼容迁移与清理

- valid cache hit：直接 hydrate screenshot，不立即 seek 可见视频。
- invalid/stale/missing/expired/corrupt ref：清理 draft ref，并回落到低并发 preparation；
  pending state 保持可恢复。
- legacy `screenshotRequested`-only draft：按当前 preparation owner 恢复。
- legacy `storage.local` base64 hit：best-effort migrate 到 IndexedDB，随后删除旧 key。
- capture 删除：只有 mutation durable commit 后，才 best-effort 删除当前 draft 不再引用的
  Blob ref；cache cleanup failure 只 warning，不回滚 capture 删除。
- terminal cleanup/global prune：同步删除对应 refs；orphan 由 TTL/global prune 收敛。

## 7. 导出与附件模板

`video.screenshotAttachment.{locationTemplate,fileNameTemplate,markdownUrlFormat}` 只规划
export-time 路径、文件名和 Markdown URL。`VideoSessionExporter` 生成 Markdown 与 serialized
attachments；background planner 解析/去重模板，`clipProcessor` 将 serialized content 恢复为
Blob，并由当前 vault writer 路径写入附件和 Markdown。

附件模板不得变成 durable cache key 或 draft schema。写入失败沿用现有 clip transaction/error
行为；不得用内联 base64 draft 或 background idle archive 作为 fallback。

## 8. 权限与隐私

- `activeTab` / `tabs.captureVisibleTab` 只用于用户当前交互触发的可见标签页截图。
- `offscreen` 支撑当前 background 图像处理链；不引入持续媒体流。
- 截图可能包含当前页面可见内容；产品 disclosure 与
  [`privacy-policy.md`](./privacy-policy.md) 必须保持一致。
- 截图 bytes、页面正文、用户名或完整 URL 不得进入 analytics。

## 9. 验证入口

```bash
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts \
  tests/unit/background/videoScreenshotCacheIndexedDbStore.test.ts \
  tests/unit/content/video/videoScreenshotCacheRepository.test.ts \
  tests/unit/content/video/videoScreenshotPreparationCoordinator.test.ts \
  tests/unit/content/video/VideoSession.test.ts
node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:video
node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:state
```

Browser regression 必须覆盖 reload、同 context 关闭/重开，以及用同一 `userDataDir` relaunch
persistent browser context；同时验证删除 capture 后 cache entry cleanup。完整工程/浏览器命令
以 [`engineering-entrypoints.md`](./engineering-entrypoints.md) 为准。

## 10. 剩余产品决策

以下事项属于未来产品策略，不表示当前实现缺失：

- 是否增加额外截图格式/质量选项；
- 是否增加隐私遮罩或二次确认；
- 是否通过通用 `retentionPolicy` 注入不同 cache TTL/容量策略。

任何扩展都必须保持 metadata-only draft、background Blob ownership、transaction-complete 成功
边界、当前权限下限与现有 export attachment contract。
