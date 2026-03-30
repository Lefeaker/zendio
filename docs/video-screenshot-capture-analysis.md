# 视频模式截图功能可行性分析报告

## 1. 背景与目标
- 需求：在视频模式下，用户打点（创建时间戳或文字片段）时自动截取当前视频画面，保存并随导出的 Markdown 一起写入仓库。
- 现状：`VideoSession` 仅记录时间戳、评论及文本片段（`VideoTimestampCapture` / `VideoFragmentCapture`），导出链路只处理 Markdown 文本，不包含二进制资源。
- 目标：评估在保持现有功能稳定的前提下，引入截图捕捉的新能力所需的技术改动、风险与工作量。

## 2. 现有架构概览
| 模块 | 作用 | 关键文件 |
| --- | --- | --- |
| 视频内容脚本 | `VideoSession` 协调面板 UI、选区捕获、存储与导出，时间戳录入在 `handleAddCapture` 内完成 | `src/content/video/session.ts` |
| 捕获持久化 | 将 `captures` 序列化至 `chrome.storage.local`，重建时同步高亮 | `src/content/video/captureStorage.ts` |
| 导出构建 | `VideoSessionExporter` 将捕获数据转成 Markdown + front matter | `src/content/video/videoSessionExporter.ts` |
| 导出链路 | `VideoSession` -> `VideoSessionExporter` -> background `clipPipeline` -> `processClipPayload` -> `writeMarkdownToVault` | `src/background/pipelines/clipPipeline.ts`, `src/background/application/clipProcessor.ts`, `src/background/services/obsidianWriter.ts` |
| REST 写入 | 默认 `FetchRestClient.writeFile` 仅支持 `text/markdown` PUT | `src/infrastructure/restClient.ts` |
- manifest 当前权限：`activeTab`、`scripting`、`storage` 等，无 `unlimitedStorage`。

## 3. 功能需求拆解
1. **截图能力**：在用户触发打点时获取当前视频画面，支持至少 720p，失败时需降级不阻塞打点。
2. **数据结构扩展**：为时间戳捕获引入图片字段，并能持久化在本地缓存中。
3. **导出链路升级**：图片需随 Markdown 一并写入仓库，可选为内联 `data:` URI 或单独文件。
4. **UI/交互**：面板展示截图预览、导出结果在 Markdown 中正确引用；提供开关或告警。
5. **配置与权限**：在 options 页面增加开关、截图质量、保存位置等配置；评估权限（例如 `unlimitedStorage`、`tabCapture`）。
6. **测试与文档**：补充单元/端到端测试、更新 i18n 文案与用户指南。

## 4. 技术方案评估

### 4.1 截图获取方式
| 方案 | 描述 | 优点 | 风险 / 限制 |
| --- | --- | --- | --- |
| A. `<video>` + Canvas | 在内容脚本中使用 `canvas.drawImage(video)` | 实现简单；无需背景交互 | 绝大多数平台（Bilibili、YouTube）视频源跨域，Canvas 会被标记为 tainted，无法读取像素 |
| B. `chrome.tabs.captureVisibleTab` + 裁剪 | 在后台 Service Worker 调用 API 获取整页截图，再按视频元素 bounding box 裁剪 | 不受跨域限制；官方支持 | 仅能截取可见区域；需要在内容脚本与后台之间交换矩形信息；Service Worker 无 DOM，需要 `OffscreenCanvas`/`ImageBitmap` 处理；多显示器/高 DPI 需计算缩放 |
| C. `chrome.tabCapture.capture` (流) | 捕获页面媒体流，绘制到 OffscreenCanvas | 可持续获取帧，适合后续扩展 | 需声明 `tabCapture` 权限；实现复杂；Firefox 兼容性差；额外性能开销 |

推荐先走方案 B：一次性截图满足当前“打点瞬间”需求，复杂度可控。Canvas 方案只能在同源视频站适用，价值有限；流式捕获工程成本远高于收益。

### 4.2 截图裁剪 / 缩放
- 内容脚本在触发打点时同步发送：目标 `tabId`、`videoBoundingRect`、页面 `devicePixelRatio`。
- 后台 Service Worker 调用 `captureVisibleTab` 获取 base64 PNG，再通过 `OffscreenCanvas` 按坐标处理，返回裁剪后的 data URL。
- 需要处理页面滚动导致的可视区域偏移；若视频不在 viewport（用户切到其他标签页），API 可能返回上一帧或空白，需要回退。
- 可在内容脚本层添加等待（最多 150ms）确保 UI 稳定，必要时提示用户需保持标签页激活。

### 4.3 数据存储与同步
- **结构调整**：为 `VideoTimestampCapture` 增加可选字段 `screenshot?: { dataUrl: string; width: number; height: number; capturedAt: number }`；序列化结构需同步更新。
- **存储配额**：Chrome `storage.local` 默认总额度 ~5MB；无 `unlimitedStorage` 时，5 张 720p PNG（~800KB/张）就可能触顶。需评估：
  - 请求 `unlimitedStorage` 权限；
  - 或仅缓存文件名与元信息，将图片落盘后不再保存在 storage 中；
  - 或限制截图分辨率（例如 480p）并压缩为 JPEG/WebP。
- **清理策略**：删除某个 capture 时需要同步删除缓存中的图片信息；若导出后执行 `cleanup()`，考虑是否清空 storage 中历史截图。

### 4.4 导出与仓库写入
| 方案 | 描述 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 1. Markdown 直接内联 `data:image/png;base64` | 无需改 REST 客户端 | 文档体积暴涨；Obsidian 预览性能差；Markdown diff 变大 |
| 2. 将截图写为独立文件（`assets/video-shots/<id>.png`），Markdown 引用 | 体积可控，用户可复用资源 | 需要扩展后端链路支持二进制写入、多文件；需处理命名冲突与引用同步 |
| 3. Markdown 内使用 `![[attachment]]`，通过 REST 写入 Attachment | 贴合 Obsidian 用法 | 同方案 2 的实现复杂度 |

**建议路径**：优先落地方案 2。需要对以下模块扩展：
1. `VideoSessionExporter`：在 `ExportPayload.meta` 中新增附件数组（包含文件名、MIME、base64）。
2. `ClipResultMessage` / `processClipPayload`：支持携带附件信息。
3. `writeMarkdownToVault` / `FetchRestClient`：增加 `writeBinaryFile`，使用 `PUT` 并设置合适的 `Content-Type`。
4. 若 REST 服务端不支持，该方案需先验证（可通过临时脚本对接当前 REST API）。

若短期无法改动后端，折中方案是提供配置选择：允许用户开启“内联图片”，并提示文件体积风险。

### 4.5 UI/交互调整
- 面板侧：
  - 在 `VideoPanelPresenter` 渲染时间戳项时显示缩略图（可懒加载）。
  - 编辑、删除时同步更新截图。
  - 失败时展示提示（例如“截图失败，已保存时间戳”）。
- 打点流程：
  - `handleAddCapture` 需改为异步，等待截图结果后再 push capture；失败则以无图模式继续。
  - 可加入 loading 态或淡化按钮避免用户连续点击。
- 导出提示：
  - `VideoSession` 的完成提示应说明截图一并导出。
  - Options 页面提供开关、分辨率/格式选择、是否内联等设置 (`src/options/state/optionsStore.ts`、`options/index.html` 等需同步 i18n 文案)。

### 4.6 权限 / 隐私
- 可能新增权限：
  - `tabCapture`（若改用方案 C）或 `unlimitedStorage`。
  - 如使用 `captureVisibleTab`，需确保 manifest 中 `activeTab` 足够；Firefox 需验证是否还要 `tabs` 权限。
- 隐私文档与许可说明 (`docs/privacy-policy.md`) 需更新，说明扩展会截取用户当前页面的图像，只用于导出。
- 需要提供配置项允许用户关闭截图能力，默认可考虑关闭以降低敏感度。

## 5. 工程改动范围
1. **内容脚本 (`VideoSession`)**
   - 打点流程异步化、增加截图请求逻辑、错误处理、UI 状态。
   - `captures` 数据结构变更，序列化/反序列化适配。
   - 在清理流程中释放临时资源。
2. **平台适配器**
   - 若部分平台需要特殊构图（例如 Bilibili 弹幕遮盖），需在 `platforms/*` 中添加额外遮罩逻辑。
3. **后台 Service Worker**
   - 新增消息处理器，执行 `captureVisibleTab`、`OffscreenCanvas` 裁剪、编码。
   - 可抽象成 `videoScreenshotService`，便于复用与测试。
4. **导出链路**
   - `VideoSessionExporter` 构造 Markdown + 附件元信息。
   - `clipPipeline` / `processClipPayload` 扩展 payload 结构。
   - `restClient` 支持批量写入：先写图片，再写 Markdown（或反之）。
5. **配置与本地化**
   - Options UI、新增 schema 字段、`_locales/*` 文案。
   - 更新 `docs/zh-cn/设置页面使用指南.md` 等指南。
6. **测试**
   - 单元测试：截图请求协议（mock background）、序列化迁移、导出 Markdown 链接正确性。
   - e2e：在 `tests/e2e/deepseekAiChatFlow.test.ts` 等基础上新增视频模式场景或独立脚本，验证截图文件写入。
7. **文档与发布**
   - 更新 README / 发行说明，说明新权限与功能。
   - 若引入 `unlimitedStorage` 等敏感权限，需要在 Chrome Web Store 列表 (`marketing/chrome-web-store/listing.md`) 更新描述。

## 6. 风险与缓解
| 风险 | 描述 | 缓解措施 |
| --- | --- | --- |
| 截图失败率高 | 标签页未激活、视频被遮挡、跨屏缩放导致裁剪错位 | 捕获前检测 `document.visibilityState`；获取失败时退化为无图；记录错误用于后续统计 |
| 存储超限 | 多次截屏导致 `storage.local` 爆满或仓库写入体积过大 | 允许用户配置最大分辨率 & 保留张数；导出后清理缓存；必要时请求 `unlimitedStorage` |
| REST API 不支持二进制写入 | 现有 Obsidian REST 仅测试过 Markdown | 预研 REST 端行为，必要时提交补丁；若短期无法支持，使用内联方案作为过渡 |
| 性能回归 | 截图/编码耗时导致前端卡顿 | 在 Service Worker 侧异步处理，前端仅等待 Promise；可在 UI 层显示 loading；对截图进行压缩 |
| 权限审查风险 | 新增截图相关权限可能触发商店审核 | 在文档与上架描述中充分披露用途，提供开关；若仅使用 `captureVisibleTab`，保持最小权限 |

## 7. 工作量粗估（以 2 人周衡量）
| 任务 | 估计 | 说明 |
| --- | --- | --- |
| 截图服务实现（内容脚本 + 背景通信） | 3-4 天 | 含裁剪、错误处理、单元测试 |
| 数据结构 & 存储迁移 | 1-2 天 | 兼容旧数据、添加清理逻辑 |
| 导出链路扩展（附件写入） | 3-4 天 | 取决于 REST API 支持程度，可能拆分为两阶段 |
| UI 与配置调整 | 2 天 | 面板预览、Options、i18n |
| 测试 & 文档 | 2 天 | e2e + 文档更新 |
| 审稿及回归 | 1 天 | 包括手动验证 Bilibili / YouTube |
- 总体 11-15 天，存在 REST 端未改造或权限受限的额外风险缓冲。

## 8. 推荐推进节奏
1. **预研阶段**：验证 `captureVisibleTab` + 裁剪可行性、确认 REST API 对二进制 PUT 的支持；决定是否需要 `unlimitedStorage`。
2. **实现阶段**：先落地截屏 + 本地缓存（不修改导出），再串联导出链路与 UI。
3. **发布前准备**：更新权限说明、完成多语言文案与文档、补充回归测试。

## 9. 待明确问题
- Obsidian 端 REST 接口是否允许 `Content-Type: image/png` 的写入？是否需要新增 API？
- 截图文件在仓库中的归档策略（统一目录/按视频 ID 分类）及命名规范。
- 是否需要对截图做敏感信息遮挡（如用户名、弹幕）或提醒用户可能涉及隐私。
- 用户是否需要手动触发截图（例如二次确认）或支持自动关闭。

---

如需推进开发，建议先安排两天的 spike 验证（后台截屏、REST 写入），再决定最终实现路径。若 REST 扩展无法短期完成，可先实现内联图片作为 beta 功能，并在 Options 中标注实验性质。
