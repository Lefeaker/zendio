# 剪藏 UI / REST Sink 共享能力清单（C1）

## 目标

整理剪藏链路中跨模块复用的能力，明确可抽取的工具函数，以支持后续解耦工作（C2-C4）。

## 涉及文件

- `src/content/clipper/services/contextCapture.ts`
- `src/content/clipper/components/dialog.ts`
- `src/background/sinks/obsidianRest.ts`
- 相关辅助模块：`src/content/clipper/utils/markdown.ts`、`src/content/clipper/utils/datetime.ts` 等

## 共享能力

| 能力                   | 主要位置                          | 复用点 / 问题                                                             | 拟抽取方向                                                                                   |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 上下文截取与序列化     | `contextCapture.ts`               | DOM 选择、列表路径、片段序列化逻辑杂糅，其他流程可能也需复用高亮/格式整理 | 抽象为 `contextDomUtils`（选择范围、列表路径）+ `contextSerialization`（HTML/Markdown 处理） |
| Markdown 高亮/脚注处理 | `clipper/utils/markdown.ts`       | 已部分解耦，但 `contextCapture` 内仍有大量重复逻辑                        | 继续集中在 utils，提供易组合的函数                                                           |
| UI 对话框拖拽/样式注入 | `components/dialog.ts`            | 拖拽状态管理、全局 style 插入与业务逻辑混在一起                           | 抽出 `dragController`（指针事件处理）与 `styleManager`（临时样式注入）                       |
| 时间/命名辅助          | `clipper/utils/datetime.ts`       | 格式化时间戳、生成默认文件名等散落多个文件                                | 统一工具函数目录，确保所有格式一致                                                           |
| REST 写入重试策略      | `obsidianRest.ts`                 | request 构造、重试、日志混在同一文件，重复拼接 URL                        | 拆分 `restRequestBuilder`、`restRetryHandler`，并在多处使用                                  |
| 敏感日志过滤           | `obsidianRest.ts`                 | 当前日志输出包含 API Key 片段（截断但仍有风险）                           | 建立 `safeLog` 工具，统一处理敏感字段                                                        |
| 配置回退策略           | `obsidianRest.ts`                 | HTTPS/HTTP 组合尝试逻辑繁琐，其他模块若有需要重复                         | 封装成可注入的策略对象，测试覆盖端口回退                                                     |
| 事件/状态总线          | `dialog.ts` + `contextCapture.ts` | 目前通过 Promise resolve/async 传递，调试困难                             | 引入更清晰的事件接口或独立状态管理对象（视需求）                                             |

## 下一步建议

1. 在 `src/content/clipper/shared/` 下建立共享模块目录：`dom.ts`、`interaction.ts`、`serialization.ts` 等。
2. 在 `src/background/sinks/` 下拆分 `obsidianRest` 的 URL 构造、fetch 调用与重试策略，并增加单元测试覆盖。
3. 准备针对拖拽、重试、上下文序列化的最小单元测试，确保抽取后功能稳定。

> 本清单为后续 C2-C4 的拆分参考，后续落地时应同步更新。
