# Tailwind Token 缺口说明

> **更新日期**：2026-03-13  
> **目标口径**：token 文档只记录仍影响完全迁移目标的事实，不再把“双层 token 并存”直接判成可长期保留终态

---

## 当前真值

- `src/styles/design-tokens.css` 仍为全局 token 基座
- `src/options/styles/design-tokens.css` 仍为 Options token 基座
- 两者当前并存，但都只应提供变量，不应继续承担主视觉样式

---

## 当前未完成项

- 文档层仍需继续明确哪些 token 只负责供值
- `Options` 与全局 token 的边界仍需继续保持一致
- 若后续继续压缩 `aob-options.css`，需要同步检查是否又把视觉职责回写到 token 层

---

## 不再使用的说法

以下口径不再成立：

- “token 双轨并存即可视为迁移完成”
- “只要保留 design tokens，就可以接受主路径继续混用”
- “token gap 已经完全降级，不再影响迁移判断”

---

## 当前结论

**Token 双层体系当前仍存在，但它只应承担变量职责。完全迁移是否完成，仍以主样式入口和主路径残留是否退出为准。**
