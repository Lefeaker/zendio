# Week 1-2 迁移清单

## Section 审计结果

| Section | 文件 | 按钮数 | 输入框数 | 卡片数 | Alert 数 | 其他 UI | 优先级 | 预计工时 |
|---------|------|--------|---------|--------|---------|---------|--------|---------|
| AiSection | AiSection.ts | 2 | 3 | 0 | 1 | 平台标签列表 | P1 | 2h |
| LanguageSection | LanguageSection.ts | 1 | 0 | 0 | 0 | 下拉选择 | P1 | 1h |
| PrivacySection | PrivacySection.ts | 1 | 0 | 0 | 0 | 复选框 | P1 | 1h |
| TransferSection | TransferSection.ts | 2 | 0 | 0 | 1 | 状态提示 | P1 | 1.5h |
| RestSection | RestSection.ts | 3 | 4 | 1 | 1 | 连接测试区域 | P2 | 3h |
| RoutingSection | RoutingSection.ts | 2 | 2 | 0 | 0 | 路由表编辑 | P2 | 2h |
| FragmentSection | FragmentSection.ts | 2 | 3 | 0 | 0 | YAML 片段表单 | P2 | 2h |
| VideoSection | VideoSection.ts | 2 | 2 | 0 | 0 | 平台列表 | P2 | 2h |
| ReadingSection | ReadingSection.ts | 1 | 0 | 1 | 0 | 模板编辑 | P3 | 2h |
| TemplatesSection | TemplatesSection.ts | 2 | 0 | 1 | 0 | 模板列表 | P3 | 2h |
| ClassifierSection | ClassifierSection.ts | 2 | 2 | 0 | 0 | 分类器配置 | P3 | 2h |
| UsageSection | UsageSection.ts | 1 | 0 | 0 | 0 | 图表展示 | P3 | 1h |
| **YamlConfigSection** | YamlConfigSection.ts | 5 | 10 | 0 | 0 | 表格编辑器 | **P4 延后** | 8h |
| **DiagnosisSection** | DiagnosisSection.ts | 1 | 0 | 0 | 0 | 诊断操作 | **P4 延后** | 1h |

**总计**：
- 简单 Section（P1）：4 个，预计 5.5h
- 中等 Section（P2）：4 个，预计 9h
- 复杂 Section（P3）：4 个，预计 7h
- 延后 Section（P4）：2 个，延后到月度 3

**累计工时**：21.5h（Week 3-4 批量迁移）

## TODO 标记统计

| Section | TODO 数量 |
|---------|-----------|
| AiSection | 3 |
| LanguageSection | 1 |
| PrivacySection | 1 |
| TransferSection | 3 |
| RestSection | 6 |
| RoutingSection | 4 |
| FragmentSection | 4 |
| VideoSection | 3 |
| ReadingSection | 2 |
| TemplatesSection | 3 |
| ClassifierSection | 4 |
| UsageSection | 1 |
| YamlConfigSection | 6 |
| DiagnosisSection | 1 |

**总计**：42 个 TODO

## 延后组件说明

1. **YamlConfigSection 的表格编辑器**  
   - 原因：依赖 Zag.js Table（Stage 3 月度 3 任务）  
   - 行数：~2000 行，涉及复杂的 YAML 映射与拖拽行为  

2. **VaultRouter 下拉选择器（RoutingSection）**  
   - 原因：需要 Zag.js Select，涉及虚拟滚动与键盘导航  
   - 行数：~300 行，建议维持现状，仅迁移外围按钮样式  

3. **路由表编辑器（RoutingSection）**  
   - 原因：自定义拖拽与条件渲染，迁移风险高  
   - 计划：Stage 3 月度 3 联合 UX/前端更新  

4. **YamlConfigSection 的批量导入/导出对话框**  
   - 原因：需先完成 DaisyDialog（Week 3 任务）再统一替换  

5. **DiagnosisSection 的诊断操作面板**  
   - 原因：依赖后台诊断接口联动，需 Stage 3 月度 3 的 API 签核  

6. **FragmentSection 的 YAML 片段表单**  
   - 原因：需接入 Monaco/CodeMirror，搭配 Month 3 的富文本/片段编辑器统一迁移  
   - 计划：Stage 3 Month 3 完成基础编辑器后再替换现有实现  

7. **Reading/Templates Section 的模板编辑器 / 域名映射拖拽**  
   - 原因：需要 Zag.js List/Grid 能力支持拖拽排序与高级模板编辑体验  
   - 计划：Stage 3 Month 3 完成 Zag.js 列表组件接入后统一替换当前占位实现  

8. **UsageSection 的 Chart.js 面板升级**  
   - 原因：需要把现有 SVG/Chart.js 容器统一迁移到 DaisyCard + Zag.js chart shell，属于 Week 5 的可视化规范  
   - 计划：Stage 3 Month 3 配合整套 Usage Dashboard 刷新时再改造，目前仅完成按钮替换并保留现有图表实现  

这些延后项已在迁移清单中标记为 P4，将在 Stage 3 Month 3 集中处理。***
