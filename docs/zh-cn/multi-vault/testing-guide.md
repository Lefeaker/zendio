# 多仓库连接验证指南

## 验证目标

确认 Zendio 使用当前生产 REST 写入路径连接到 Obsidian Local REST API，并且不同仓库的本地配置不会互相污染。

本指南不再提供可直接运行的手写 REST 调试脚本。旧脚本包含固定端口、固定仓库名、旧 URL 语义和示例密钥，容易与当前生产实现不一致。

## 准备工作

1. 启动 Obsidian，并启用 Local REST API 插件。
2. 在插件设置中生成或复制本机 API Key。
3. 在 Zendio Options 中为每个仓库填写：
   - HTTPS URL 或 HTTP URL
   - Vault 名称
   - API Key
4. API Key 只能来自本机插件设置，不要写入仓库、文档、截图或提交信息。

## 推荐验证方式

### Options 连接测试

优先使用 Options 页面内置连接测试。该入口复用生产连接配置与错误展示路径，适合验证本机 Obsidian、端口、Vault 名称和 API Key 是否匹配。

### REST 候选与路径单元测试

修改 REST URL、Vault 路径或候选协议逻辑时，运行聚焦测试：

```bash
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts \
  tests/unit/infrastructure/restClient.test.ts \
  tests/unit/shared/restCandidates.test.ts
```

这些测试覆盖当前生产 URL 契约，包括避免重复拼接 `/vault/<vault>` 的行为。

### 写入路径与接口测试

修改写入编排、接口契约或平台服务时，运行：

```bash
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts \
  tests/unit/background/obsidianWriter.test.ts \
  tests/unit/shared/interfaces.test.ts \
  tests/unit/platform/preview/services.test.ts
```

### Local Vault 浏览器验证

需要真实浏览器或 Local Vault 场景时，使用仓库维护的浏览器 harness 和 e2e 命令，而不是复制 REST 请求脚本。具体入口以 `docs/engineering-entrypoints.md` 中的 Local Vault / browser checks 为准。

## Vault 身份与旧数据恢复合同

- 新建 Vault 使用与列表长度、行号、名称和时间无关的稳定 ID，并在写入前检查碰撞。显式提供的重复 ID、无解的默认 Vault 或无解的规则引用会在严格存储边界被拒绝。
- 读取旧版重复 ID 数据时，第一行保留原 ID，后续同 ID 行获得确定且幂等的兼容 ID，不删除任何 Vault。后续行内嵌规则跟随其所在行的新 ID；旧顶层规则和默认 Vault 只含歧义旧 ID 时继续指向历史第一行，不根据名称、URL 或文件夹猜测其他行。
- 如果旧顶层规则与第一行的内嵌规则使用相同规则 ID，身份规范化仍会写入；顶层规则数组和两份规则载荷都保留，由现有顶层优先的规则去重顺序继续决定实际路由，不借身份迁移改写规则优先级。
- 同一旧 ID 下的本地文件夹授权只属于第一行。迁移不会把目录句柄复制给后续行；这些行需要用户重新选择本地文件夹，避免把同一目录权限意外授予另一个 Vault。
- 自动迁移先规范化身份，再折叠旧顶层规则并执行严格校验。portable Options 与 device-local binding 继续由现有 recovery journal 协调；故障或浏览器中断后只能成对回滚或继续完成，不能单独恢复旧 binding 快照。
- 自动写回只适用于 codec 判断为无损的旧配置。包含未知 root 或无效 section 的数据保持原样并报告问题，不通过身份迁移静默丢弃扩展字段。

聚焦验证入口：

```bash
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts \
  tests/unit/shared/storedOptionsCodec.test.ts \
  tests/unit/shared/deviceLocalVaultBindings.test.ts \
  tests/unit/background/vaultRouter.test.ts \
  tests/unit/options/vaultRouterStore.test.ts

PLAYWRIGHT_BROWSERS_PATH=/Users/mac/Library/Caches/ms-playwright \
  node scripts/run-bounded-command.mjs --profile playwright-v1 -- test \
  tests/e2e/optionsIncrementalRender.browser.test.ts \
  tests/e2e/optionsCrossContextMutation.browser.test.ts \
  --project=chromium-desktop --grep F04
```

## 密钥处理要求

- 文档中只写占位符，例如 `<YOUR_LOCAL_REST_API_KEY>`。
- 本地测试时通过 Options UI、临时环境变量或手动输入提供 API Key。
- 不提交 64 位十六进制 API Key 示例。
- 不在终端输出、ledger、截图或最终报告中复制真实 API Key。

## 常见问题

### 连接失败

1. 确认 Obsidian 正在运行。
2. 确认 Local REST API 插件已启用。
3. 确认 Zendio Options 中的 URL、端口和 Vault 名称与插件配置一致。
4. 优先查看 Options 连接测试的错误信息。

### 认证失败

1. 重新从 Local REST API 插件复制 API Key。
2. 确认没有多余空格或换行。
3. 不要复用文档、历史脚本或他人机器上的示例值。

### 写入路径异常

1. 先运行 REST 候选与路径单元测试。
2. 确认当前路径契约由 `src/shared/paths/vaultWritePath.ts`、`src/background/utils/restCandidates.ts` 和 `src/infrastructure/restClient.ts` 覆盖。
3. 如需排查生产写入流程，优先检查 `src/background/services/obsidianWriter.ts` 相关测试。
