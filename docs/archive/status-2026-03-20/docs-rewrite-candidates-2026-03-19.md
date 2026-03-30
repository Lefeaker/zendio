# Docs Rewrite Candidates (2026-03-19)

> 目的：记录当前仍建议保留、但内容已经部分落后于实现的文档，供后续统一重写。  
> 已确认“纯历史且会误导执行”的文档，已归档到 `trash/docs/20260319-outdated-docs/`。

## 1. 建议保留并重写

### `docs/options-refactor-summary-2025.md`

- **保留原因**：这份文档仍然有较高的交接价值，尤其是 Options 页组件化、Section 拆分、Controller/Registry 分层的整体脉络。
- **需要重写的点**：
  - “样式与设计对齐”仍停留在 `options-aob.css` / `aob-options.css` 阶段，没有反映当前 `tailwind.css + global.tailwind.css + design-tokens.css` 的真实入口。
  - “后续建议”里引用了已归档的 `options-navigation-implementation.md`。
  - 仍引用 `trash/archived-option-docs/`，但当前仓库中的历史文档路径已不以该目录为准。
- **建议重写方向**：
  - 保留“2025 重构总结”的历史定位。
  - 单独补一个“2026-03 现状校正”小节，明确 Tailwind 主路径已落地。
  - 清理失效链接，改为指向当前有效入口文档。

### `docs/deprecated-guides-251122.md`

- **保留原因**：它仍然承担“旧指南索引/废弃原因总表”的职责。
- **需要重写的点**：
  - 部分举证仍基于旧事实，例如把 `aob-options.css` 视为现役入口。
  - 个别路径说明已经和实际归档结构不完全一致。
- **建议重写方向**：
  - 保持“哪些文档已废弃”的主结构不变。
  - 统一把证据改成当前真实代码路径与当前归档路径。

### `docs/options-style-validation-guide.md`

- **保留原因**：它仍有“样式规范校验入口”的用途。
- **需要重写的点**：
  - 多处仍把 `src/options/styles/aob-options.css` 作为当前检查对象。
  - `Coverage` 和手动检查步骤没有跟随 Tailwind 主路径更新。
- **建议重写方向**：
  - 改为围绕 `tailwind.css`、`global.tailwind.css`、`design-tokens.css` 和结构 hook 做校验。
  - 明确哪些检查针对 legacy 前缀，哪些检查针对样式主入口。

### `docs/options-doc-refresh-log.md`

- **保留原因**：这是历史刷新日志，不能简单删除。
- **需要重写的点**：
  - 其中大量记录仍在讨论 `aob-options.css` 的逐步缩减。
  - 如继续作为“现行参考”使用，会把旧迁移阶段和当前真值混在一起。
- **建议重写方向**：
  - 不建议清空历史。
  - 建议在文首新增醒目的状态说明，标注“2026-03 之后仅作历史日志，不代表当前实现入口”。

### `docs/251126-design-system-poc/tailwind-css-migration/251122tailwind_css_migration/tailwind-pre-migration-check.md`

- **保留原因**：属于 Tailwind 主线的重要过程文档，仍有历史追溯价值。
- **需要重写的点**：
  - 文中仍把 `aob-options.css` 当作迁移前后的关键现役载体。
  - 对预览页、运行时状态类和样式入口的表述已与现状不完全一致。
- **建议重写方向**：
  - 如果继续放在活跃目录，应补“历史阶段文档”标识。
  - 更稳妥的方案是后续继续归档，或由总索引文档显式标记其历史属性。

### `docs/251126-design-system-poc/tailwind-css-migration/251124tailwind_css_migration/tailwind-dependency-matrix.md`

- **保留原因**：它记录了迁移时的依赖拆分逻辑。
- **需要重写的点**：
  - 仍把 `src/options/styles/aob-options.css` 视为“继续压缩中”的依赖。
- **建议重写方向**：
  - 若保留在活跃目录，应同步 2026-03 的完成状态。
  - 否则建议并入归档索引，避免与当前主线状态冲突。

### `docs/251126-design-system-poc/PRE-CODE-STYLE-MIGRATION-CHECKLIST.md`

- **保留原因**：它仍可作为迁移完成判定标准的历史依据。
- **需要重写的点**：
  - 文中多处仍保留 `aob-options.css` 作为过渡桥的阶段性表述。
  - 目前与“Options 已完成清零”的最终状态文档并存，容易让读者误以为该 checklist 仍需执行。
- **建议重写方向**：
  - 增加“本文件仅代表迁移前/迁移中约束，当前不再作为执行入口”的说明。

## 2. 本次已归档的文档

- `docs/options-css-naming-map.md`
- `docs/options-tailwind-style-loading-guide.md`
- `docs/aob-option-preview-styles.md`
- `docs/options-css-full-cleanup-guide.md`
- `docs/options-style-refinement-plan.md`
- `docs/options-style-refinement-guide.md`
- `docs/options-pre-251120-checklist.md`
- `docs/options-pre-251120-checklist-report-251122.md`
- `docs/domain-best-practice-gap-report.md`

## 3. 判断标准

- **直接归档**：文档是阶段性执行指南、执行报告、旧入口说明，且按当前代码执行会误导。
- **保留重写**：文档仍有历史总结、总表、索引或规范价值，但需要补充“当前真值”或移除失效引用。
