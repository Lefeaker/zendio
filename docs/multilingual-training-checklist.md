# AiiinOB 多语言工具培训手册

> 版本：v1.0  
> 最近更新时间：2025-10-19  
> 适用对象：新加入的前端 / QA / 翻译协作者

## 📚 培训目标

1. 熟悉 AiiinOB 多语言体系（运行时 + Chrome 静态资源）  
2. 掌握伪本地化、字符预算与适配策略的使用方法  
3. 能独立运行视觉回归与 DOM 巡检流程

## 🕒 培训排期（建议 2 × 1.5h）

### 第 1 次：体系讲解 + 实操演练

- **多语言架构**：`src/i18n/`、`public/_locales/`、`LANGUAGE_CONFIG`  
- **伪本地化**：切换 `qps-ploc`、观察 `resolveAdaptiveText` 行为  
- **字符预算**：查看 `src/shared/i18n/budgets.ts`、运行 `npm run i18n:lint`
- **练习**：在 Options 页面新增一个按钮文案并提供短版本

### 第 2 次：质量保障流程

- **视觉回归**：`npm run visual:record` / `npm run visual:test`、基线管理  
- **布局巡检**：`npm run layout:report`、阅读 `build/reports/layout-issues.json`  
- **问题录入**：演示使用 `docs/multilingual-weekly-maintenance.md` 模板创建 Issue  
- **练习**：模拟一次德语文本溢出修复，全流程提交 PR

## ✅ 培训清单

| 项目 | 验收方式 | 状态 |
|------|----------|------|
| 了解语言配置与别名映射 | 口头提问 | ☐ |
| 能开启伪本地化并说明用途 | 实操演示 | ☐ |
| 能解释字符预算规则与短文案策略 | 实操演示 | ☐ |
| 独立跑通视觉回归与布局巡检脚本 | 实操演示 | ☐ |
| 了解周度维护流程和 Issue 模板 | 口头提问 | ☐ |

> 每次培训结束后由导师在表格中勾选状态，存档于 `docs/training-records/`。

## 📎 配套资料

- 《多语言适配指导报告》：`docs/multilingual-adaptation-guide.md`
- 《开发规范指南》：`docs/development-guidelines.md`
- 《多语言布局每周维护例行》：`docs/multilingual-weekly-maintenance.md`
- 视觉回归基线：`tests/visual/__snapshots__/`
- DOM 巡检脚本：`scripts/layout-report.mjs`

---

**维护负责人**：i18n 专员  
**反馈渠道**：Slack `#aiiinob-i18n` / 邮件 `i18n@aiiinob.dev`
