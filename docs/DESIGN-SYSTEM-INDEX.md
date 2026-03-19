# 设计系统文档索引 | Design System Documentation Index

> **创建日期**：2025-11-26
> **状态**：✅ 文档完整，POC 验证待开始

---

## 📂 完整文档集

所有设计系统相关的技术文档已集中到：

**[`docs/251126-design-system-poc/`](./251126-design-system-poc/)**

---

## 🚀 快速开始

### 如果你是第一次阅读

1. 阅读 [`README.md`](./251126-design-system-poc/README.md) - 了解整体概览
2. 重点阅读 [`design-system-technical-details.md`](./251126-design-system-poc/design-system-technical-details.md) ⭐ - 关键技术细节（必读）
3. 查看 POC 测试文件：[`tests/visual/`](../tests/visual/)

### 如果你要执行 POC 验证

👉 **直接阅读 [`POC-IMPLEMENTATION-PLAN.md`](./251126-design-system-poc/POC-IMPLEMENTATION-PLAN.md)** ⭐

这是一份完整的可独立执行的实施手册，包含：
- 环境验证和依赖安装（Step 1）
- DaisyUI 配置详细步骤（Step 2）
- 4 个测试的完整执行流程（Step 3）
- 结果汇总和提交指南（Step 4）
- 完整的故障排查指南

**预计耗时**：1-2 天

---

## 📋 文档清单

| 文档 | 用途 | 阅读时长 |
|------|------|----------|
| [`POC-IMPLEMENTATION-PLAN.md`](./251126-design-system-poc/POC-IMPLEMENTATION-PLAN.md) ⭐ | **POC 实施手册（可独立执行）** | **1-2 天** |
| [`design-system-consultation-brief.md`](./251126-design-system-poc/design-system-consultation-brief.md) | 咨询准备材料 | 15 分钟 |
| [`design-system-suggestion.md`](./251126-design-system-poc/design-system-suggestion.md) | 专家初始建议 | 20 分钟 |
| [`design-system-suggestion-review.md`](./251126-design-system-poc/design-system-suggestion-review.md) | 审核报告 | 25 分钟 |
| [`design-system-suggestion-revised.md`](./251126-design-system-poc/design-system-suggestion-revised.md) | 修订方案 | 35 分钟 |
| [`design-system-technical-details.md`](./251126-design-system-poc/design-system-technical-details.md) ⭐ | **技术细节（必读）** | **40 分钟** |

---

## 🎯 核心推荐

- **样式架构**：Tailwind CSS + DaisyUI
- **交互逻辑**：原生 TS + Zag.js（按需）
- **图标系统**：Lucide Icons
- **颜色方案**：HSL 分离（推荐）

---

## 🧪 POC 测试

- [`tests/visual/daisyui-opacity-test.html`](../tests/visual/daisyui-opacity-test.html)
- [`tests/visual/zagjs-combobox-test.html`](../tests/visual/zagjs-combobox-test.html)
- [`tests/visual/lucide-shadow-dom-test.html`](../tests/visual/lucide-shadow-dom-test.html)
- [`tests/visual/css-vars-penetration-test.html`](../tests/visual/css-vars-penetration-test.html)

---

## ⚠️ 关键警告

1. **🚨 Zag.js 焦点丢失陷阱**：必须分离 Mount 和 Update，详见技术细节文档 §2
2. **⚠️ DaisyUI 透明度修饰符**：需要使用分离的 HSL 值，详见技术细节文档 §1
3. **⚡ 性能优化**：使用脏检查避免不必要的 DOM 操作，详见技术细节文档 §2

---

**维护者**：项目技术团队
**最后更新**：2025-11-26
