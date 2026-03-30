# 目标架构迁移后的长期维护 Backlog

日期：2026-03-29
来源：[`final-acceptance-report-2026-03-29.md`](./final-acceptance-report-2026-03-29.md)

## P1

1. 压缩最大 shared/vendor chunk
   - 目标：继续拆解 `chunks/chunk-3IQTRPT5.js`、`chunks/chunk-VZ3PAZU2.js`、`chunks/chunk-JF3FOSTR.js`
   - 守门：`npm run audit:build:report`

2. 收口 content 热点文件
   - 目标：继续削减 `src/content/video/platforms/bilibiliPlatform.ts`、`src/content/video/session.ts`
   - 守门：`npm run audit:performance:report`

3. 继续压缩 `sectionRegistry.ts`
   - 目标：把剩余 registry 式协调替换为 typed controller / explicit callback
   - 边界：不得把新职责继续加回 registry

## P2

4. 为 `src/ui` 建立明确 chunk budget / size threshold
   - 当前已有 build report，但尚未设置失败阈值

5. 把 migration harness smoke 纳入长期 browser guard
   - 当前已有 `tests/visual/migration-harness.spec.ts`
   - 后续可考虑加入默认 browser CI 或 nightly smoke

6. 评估 Firefox browser smoke 纳入常规门禁
   - 当前为可选路径：`npm run test:e2e:browser:firefox`

## P3

7. 评估清理 archive 中不再需要的 legacy 参考资产
   - 范围：`docs/archive/legacy-options-assets/*`
   - 前提：harness / visual regression 已能完全替代历史预览用途
