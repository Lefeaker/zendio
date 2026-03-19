# Tailwind Migration Status

> **更新日期**：2026-03-13
> **判定口径**：以当前仓库代码、构建脚本、`PRE-CODE-STYLE-MIGRATION-CHECKLIST.md` 与 `STYLE-MIXING-AUDIT.md` 的交叉核对为准
> **目标口径**：现状允许如实记录混用事实，但正式目标固定为**全部退出主路径中的 legacy CSS / inline `<style>` / runtime 注入**

---

## 结论摘要

当前项目已经完成 Tailwind 主线收口，并**满足归档条件**。

当前真实状态是：

- 多个模块已经以 Tailwind 产物承载主要视觉样式
- 项目主路径中仍存在 legacy CSS、inline `<style>`、运行时 `<style>` 注入与 Shadow DOM fallback
- 其中 `Bilibili` 视频样本已接受为浏览器媒体能力例外，不再作为 Tailwind 主线阻塞
- 因此，Tailwind 主线现已从实施阶段切换为**归档准备 / 总入口保留**状态

本页的职责固定为：

1. 记录当前哪些模块仍存在混用事实
2. 明确这些混用都属于**待退出主路径**的迁移对象
3. 给出准备阶段是否完成、代码迁移是否开始、哪些模块仍未迁完

`STYLE-MIXING-AUDIT.md` 在本页中只作为**现状证据来源**，不再作为“哪些混用可以长期保留”的裁决依据。  
正式终态、禁区、验收标准一律以 `PRE-CODE-STYLE-MIGRATION-CHECKLIST.md` 为准。

---

## 当前状态总览

### 准备阶段

- [x] 已完成样式混用现状审计
- [x] 已完成迁移前 checklist，模块终态 / 禁区 / 验收标准已逐条写明
- [x] 已统一文档口径为“完全迁移”
- [x] 已锁定模块范围与优先顺序
- [x] 当前以 checklist 判定为准，已**允许**进入代码迁移阶段

### 当前阶段

- [x] `Onboarding` 第一刀代码迁移已完成
- [x] `Options` 最后一刀已完成，`aob-options.css` 已退出主路径
- [x] `SupportPrompt` 已退出直接 runtime 样式注入主路径
- [x] `Video` prompt / session 已退出直接 runtime 样式注入主路径
- [x] `Reader` 已退出 `InlineStyleManager` 与空 runtime 样式注入主路径
- [x] 已完成 Chromium 样本回放，见 `archived/tailwind-migration/251126-closure/TAILWIND-BROWSER-SAMPLE-LOG-2026-03-13.md`
- [x] 已完成真实扩展首开与跨站点自动化样本，见 `archived/tailwind-migration/251126-closure/TAILWIND-REAL-EXTENSION-REGRESSION-2026-03-13.md`
- [x] 已完成非 headless 实机浏览器回归，见 `archived/tailwind-migration/251126-closure/TAILWIND-MANUAL-BROWSER-REGRESSION-CLOSURE-2026-03-13.md`
- [x] Tailwind 主线已满足归档条件
- [ ] `Clipper` 尚未退出受控 stylesheet bridge fallback
- [x] 人工浏览器回归已形成正式结项记录

---

## 模块状态

| 模块 | 当前现状 | 完全迁移目标 | 当前状态 |
| --- | --- | --- | --- |
| `Onboarding` | 页面与 modal 已并入静态产物链路，`index.html` inline `<style>` 与 `bootstrap.ts` 动态 `<style>` 已删除 | 继续保持静态 `<link>` 为唯一主入口 | **已过第一刀 / 本轮通过** |
| `Options` | `tailwind.css` + `global.tailwind.css` + `design-tokens.css` 承担 page / preview 样式，`aob-options.css` 已退出主路径 | 以静态 Tailwind 产物与 token 链路承载页面与 preview；不再保留模块级 legacy CSS 兜底 | **本轮已清零 / 通过** |
| `SupportPrompt` | 主 prompt 与 toast 已改为受控 Shadow DOM bridge，不再直接 runtime 注入样式文本 | 保留统一静态产物来源，继续验证 bridge 稳定性 | **真实扩展首开通过 / 实机回归已记录** |
| `Video` | prompt / session 主路径已退出直接 runtime 注入；fragment highlight 已切到受控 Shadow DOM bridge | 保留静态产物来源，继续验证 fragment highlight bridge 稳定性 | **YouTube 实机通过 / Bilibili 保留媒体能力例外** |
| `Clipper` | `clipper.tailwind.css` 已承载主视觉；主对话框已切到 Shadow-only bridge，fallback 已收口到受控 `shadowStyleBridge` | 最终退出受控 fallback，保留单一 bridge 形态 | **进行中 / 未完全清零** |
| `Reader` | panel 视觉已接入共享 Tailwind 链路，`InlineStyleManager` 与空 runtime 样式已退出主路径 | 保持 panel 走统一 bridge，不再恢复独立注入 | **真实扩展首开通过 / 实机回归已记录** |
| `Firefox compatibility` | 平台兼容 CSS 独立存在 | 不纳入本轮 Tailwind 完全迁移完成率 | **独立跟踪** |

---

## 当前真值

### 已完成

- Tailwind 构建产物已经覆盖 `Options`、`Global`、`Clipper`、`Video`
- 完全迁移目标、模块终态、禁区与验收标准已在 checklist 中写死
- `Onboarding` 已被正式定义为第一优先级代码迁移对象
- 文档口径已从“接受混用 / 边界未定”改为“现状混用，但目标全部退出主路径”
- `Onboarding` 第一刀已完成并通过定向测试
- `SupportPrompt`、`Video`、`Reader` 已退出直接 runtime `<style>` 注入主路径
- `Clipper` / `Panel` / `Video highlight` 的 Shadow DOM fallback 已收口到统一 `shadowStyleBridge.ts`
- `ReaderPanel` / `VideoPanel` 已退出业务层 fallback style element，改为 Shadow-only
- `Clipper` 主对话框已不再保留业务层非 Shadow fallback 分支
- 已补一轮 Chromium 浏览器样本，确认 SupportPrompt toast / Reader panel / Video prompt 首开走 adoptedStyleSheets 主路径
- 已补一轮真实扩展首开，确认 `build/dist` 下 Options / SupportPrompt toast / Reader / YouTube video prompt 走当前 Tailwind / Shadow 主路径
- 已补一轮 article 跨站点样本，Wikipedia / MDN 表现一致
- 已补一轮非 headless 实机浏览器回归，SupportPrompt / Reader / Options / YouTube video prompt 结果与自动化样本一致
- Firefox fallback 保留决策已经固化到 `SHADOW-STYLE-BRIDGE-EXIT-EVALUATION.md`

### 未完成

- `Clipper` 仍保留受控 stylesheet bridge fallback，尚未达到完全清零
- `Bilibili` 视频样本在 headless 与非 headless Chromium 中都未检测到可播放 `<video>`，当前已接受为浏览器媒体能力例外说明
- `Clipper` 的 Firefox fallback 仍存在主线路径，尚未达到 bridge 清零
- Tailwind 主线不再继续新的样式迁移开发；后续如需推进，只能作为独立兼容性议题

### 已过时的说法

以下说法不再成立：

- “Tailwind 迁移基本完成，只剩文档收尾”
- “项目可以接受长期混用，只要边界写清楚”
- “某些 runtime 注入默认可视为长期保留架构”
- “STYLE-MIXING-AUDIT.md 可以决定哪些混用保留、哪些继续迁”

---

## 下一步

### 第一阶段：归档后保留项

1. 收口 `Clipper` bridge：
   - 只允许通过统一 `shadowStyleBridge.ts` 进行 Shadow DOM fallback
   - 禁止在业务模块继续新增直接 `<style>` 注入
2. 保持 `Bilibili` 例外说明，仅作为浏览器媒体能力备注保留

### 第二阶段：主线归档

1. 判断哪些 Tailwind 文档可以归档，哪些仍应保留为主线状态页
2. 保留 `TAILWIND-MIGRATION-STATUS.md` + `PENDING-TASKS.md` 作为最终活跃入口，其他阶段文档转历史参考

执行原则固定为：

- 现状混用可以作为事实记录
- 但迁移目标始终是**退出主路径**
- 任何 bridge 都只能被视为临时过渡实现，不能再在状态页里写成正式终态

---

## 当前正式口径

**项目当前仍存在样式混用事实，但 Tailwind 主线的正式目标已经固定为完全迁移。凡是仍在主路径中的 legacy CSS、inline `<style>`、runtime 注入，都属于待退出对象，而不是长期保留方案。**

---

## 归档条件

当前 Tailwind 主线归档条件已经满足：

1. 人工浏览器回归已完成正式执行与留档
2. Firefox fallback 保留决策已固化
3. `Bilibili` 已接受为浏览器媒体能力例外，而不再视为 Tailwind 主线阻塞

除归档后保留项外，本主线不再继续新的样式迁移开发。
