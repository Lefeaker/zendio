# Source of Truth 索引

最后更新：2026-05-25

## 正式入口

- 工程命令与门禁：[`engineering-entrypoints.md`](./engineering-entrypoints.md)
- 性能与热点真值：[`performance-baseline.md`](./performance-baseline.md)
- 类型收口路线：[`typescript-strict-roadmap.md`](./typescript-strict-roadmap.md)
- 当前执行计划：[`project-stabilization-plan-2026-04-13.md`](./project-stabilization-plan-2026-04-13.md)
- 当前工作树批次归属：[`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md)
- 架构边界：[`architecture-boundaries.md`](./architecture-boundaries.md)
- 设计系统治理：[`design-system-governance.md`](./design-system-governance.md)
- Options 主链说明：[`../src/options/README.md`](../src/options/README.md)
- 长期维护 backlog：[`long-term-maintenance-backlog-2026-03-29.md`](./long-term-maintenance-backlog-2026-03-29.md)
- 2026-05-20 release readiness handoff：[`release-readiness-handoff-2026-05-20.md`](./release-readiness-handoff-2026-05-20.md)

## 当前执行主线

- 当前统一门禁以 `quality` / `verify:preflight` / CI 三者一致为准
- 当前性能真值以 `audit:build:report` 与 `audit:performance:report` 为准
- 当前 `M4` 已按重定义口径通过；旧版工作树/批次规模预算已下沉到 backlog
- 2026-05-18 stabilization 的 audit-time dirty tree 归属以 [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md) 为准；该文档不再声明当前工作树为 `0` open paths
- 2026-05-19 gap closure 后，batch handoff 使用 post-fact amended ownership；不要再声称历史 committed path manifests exactly once
- Local Vault / offscreen / manifest / release 风险的当前真值来自 2026-05-18 stabilization ledger、2026-05-19 gap closure ledger、集成提交和 `audit:local-vault-release:report`
- Release surface 当前真值：production builds/package outputs 不包含 dev/test harness HTML/JS；dev builds 保留 harness 页面；`audit:release-surface:report` 校验 manifest 文件引用与 forbidden harness package members，并已接入 `quality` 与 CI release-surface 步骤
- Quality gate 当前真值：`quality` 包含 locale source alignment；CI locale source alignment audit 是 hard gate；`lint:options-css` 对当前 `src/options/stitch/styles/**` 解析出非空 `selector-class-pattern` 规则
- i18n 语言范围当前真值：产品决策标签为 `release-13-languages`；release-supported human UI locales 为 `en`、`zh-CN`、`ja`、`de`、`fr`、`es-ES`、`es-419`、`it`、`ko`、`pt-BR`、`ru`、`zh-TW`；README、runtime config、locale loaders、`src/i18n/locales/*.ts` 与 WebExtension `_locales` 必须与该范围一致
- `qps-ploc` 当前分类为 `dev-test-only` pseudo-locale：仅用于开发/测试伪本地化；production runtime locale registry、production build output、Chrome ZIP 与 Firefox XPI 均不得包含 `qps-ploc` loader/chunk 或 `_locales/qps-ploc/messages.json`
- Chrome Web Store release 真值：`release:chrome` 默认 dry-run；真实发布只允许 `release:chrome:publish -- --zip <release.zip>` 并需要 owner credentials / manual confirmation
- 2026-05-20 release readiness 真值：Node `20.20.2` / npm `10.8.2` 下全量 release gate 通过，`npm audit --omit=dev` 为 `0`，`npm audit --audit-level=low` 仍作为 dev/release toolchain 后续计划记录
- 2026-05-21 owner-proof 真值：低复用/retained source 删除只接受 M6.1 六项 owner proof 表中 `delete-approved` 的 exact path；当前 `changelogContent`、`trial-notice`、reader `highlightController` 与 `contentClipOrchestrator` 均未获删除批准
- 2026-05-21 M7 baseline sync 真值：`content/runtime.js` fresh build 为 raw `54,554` bytes，低于 `57,600` stop gate
- 2026-05-24 gap-remediation baseline sync 真值：lint warning baseline 曾同步为 `254`；M3.4 后当前 baseline 已继续收紧为 `165`，不得通过禁用规则或修改 lint 配置制造下降
- 2026-05-24 M2.5 budget ratchet 真值：M2.1-M2.4 合入后，Node `v20.20.2` / npm `10.8.2` 下 fresh `build:fast`、`build:dev`、`audit:build:report`、`audit:performance:report` 已通过；`content/runtime.js` raw stop gate 收紧为 `56,320` bytes，chunk count 收紧为 `<= 112`，hotspot line budgets 以 [`performance-baseline.md`](./performance-baseline.md) 为准
- 2026-05-25 M5.1 type audit truth：`lint:type-any` 扫描 `1076` files；`any: 0`、`unknown: 971`、assertions `1667`、non-null assertions `108`、`ts-expect-error: 5`；M5.3 ratchet 必须从该 measured truth 生成阈值，不得凭计划值手写
- 2026-05-25 M5.1 non-production source truth：`audit:non-production-source:report` 当前 decision counts 为 `migrate-import-owner: 197`、`retain-production: 524`、`retain-production-facade: 17`；任何 `src` 删除仍必须满足六项 exact-path owner proof
- 2026-05-25 M5.1 build/performance truth：`quality` 与 `verify:preflight` 重新通过；dev `content/runtime.js` 为 `53.1 KB`（raw `54,337` bytes），chunk count `102`，hotspot current truth 以 [`performance-baseline.md`](./performance-baseline.md) 为准
- 2026-05-25 M5.3 budget ratchet truth：`lint:type-any:ratchet` 以 `0/971/1667/108/5` 接入 `quality`；`audit:performance:report` 以当前全部 `99` 个 `src` >250 LOC 文件为 line-budget 覆盖集，预算等于本次实测行数
- 2026-05-22 final exit gate 真值：Node `v20.20.2` / npm `10.8.2` 下，`quality`、`verify:preflight`、`test:unit`、`clean`、`build:dev`、`audit:build:report`、`audit:performance:report`、`verify:stitch-secondary`、`visual:test`、browser smoke、reader-panel、local-vault 均已通过；当前 release/交付证据以 Node `20.x` 为准
- 2026-05-22 review gap patch 真值：`productionStitchShellMount.ts` 与 `usageChartRenderers.ts` 已纳入 hotspot/production shape 治理，预算均为 `<= 450` 行；`npm run build`、`npm run build:firefox`、Chrome/Firefox `audit:local-vault-release:report` 已在 Node `20.x` 下补跑通过
- 2026-05-22 retained-code 真值：M6.2 低复用代码退役是安全 no-op，未删除源码；没有新增 `delete-approved` retained low-reuse path，剩余 retained/compatibility source 仍是后续债务

## 历史与归档

- `archive/status-*`、历史 milestone 文档、旧迁移方案只用于追溯
- `archive/legacy-options-assets/` 与 `reference-fixtures/legacy-options/` 仅作参考夹具
- 看到 `archive` / `legacy` / `compatibility` / `retired` 时，默认不要把它当成生产真值

## 使用规则

- 想知道“现在该跑什么命令”，先看 [`engineering-entrypoints.md`](./engineering-entrypoints.md)
- 想知道“现在包体和热点是多少”，先看 [`performance-baseline.md`](./performance-baseline.md)
- 想知道“审计时的脏工作树属于哪个交付批次”，先看 [`current-delivery-batches-2026-04-13.md`](./current-delivery-batches-2026-04-13.md)
- 如果新增正式入口、门禁口径或批次归属规则，必须同步更新本页与 [`README.md`](./README.md)
