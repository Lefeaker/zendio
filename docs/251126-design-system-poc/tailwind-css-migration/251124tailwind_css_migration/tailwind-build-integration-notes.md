# Tailwind 构建集成说明

> **更新日期**：2026-03-13  
> **目标口径**：记录当前真实构建状态，但不把任何主路径混用写成长期稳定终态

---

## 当前真值

- `tailwind:build` / `tailwind:build:global` / `tailwind:build:clipper` / `tailwind:build:video` 已存在
- `tailwind.css`、`global.tailwind.css`、`clipper.tailwind.css`、`video.tailwind.css` 已进入正式构建链路
- 静态页面通过 `<link>` 消费 Tailwind 产物
- content 侧通过 `styleRegistry` + stylesheet bridge 消费 Tailwind 产物

---

## 当前未完成项

- 构建已接入，不代表迁移已完成
- `Options` 仍保留 `aob-options.css` 结构 / 兼容层
- content 侧仍保留统一 bridge
- 人工浏览器回归仍未全部完成

---

## 不再使用的说法

以下口径不再成立：

- “Tailwind 构建仍待接入”
- “runtime 样式消费已经是长期稳定终态”
- “只要构建脚本存在，就可以判定迁移完成”

---

## 当前结论

**构建链路已完成接入，但样式迁移主线仍未结束。后续重点是继续退出主路径残留，而不是继续讨论 Tailwind 是否已接入 build。**
