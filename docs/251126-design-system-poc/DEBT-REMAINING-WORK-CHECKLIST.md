# 技术债剩余工作执行清单（基于 `docs/债务.md` 当前真值）

> **更新日期**：2026-03-13  
> **来源**：`/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB/docs/债务.md`  
> **用途**：将 `docs/债务.md` 中**仍未完成**、且按当前仓库真值仍成立的技术债，整理为可执行清单  
> **判定口径**：以当前代码、配置、脚本、测试入口真值为准；已失效或已完成的旧判断不纳入本清单
> **状态说明**：本文件只保留问题清单与优先级，不再单独声明批次完成状态；当前执行顺序与批次状态以 `DEBT-IMPLEMENTATION-ROADMAP.md` / `DEBT-BATCH-TRACKER.md` 为准

---

## Summary

`docs/债务.md` 不是可直接执行的计划文档，里面混有三类内容：

1. 仍然成立且尚未完成的技术债
2. 已部分缓解、但尚未系统收口的债务
3. 已经失效的旧判断

本清单只保留前两类，并按当前投入收益重排优先级。

---

## 已从清单剔除的失效项

以下内容在 `docs/债务.md` 中仍有记录，但按当前仓库真值**不应再作为未完成项**：

- `aob-options.css` 作为主路径遗留 CSS：**已失效**
  - 该文件已删除，`Options` 主线样式迁移已完成。
- `test:coverage` 脚本不存在：**已失效**
  - `package.json` 已存在 `test:coverage`。
- coverage 阈值未配置：**已失效**
  - `vitest.unit.config.ts` 已配置 `statements 80 / lines 80 / functions 80 / branches 75`。
- `supportPrompt.ts` 仍属超大文件热点：**已不再成立**
  - 当前文件规模已明显下降，不再是本轮大文件治理优先对象。
- `optionuicsssuggest.md` 为 600KB 级遗留文件：**已不再成立**
  - 当前体量已降至可控，不再单列为高优先级体积债务。
- `obsidian-hybrid-preview.html` 为 60K 行遗留文件：**已不再成立**
  - 当前文件规模已显著下降，但是否保留仍可纳入后续轻量清理。

---

## 当前仍成立的技术债

### P0：必须先处理的工程债

1. **`getPlatformServices()` 仍未完成最终收口**
   - 当前 `src/` 内非测试残留已收敛到 bootstrap / composition root allowlist。
   - listener / pipeline 主链已退出直连；当前剩余重点是冻结 allowlist 并阻止高层回流。
   - `src/options/app/bootstrap.ts` 仍保留 1 处 app bootstrap 调用，需与 Options 仓储主链统一一起复核。

2. **Options 仓储双轨仍并存**
   - `ChromeSyncOptionsRepository`
   - `ChromeOptionsRepository`
   - `optionsStore` / `chromeOptionsPersistence`
   - Repository 模式已存在，但尚未收敛为唯一 load/save/subscribe/normalize 主链。

3. **类型系统默认配置仍偏宽松**
   - `tsconfig.base.json` 当前仍为：
     - `strict: false`
     - `isolatedModules: false`
   - `tsconfig.strict.json` 只是补充检查，不是默认基线。

4. **超大文件仍未拆分**
   - 当前高优先级目标仍包括：
     - `src/content/video/session.ts`
     - `src/options/components/controls/yamlConfigTable.ts`
     - `src/content/clipper/components/dialog.ts`
     - `src/content/reader/session.ts`

### 已完成重基线但不再列为活跃 P0

- `window.__aiob*` 生产主状态链已迁出到 `contentSessionRegistry`，不再作为当前执行入口。

### P1：应在 P0 后集中治理的结构债

5. **配置管理碎片化**
   - TypeScript / Tailwind / Vitest 仍是多配置并行体系。

6. **双轨设计令牌系统**
   - `src/options/styles/design-tokens.css`
   - `src/styles/design-tokens.css`
   - 仍然是两个来源，后续维护成本高。

7. **Tailwind 配置碎片化**
   - `tailwind.config.cjs`
   - `tailwind.config.global.cjs`
   - `tailwind.config.clipper.cjs`
   - `tailwind.config.video.cjs`

8. **深层相对导入泛滥**
   - 仍有大量 `../../../` 级相对导入。

9. **直接 DOM 操作与业务逻辑混用**
   - 不是说要消灭 DOM 操作，而是要把高频业务逻辑路径里的 DOM 操作抽象出稳定边界。

10. **依赖注入运行时检查过重**
   - 典型问题仍体现在 `video/session.ts` 这类依赖解析与运行时守卫组合上。

### P2：可以在主结构收口后处理的维护债

11. **目录层级 / barrel 文件治理**
12. **类型定义分散**
13. **I18n 多语言文件重复结构**
14. **TODO / FIXME 历史标记清理**
15. **构建脚本职责整理**
16. **残余文档债与遗留参考文件清理**

---

## 固定优先级

1. `getPlatformServices()` 收口
2. Options 仓储双轨统一
3. 类型系统默认基线收紧
4. 超大文件拆分
5. 配置管理碎片化
6. 设计令牌双轨收口
7. Tailwind 配置收口
8. 深层导入与路径别名
9. DOM 业务边界抽象
10. DI 运行时检查简化
11. 目录 / 类型 / I18n / TODO / 脚本文档尾项

---

## 任务 1：冻结 `getPlatformServices()` allowlist

**目标**：把浏览器 API 访问继续压缩到 bootstrap / composition root 边界，并阻止高层回流。

**执行动作**

- 对当前 `getPlatformServices()` 调用点按层分类：
  - bootstrap / composition root
  - listener / pipeline
  - service / shared
  - UI / section / controller
- 优先清理非 allowlist 调用点：
  - `src/options/bootstrap.ts`
  - `src/shared/errors/analytics/analyticsConfig.template.ts`
- 将剩余 bootstrap / composition root 调用点固化到文档 allowlist。
- 为新增代码建立约束：
  - listener / pipeline / service / shared / UI 层禁止新增 `getPlatformServices()` 调用
  - 优先通过 `resolveRepository()` 或显式注入访问能力

**完成标准**

- 高层 UI / shared / service / listener / pipeline 主路径不再继续新增平台直连。
- 残留调用点仅集中到 bootstrap / composition root allowlist。

---

## 任务 2：统一 Options 仓储主链

**目标**：把 Options 读写、订阅、归一化收敛为一条唯一主链。

**执行动作**

- 明确 `IOptionsRepository` 是否为唯一长期合同。
- 处理 `ChromeSyncOptionsRepository` 与 `ChromeOptionsRepository` 的职责重复。
- 明确下列职责归属：
  - load / save
  - subscribe
  - merge / normalize
  - compatibility adapter
- 更新 `optionsStore` / `chromeOptionsPersistence` / 平台装配点，使生产路径不再同时依赖两套语义。

**完成标准**

- Options UI 持久化不再依赖两套仓储语义。
- load/save/subscribe/normalize 的主责任边界清晰且唯一。

---

## 任务 3：收紧类型系统默认基线

**目标**：把严格类型检查从“额外检查”推进为默认基线方向。

**执行动作**

- 先审视 `tsconfig.base.json` 与 `tsconfig.strict.json` 的职责边界。
- 制定两步迁移方案：
  1. 先开启最容易收口的严格项
  2. 再逐步推进 `strict: true`
- 先清理最集中的显式 `any` 与易收口文件。
- 评估 `isolatedModules: true` 对现有构建链路的影响并消除阻塞。

**完成标准**

- 有一份明确的 strict 迁移路线，而不是长期停留在双配置妥协态。
- 至少完成第一批默认严格项落地，避免继续无限延期。

---

## 任务 4：拆分超大文件

**目标**：优先处理最影响维护和测试的超大文件。

**固定顺序**

1. `src/content/video/session.ts`
2. `src/options/components/controls/yamlConfigTable.ts`
3. `src/content/clipper/components/dialog.ts`
4. `src/content/reader/session.ts`
5. `src/content/video/platforms/bilibiliPlatform.ts`
6. `src/third_party/ai-chat-exporter/shared/markdown.ts`

**执行动作**

- 每次只拆一个文件，不并行大重构。
- 按职责拆分，而不是按行数硬切：
  - 状态管理
  - DOM / view 层
  - repository / service 层
  - serializer / parser / helper
- 每拆完一个文件，先补最小测试回归，再进入下一个。

**完成标准**

- 每个目标文件都不再承担 3 类以上主职责。
- 拆分后模块边界清晰，测试入口更稳定。

---

## 任务 5：整理配置管理碎片化

**目标**：先理清，再合并；避免为了“单文件”而制造更隐蔽的复杂度。

**执行动作**

- 对以下配置分别做职责表：
  - TypeScript
  - Tailwind
  - Vitest
- 识别哪些差异是真需求，哪些只是历史累积。
- 先消除重复定义和冲突项，再决定是否合并文件。
- 不强求“一份配置打天下”，但必须建立清晰主配置和扩展层级。

**完成标准**

- 每类配置都有主入口和扩展关系图。
- 新开发者不需要靠猜来理解配置体系。

---

## 任务 6：收口设计令牌双轨与 Tailwind 配置碎片

**目标**：在不回退样式主线的前提下，减少 token / Tailwind 配置的重复维护成本。

**执行动作**

- 为两套 `design-tokens.css` 建立差异表：
  - 完全重复
  - 语义一致但命名不同
  - 平台特有
- 确定长期单一源策略：
  - 哪一套是主源
  - 哪一套是派生或兼容层
- 对 4 份 Tailwind config 先做抽象共享，再决定后续是否物理合并。

**完成标准**

- token 与 Tailwind 配置都形成“主源 + 扩展”的明确结构。
- 不再长期靠人工同步多份相近配置。

---

## 任务 7：处理深层导入、DOM 边界与 DI 复杂度

**目标**：降低未来重构成本。

**执行动作**

- 为路径别名建立最小可落地方案：
  - `@shared/*`
  - `@content/*`
  - `@options/*`
- 把高频 DOM 交互从大业务文件中提取到 adapter / helper 边界。
- 将运行时依赖校验过重的模块改成更直接的构造函数注入或工厂注入。

**完成标准**

- 新代码不再继续扩散深层相对导入。
- 高复杂会话类的依赖入口更直接可读。

---

## 任务 8：清理低优先级维护债

**包含**

- 目录层级 / barrel 文件治理
- 类型定义整理
- I18n 结构生成化评估
- TODO / FIXME 历史标记清理
- 脚本职责整理
- 低价值遗留参考文件清理

**完成标准**

- 这些事项不再散落，而是形成独立的小批次治理任务。

---

## 固定执行顺序

### 批次 1：核心架构债

1. 全局状态污染
2. `getPlatformServices()` 收口
3. 类型系统默认基线

### 批次 2：高收益结构债

4. `video/session.ts`
5. `yamlConfigTable.ts`
6. `clipper/dialog.ts`
7. `reader/session.ts`

### 批次 3：配置与样式基础设施债

8. 配置管理碎片化
9. 设计令牌双轨
10. Tailwind 配置碎片

### 批次 4：维护性治理

11. 深层导入 / 路径别名
12. DOM 边界抽象
13. DI 运行时检查简化

### 批次 5：低优先级尾项

14. I18n / TODO / 脚本 / 文档与遗留参考清理

---

## 验证要求

每完成一个批次，至少做以下复核：

- 代码搜索确认旧模式是否减少，而不是改名后原样保留
- 定向测试通过
- 若涉及类型或配置，补跑对应检查命令
- 文档与执行结果同步，不允许只改计划不改状态

---

## 最终完成标准

当以下条件同时满足时，可认为 `docs/债务.md` 的主债务已进入可控状态：

- `window.__aiob*` 不再承担主生产状态职责
- `getPlatformServices()` 高层直连显著收缩
- 默认类型基线不再长期宽松
- 超大文件主热点已完成第一轮职责拆分
- 配置 / token / Tailwind 的碎片关系已被系统梳理
- 剩余低优先级维护债已形成独立小清单，而不是继续堆在总债务文档里

---

## 备注

这份清单是 `docs/债务.md` 的**执行版**，不是替代品。

建议后续做法：

- `docs/债务.md` 保留为总览与背景说明
- 本清单作为当前执行入口
- 每完成一个批次，再回写 `docs/债务.md` 或拆出更小的专项计划
