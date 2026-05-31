# AiiinOB 选项页重构总结（2025-11）

> 复盘 2025 年 10-11 月完成的 Options 页面架构与体验改造，用于团队交接与后续评估。本文聚焦多语言以外的工作内容。
>
> 2026-05-31 状态：本文为历史复盘；旧 layout shell 源码已退役，新增 Options UI 行为归属 production Stitch shell、schema/render/domain code。

---

## 1. 重构动机与目标回顾

- **动机**：旧版 Options 页面为巨型 HTML + 全局脚本，存在 DOM/逻辑强耦合、维护困难、性能体验不佳等问题。
- **核心目标**：
  1. **组件化**：每个设置区块由独立 TypeScript Section 托管，具备完整生命周期。
  2. **设计一致**：对齐当期 Options 预览规范，替换旧 `options-*` 样式。
  3. **性能与稳定**：为懒加载、自动保存、测试回归打基础。
  4. **可验证性**：补齐单元与端到端测试，接入 CI/CD。

---

## 2. 架构总览

- **OptionsApp**：装配 Sidebar + MainContent，暴露 `mountSection` 等生命周期 API。
- **MainContent**：维护 Section 定义表（动态 `import`），默认仅挂载首个 Section，其余按需懒加载。
- **Section 组件**：继承 `BaseSection`，负责 DOM 渲染、事件绑定、`applySnapshot` / `collectChanges`。
- **formSectionManager**：集中管理 Section 的快照应用与变更收集。
- **OptionsController**：统筹持久化、自动保存、导入导出；支持 `dispose()`。
- **状态存储**：`OptionsStateManager` 增加 `mountedSections`、`activeSection`。

---

## 3. 主要工作项

### 3.1 组件体系建设

- 所有 Section（Usage、Rest、Routing、Templates、YamlConfig、AI、Reading、Fragment、Video、Privacy、Classifier 等）迁移为自包含组件，移除对 `renderOptionsForm` 的依赖。
- 引入 `formSectionManager`，替代 legacy schema 的 `apply/collect` 逻辑。
- 清理 `OPTIONS_FORM_SCHEMA`、`optionsForm.ts`，`optionsFormAdapter` 改为只负责基线 + Section 结果合并。

### 3.2 helper 与交互模块化

- `DomainMappingsController`、`YamlConfigTable`、`VaultRouterController` 等改写为 `BaseComponent` 子类，`destroy()` 释放资源。
- `NavigationController`、`ModalController` 等脚本提炼为可初始化/清理模块。
- `sectionRegistry` 负责集中注册 AI 时间戳、隐私刷新、分类器提示等跨 Section 功能。

### 3.3 功能修复与扩展

- Fragment Section 恢复上下文长度/模式控件并加入校验。
- 懒加载能力：`MainContent` 支持 `mountSection`、`preloadSections`、事件派发 (`aob:sectionmounted`)。
- 各 Section 补齐自动保存调度、错误处理与状态回退。
- `bootstrap.ts` 调整初始化顺序，修复 `cleanupHandlers` 等构建时异常。

### 3.4 样式 & 设计对齐

- 新增 `options-aob.css`，统一 `.aob-*` 命名；移除大部分旧 `options-*` 样式（2025-10）。
- 2025-11-08 完成 CSS Consolidation 后，`options-aob.css` 删除，`aob-options.css` 成为唯一 Options 页面样式文件。
- `options/index.html` 套用 preview 布局，Sidebar + Content 结构与设计稿一致。
- 优化阴影、按钮、表单控件样式，适配浅/深色主题；保留响应式基础（后续可再增强）。

### 3.5 测试与 CI/CD

- 单元测试：`tests/unit/options/sections/*.test.ts`、`MainContent.test.ts` 等覆盖渲染、snapshot、auto-save 场景。
- E2E：`optionsFragmentAutoSave.test.ts`、`optionsLanguageSwitch.test.ts`、`optionsNavigationLazyLoad.test.ts` 等验证核心流程。
- CI：`.github/workflows/ci.yml` 运行构建、i18n 检查、单元 + e2e、视觉回归、打包，确保部署质量。

---

## 4. 影响评估

- **维护性提升**：Section/Helper 模块化后，新增设置项仅需扩展对应组件，`bootstrap` 大幅瘦身。
- **自动保存与导入导出稳定**：通过 `OptionsController` + `formSectionManager` 双重保障。
- **测试可靠性提升**：新增单元/E2E 覆盖关键场景，CI 自动执行。
- **性能体验**：交互响应更快；默认仅首屏挂载 `usage` Section，通过懒加载与预加载能力平衡首屏体验与资源占用。

---

## 5. 后续建议

1. **多语言适配**：整理 zh/en 以外的词条，全面接入 `data-i18n`。
2. **响应式导航增强**：可按 `options-navigation-implementation.md` 方案实现悬浮/触发区行为或更新文档。
3. **文档梳理**：早期“迁移过程”文档已移至 `trash/archived-option-docs/`，保持主文档聚焦最新指引。
4. **性能调优**：根据需求决定是否重新启用懒加载（`preloadSections` 可选），或引入首屏骨架显示。
5. **视觉验收**：与设计确认最终配色、阴影、动效，必要时更新 Chrome Web Store 截图。

---

## 6. 附录：相关文件索引

- 架构与入口
  - `src/options/app/bootstrap.ts`
  - `src/options/components/layout/OptionsApp.ts`
  - `src/options/components/layout/MainContent.ts`
- Section 示例
  - `src/options/components/sections/FragmentSection.ts`
  - `src/options/components/sections/TemplatesSection.ts`
- Helper 与服务
  - `src/options/components/controls/domainMappings.ts`
  - `src/options/components/controls/yamlConfigTable.ts`
  - `src/options/components/sectionRegistry.ts`
- 测试
  - `tests/unit/options/sections/*.test.ts`
  - `tests/unit/options/layout/MainContent.test.ts`
  - `tests/e2e/optionsFragmentAutoSave.test.ts`
- CI
  - `.github/workflows/ci.yml`

---

> 以上成果已合入主干。如需进一步扩展，请参考本总结及新生成的 Guide 文档。谢谢所有参与者的努力！ 🎉
