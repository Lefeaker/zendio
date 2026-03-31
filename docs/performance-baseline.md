# 性能优化与热点基线

日期：2026-03-31

## 1. 本轮迁移后的主项

- 已建立 `src/ui/foundation/*` 与 `src/ui/primitives/*`，基础控件不再各自维护分叉 contract。
- `audit:build:report` 已引入 entry / chunk 数量 / 单 chunk 大小三类硬阈值。
- icon 策略已统一到 `src/ui/foundation/icons/index.ts`，`src/*` 其余位置不再直接从 `lucide` 导入。
- shadow style bridge 已统一经由 `src/ui/foundation/style-host/index.ts` 进入。
- `Options` / `content` 旧 shared wrapper 已退役，不再作为新的语义真值源。
- `StateManager.ts`、`optionsStore.ts` 等 Options 热路径继续保持 `deepClone=0`、`JSON.stringify=0`。
- i18n locale 已改为按语言拆分的动态加载，不再把全部语言包内联进主 shared chunk。

## 2. 构建拆包结果

验证命令：

```bash
npm run build:dev
npm run audit:build:report
```

本轮结果：

- `build/dist/content/index.js`: `561 B`
- `build/dist/content/runtime.js`: `62.7 KB`
- `build/dist/options/index.js`: `108.7 KB`
- `build/dist/onboarding/index.js`: `11.1 KB`
- 额外 chunk：`126`

代表性 UI chunk：

- `YamlConfigSection`: `77.7 KB`
- `RestSection`: `37.2 KB`
- `TemplatesSection`: `27.8 KB`
- `PrivacySection`: `20.4 KB`
- `supportPrompt`: `18.4 KB`

当前仍需重点关注的大 chunk：

- `chunks/chunk-ITG6F7PJ.js`: `173.0 KB`
- `chunks/chunk-MNZOSRBM.js`: `146.5 KB`
- locale packs 已独立拆分：
  - `chunks/qps-ploc-*.js`: `56.6 KB`
  - `chunks/ru-*.js`: `49.0 KB`
  - `chunks/ja-*.js`: `38.4 KB`

与 2026-03-30 基线相比，本轮收口已完成：

- `content/runtime.js`：`195.5 KB → 62.7 KB`
- 最大 shared/vendor chunk：`595.4 KB → 173.0 KB`
- 内容侧与 UI 侧重复 shared chunk 已通过合并 ESM 构建入口消除
- i18n 全量语言包已从主 shared chunk 拆出，按 locale 独立加载

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
- `npm run test:e2e:browser:smoke`

确认点：

- YAML config 真实交互通过
- interaction contract harness 可打开统一 dialog contract
- content orchestrator harness 可正常加载
- runtime observability harness 可进入 ready 状态且无 console error
- browser 失败时会统一保留 Playwright trace / screenshot，并附带 `browser-console` 文本与 JSON 摘要

## 5. 后续长期议题

- 继续收敛 `bilibiliPlatform.ts` 与 `video/session.ts`
- 为 `src/ui` 引入更明确的 chunk budget / size threshold
- 视 Firefox 运行环境补充 browser smoke 到长期门禁
