# Pending Tasks

> **更新日期**：2026-03-15
> **判定口径**：以代码 / 测试 / 当前主文档真值为准；只保留当前仍未闭环的真实事项
> **当前定位**：本文件用于维护活跃 backlog，不再保留“接受混用 / 边界未定”的过渡表述

---

## 当前活跃事项

### Phase 2 / Platform 主链收口
**关联文档**：`DEBT-IMPLEMENTATION-ROADMAP.md`、`GET-PLATFORM-SERVICES-CLEANUP.md`

- [x] B-12：`src/background/pipelines/clipPipeline.ts` 已退出 `getPlatformServices().tabs` 直连
- [x] 定向验证：`tests/unit/background/clipPipeline.test.ts`
- [x] 搜索证明：`rg -n "getPlatformServices\\(" src/background/pipelines/clipPipeline.ts` 返回空
- [x] B-12 验收后已按当前仓库真值重排剩余调用点口径：`runtimeMessages.ts` / `contextMenus.ts` 已不在残留清单
- [x] `src/options/bootstrap.ts` 的 legacy compatibility 已改为显式注入 `StorageService`
- [x] `src/shared/errors/analytics/analyticsConfig.template.ts` 已改成显式注入模板
- [x] `tests/unit/options/bootstrap.test.ts` 当前已恢复通过，`options/app/bootstrap.ts` 的 shell fallback 回归不再保留为活跃项
- [x] `tests/unit/background/runtimeMessages.test.ts` 已恢复通过，不再作为活跃回归项
- [x] `tests/unit/background/bootstrap.test.ts` 已修复 hoisted mock 初始化顺序并恢复为稳定门禁
- [ ] 持续保留的 bootstrap / composition root 调用点仅作为 inventory，不再误记为“已整体收口完成”
- [ ] 下一批：冻结 allowlist，只允许 bootstrap / composition root 保留 `getPlatformServices()`
- [x] `IOptionsRepository` 已成为生产主合同；content/background/Options 主链已退出 `PlatformServices.optionsRepository`

### Stage 3 总体计划
**关联文档**：`STAGE3-IMPLEMENTATION-PLAN.md`

- [ ] 随后续阶段进展更新状态
- [ ] 总计划结束后再整体归档

### 架构重构总计划
**关联文档**：`ARCHITECTURE-REFACTOR-PLAN.md`

- [ ] 随 4 个月架构重构推进更新
- [ ] 各阶段闭环后再整体归档

### Tailwind 完全迁移主线
**关联文档**：`TAILWIND-MIGRATION-STATUS.md`、`archived/tailwind-migration/251126-closure/`

- [x] Tailwind 主线已完成迁移实施、浏览器样本、真实扩展首开、非 headless 实机回归与归档收口
- [x] `Bilibili` 已接受为浏览器媒体能力例外，不再视为 Tailwind 主线阻塞
- [x] 当前保留 `TAILWIND-MIGRATION-STATUS.md` 仅作为总入口与归档导航，不再作为活跃实施主题
- [x] `Options` 已删除 `aob-options.css`，`color-scheme` / reduced-motion 已迁入共享样式输入层

---

## 已归档 / 已关闭结论

### Month 4
**关联文档**：`archived/repo-month4/REPO-MONTH4-COMPLETION-REPORT.md`、`archived/repo-month4/REPO-MONTH4-EXECUTION-PLAN.md`

- [x] Month 4 已完成并已归档
- [x] 质量门禁已通过：`npm run test:unit`、`npm run lint`、`npm run lint:warnings-guard`、`npm run test:coverage`
- [x] 最新归档真值：`lines 86.39% / statements 86.39% / functions 84.00% / branches 75.01%`
- [x] Week 3 E2E / flow 已按当前仓库测试形态完成回写
- [x] 原 `must / should` 测试清单已结束，不再作为活跃 backlog 保留

### 已完成收口但不再作为主线任务保留

- [x] Options 配置边界的 Zod 收敛已完成
- [x] Month 3 复杂组件收口已完成，相关历史文档已归档

### 已完成重基线但仍属活跃治理

- [ ] `getPlatformServices()` 已完成当前 inventory 重基线，但 Phase 2 尚未整体结束
- [x] `src/options/bootstrap.ts` 与 `src/shared/errors/analytics/analyticsConfig.template.ts` 已退出直接平台查找
- [ ] 允许保留的调用点仅限 bootstrap / composition root，并需继续维持 allowlist
- [x] `background/bootstrap.test.ts` 已恢复，通过当前 Phase 2/Phase 3 稳定测试门禁

---

## 后续独立议题

### 样式兼容性保留项

- `src/content/shared/shadowStyleBridge.ts` / `Clipper` stylesheet bridge fallback：当前因 Firefox WebExtension content script 主线兼容性仍需保留；如后续继续推进，只作为独立兼容性议题，不再回到 Tailwind 主线

### coverage / 维护尾项

- `src/shared/errors/analytics/analyticsConfig.template.ts`
- `src/shared/di/testHelpers.ts`
- `src/content/reader/sessionDom.ts`
- `src/options/state/selectors.ts`
- `src/content/clipper/presentation/clipperDialogPrompt.ts`
- `src/content/reader/sessionTypes.ts`
- `src/background/sinks/obsidianRest.ts`
- `src/content/reader/sessionExportUtils.ts`
- `src/background/services/obsidianWriter.ts`
- `src/options/app/routing.ts`
- `src/content/shared/markdown.ts`

> 若后续仍需继续补测、补 coverage 或做薄层清理，应单独立项推进，不再回到 Month 4 口径。

---

## 当前建议顺序

1. Phase 2：冻结 `getPlatformServices()` allowlist，只保留 bootstrap / composition root
2. Phase 2：冻结 allowlist，并仅把 bootstrap / composition root 作为 residual inventory 维护
3. O-1：补完 Observability 运行时联调，聚焦 Sentry DSN / release / consent 真机验证，而非继续重做 provider 层
4. Phase 7：source import baseline 已清零；后续只维持 alias 边界，不再作为活跃实施项
5. Phase 8：TODO/FIXME 活跃基线已清零；后续若再引入新的 UI helper / 维护债，应单独立项，不重开大规模 UI 重构
6. `Clipper` stylesheet bridge fallback 的 Firefox / Chromium 分流退出条件
7. Tailwind 主线维持归档后总入口，不再恢复为实施 backlog
8. 新的独立兼容性议题如需继续推进，应单独立项
9. `STAGE3-IMPLEMENTATION-PLAN.md`
10. `ARCHITECTURE-REFACTOR-PLAN.md`
11. 新的独立 coverage / 维护议题（如后续另行立项）

---

## 归档判断

### 已完成归档

- [x] Month 4

### 仍属长期活跃

- [ ] `STAGE3-IMPLEMENTATION-PLAN.md`
- [ ] `ARCHITECTURE-REFACTOR-PLAN.md`
- [x] Tailwind 完全迁移主线已满足归档条件，保留总入口页

### Tailwind 主线归档条件

- [x] 人工浏览器回归已完成正式执行与记录
- [x] Firefox fallback 保留决策已固化
- [x] 已接受 `Bilibili` 为浏览器媒体能力例外，而不再视为 Tailwind 主线阻塞

> 除上述归档判断外，Tailwind 主线不再新增新的样式迁移开发任务。
