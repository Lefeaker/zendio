# Reader Panel DaisyDialog 迁移技术方案

> 目标: 在 Content Scripts 环境下搭建通用 Daisy 组件基座，并用其完整替换现有 `ReaderPanel`。

## ✅ 当前进展 (2026-03-07)

- **组件基座已完成**: `ContentDaisyDialog/Button/Badge` 已落地。
- **Session 接入已完成**: `createReaderPanelViewFactory` 默认输出 `ReaderDialogPanel`，保留 `readerDialogVersion` feature flag 作为回退手段。
- **数据与交互闭环已完成**: ReaderDialog / ReaderDialogPanel / ReaderSession 已接通。
- **自动化测试已完成**: `ReaderDialog.test.ts`、`ReaderPanelViewFactory.test.ts`、`ReaderSession.test.ts`、`readerPanelFlow.test.ts`、`reader-panel-complete.spec.ts` 均已存在。
- **当前剩余事项**: 微信公众号与 Notion 两个手工站点补测，以及对应审计文档同步。

## 已完成范围

1. **内容脚本 Daisy 基座**
   - `ContentDaisyDialog.ts`
   - `ContentDaisyButton.ts`
   - `ContentDaisyBadge.ts`
2. **ReaderDialog 重写**
   - 新 Dialog UI 与高亮列表交互已实现
3. **ReaderSession 集成**
   - ViewFactory 已接入 `ReaderDialogPanel`
   - 旧实现通过 feature flag 保留 fallback
4. **自动化验证**
   - 单元测试与 E2E 产物已齐备

## 当前不再属于待实现的事项

- 不再需要把 ReaderPanel 视为“待开发”
- 不再需要补建 Reader 自动化测试框架
- 不再需要新增 Reader feature flag

## 剩余收尾项

1. 补测微信公众号 (mp)
2. 补测 Notion
3. 将最终手工结论同步到：
   - `reader-panel-site-test-plan.md`
   - `reader-panel-audit.md`
4. 手工验证完成后，将 Reader 文档簇转入归档候选

## 与 Video 的关系

Reader 迁移已基本完成；后续如果推进 Video Panel Daisy 化，应复用 Reader 的以下经验：
- `ContentDaisyDialog` 作为统一基座
- feature flag / 新旧并存策略
- ViewFactory 替换而不是直接在 Session 中硬编码 UI
- 审计 + 自动化 + 手工验证三类证据同步闭环
