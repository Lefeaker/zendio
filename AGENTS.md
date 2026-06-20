# AGENTS.md

本文件定义本仓库（`/Users/mac/Documents/Dev/AI2OB_Plg/AiiinOB`）内所有 AI/人工协作者的统一执行规范。

## 1. 项目上下文（按当前仓库状态）

- 目标项目：`Zendio`（当前本地仓库目录仍为 `AiiinOB`）
- 项目形态：浏览器扩展，主要面向 Obsidian 工作流，包含网页剪藏、AI 聊天导出、阅读模式、视频模式、多语言与多仓库配置能力。
- 技术栈：TypeScript、esbuild、Vitest、Playwright、ESLint、Prettier、Stylelint、Zod、Stitch runtime CSS、WebExtension APIs。
- 关键目录：
  - `src/`：扩展源码
  - `tests/`：单元、E2E、视觉与浏览器相关测试
  - `docs/`：设计、迁移、排障、测试与运行文档
  - `scripts/`、`tools/`：构建、检查、打包、质量守护与辅助工具
- 当前工作方式：功能实现 + 测试补齐 + 文档同步，保持可回放、可验证、可审计。

## 2. 代码风格与实现规范

### 2.1 通用规范

- 小步快改：每次变更聚焦单一功能点，避免把重构、修复、样式和文档无边界混在一起。
- 默认保持兼容：优先不破坏既有配置结构、消息协议、存储字段、国际化 key 和扩展行为。
- 变更必须可验证：没有验证结果的功能视为未完成。
- 生成产物不直接手改：`dist/`、打包产物、临时报告和测试输出应由脚本生成，不应作为主要人工改动目标。
- 涉及跨模块改动时，优先同步检查：
  - `src/shared/`
  - `src/i18n/`
  - `public/manifest*.json`
  - 对应测试和文档

### 2.2 TypeScript / 扩展实现规范

- 统一使用现有工具链，不引入平行构建方案。
- 新增逻辑优先拆成可测试的小模块，减少直接耦合 DOM、Chrome API 和全局状态。
- 涉及浏览器 API 时，优先通过现有的 service、repository、adapter、controller 层接入，避免把 `chrome.*` 调用散落到 UI 或业务逻辑中。
- 新增配置项必须包含：
  - 默认值
  - 类型定义
  - 配置合并或迁移逻辑
  - 如适用的设置页入口、多语言文案和测试覆盖
- 国际化相关改动必须同步考虑：
  - `src/i18n/`
  - `_locales/`
  - `public/_locales/`
  - 文本长度和布局影响
- 样式改动应遵循当前仓库路线：
  - 生产 UI 以 Stitch runtime CSS、`src/styles/design-tokens.css` 与现有 design token 为准
  - Tailwind / DaisyUI 仅作为历史迁移材料或归档参考，除非新的 source-of-truth 文档明确恢复
  - 不随意引入新的样式体系
  - 不把一次性调试样式长期留在生产代码

### 2.3 文档同步规范

以下场景必须更新文档（至少一处）：

- 新增用户可见功能或设置项
- 修改构建、打包、发布、CI、质量检查流程
- 调整目录结构、架构分层或跨模块依赖关系
- 新增或变更国际化、多仓库、隐私、错误分析等治理规则
- 修复复杂缺陷且后续仍有重复踩坑风险

优先更新 `docs/` 下现有主题文档；如无合适位置，再新增文档。临时过程记录、一次性总结、代理草稿不应当替代正式文档。

以下文档默认视为内部过程材料，不应作为常规 Git 提交内容：

- 技术债清单、技术债治理计划、路线图、任务指导书
- 阶段性迁移计划、阶段性 checklist、POC 执行档案
- 一次性分析报告、审计报告、过程性建议稿

如确需保留，应先确认它属于正式长期文档，而不是过程产物。

### 2.4 高风险技术债治理闸门

执行技术债、退役代码删除、架构硬化、质量门禁调整或大规模 cleanup 计划前，必须先完成计划风险审计，不得直接执行 checklist。

审计至少覆盖：

- 当前 dirty tree 逐路径分类；存在未分类、漏项或 `unknown-stop` 时停止。
- 删除 `src` 代码前同时具备 production build graph、import graph、test/script dependency 三类证明。
- 任何 `delete-now` 路径不得仍被 package scripts、build scripts、manifest/public assets、测试、视觉/浏览器检查或必要验证命令引用。
- 新增 hard gate 接入 `quality`、build、CI、package 或 release 前必须先 standalone 通过并评估误报面。
- 禁止用 `git add -A src tests docs` 等宽泛 staging 伪装原子提交；每次提交前必须检查 `git diff --cached --name-status`。
- 高风险计划必须维护本地 execution ledger，记录每个 milestone 的分支、worktree、base/final commit、命令、跳过项、回滚点和剩余风险。
- 多 agent 并行时必须给每个 agent 分配不重叠的 write set；agent 不得 revert、格式化或暂存其他 agent 的文件。

## 3. 测试规范（强制）

### 3.1 功能与测试绑定

- 每个新增功能必须同时新增或更新测试。
- 每个修复缺陷必须有可复现测试（回归测试）。
- 严禁“只改功能不补测试”。
- 若确实无法补测试，必须在提交说明或文档中明确原因和风险边界。

### 3.2 最低验证清单

提交前至少按改动范围执行对应检查：

- 通用基础检查：
  - `npm run typecheck`
  - `npm run lint`
- 逻辑 / 业务改动：
  - `npm run test:unit`
- 流程 / 集成改动：
  - `npm run test:e2e`
- 浏览器真实交互、视觉或国际化布局改动：
  - `npm run test:e2e:browser`
  - 或 `npm run visual:test`
- 涉及文案、多语言、布局预算时：
  - `npm run test:i18n`

如改动涉及构建、打包、manifest、Firefox 兼容或发布链路，需额外执行对应命令，例如：

- `npm run build`
- `npm run build:firefox`
- `npm run package`
- `npm run package:firefox`

### 3.3 前端与交互验证

完成前端相关改动前，应自行启动可观察环境并验证实际效果：

- `npm run dev`

必要时再配合 Playwright 或浏览器实际验证，至少从以下维度检查：

- 美观度
- 交互体验
- 功能完整性
- 视觉可读性
- 多语言下的布局稳定性
- Shadow DOM / 弹窗 / 面板场景下的样式一致性

## 4. 提交规范（强制）

### 4.0 分支要求

- 禁止直接在 `main` 上开发。
- 开始任何功能开发、修复、重构或批量文档整理前，必须先新建工作分支。
- 所有提交默认应落在功能分支、修复分支或专项整理分支上，不得直接提交到 `main`。
- 如需合入 `main`，应通过分支合并或 Pull Request 完成，而不是在 `main` 上直接开发和提交。
- 执行高风险技术债、退役代码删除、架构硬化或大规模 cleanup 计划时，每个 milestone 必须使用独立 `codex/` 分支或工作树，从上一 milestone 已验证提交点切出。
- 每个 milestone 结束时必须形成可回滚提交点；不得带未提交源码变更进入下一 milestone。
- milestone 分支通过后应按计划合入专项 integration branch，而不是直接合入 `main`。

### 4.1 原子提交要求

- 每完成一个相对完整的功能点或一组自洽修复，并完成对应验证后，立即 commit 一次。
- 一个 commit 必须自洽：代码、测试、必要文档在同一提交中闭环。
- 不要把无关的格式化噪音、临时文件、产物目录和一次性报告混入提交。
- 自动提交仅允许在 staged diff 已审查、必要验证已通过、pre-commit 已通过后执行。
- 每次提交前必须运行并检查：

```bash
git diff --cached --name-status
git diff --cached --check
git status --short
```

- 如果 staged 文件包含当前 batch/milestone 之外的路径，必须先拆分或取消暂存，禁止继续提交。

### 4.2 建议提交信息格式

- `feat(scope): ...`
- `fix(scope): ...`
- `refactor(scope): ...`
- `test(scope): ...`
- `docs(scope): ...`
- `chore(scope): ...`

示例：

- `feat(options): add multilingual yaml config section`
- `fix(reader): restore highlight state after panel reopen`
- `test(content): cover clipper dialog keyboard shortcuts`
- `docs(i18n): document text budget validation flow`

## 5. Pre-commit 规范（必须通过 Husky / lint-staged）

### 5.1 强制要求

- 所有提交前必须通过当前仓库的 pre-commit 检查。
- 未通过 pre-commit，禁止把提交视为完成。

### 5.2 执行方式（仓库规范）

- 当前仓库使用 `husky` + `lint-staged`。
- pre-commit 入口：`.husky/pre-commit`
- 规则来源：`package.json` 中的 `lint-staged`
- 当前检查至少覆盖：
  - `eslint --fix`
  - `prettier --write`
  - `stylelint --fix`
  - `npm run report:options-legacy`

如需手动预跑，可在仓库根目录执行：

- `npx lint-staged`

### 5.3 与 commit 的关系

- 顺序固定：实现功能 → 新增/更新测试 → 运行必要验证 → 通过 pre-commit → commit
- 任一步失败，先修复再继续，不得跳过
- 只有在“保存大规模在研快照”这类明确例外场景下，才允许临时使用 `--no-verify`；使用后必须尽快补一次正常通过 pre-commit 的修复提交

## 6. 禁止事项

- 禁止跳过测试直接宣称完成。
- 禁止长期依赖 `--no-verify` 绕过 pre-commit。
- 禁止提交与当前功能无关的大量噪音改动。
- 禁止修改功能后不更新对应测试与文档。
- 禁止把 `dist/`、打包文件、临时目录、调试报告、代理草稿等本地或生成内容作为常规源码提交。
- 禁止把技术债计划、阶段性 POC 档案、过程性分析/路线图文档作为常规 Git 提交内容。
- 禁止在未评估多语言、样式和浏览器兼容影响的情况下草率修改用户可见 UI。

---

如无特殊说明，本规范对本目录下所有协作者生效。
