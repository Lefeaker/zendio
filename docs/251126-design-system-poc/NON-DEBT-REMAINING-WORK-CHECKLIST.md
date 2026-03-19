# 251126 目录剩余工作执行清单（排除 `docs/债务.md` 重合项）

> **更新日期**：2026-03-13  
> **用途**：只列出 `docs/251126-design-system-poc/` 目录下仍需完成、且**不与** `docs/债务.md` 工程债治理直接重合的工作，供执行人按顺序推进  
> **判定口径**：以当前仓库代码真值与本目录现有主文档为准；本清单只处理**文档真值、归档边界、入口治理**，不打开新的工程改造

---

## Summary

当前这个目录里剩余的工作，核心不是继续做 CSS 迁移实现，也不是去解决 `docs/债务.md` 里的架构债、类型债、超大文件拆分。

剩下的真实工作只有一类：**把长期计划、状态页、入口页、归档页之间的口径彻底收敛**，让后续执行人和审阅人都能直接看懂：

1. 什么是历史计划
2. 什么是当前真值
3. 什么仍然活跃
4. 什么已经完成并应归档

---

## 范围边界

### 本清单包含

- `STAGE3-IMPLEMENTATION-PLAN.md` 的真值回写
- `ARCHITECTURE-REFACTOR-PLAN.md` 的真值回写
- `PENDING-TASKS.md` / `README.md` / `ARCHIVE-INDEX.md` 的入口治理
- Tailwind 收口文档的最终去留与归档边界判断
- 本目录内模板 / 指南类文档的定位收敛

### 本清单明确不包含

- `getPlatformServices()` 清理
- 超大文件拆分
- 类型系统 / `strict` / tsconfig 治理
- 路径别名、目录结构、barrel 文件收敛
- Tailwind 配置合并
- 测试框架统一
- 新的样式迁移开发

以上事项如需推进，统一归入 `docs/债务.md` 或其后续独立执行计划，不在本清单范围内。

---

## 固定优先级

1. `STAGE3-IMPLEMENTATION-PLAN.md`
2. `ARCHITECTURE-REFACTOR-PLAN.md`
3. `PENDING-TASKS.md`
4. `README.md`
5. `ARCHIVE-INDEX.md`
6. Tailwind 收口文档归类
7. 模板 / 指南文档去留整理

---

## 任务 1：回写 `STAGE3-IMPLEMENTATION-PLAN.md`

**目标**：把这份文档从“历史计划 + 零散同步说明”改成“当前真实状态清晰、历史计划仍可追溯”的长期计划文档。

**执行动作**

- 保留顶部 `2026-03-13` 真值同步区，但不要只靠这几行承担全部纠偏职责。
- 重写“当前完成度对比”与“月度计划”之间的关系：
  - 明确哪些内容已经按代码真值完成
  - 明确哪些内容未完成
  - 明确哪些内容已转为独立议题，不再按 Stage 3 主线推进
- 对以下内容逐项改口径：
  - Month 2 的 Reader / Video / Support Prompt
  - Month 3 的复杂组件收口
  - Month 4 的无障碍 / 验收项
- 删除或改写会让执行人误以为“这些月度任务仍应逐条实施”的过时勾选项。
- 保留“历史原计划”信息时，必须明确标注为历史基线，而不是当前 backlog。

**完成标准**

- 执行人只看这一个文件，就能分清“已完成 / 未完成 / 已脱钩”三类状态。
- 文档中不再同时出现“顶部说已完成、正文却仍像待执行清单”的冲突。
- Tailwind 主线已归档这一事实在该文档中不再被写成活跃实施任务。

---

## 任务 2：回写 `ARCHITECTURE-REFACTOR-PLAN.md`

**目标**：把这份文档从“历史 Pending 表”改成“当前架构计划状态页”。

**执行动作**

- 基于当前代码与已归档事实，重写 Month 1-4 的状态说明。
- 至少拆成三类：
  - **已完成**
  - **仍活跃**
  - **已改口径 / 转独立议题**
- Month 4 相关内容必须与已归档事实一致：
  - `archived/repo-month4/REPO-MONTH4-COMPLETION-REPORT.md`
  - 当前 coverage / gate 结论
- 涉及样式系统的架构条目，要明确：
  - Tailwind 主线已完成并归档
  - `shadowStyleBridge.ts` 是独立兼容性议题
  - 不得再把 Tailwind 主线写成“继续实施中”
- 若文档里仍保留长篇原始月度计划，需增加“历史计划 / 当前状态”分隔。

**完成标准**

- 文档状态区与实际归档事实不冲突。
- 阅读者能直接判断：架构重构还有哪些活跃项，哪些只是历史背景。
- Month 4 不再出现在当前主线的 Pending 叙述里。

---

## 任务 3：压缩并收敛 `PENDING-TASKS.md`

**目标**：让它只做“当前活跃 backlog 入口”，不再混入阶段总结、历史收尾报告或已完成主线说明。

**执行动作**

- 只保留当前仍活跃的真实事项：
  - `STAGE3-IMPLEMENTATION-PLAN.md`
  - `ARCHITECTURE-REFACTOR-PLAN.md`
  - 必要时保留独立兼容性议题入口
- Tailwind 主线条目继续保留为“已完成 / 总入口导航”，不要再写成实施事项。
- 压缩“已归档 / 已关闭结论”区块，避免再次膨胀成历史总结页。
- “coverage / 维护尾项”如果不属于本目录长期活跃事项，应压缩为一句说明，并指向独立立项原则。
- “当前建议顺序”必须和本清单保持一致，不得继续保留旧排序。

**完成标准**

- 读者打开后第一眼看到的是“现在还要做什么”，不是“之前做过什么”。
- 该文件不再承担 Month 4 结项报告职责。
- Tailwind 主线不再以 backlog 口吻出现。

---

## 任务 4：更新 `README.md`

**目标**：把 README 收敛成这个目录的唯一导航页，而不是再叠加状态判断。

**执行动作**

- 明确区分三类内容：
  - 长期活跃计划
  - 当前状态 / 审计入口
  - 已归档历史材料
- 检查并修正下列入口描述是否仍准确：
  - `STAGE3-IMPLEMENTATION-PLAN.md`
  - `ARCHITECTURE-REFACTOR-PLAN.md`
  - `PENDING-TASKS.md`
  - `TAILWIND-MIGRATION-STATUS.md`
  - `STYLE-MIXING-AUDIT.md`
- 对 Tailwind 区统一改成：
  - 主线已归档
  - 保留总入口
  - 兼容性议题独立跟踪
- 如存在仍指向旧活跃路径或旧目录结构的描述，一并修掉。

**完成标准**

- README 只负责导航与定位，不再与状态页抢角色。
- 新执行人能根据 README 找到唯一正确入口。

---

## 任务 5：补齐 `ARCHIVE-INDEX.md`

**目标**：让归档索引和真实目录结构保持一致，且不把仍活跃的文档误归档。

**执行动作**

- 核对 `archived/` 下现有目录是否全部有索引记录。
- 核对 Tailwind 归档目录与 `archived/next-steps/` 是否都有明确入口。
- 核对 README 中提到的归档目录是否都能在索引中找到。
- 删除或改写仍把活跃文档写成已归档的条目。
- 如统计数字已失真，一并修正。

**完成标准**

- 索引、目录结构、README 三者完全对齐。
- 任何归档目录都能从索引直接定位。

---

## 任务 6：确定 Tailwind 收口文档的最终去留

**目标**：把 Tailwind 相关文档从“已完成但还堆在活跃区”收敛到合理结构。

**目标文件**

- `TAILWIND-MIGRATION-STATUS.md`
- `STYLE-MIXING-AUDIT.md`
- `PRE-CODE-STYLE-MIGRATION-CHECKLIST.md`
- `SHADOW-STYLE-BRIDGE-EXIT-EVALUATION.md`

**执行动作**

- 逐份判断是以下哪一类：
  - **保留为长期事实入口**
  - **保留为兼容性专题**
  - **移入归档**
- 推荐口径：
  - `TAILWIND-MIGRATION-STATUS.md`：保留为总入口
  - `SHADOW-STYLE-BRIDGE-EXIT-EVALUATION.md`：保留为独立兼容性专题
  - `STYLE-MIXING-AUDIT.md` / `PRE-CODE-STYLE-MIGRATION-CHECKLIST.md`：若已主要承担历史闭环证据职责，则考虑归档
- 若移动文件，必须同步修正所有引用入口。

**完成标准**

- 活跃区只剩真正还需要持续参考的 Tailwind 文档。
- 不再把历史闭环文档和长期入口文档混放。

---

## 任务 7：整理模板 / 指南文档的定位

**目标**：给当前仍留在根目录的模板 / 指南类文档一个明确定位。

**目标文件**

- `reader-panel-manual-test-template.md`
- `visual-regression-testing-guide.md`
- 必要时包括 `design-system-suggestion-revised.md`

**执行动作**

- 判断每份文档属于：
  - 长期参考手册
  - 阶段性材料，应归档
  - 历史总纲，只保留引用
- 在 `README.md` 中给出对应定位，不再让这些文件处于“存在但角色不明”的状态。
- 若某文档已不再服务当前目录目标，移动到更合适的归档位置。

**完成标准**

- 根目录里的每一份非计划文档都有明确角色。
- 新读者不会把模板或历史建议稿误读成当前执行入口。

---

## 固定执行顺序

### 批次 1：主计划真值回写

1. `STAGE3-IMPLEMENTATION-PLAN.md`
2. `ARCHITECTURE-REFACTOR-PLAN.md`

### 批次 2：入口治理

3. `PENDING-TASKS.md`
4. `README.md`
5. `ARCHIVE-INDEX.md`

### 批次 3：Tailwind 文档去留判断

6. `TAILWIND-MIGRATION-STATUS.md`
7. `STYLE-MIXING-AUDIT.md`
8. `PRE-CODE-STYLE-MIGRATION-CHECKLIST.md`
9. `SHADOW-STYLE-BRIDGE-EXIT-EVALUATION.md`

### 批次 4：模板 / 指南整理

10. `reader-panel-manual-test-template.md`
11. `visual-regression-testing-guide.md`
12. `design-system-suggestion-revised.md`（仅在需要调整定位时）

---

## 验证要求

### 文档真值复核

每完成一个批次，至少执行一次只读复核：

- 文件状态是否与当前代码 / 归档事实一致
- 是否仍存在互相矛盾的入口描述
- 是否仍有旧路径、旧状态、旧口径残留

### 统一搜索建议

执行人完成每批后，建议统一搜索以下关键词并清理残留：

- `进行中`
- `待完成`
- `活跃实施`
- `Tailwind 迁移`
- `Month 4`
- `aob-options.css`
- `inline <style>`
- `runtime <style>`

### 不需要在本清单中重复开启的工作

- 不重复跑 Month 4 测试补强
- 不重开 Tailwind 样式迁移开发
- 不把 `docs/债务.md` 中的工程债混入本轮

---

## 最终完成标准

当且仅当以下条件同时满足时，本清单视为完成：

- `STAGE3-IMPLEMENTATION-PLAN.md` 与 `ARCHITECTURE-REFACTOR-PLAN.md` 已完成真值回写
- `PENDING-TASKS.md` 已压缩为真实 backlog 入口
- `README.md` 与 `ARCHIVE-INDEX.md` 已和当前结构完全一致
- Tailwind 收口文档的活跃 / 归档边界已明确
- 模板 / 指南类文档的角色已明确
- 本目录内不再存在“历史计划、当前状态、归档入口”三者混杂的情况

---

## 备注

这份清单完成后，`docs/251126-design-system-poc/` 目录剩余的主要工作应只剩两类：

1. 长期计划随项目推进做常规维护
2. `docs/债务.md` 对应的独立工程债治理

也就是说，本清单的目标不是继续扩大战线，而是把这个目录本身先治理干净。
