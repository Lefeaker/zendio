# 选项页事件绑定迁移指引

> **目标**：将目前仍由 `bootstrap.ts` 维护的 DOM 事件监听迁移到对应的 TypeScript 组件内部，实现真正的组件化与解耦，同时补齐缺失的 UI 按钮。

## 1. 背景

- 选项页已经引入 `OptionsApp` + Section 组件体系，但多个按钮仍通过 `document.getElementById` 在 `src/options/app/bootstrap.ts` 中集中绑定，违背组件自治原则。
- 迁移工作需要逐步将这些事件处理逻辑下沉到各自组件，或改为通过状态管理/服务层协调。
- 在重构期间必须保证现有功能不回归：配置复制/导入、诊断流程、语言切换、域名映射、分类器提示等。

## 2. 当前全局绑定清单

| 功能 | DOM ID | 绑定位置 | 渲染来源 | 备注 |
| --- | --- | --- | --- | --- |
| 语言切换 | `languageSelect` | `bootstrap.ts:195` | `LanguageSection.ts:41` | 负责切换 i18n 资源并刷新界面。 |
| 新增域名映射 | `addMappingBtn` | `bootstrap.ts:203` | `TemplatesSection.ts:114` | 调用全局 `addMappingRow`。 |
| 导出配置 | `copyConfigBtn` | `bootstrap.ts:206` | `TransferSection.ts:33` | 使用剪贴板 API。 |
| 导入配置 | `importConfigBtn` | `bootstrap.ts:210` | `TransferSection.ts:39` | 读取剪贴板并保存。 |
| 手动保存 | `saveBtn` | `bootstrap.ts:214` | **实验 UI 未挂出** | 需确认 UI 设计。 |
| 诊断 | `diagBtn` | `bootstrap.ts:222` | `DiagnosisSection.ts:45` | 调用 `runDiagnostics`。 |
| 修复 | `fixBtn` | `bootstrap.ts:224` | `DiagnosisSection.ts:49` | 调用 `fixConfiguration`。 |
| 重新加载 | `reloadBtn` | `bootstrap.ts:226` | `DiagnosisSection.ts:53` | 刷新存储配置后诊断。 |
| 分类器开关提示 | `clsEnable` | `bootstrap.ts:230` + `updateClassifierUnstableNote` | `ClassifierSection.ts:23` | 控制不稳定提示展示。 |
| AI 时间戳强制关闭 | `aiIncludeTimestamps` | `bootstrap.ts:351` | `AiSection.ts` | 固定为 false。 |
| URL Hash 锚点 | `fragmentKeyboardShortcutsEnabled` (等) | `bootstrap.ts:408` | `FragmentSection` | 高亮指定控件。 |
| 模态框触发 | `supportLink` 等 | `initModalManager` | Sidebar footer | 已模块化，可维持。 |

## 3. 迁移策略

1. **按功能拆分**  
   分批处理，优先迁移易于封装的按钮：语言切换、域名映射、诊断三件套、分类器提示。

2. **组件内绑定**  
   - 在 Section 内部的 `render` 方法完成元素渲染后，使用实例级别的事件绑定。
   - 在 `destroy` 中注销监听，保持内存清理。

3. **公共逻辑抽取**  
   - 需要跨组件复用的服务（如剪贴板导出、诊断逻辑）仍留在 `services/` 或 `components/diagnostics.ts`，但通过显式函数调用，不再依赖全局。

4. **状态同步**  
   - 语言切换、分类器等涉及状态的操作，要通过 `OptionsStateManager` 或已有 store 协调。
   - 如暂不迁移状态层，可在组件中直接调用现有 service，但避免 `document.getElementById`。

5. **缺失 UI 补充**  
   - `saveBtn` 在实验 UI 中缺席，需要决定是否恢复为显式保存按钮。若改为自动保存，应同步移除监听与相关提示文案。

## 4. 建议的执行顺序

1. **诊断面板**  
   - 在 `DiagnosisSection` 中封装 `runDiagnostics`、`fixConfiguration`、`handleReload` 调用，提供加载中状态或禁用按钮的能力。

2. **配置同步**  
   - 将 `copyConfig` / `importConfig` 操作迁入 `TransferSection`，并考虑提示统一显示位置（如 Section 内 status bar）。

3. **语言与映射**  
   - 语言选择器在 Section 内部监听 `change`，通过 `ensureDeclarativeI18nController` 触发刷新；迁移完毕后 `bootstrap.ts` 删除对应逻辑。
   - 域名映射新增按钮在模板 Section 内部直接调用 `addMappingRow` 或替换为新的接口。

4. **分类器提示**  
   - 在 `ClassifierSection.render` 中监听 `clsEnable` 的 change 事件，实时控制提示显示。

5. **AI 时间戳与 Hash 高亮**  
   - 将强制关闭时间戳改为渲染时设定默认值或通过 state 控制。
   - Hash 高亮功能可重写为 `OptionsApp` 层的导航 hook，无需直接查找具体控件。

## 5. 验收检查单

- [ ] `bootstrap.ts` 中不再出现针对上述 ID 的 `getElementById`/`addEventListener`。
- [ ] Section 组件在 `destroy()` 中移除各自监听。
- [ ] 所有按钮在 UI 中可见且功能正常：语言切换更新内容、映射新增成功、配置导入导出成功、诊断/修复/重新加载无报错。
- [ ] 分类器开关能即时显示/隐藏提示，且状态随保存保持一致。
- [ ] 文档/提示文字同步更新（若移除手动保存按钮，需要公告自动保存策略）。

## 6. 后续维护建议

- 新增 Section 时，统一在组件内部管理交互；仅当逻辑必须跨区时，才由 `OptionsApp` 调用共享服务。
- 在迁移过程中，注意保留 `bootstrap.ts` 中与模态管理、导航锚点等无关事件的功能，避免误删。
- 完成每个阶段的迁移后，立即运行相关单元/端到端测试，确保行为不回归。

---

> 完成以上迁移后，请将 PR/变更提交给维护者审核，并在合并前再次验证诊断面板与配置同步流程。随后会有专人进行复核与回归测试。谢谢配合！
