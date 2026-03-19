# Reader Panel DaisyDialog 手工验证计划 (任务 5.5)

> 目标: 在 10+ 站点验证 ReaderDialog 的样式隔离、焦点管理、核心交互（选中/编辑/导出），并记录异常以便后续 E2E 与回归。
>
> **当前状态**: ✅ 自动化验证已具备；手工验证完成 9/11。微信公众号、Notion 两个外部条件站点已明确豁免，本轮不再补测。

## 相关文件

- 自动化流测试: `tests/e2e/readerPanelFlow.test.ts`
- 完整站点 Playwright 脚本: `tests/e2e/reader-panel-complete.spec.ts`
- 报告生成器: `tests/e2e/generate-test-report.mjs`
- 手工验证模板: `docs/251126-design-system-poc/reader-panel-manual-test-template.md`
- 运行脚本: `scripts/run-reader-panel-tests.sh`

## 测试范围

| 站点 | 类型 | 验证要点 | 状态 | 备注 |
|------|------|----------|------|------|
| Wikipedia (en) | 复杂 DOM + Sticky header | Shadow DOM 隔离、Tab 顺序、Esc 关闭 | ✅ 手工已验证 | |
| Medium | 自定义字体/深底色 | Daisy 主题适配、按钮对比度 | ✅ 手工已验证 | |
| GitHub Gist | 代码块 + 深色主题 | 高亮定位、滚动到高亮 | ✅ 手工已验证 | |
| Stack Overflow | 多层问答 | Selection + Hint 状态切换 | ✅ 手工已验证 | |
| Twitter/X | 动态时间线 | 自动选中文本、提示 | ✅ 手工已验证 | 可能需要登录 |
| Reddit (新 UI) | 无限列表 | Dialog 随滚动稳定性 | ✅ 手工已验证 | |
| YouTube | 视频页 | Shadow DOM fallback、Reader/Video 共存 | ✅ 手工已验证 | |
| Bilibili | 弹幕/ShadowHost | 选区在 ShadowRoot 内时恢复 | ✅ 手工已验证 | |
| 知乎 | 富文本编辑器 | 过滤可编辑区域 | ✅ 手工已验证 | |
| 微信公众号 (mp) | 自定义排版 | 字体/间距、导出内容 | ⏭️ 本轮豁免 | 需要特定 URL，当前不执行 |
| Notion (可选) | 动态编辑器 | SelectionController 兼容性 | ⏭️ 本轮豁免 | 需要登录，当前不执行 |

## 自动化验证说明

### 方式 1：Vitest E2E Flow
```bash
npm run test:e2e -- tests/e2e/readerPanelFlow.test.ts
```

### 方式 2：Playwright 完整站点脚本
```bash
npm run build
bash scripts/run-reader-panel-tests.sh
# 或
npx playwright test tests/e2e/reader-panel-complete.spec.ts --headed
```

> 说明：`reader-panel-complete.spec.ts` 走的是 Playwright，不属于 `vitest.e2e.config.ts` 的 `*.test.ts` 匹配范围。

## 豁免说明

1. 微信公众号 (mp) 与 Notion 均依赖外部访问条件，不属于当前代码实现阻断。
2. 本轮按“代码 + 自动化 + 已完成手工样本”口径收口，明确不再追加这 2 个站点补测。
3. 若后续需要扩展站点信心，可再单独恢复这两项验证。

## 当前结论

- Reader 代码与自动化验证已闭环
- 已完成 9 个代表性站点手工巡检
- 微信公众号与 Notion 已明确标记为本轮豁免，不再作为阻断项
