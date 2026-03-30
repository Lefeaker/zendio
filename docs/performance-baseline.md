# 性能优化与热点基线

日期：2026-03-29

## 1. 本轮迁移后的主项

- 已建立 `src/ui/foundation/*` 与 `src/ui/primitives/*`，基础控件不再各自维护分叉 contract。
- `audit:build:report` 已引入 entry / chunk 数量 / 单 chunk 大小三类硬阈值。
- icon 策略已统一到 `src/ui/foundation/icons/index.ts`，`src/*` 其余位置不再直接从 `lucide` 导入。
- shadow style bridge 已统一经由 `src/ui/foundation/style-host/index.ts` 进入。
- `Options` / `content` 兼容层只保留 wrapper，不再作为新的语义真值源。
- `StateManager.ts`、`optionsStore.ts` 等 Options 热路径继续保持 `deepClone=0`、`JSON.stringify=0`。

## 2. 构建拆包结果

验证命令：

```bash
npm run build:dev
npm run audit:build:report
```

本轮结果：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `195.5 KB`
- `build/dist/options/index.js`: `107.5 KB`
- `build/dist/onboarding/index.js`: `10.8 KB`
- 额外 chunk：`111`

代表性 UI chunk：

- `YamlConfigSection`: `77.7 KB`
- `RestSection`: `37.2 KB`
- `TemplatesSection`: `27.8 KB`
- `PrivacySection`: `20.4 KB`
- `supportPrompt`: `18.4 KB`

当前仍需重点关注的大 chunk：

- `chunks/chunk-3IQTRPT5.js`: `576.2 KB`
- `chunks/chunk-VZ3PAZU2.js`: `595.4 KB`
- `chunks/chunk-JF3FOSTR.js`: `196.2 KB`

## 3. 热点报告摘要

验证命令：

```bash
npm run audit:performance:report
```

本轮摘要：

- `src/options/state/StateManager.ts`: `deepClone=0`, `JSON.stringify=0`
- `src/options/state/optionsStore.ts`: `deepClone=0`, `JSON.stringify=0`
- `src/content/index.ts`: `addEventListener=1`
- `src/content/runtime/bootstrapRuntime.ts`: `setInterval=0`, `MutationObserver=0`
- `src/content/reader/utils/markdownBuilder.ts`: `lines=537`, `getElementById=2`
- `src/content/video/platforms/bilibiliPlatform.ts`: `lines=621`, `querySelector=2`, `MutationObserver=2`
- `src/content/video/session.ts`: `lines=642`, `querySelector=1`

## 4. 浏览器与交互回归

已执行的真实浏览器路径：

- `npm run test:e2e:browser`
- `npx playwright test tests/visual/migration-harness.spec.ts --project=chromium-desktop`

确认点：

- YAML config 真实交互通过
- interaction contract harness 可打开统一 dialog contract
- content orchestrator harness 可正常加载
- runtime observability harness 可进入 ready 状态且无 console error

## 5. 后续长期议题

- 继续压缩最大 vendor / shared chunk
- 继续收敛 `bilibiliPlatform.ts` 与 `video/session.ts`
- 为 `src/ui` 引入更明确的 chunk budget / size threshold
- 视 Firefox 运行环境补充 browser smoke 到长期门禁
