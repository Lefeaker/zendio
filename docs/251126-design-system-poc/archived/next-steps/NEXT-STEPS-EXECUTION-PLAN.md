# 下一阶段执行计划（迁移准备 → 样式完全迁移 → Stage 3 → Architecture）

> **更新日期**：2026-03-12  
> **用途**：作为下一阶段的正式执行清单，交由后续执行人按顺序推进；完成后再由审阅人统一复核  
> **判定口径**：以当前仓库代码、测试、构建脚本与 `docs/251126-design-system-poc/` 中已整合文档的真实状态为准

---

## Summary

当前 `docs/251126-design-system-poc/` 下真正仍需推进的工作，不应再被简单理解为“Tailwind 文档收口”。

基于当前代码真值，项目样式仍处于**混合架构**：

- `design-tokens.css` 变量体系仍在广泛使用
- Tailwind 产物（`tailwind.css` / `global.tailwind.css` / `clipper.tailwind.css` / `video.tailwind.css`）已经覆盖大量模块
- 但 `aob-options.css`、Onboarding 内联 `<style>`、运行时 `styleManager` / `styleSheetManager`、独立主题 CSS 仍然存在
- 因此，下一阶段必须先完成一轮**改代码前迁移准备**，然后按“样式完全迁移”目标推进，而不是长期接受混用

本轮固定优先级调整为：

1. **改代码前迁移准备**
2. **样式完全迁移主线**
3. **Stage 3 计划真值校正**
4. **Architecture Refactor 计划真值校正**
5. **最后统一回写 `PENDING-TASKS.md` / `README.md` / `ARCHIVE-INDEX.md`**

目标不是继续停留在“边界判断”，而是先把迁移前提写清楚，然后按统一终态推进：

- 哪些模块必须纳入完全迁移范围
- 哪些遗留样式入口必须退出主路径
- 哪些过渡方案允许短期存在，但最终必须消失
- 哪些文档口径必须先改，避免误导执行人

---

## Key Changes

### 1. 第一优先级：完成改代码前迁移准备
**主要入口**：`STYLE-MIXING-AUDIT.md`、`INTEGRATED-EXECUTION-PRIORITY-PLAN.md`（必要时允许补充专项准备清单）

执行人必须先把“完全迁移”的范围、终态与禁区写清楚，而不是直接开始代码迁移。

具体工作：

- 按模块盘点当前样式来源，至少覆盖：
  - `Options`
  - `Onboarding`
  - `Clipper`
  - `Reader`
  - `Video`
  - `SupportPrompt`
- 对每个模块明确记录：
  - 当前样式入口
  - 目标终态样式入口
  - 必须移除的 legacy CSS / inline `<style>` / runtime 注入
  - 允许阶段性过渡、但最终必须消失的桥接方案
- 明确项目总体结论：
  - 当前目标是**全面 CSS 迁移完成**
  - 不把“长期混用”作为正式终态

交付完成标准：

- 形成一份唯一的**迁移前准备基线**
- 后续所有 Tailwind / CSS 迁移文档都以这份基线为前提
- 后续执行人不再需要猜测哪些混用会被长期保留

### 2. 第二优先级：按准备基线推进样式完全迁移主线
**主要入口**：`TAILWIND-MIGRATION-STATUS.md`

只有在完成迁移前准备后，才能真正推进样式完全迁移。

具体工作：

- 重写 `TAILWIND-MIGRATION-STATUS.md` 的结论摘要，使其明确当前目标是“完全迁移”
- 结合准备基线，重新定义 Tailwind 主线的剩余范围：
  - 哪些模块先迁
  - 哪些 legacy / inline / runtime 样式先退场
  - 哪些桥接层仅允许阶段性存在
- 对齐 `Stage 5 / Stage 6 / Stage 7` 的状态表述：
  - `251122` 阶段文档中的结论
  - `251124` 依赖矩阵 / build notes / token gap 中的后期真值
  - 当前代码中实际存在或已删除的 CSS 文件与注入链路
- 重新定义 `Stage 7 / Clipper refinement` 的边界：
  - 若当前代码仍有混用主路径，就把它重新纳入代码迁移范围
  - 不再把“保留运行时注入架构”默认视为最终结论
- 明确哪些 Tailwind 文档只保留为历史输入，哪些仍是活跃入口

交付完成标准：

- `TAILWIND-MIGRATION-STATUS.md` 成为唯一可信的 Tailwind / CSS 迁移状态页
- 明确项目目标是“完全迁移”，而不是“边界定性后长期混用”
- 活跃区只保留真正仍需推进的迁移文档

### 3. 第三优先级：回写 Stage 3 总体计划真值
**主要入口**：`STAGE3-IMPLEMENTATION-PLAN.md`

当前 Stage 3 文档中的进度跟踪落后于项目实际，且它对 Tailwind / 无障碍 /内容链路的关系也需要跟最新口径对齐。

具体工作：

- 重写 `进度跟踪` 区块，使其与当前仓库现实一致
- 重点核对以下状态：
  - Month 2（Content Scripts）中 Reader / Video / Support Prompt 的真实完成情况
  - Month 3（复杂组件）中 VaultRouter / YamlConfig / Tabs 的真实状态
  - Month 4（无障碍性）是否仍作为活跃任务保留，还是应改写为“未启动 / 后续独立议题 / 与当前主线脱钩”
- 若“完全迁移”目标改变了 Tailwind 主线口径，也需要同步改写文档中“Tailwind 迁移基本完成”的叙述
- 重算 `Stage 3` 还剩什么：
  - 哪些目标已经达到
  - 哪些只是历史计划里写了，但项目当前并未继续推进
  - 哪些需要保留为长期活跃项

交付完成标准：

- `STAGE3-IMPLEMENTATION-PLAN.md` 不再是一张过时的历史计划表
- `进度跟踪`、`目标`、`验收标准` 三部分之间不再互相矛盾
- 执行人能够从该文档直接看出：Stage 3 现在真正还剩什么

### 4. 第四优先级：回写 Architecture Refactor 计划真值
**主要入口**：`ARCHITECTURE-REFACTOR-PLAN.md`

这份文档当前最大的偏差，是状态全部停留在历史 `Pending`，同时未吸收项目已经发生的实际演进。

具体工作：

- 重写 `进度跟踪` 区块，校正 Month 1-4 的状态
- 至少明确以下三类内容：
  - **已完成**：哪些重构目标实际上已经通过代码落地
  - **未完成**：哪些仍然是未来任务
  - **已改口径**：哪些原本在架构计划中，现在已不再以该计划推进
- 特别处理 Month 4（测试覆盖率提升）相关描述：
  - 当前测试门禁、coverage、文档与 Month 4 已归档事实必须对齐
  - 不允许继续把已完成内容留在 `Pending`
- 若当前代码仍存在混用主路径，也应把这点纳入架构现状说明，并明确它是待消除问题而非长期保留架构

交付完成标准：

- `ARCHITECTURE-REFACTOR-PLAN.md` 的状态区能反映当前真实进展
- Month 4 相关内容不再与已归档事实冲突
- 文档能正确表达“样式架构是否已统一”这一事实

### 5. 第五优先级：统一回写总入口文档
**主要入口**：`PENDING-TASKS.md`、`README.md`、`ARCHIVE-INDEX.md`

这一步必须放在前 4 步之后，不能提前做。

具体工作：

- 根据样式审计 / Tailwind 状态页 / Stage 3 / Architecture 三份主文档的最新真值，统一回写总入口文档
- `PENDING-TASKS.md`：
  - 只保留当前仍活跃的真实事项
  - 把“Tailwind 迁移整合与收口”改成与样式审计结果一致的真实描述
- `README.md`：
  - 反映当前活跃文档入口
  - 把 Tailwind 区的“活跃 / 归档 / 历史输入”结构写清楚
- `ARCHIVE-INDEX.md`：
  - 只记录真正已归档的文档
  - 统计数与目录结构要一致

交付完成标准：

- 三个入口文档与主文档状态完全一致
- 不再出现“README 说活跃、索引说已归档、状态页又说未完成”的冲突

---

## Test / Validation Plan

本轮主要是文档与状态校正，但其前提是**以代码真值完成样式审计**。验证重点分为两层。

### 1. 样式真值检查

执行人完成样式审计时，应至少核对：

- 项目中实际存在的 CSS 入口文件
- 构建脚本中实际生成的 Tailwind 产物
- 运行时注入链路中实际加载的样式来源
- 仍存在的 inline `<style>`、legacy CSS、结构类 / `classList` 驱动逻辑

建议至少通过只读检查确认：

- `src/options/index.html`
- `src/onboarding/index.html`
- `src/options/styles/aob-options.css`
- `src/styles/*.css`
- `src/styles/clipper/*.css`
- `styleManager` / `styleSheetManager` / `InlineStyleManager` 的注入路径

### 2. 文档一致性检查

执行人完成每个阶段后，都应至少检查：

- 文档中的完成 / 未完成状态与当前仓库代码事实一致
- 同一事项在不同文档中的状态不冲突
- 被迁移或归档的文档，其入口路径与引用均已更新

### 建议执行顺序下的检查点

- 完成样式混用审计后：
  - 复查 Tailwind / legacy / inline / runtime injection 的模块分类是否完整
- 完成 Tailwind 收口后：
  - 复查 `TAILWIND-MIGRATION-STATUS.md`
  - 复查活跃 Tailwind 文档与归档 Tailwind 文档的目录边界
- 完成 Stage 3 校正后：
  - 复查 `STAGE3-IMPLEMENTATION-PLAN.md` 的进度表与验收标准是否一致
- 完成 Architecture 校正后：
  - 复查 `ARCHITECTURE-REFACTOR-PLAN.md` 的 Month 4 相关状态是否与已归档事实一致
- 最后回写入口文档后：
  - 统一搜索 `README.md`、`PENDING-TASKS.md`、`ARCHIVE-INDEX.md` 中的旧路径与旧状态口径

### 若执行过程中需要引用代码真值

允许执行人用非破坏性方式复核：

- `npm run test:unit`
- `npm run lint`
- `npm run lint:warnings-guard`
- `npm run test:coverage`

但这些命令的用途是**确认文档口径是否仍与真实项目状态一致**，不是重新打开 Month 4 开发工作。

---

## Assumptions

- Month 4 已完成并归档，这一点不再回退
- 当前项目样式体系仍是**混合架构**，这是现状而不是目标
- Tailwind 主线当前目标已明确升级为“完全迁移”，不把“长期接受混用”作为正式终态
- `Stage 3` 与 `Architecture Refactor` 当前首要工作不是继续扩实现，而是先把文档状态校正到真实项目现状
- `coverage / 薄层维护尾项` 仍属于后续独立议题，不进入本轮主执行顺序
- 执行人应优先完成迁移前准备与入口收口，再进入代码改动
