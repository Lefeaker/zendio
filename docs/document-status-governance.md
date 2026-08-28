# 文档状态治理

最后更新：2026-08-28

本页定义 Zendio 当前 Git 跟踪 Markdown 的最小状态分类。分类用于区分当前工程入口、历史材料和测试夹具；它不解析文档正文，也不替代命令边界、代码 owner、测试或人工文档审查。

## 状态定义

- `active`：当前维护的产品、工程、运维、测试或用户文档。它可以被当前入口索引直接引用。
- `historical`：保留用于追溯的完成总结、旧方案、旧 handoff、旧变更记录或过时说明。它不是当前执行真值，只能从明确标注的历史/参考区域引用。
- `fixture`：测试专用 Markdown。它的正文只属于对应测试夹具，不是工程或产品指导。

当前清单由 [`tools/active-document-status.json`](../tools/active-document-status.json) 维护，共 `143` 行：`93 active`、`49 historical`、`1 fixture`。清单顶层只包含 `schemaVersion` 和 `documents`；每一行只包含 `path` 和 `status`。

## 当前入口索引

以下五个页面是当前文档入口面：

- [`../README.md`](../README.md)
- [`README.md`](./README.md)
- [`source-of-truth-index.md`](./source-of-truth-index.md)
- [`DESIGN-SYSTEM-INDEX.md`](./DESIGN-SYSTEM-INDEX.md)
- [`engineering-entrypoints.md`](./engineering-entrypoints.md)

这些入口可以在明确的历史/参考区链接 `historical` 文档，但不得把历史材料描述为当前完成状态、当前命令或当前 owner。

## 检查命令

在仓库根目录使用固定的 direct-tool profile：

```bash
node scripts/run-bounded-command.mjs --profile node-script-standard-v1 -- tools/report-active-document-contract.mjs --report
node scripts/run-bounded-command.mjs --profile node-script-standard-v1 -- tools/report-active-document-contract.mjs --check
```

`--report` 输出当前 Git 跟踪 Markdown 的计数和排序后的普通 findings；`--check` 在存在未分类路径、失效清单路径、非法状态、重复/未排序行、额外 schema 字段或 Markdown symlink 时退出非零。

## 维护流程

1. 新增 Git 跟踪 Markdown 时，在同一提交中增加一条按路径 code-unit 顺序排列的清单行。
2. 删除或重命名 Markdown 时，同步删除/重命名清单行，并修复当前入口与其他保留文档中的链接。
3. 只有仍代表当前维护口径的文档才能标为 `active`。阶段计划、完成总结和 dated handoff 默认应标为 `historical`，或保留在忽略目录而不进入长期文档。
4. 只有测试树中被测试 owner 使用的 Markdown 才能标为 `fixture`。
5. 运行上面的 report/check，并按变更范围继续运行现有测试、类型检查、lint、quality、preflight、build 和真实 pre-commit hook。

## 边界

- 本检查只读取当前 Git 路径和清单，不读取或执行 Markdown 中的命令、代码块或链接目标。
- 当前可执行命令的语法与 admission 继续由 [`engineering-entrypoints.md`](./engineering-entrypoints.md) 和现有 command-boundary owners 管理。
- `historical` 不表示内容已验证，也不允许旧文档覆盖当前源码、配置、测试或工程入口。
- 文档内容最终同步仍按普通 code review 与对应 owner 完成；状态清单不是历史 Git 重放、对象身份绑定或发布凭据。
