# TypeScript 类型校验治理迭代计划

## 背景
当前仓库尚未接入 `tsc --noEmit`，在尝试启用时会一次性出现大量报错，涉及全局类型冲突、第三方适配器、旧逻辑的 `any` 逃逸等问题。如果直接开启类型校验，会对现有开发流程造成较大阻力。因此需要通过迭代治理的方式逐步清理技术债务，并在合适的时机正式把 TypeScript 校验纳入 CI。

## 治理目标
- **短期（迭代 1）**：梳理并分组当前报错来源，建立最低限度的类型基线；为重点模块（通知服务、存储层、content 脚本）补齐基础类型。
- **中期（迭代 2）**：消除主要模块中的 `any`、隐式返回类型和 DOM API 误用；为第三方适配层提供轻量声明或隔离方案；确保单元测试在启用类型模式下可编译。
- **长期（迭代 3）**：在 CI 中加入 `npm run typecheck`（或等效脚本），并要求所有新代码遵循严格模式；建立针对第三方子仓的类型守护策略，避免回归。

## 基础约定
1. **先分类再治理**：把报错按“全局声明冲突”“缺失/错误类型”“第三方脚本”“测试环境”四类归档，分批解决。
2. **引入轻量声明文件**：对于短期内难以彻底类型化的第三方模块，使用 `*.d.ts` 描述最小必要接口，待后续逐步替换。
3. **配套自动化**：每个阶段完成后运行 `npm run test:unit` + `tsc --noEmit` 验证；最终阶段把 `typecheck` 纳入 `test:ci`。
4. **文档同步**：整理迁移指南，编写《TypeScript 开发约定》到 docs 目录，降低后续维护成本。

## 当前报错分组
| 分类 | 代表文件/现象 | 说明 |
| --- | --- | --- |
| 全局声明冲突 | `duplicate identifier 'chrome'/'fetch'` | 单测与内容脚本共享 DOM/Node 声明，需要按环境拆分 `tsconfig` 或自定义声明。 |
| 错误类型使用 | `src/background/services/notifications.ts` | 自定义适配器与 `chrome.notifications.create` 类型签名不匹配。 |
| 缺失第三方声明 | `turndown`、`@mozilla/readability` | 需补充 `@types/turndown`（已引入）或自定义 d.ts。 |
| DOM API 误用 | `src/options/components/usageDashboard.ts` | 直接把 `HTMLElement` 断言为 `SVG*`，需改成 `SVGElement` 查询或 `instanceof` 校验。 |
| 隐式 any / 推断失败 | `contextCapture.ts`, `contextDom.ts` 等 | 老代码缺少显式类型，导致 `TS7022` 等报错。 |
| 第三方采集脚本 | `src/third_party/ai-chat-exporter/platforms/*.ts` | 依赖旧的 DOM NodeList 遍历写法（没有 `[Symbol.iterator]`），需统一用 `Array.from`。 |
| 表单 Schema | `src/options/components/optionsForm.ts`, `src/options/schema.ts` | `Record<string, string>` 与强类型对象交叉混用，需拆分字段映射。 |
| 测试桩类型 | `tests/unit/optionsStore.test.ts` 等 | 直接对 `chrome.storage.sync` 赋 `vi.fn()`，需通过包装的 mock helper。 |

## 迭代路线

### 迭代 1：类型基线与基础设施
- [ ] 在 `tsconfig.json` 中拆分三套配置：`tsconfig.base`（共享）、`tsconfig.app`（生产代码，DOM + chrome types）、`tsconfig.tests`（Node + vitest）。
- [ ] 在 `package.json` 添加 `"typecheck": "tsc -p tsconfig.app.json && tsc -p tsconfig.tests.json"`（先不接入 CI）。
- [ ] 调整 `src/background/services/notifications.ts` 的签名，使 `NotificationAdapter` 与 `chrome.notifications.create` 兼容；同步更新单测。
- [ ] 引入 `@types/turndown`（已完成）并在 `third_party` 目录为确实缺失声明的模块补充最小 `d.ts`。
- [ ] 为 `chrome.messages` 等 API 编写 `test/mocks/chrome.ts`，单测直接导入，避免全局重写。

**验收指标**：`tsc -p tsconfig.app.json` 报错数下降到 < 30，核心打包脚本无类型错误。

### 迭代 2：模块化治理
- [ ] 重构 `contextCapture.ts` / `contextDom.ts` / `contextSerialization.ts` 的函数签名，补齐返回值和参数类型；引入 `Node` union，避免 `any`。
- [ ] `usageDashboard.ts` 及 Options 面板组件：使用 `querySelector<SVGSVGElement>` 等泛型接口，减少非安全断言。
- [ ] `optionsForm.ts` & `options/schema.ts`：拆分表单域模型，使用 `Pick<OptionsState, 'rest' | ...>`，并给校验层定义独立类型。
- [ ] `ai-chat-exporter` 平台脚本：统一使用 `Array.from(nodeList)` 遍历，补充必要的 `Element` 类型守卫。
- [ ] 处理剩余 `implicit any` 报错，确保生产代码 `tsc` 仅余测试相关告警。

**验收指标**：`tsc -p tsconfig.app.json` 0 报错，`tsc -p tsconfig.tests.json` 仅剩 mock/声明待处理项。

### 迭代 3：测试与 CI 接入
- [ ] 为测试环境补充 `chrome` mock 类型定义，解决 `duplicate identifier` 及 `delete` 操作报错。
- [ ] 调整 `vitest` 配置：为需要 DOM 的测试使用 `@vitest-environment jsdom`，减少全局 DOM 类型引入。
- [ ] 在 `package.json` 的 `test:ci` 中增加 `npm run typecheck`，CI 失败即阻断。
- [ ] 编写《TypeScript 编码约定》文档，明确类型严格模式下的常见实践。
- [ ] 将治理成果纳入 PR 模板和代码评审要点。

**验收指标**：CI 通过 `npm run typecheck`，新 PR 默认遵循类型校验；无新增 `any` 或 `@ts-ignore`。

## 风险与缓解措施
- **历史代码面大**：优先保证与剪藏流程强相关的模块，低风险区域（如 options UI）可排到中后期。
- **第三方脚本频繁更新**：对比官方仓库，考虑通过 `// ts-expect-error` + 快速跟进策略维持同步。
- **人员认知差异**：提供 pair programming & code review checklist，必要时举行一次内部分享。

## 里程碑
| 阶段 | 目标 | 预计工期 |
| --- | --- | --- |
| 迭代 1 | 完成配置拆分、核心服务类型修复 | 1 周 |
| 迭代 2 | 主要模块零类型报错，梳理 UI & 解析层 | 1-2 周 |
| 迭代 3 | CI 接入 + 制度化约束 | 1 周 |

## 后续工作
- 将本计划纳入 docs 指南目录，并在每个迭代结束后更新进展。
- 在 GitHub 项目看板或 Issue 中拆分为可执行任务，追踪完成度。
- 定期复盘（例如每次迭代结束时）是否需要调整策略或优先级。

