# 选项表单 Schema 验证记录

## 验证目标
- 确认 `OPTIONS_FORM_SCHEMA` 渲染出的 UI 与原有功能一致。
- 新旧数据结构兼容：
  - 表单渲染能正确加载已有 `chrome.storage.sync` 中的存量配置。
  - 收集函数输出的 `CompleteOptions` 字段与原来一致（含 `baseUrl`、`domainMappings` 默认值等）。
- 联动逻辑保持生效：
  - `fragmentCaptureContext` 控制上下文输入框显示。
  - `clsEnable` 控制分类器配置区域显示。

## 操作步骤
1. 本地构建并打开 `src/options/index.html`：
   - 手动勾选/填写关键字段，观察上下文/分类器区域显隐与输入值更新。
2. 通过单元测试覆盖：
   - `npm run test`（已有覆盖包含 optionsStore/optionsMerger/optionsValidation 等，确认收集输出不破坏既有逻辑）。
3. 脚本检查关键路径：
   ```ts
   // 在控制台执行
   import { renderOptionsForm, collectOptionsFromForm } from './optionsForm';

  const mock = {
    rest: { httpsUrl: 'https://example.com/', vault: 'Demo', apiKey: 'KEY123' },
    fragmentClipper: { captureContext: true },
     classifier: { enabled: true, provider: 'openai' }
   };

   renderOptionsForm(mock);
   const collected = collectOptionsFromForm(mock);
   console.log(collected.rest.baseUrl); // -> https://example.com/
   console.log(collected.fragmentClipper.captureContext); // -> true
   console.log(collected.classifier.provider); // -> openai
   ```

## 结论
- 在手动冒烟与单元测试均通过的情况下，schema 重构版本与旧结构保持兼容，可继续后续迭代。
