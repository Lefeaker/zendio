# 视频模式会话模块平台化重构指导

## 1. 背景
- `src/content/video/session.ts` 现有实现超过 2.8k 行，耦合了面板 UI、数据持久化以及平台（Bilibili/YouTube/通用）适配逻辑，维护成本高。
- Bilibili 页面结构频繁变动，需要快速迭代平台适配；现状下每次改动都需在巨型文件中穿插修改，易引入回归。
- 平台无关逻辑与特化逻辑混杂，导致测试覆盖难以聚焦，代码审阅与知识转移效率低。

## 2. 目标
1. 将视频模式核心流程与平台特化逻辑剥离，形成“框架 + 多态适配”结构。
2. 降低 `VideoSession` 主体文件体积至约 300～400 行，提升可读性与可测试性。
3. 为 Bilibili/YouTube 等平台建立独立的适配实现，并提供清晰接口，便于后续新增或调优。
4. 完成后保持现有功能、测试集与包体行为一致。

## 3. 目标目录结构（建议）
```
src/content/video/
├── session.ts                 // 精简后的主控制器，仅编排公共流程
├── application/…              // 现有 UI / 模型层保持不变
├── platforms/
│   ├── baseVideoPlatform.ts   // 平台接口定义 + 默认实现框架
│   ├── bilibiliPlatform.ts    // Bilibili 平台适配
│   ├── youtubePlatform.ts     // YouTube 平台适配
│   └── index.ts               // 工厂方法，根据 URL/Platform 构建适配器
└── utils.ts                   // 若有需要，可存放共用工具函数
```

可根据实际情况补充更多平台（如未来支持其他视频站点）。

## 4. 平台接口设计要点
`BaseVideoPlatform` 建议至少包含下列职责：
- `shouldActivate(document: Document): boolean`：判断当前页面是否匹配。
- `resolveSelection(range: Range | null, event?: MouseEvent): PlatformSelectionResult`：处理选区兜底、文本/HTML 生成、Token 化等。
- `highlight(range: Range, captureId: string, fragmentUrl: string): string | undefined`：封装高亮创建及样式注入。
- `restoreHighlight(capture: VideoFragmentCapture): void`：在页面重新渲染或刷新的情况下恢复高亮。
- `observeDomChanges(observer: MutationObserver): void`：注册 Shadow DOM/MO 监听逻辑。
- `dispose(): void`：平台特化的清理流程。

可根据需要扩展接口，例如富文本序列化、URL 构建、事件桥接等。

## 5. 拆分实施步骤
1. **基线准备**
   - 运行核心测试（`npm run typecheck:app`、`npm run test:unit`）。  
   - 标记需要迁移的 Bilibili 专用函数（`extractBilibiliSelection`、`observeShadowRoots` 等）。
2. **创建平台基础设施**
   - 新建 `platforms/baseVideoPlatform.ts`，定义接口及默认实现（可提供空实现或返回 `null`）。
   - 新建 `platforms/index.ts`，根据 `VideoPlatform` 枚举或 URL 特征返回对应适配器。
3. **迁移公共流程**
   - `VideoSession` 中保留 UI 面板、存储、命令触发等逻辑；原平台相关调用改为调用接口实例。
   - 在 `start()` 时初始化平台适配器，在 `cleanup()` 中释放。
4. **Bilibili 适配迁移**
   - 将当前 Bilibili 专用函数（Shadow DOM 监听、富文本解析、选区兜底、高亮恢复）移动到 `bilibiliPlatform.ts`。
   - 调整函数为类/对象方法，使用接口定义的返回值。
   - 迁移后删除 `session.ts` 中对应实现，改为调用适配器。
5. **YouTube 适配迁移**
   - 针对 YouTube 的个别逻辑（如 URL 构建、选区处理）迁移到 `youtubePlatform.ts`。
   - 如果 YouTube 逻辑较简单，可在 `BaseVideoPlatform` 中提供默认实现，再通过 `youtubePlatform` 进行轻量覆盖。
6. **共用工具提取**
   - 将富文本解析、HTML 转义等平台共用工具函数整理至 `platforms/utils.ts` 或保留在 `BaseVideoPlatform`。
7. **主流程清理**
   - 确保 `VideoSession` 中平台相关的字段/状态（如 ShadowRoot 集合）转移到适配器内部。
   - 检查导入依赖，删除未使用代码。
8. **测试与验证**
   - 更新或新增单元测试：  
     - Bilibili 富文本解析（可引用 `docs/全马…html` 片段）。  
     - 选区兜底与高亮恢复。
   - 运行 `npm run typecheck:app`、`npm run test:unit`、必要时的 e2e。
9. **文档与交付**
   - 更新 README 或内部文档，说明平台适配接口的用法。
   - 在 PR 描述中列出迁移范围与测试结果。

## 6. 测试与验证建议
- **单元测试**：针对平台适配器的纯函数（文本解析、Range 构造）补充测试，输入使用抓取的 HTML 片段。
- **集成测试**：在 e2e 环节模拟 Shadow DOM，验证高亮恢复及选区捕捉。
- **人工验证**：  
  - Bilibili：主评、回复、表情、@ 提及、滚动加载、切换排序。  
  - YouTube：常规选区、时间戳生成。  
  - 验证高亮复现及面板数据持久化。

## 7. 风险与缓解
| 风险 | 描述 | 缓解 |
| ---- | ---- | ---- |
| 拆分后遗漏依赖 | 平台逻辑未完整迁移导致编译/运行异常 | 迁移同时保持原函数签名，拆分后逐步删除旧实现；单元测试覆盖关键路径 |
| 平台接口设计不完整 | 后续需要频繁改动接口 | 初版接口保持最小集合，允许通过可选方法或扩展接口演进 |
| 回归难以发现 | 交叉依赖隐藏在大文件之外 | 补充自动化测试 + 参考真实 DOM 片段做快照测试 |

## 8. 里程碑与协作建议
1. **Day 1-2**：接口设计、基础模块搭建、VideoSession 精简。
2. **Day 3-4**：Bilibili 适配迁移、单元测试补充。
3. **Day 5**：YouTube 适配迁移、共用工具整理。
4. **Day 6**：联调 + 回归测试、文档更新。

任务可按平台分工（一个人负责 Bilibili 适配，一个人负责通用流程/YouTube），并在 PR 阶段同步评审。

---

完成上述拆分后，再继续推进 Bilibili 评论区抓取的后续适配，将显著降低改动范围，提高调试效率。
