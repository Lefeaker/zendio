# CI 工作流配置指南

当前 CI 真值由 `.github/workflows/ci.yml`、
`.github/actions/setup-node-deps/action.yml`、
`.github/actions/setup-playwright/action.yml` 与
`tools/report-ci-workflow-contract.mjs`、
`scripts/config/githubActionPins.mjs`、
`tools/report-github-actions-supply-chain.mjs` 共同定义。不要复制旧的
`npm ci`、`npx`、默认 package-manager cache 或
`~/.cache/ms-playwright` 示例。

## 命令边界

每个 job 的第一步都是 checkout 前的 `bootstrap-shell-v1`：

- 只使用 Bash 3.2 builtin；
- 拒绝 `NODE_OPTIONS`、`HUSKY` 与大小写变体的
  `npm_config_*`；
- 绑定 GitHub run/job、Ubuntu 24.04 image 与单调启动时间；
- 只创建 mode-0600 的启动 stamp，不创建目录。

checkout 与 full-SHA pinned `actions/setup-node`（同一行保留审核别名
`# v6`）后，第一个仓库 Node 入口是：

```bash
node scripts/run-bounded-command.mjs --profile github-ci-install-v1
```

该 profile 验证 stamp、job class、总预算与 `GITHUB_OUTPUT`，原子保留
attempt root 和 `install` 子目录，创建 private npm user/global config，
再用绝对 npm CLI argv 执行 locked install。Composite 只输出：

- `attempt-root`
- `npm-userconfig`
- `npm-globalconfig`

`actions/setup-node` 必须使用 literal `package-manager-cache: false`。
不得添加 `cache:`、`actions/cache`、raw npm、`GITHUB_ENV` 或第二个
setup/install fallback。

## GitHub Actions supply chain

所有 Git-visible `.github/**/*.yml|yaml` 都由结构化 YAML inventory 扫描。
外部 `uses:` 必须匹配 `scripts/config/githubActionPins.mjs` 的五行 allowlist：
reviewed full 40-hex commit 与同一行的精确 `# vN` 注释缺一不可；tag、branch、
short SHA、expression、Docker、remote reusable workflow 与未登记 subpath 均 fail
closed。两个本地 action 必须保持 Git-visible、regular、composite-only，并递归扫描
其 `runs.steps[*].uses`；禁止 traversal、symlink、dual manifest 与 cycle。

当前闭包为 `5` 个 YAML owner、`38` 个 external uses、`21` 个 local uses 与
`2` 个 composite action。`audit:github-actions-supply-chain:{report,check}` 都经
`npm-script-standard-v1`；check 只在 inventory 零 findings 时成功。该 check 在
`quality` 中恰有一个 typed task，是 CI Static preflight 的第六个/final suffix
leaf，并在 Chrome/Firefox 的无凭据 prepare job 中各运行一次；不得进入受保护的
publish/submit job。

## Playwright

Chromium setup 是两个顺序且不可合并的固定阶段：

```bash
node scripts/run-bounded-command.mjs --profile playwright-host-deps-platform-v1 -- chromium-with-host-deps
node scripts/run-bounded-command.mjs --profile playwright-browser-install-v1 -- chromium-with-host-deps
```

第一阶段只对 GitHub-hosted Ubuntu 的 privileged host dependencies
负责，最终终止边界属于 job timeout；第二阶段安装 attempt-owned bundled
browser，并由普通 bounded lifecycle 监督。Firefox job 使用同样的两个
literal profile，参数固定为 `firefox-with-host-deps`。禁止 default
browser cache、channel/executable override、raw Playwright CLI 或 shell
插值。

## Job 拓扑与预算

所有 job 使用 literal `ubuntu-24.04`：

- `static-preflight`：60 分钟；
- `package`：35 分钟；
- 其他 generic job：30 分钟；
- browser/visual job：60 分钟。

固定 job 集合为 static preflight/release/generated/style/reporting、
coverage、visual matrix、E2E Vitest、YAML/reader/smoke/video/Firefox
browser 与 package。Package 只依赖 `static-preflight`；报告型 audit
可以保留 step-level `continue-on-error`，不得给 hard gate 或 browser
test 添加 masking。

每个 repository `run:` step 必须是 direct root coordinator 或
`node scripts/run-bounded-command.mjs --profile ...`。不得使用 raw
`npm`、`npx`、`pnpx`、bare Vitest/Prettier/Stylelint/Playwright、
shell chain、caller-selected cwd/env/timeout/concurrency 或共享 browser
output。

## 本地验证

```bash
node scripts/run-bounded-command.mjs --profile npm-script-quick-v1 -- audit:ci-workflow:check
node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:github-actions-supply-chain:report
node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:github-actions-supply-chain:check
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/tools/ciWorkflow.test.ts
node scripts/quality-check.mjs
node scripts/verify-preflight.mjs
```

Husky 的 tracked target 只能调用 `lint-staged-hook-v1`，正常提交不得使用
`--no-verify`。格式化和修复应在提交前完成，使真实 hook 的第二次执行保持
index tree 与 stash ref 不变。

### Job context inheritance

Each CI job declares `ZENDIO_JOB_CLASS` and `ZENDIO_JOB_TIMEOUT_MINUTES` once in
job-level `env`. Bootstrap, dependency setup and every later bounded command inherit
those same constants. Step-only setup variables do not persist into later steps;
using them caused `CI_ENVIRONMENT_INVALID` immediately after a successful install.
The workflow contract rejects missing job bindings and step overrides. The command
boundary still validates the attempt root and npm configuration authority; no
`GITHUB_ENV` propagation or environment-policy exception is used.
