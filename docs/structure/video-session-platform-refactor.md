# 视频会话平台边界与 DOM 变更观察

## 当前结构

视频模式已经拆成会话编排、平台适配和 DOM 能力三层：

```text
src/content/video/videoSessionRuntime.ts
  -> videoSessionControllers.ts
    -> fragmentHighlightCoordinator.ts
    -> sessionPlatformController.ts
      -> platforms/index.ts
        -> base / youtube / bilibili adapter
```

`VideoSession` 负责会话组合和清理，不保存平台特化的 ShadowRoot 状态。平台工厂仍由
`sessionPlatformController.ts` 调用；替换平台时必须先释放旧适配器，再构造新适配器。

## 平台适配接口

`VideoPlatformAdapter` 只公开平台行为：

- 激活判定、选区解析和文本 Range 查找；
- 高亮创建与恢复；
- 时间戳 URL 和标题格式化；
- 可选的 selection-root 启动入口；
- 完整、幂等的 `dispose()`。

文档级 DOM 订阅不是适配器的兼容方法。平台需要变更通知时，必须通过组合根注入的
`DocumentMutationHub` 显式订阅，并在适配器释放时调用对应 disposer。

## DocumentMutationHub

`src/content/runtime/documentMutationHub.ts` 以 `WeakMap<Document, DocumentMutationHub>`
保存每个 Document 的唯一实例。实际获取点只有 `videoSessionRuntime.ts`；同一对象随后传给
controllers、`FragmentHighlightCoordinator` 和 `VideoPlatformContext`，下游不得再次获取。

Hub 的固定契约如下：

- 第一个订阅者连接唯一的 `document.body` observer，最后一个订阅者释放时断开；
- 每个订阅者先同步过滤自己的 MutationRecord，再进入自己的 coalescing 队列；
- 不同订阅者或 key 的队列相互独立；
- filter/callback 异常只报告当前订阅者，不阻塞其他订阅者，也不毒化后续批次；
- disposer 幂等，并取消该订阅者尚未执行的工作；
- observer generation 与 subscriber generation 阻止释放后的迟到回调。

Fragment 高亮订阅只在至少存在一个 fragment capture 时有效。它在 coalescing 前拒绝弹幕、
无关文本和无有效高亮关系的移除事件；相关记录只进入 `FragmentHighlightCoordinator` 的既有
有界 restore scheduler，不直接扫描全局 DOM。Bilibili body 订阅只负责评论 root 发现，不为同一
记录再次触发全局 restore。最后一个 fragment 消失时 fragment 队列立即释放；零 fragment 会话
仍保留 Bilibili 发现订阅。

## Bilibili ShadowRoot 发现

MutationObserver 不跨 Shadow DOM。Bilibili 适配器因此拥有一条与 body hub 分离的 scoped
observer：

1. body 订阅发现外层评论 host；
2. 外层 open ShadowRoot 由唯一 scoped observer 注册；
3. scoped callback 发现稍后加入的嵌套评论 host；
4. 每个新评论 root 注入高亮样式，并由当前 adapter 显式拥有 selection bridge 注册；
5. root 断开时立即注销 selection listener/强映射并重建 scoped 观察集合；同一 root 重连可再次注册；
6. adapter 释放时注销其全部 selection root，scoped observer、轮询 timer 和 body disposer 一起清理。

搜索用评论 root 只保存 `WeakRef<ShadowRoot>`，每次读取时剔除已回收或已断开的 root。
等待 `shadowRoot` 出现的 host 只作为 WeakMap/WeakRef 身份参与最多 20 次有界轮询；第 20 次
回调仍先检查 `host.shadowRoot`，再判定耗尽。同一 host 不会启动第二条轮询链，成功、断开、
耗尽、替换或释放都会停止后续工作。

`observeWithFragmentObserver` 仍是平台 context 的低层 scoped 能力：它把 Bilibili 自己创建的
scoped observer 连接到具体 Element/ShadowRoot。它不能用于 `document.body`，也不代表 fragment
订阅必须存在。

## 生命周期矩阵

| 事件                   | 结果                                                          |
| ---------------------- | ------------------------------------------------------------- |
| 第一个 body 订阅       | 创建并连接一个 observer                                       |
| 新增 fragment          | fragment subscriber 加入现有 hub                              |
| 删除最后一个 fragment  | 只释放 fragment subscriber；活动 Bilibili subscriber 保留 hub |
| Bilibili adapter 替换  | 旧 body/scoped 订阅和轮询先释放，迟到工作失效                 |
| 最后一个 body 订阅释放 | 取消队列并断开 observer 一次                                  |
| 外层评论 host 出现     | 注册外层 ShadowRoot                                           |
| 嵌套评论 host 稍后出现 | scoped observer 注册嵌套 root，即使 fragment 数量为零         |
| 评论 root 断开并重连   | 注销旧 listener/强映射；同一 root 重连后重新注册              |
| 弹幕或无关变更         | 在 coalescing 前拒绝，不触发全局高亮恢复                      |
| 会话完成、取消或失败   | fragment、平台和其余会话 owner 都沿现有 cleanup 路径释放      |

## 验证要求

变更此边界时至少验证：

- hub 的唯一 body observer、过滤、独立合并、异常隔离、幂等释放和迟到回调；
- fragment 首次订阅、最后释放、适配器替换及无迟到 restore；
- Bilibili 零 fragment 外层/嵌套 ShadowRoot 发现、弱引用剔除、有界轮询和 scoped 释放；
- Bilibili 弹幕风暴不增加全局 restore、高亮插入或 selection listener；
- VideoSession cleanup 后没有 body/scoped observer 或 timer 遗留；
- `typecheck:app`、`typecheck:tests`、`typecheck:strict`、quiet lint、performance/build 报告、
  `quality`、`verify:preflight`、production build 和真实 pre-commit hook。

平台工厂 facade、package scripts、CI/shard registry 和性能预算不是此边界的扩展点。若实现需要
修改这些 owner，必须先重新完成调用者闭包和 write-set 审计。
