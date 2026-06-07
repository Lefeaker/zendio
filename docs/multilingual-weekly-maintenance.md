# AiiinOB 多语言布局每周维护例行

> 版本：v1.0  
> 最近更新时间：2026-06-05
> 适用范围：多语言视觉/布局巡检

## 🎯 目标

1. 确认视觉回归与 DOM 巡检结果，确保高优先级问题在 3 天内关闭
2. 将巡检结论同步到团队 Standup，持续追踪未解决项
3. 维护 `build/reports/layout-issues.json` 与截图基线，避免误报

## 👥 参与角色

- **值班前端**：负责执行脚本、初筛问题、创建 Issue
- **i18n 专员**：评估翻译是否需要短文案或重新措辞
- **QA / 设计**：确认高风险页面（剪藏对话框、阅读器、Options）表现

## 🗓️ 每周例行（建议星期一 10:00 前完成）

1. **拉取最新代码并安装依赖**
   ```bash
   git pull origin main
   npm install
   ```
2. **更新视觉基线（必要时）**

   ```bash
   npm run visual:record
   ```

   - 若生成新的基线，请在 MR 中附带差异说明

3. **执行视觉对比与布局巡检**

   ```bash
   npm run visual:test
   npm run layout:report
   ```

   - 所有输出保留在 `tests/visual/__output__/` 与 `build/reports/layout-issues.json`

4. **分析结果**
   - `tests/visual/__output__/...-diff.png`：先确认是否为真实回归
   - `build/reports/layout-issues.json`：筛选 `priority === "high"` 或 `language` 属于高风险语言（de、ru、fr、pt-BR）
5. **创建/更新 Issue**
   - 模板：`[i18n-layout] <页面>/<组件>`
   - 必要信息：语言、视口、截图、产品影响、建议处理人
6. **同步周会**
   - 在项目周会文档记录「发现的问题 / 处理进度 / 是否需要翻译调整」

## 📦 输出物

- `build/reports/layout-issues.json`（本地存档后可删除）
- Issue 列表（GitHub `i18n-layout` 标签）
- 周会纪要（`docs/meeting-notes/`）

## 🚨 快速处理指引

- **高优先级**：DOM 崩坏、按钮/对话框不可读 → 当天提交修复或回滚
- **中优先级**：文字溢出，但功能正常 → 两个工作日内完成短文案或 CSS 调整
- **低优先级**：个位数像素抖动 → 记录在 Issue，合并到下一次 UI 调整

## 🤝 协同建议

- 短文案变更只改 catalog source：`src/i18n/catalog/messages/<lang>/runtime.json`、`schema.json` 或 `static.json`；`public/_locales/**` 由 generator 生成，不手写
- 文案变更后依次运行：`npm run i18n:catalog:generate`、`npm run i18n:catalog:check`、`npm run i18n:lint`、`npm run audit:locales:report`
- CSS 改动需同步考虑 `TEXT_BUDGETS` 与 `resolveAdaptiveText` 行为
- 任何视觉回归基线更新都需经过评审，避免误将真实问题当成基线

---

**维护负责人**：前端团队轮值  
**联系渠道**：Slack `#aiiinob-i18n` / 飞书多语言小组群
