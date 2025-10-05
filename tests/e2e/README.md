# E2E Test Placeholder

当前已提供 `clipperFlow.test.ts`（基于 Vitest/jsdom）模拟完整剪藏链路：路由选择、路径解析、通知派发。未来若引入 Playwright/Puppeteer，可在此目录新增脚本，例如：

- `clipper.smoke.spec.ts`：浏览器内验证全页面剪藏流程。
- `options.smoke.spec.ts`：验证 Options 表单保存与回显。

运行浏览器端脚本之前，请确保扩展已打包并被测试浏览器加载。
