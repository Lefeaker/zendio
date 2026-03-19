# 设计系统 / Repository 文档集

> **整理日期**：2026-03-10
> **归档策略**：以代码 / 测试 / 验收产物为主判定完成状态
> **当前定位**：保留长期活跃计划；Month 4 文档已正式归档，避免与长期 backlog 混杂

---

## 当前活跃文档

### 长期执行入口

1. **`STAGE3-IMPLEMENTATION-PLAN.md`**  
   Stage 3 总体实施计划，上层路线图。

2. **`ARCHITECTURE-REFACTOR-PLAN.md`**  
   4 个月架构重构总计划，仍是长期活跃规划。

### 当前跟踪 / 审计文档

- **`PENDING-TASKS.md`** - 当前真实未闭环任务与归档判断清单；Month 4 已完成，本文档不再作为其测试主战场
- **`TAILWIND-MIGRATION-STATUS.md`** - Tailwind 主线总入口；当前用于归档完成状态、例外说明、`Options` 最后一刀收口结果与归档入口导航
- **`STYLE-MIXING-AUDIT.md`** - 全项目样式混用审计，作为 Tailwind / CSS 主线收口的事实基础
- **`PRE-CODE-STYLE-MIGRATION-CHECKLIST.md`** - 样式完全迁移前的准备清单，先完成后再进入代码改动
- **`SHADOW-STYLE-BRIDGE-EXIT-EVALUATION.md`** - Firefox fallback 保留判断与退出条件
- **`GET-PLATFORM-SERVICES-CLEANUP.md`** - 平台服务装配层收敛相关跟踪文档
- **`reader-panel-manual-test-template.md`** - 手工验证模板

### Tailwind 归档入口

- **`archived/tailwind-migration/251126-closure/`** - Tailwind Stage 5 / 6 / 7 文档与 2026-03-13 回归证据归档

> 当前口径：Tailwind 主线已满足归档条件，不再作为活跃实施主题维护。

### 长期参考文档

- **`design-system-suggestion-revised.md`** - 设计系统总纲
- **`visual-regression-testing-guide.md`** - 视觉回归测试参考指南

---

## Month 4 已归档文档

- **`archived/repo-month4/REPO-MONTH4-EXECUTION-PLAN.md`** - Month 4 原始执行计划与历史执行口径
- **`archived/repo-month4/REPO-MONTH4-COMPLETION-REPORT.md`** - Month 4 最终完成报告
- **`archived/repo-month4/MONTH4-WEEK1-COMPLETION-REPORT.md`** - Month 4 Week 1 完成报告
- **`archived/repo-month4/MONTH4-WEEK1-2-AUDIT-REPORT.md`** - Month 4 Week 1-2 审计报告

> 当前状态：Month 4 已完成并已归档；以 `archived/repo-month4/REPO-MONTH4-COMPLETION-REPORT.md` 作为最终结论入口。

---


## Tailwind 迁移整合文档

- **`TAILWIND-MIGRATION-STATUS.md`** - Tailwind 主线总入口与归档完成状态
- **`archived/tailwind-migration/251120/`** - 早期前置检查 / 基线 / 配置准备文档
- **`archived/tailwind-migration/251126-closure/`** - Stage 5 / 6 / 7 最终文档与浏览器回归证据
- **`tailwind-css-migration/251122tailwind_css_migration/`** - 分阶段 Tailwind 迁移指南
- **`tailwind-css-migration/251124tailwind_css_migration/`** - 依赖矩阵 / token gap / 构建集成补充文档

## 本轮已归档文档

### 新增归档目录

- `archived/repo-month1/` - Repo Month 1 完成文档
- `archived/repo-month2/` - Repo Month 2 完成文档
- `archived/repo-month3/` - Repo Month 3 完成文档
- `archived/repo-month4/` - Repo Month 4 完成文档
- `archived/stage3-week3-4/` - Stage 3 Week 3-4 完成文档
- `archived/stage3-month2/` - Stage 3 Month 2 Content Scripts 收口文档
- `archived/stage3-month3/` - Stage 3 Month 3 收口摘要

### 本轮归档说明

- `Repo Month1`：已按完成状态归档，计划文档勾选已同步。
- `Repo Month2`：已按完成状态归档，`GET-PLATFORM-SERVICES-CLEANUP.md` 保留根目录继续追踪残留项。
- `Repo Month3`：已按“代码证据优先”统一状态归档；`MONTH3-WEEK2-COMPLETION-REPORT.md` 的结论已与审计结果对齐。
- `Repo Month4`：已完成文档收口、门禁复核与最终归档；以 `archived/repo-month4/REPO-MONTH4-COMPLETION-REPORT.md` 为最终结论入口。
- `Stage3 Week3-4`：Week 3-4 Guide / Report 已归档；`STAGE3-WEEK1-2-GUIDE.md` 也已移入 `archived/stage3-week1-2/`。
- `Stage3 Month2`：Reader / Video / Support Prompt 收口文档已移入 `archived/stage3-month2/`，按当前代码与测试真值归档。

更多历史文档请查看 **`ARCHIVE-INDEX.md`**。

> 补充：Month 3 本轮收口摘要已归档至 `archived/stage3-month3/MONTH3-CLOSURE-SUMMARY.md`。

---

## 目录结构

```text
docs/251126-design-system-poc/
├── README.md
├── ARCHIVE-INDEX.md
├── ARCHITECTURE-REFACTOR-PLAN.md
├── GET-PLATFORM-SERVICES-CLEANUP.md
├── PENDING-TASKS.md
├── TAILWIND-MIGRATION-STATUS.md
├── STAGE3-IMPLEMENTATION-PLAN.md
├── design-system-suggestion-revised.md
├── reader-panel-manual-test-template.md
├── visual-regression-testing-guide.md
├── tailwind-css-migration/
│   ├── 251122tailwind_css_migration/
│   └── 251124tailwind_css_migration/
├── archived/
│   ├── tailwind-migration/
│   │   ├── 251120/
│   │   ├── 251122-completed/
│   │   ├── 251124-history/
│   │   └── 251126-closure/
│   ├── repo-month1/
│   ├── repo-month2/
│   ├── repo-month3/
│   ├── repo-month4/
│   ├── stage3-week1-2/
│   ├── stage3-week3-4/
│   ├── stage3-month2/
│   ├── stage3-month3/
│   ├── stage1-2/
│   ├── poc/
│   ├── phase1/
│   ├── phase2/
│   ├── phase3/
│   └── phase4/
└── poc-results/
```

---

## 快速查阅

```bash
# 查看长期活跃计划
cat STAGE3-IMPLEMENTATION-PLAN.md
cat ARCHITECTURE-REFACTOR-PLAN.md

# 查看当前任务与 Tailwind 状态
cat PENDING-TASKS.md
cat TAILWIND-MIGRATION-STATUS.md

# 查看 Tailwind 总入口与归档证据
cat TAILWIND-MIGRATION-STATUS.md
ls archived/tailwind-migration/251126-closure
cat SHADOW-STYLE-BRIDGE-EXIT-EVALUATION.md

# 查看 Month 4 收口结论
cat archived/repo-month4/REPO-MONTH4-COMPLETION-REPORT.md

# 查看归档索引
cat ARCHIVE-INDEX.md
```
