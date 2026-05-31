# 目标架构迁移 Milestone 核查清单

> 日期：2026-03-29
> 最终回写：2026-03-30
> 对应方案：[`目标架构迁移执行方案-2026-03-29.md`](./目标架构迁移执行方案-2026-03-29.md)
> 用途：作为“从当前代码迁移到目标架构”的执行台账与阶段回写入口

---

## 顶层 Milestone

- [x] `M0` 迁移前置债务清理
- [x] `M1` 冻结目标架构边界与迁移守门
- [x] `M2` 统一 foundation 层
- [x] `M3` 统一 primitives contract
- [x] `M4` 建立 patterns 与 hosts 分层
- [x] `M5` 完成 `Options` 侧迁移
- [x] `M6` 完成 `content / clipper / reader / video` 侧迁移
- [x] `M7` 抽取稳定 domains，收紧状态与边界
- [x] `M8` 做架构配套的性能与包体治理
- [ ] `M9` 退役旧入口并完成最终验收

---

## M0

- [x] `M0.1` 清理残留全局状态声明
- [x] `M0.2` 归档或隔离历史样式与预览大文件
- [x] `M0.3` 清理正式入口歧义并补强文档约束

## M1

- [x] `M1.1` 固化目标架构、迁移原则、宿主边界、目录规划
- [x] `M1.2` 建立独立 milestone checklist 与更新规则
- [x] `M1.3` 建立 `audit:ui-architecture:report`（或等价守门）
- [x] `M1.4` 建立旧入口兼容清单与禁用规则

## M2

- [x] `M2.1` 建立 `foundation/tokens`
- [x] `M2.2` 建立 `foundation/icons` 并统一 icon 白名单
- [x] `M2.3` 建立 `foundation/a11y`
- [x] `M2.4` 建立 `foundation/style-host`
- [x] `M2.5` 建立 `foundation/types`
- [x] `M2.6` 建立 `foundation/keyboard`
- [x] `M2.7` 建立 `foundation/lifecycle`

## M3

- [x] `M3.1` 建立 `primitives/button`
- [x] `M3.2` 建立 `primitives/dialog`
- [x] `M3.3` 建立 `primitives/layout`
- [x] `M3.4` 建立其它基础原语入口（input/select/checkbox/textarea/toggle/badge/alert/panel）
- [x] `M3.5` 建立 primitives contract 测试与 harness

## M4

- [x] `M4.1` 建立 `patterns/form-field`
- [x] `M4.2` 建立 `patterns/setting-row`
- [x] `M4.3` 建立 `patterns/section-shell`
- [x] `M4.4` 建立 `patterns/message-block` 与 `patterns/confirm-flow`
- [x] `M4.5` 建立 `hosts/options`
- [x] `M4.6` 建立 `hosts/content`
- [x] `M4.7` 建立 `hosts/shadow`
- [x] `M4.8` 统一 mount/update/destroy contract

## M5

- [x] `M5.1` `Options` shared 基础件切到 `src/ui/primitives`
- [x] `M5.2` `BaseSection` / `OptionsApp` / `MainContent` 切到 `patterns` 与 `hosts/options`
- [x] `M5.3` `confirmDialog` / `ThemeSwitcher` / `OptionsLayout` 相关重复逻辑收口
- [x] `M5.4` REST 与旧 Options 非 REST section 完成迁移
- [x] `M5.5` 收紧 `Options` 状态与组件边界

## M6

- [x] `M6.1` `content/shared/daisy/*` 切到 `src/ui/primitives`
- [x] `M6.2` `ClipperDialog` 切到统一 dialog/layout contract
- [x] `M6.3` `ReaderDialog` 切到统一 dialog/layout contract
- [x] `M6.4` `VideoDialog` / `SupportPrompt` 切到统一 contract
- [x] `M6.5` styleSheetManager / shadow bridge 接到 `foundation/style-host`
- [x] `M6.6` 收紧 content feature 与 UI 宿主边界

## M7

- [x] `M7.1` 建立 `domains/vault-router`
- [x] `M7.2` 建立 `domains/yaml-config`
- [x] `M7.3` 建立 `domains/privacy`
- [x] `M7.4` 建立 `domains/reading` / `domains/video`（至少确定边界）
- [x] `M7.5` 收敛 registry 式全局协调
- [x] `M7.6` 固化 domains 与 features 的依赖方向

## M8

- [x] `M8.1` 消除全量 icon 大包问题
- [x] `M8.2` 为 `src/ui` 建立 bundle budget / chunk 审计
- [x] `M8.3` 清理新增共享层带来的热路径问题
- [x] `M8.4` 完成 dialog/panel/session lazy path 收口
- [x] `M8.5` 更新 `performance-baseline.md`

## M9

- [ ] `M9.1` 删除旧 helper / 旧 adapter / 旧入口别名
- [x] `M9.2` 更新正式文档与工程入口
- [x] `M9.3` 建立长期守门清单
- [ ] `M9.4` 形成最终验收报告
- [x] `M9.5` 回写长期 backlog

---

## 当前真值核验记录

### 2026-03-30 / M7

- 自动化通过：
  - `npm run audit:ui-architecture:report`
  - `npm run audit:deps:report`
  - `npm run audit:imports:report`
- 关键结论：
  - `src/ui/domains/privacy/*`、`vault-router/*`、`yaml-config/*`、`reading/*`、`video/*` 不再依赖 `src/options/*` 或 `src/content/*` 旧 feature 文件
  - domain 层真实实现所有权已固定到 `src/ui/domains/*`

### 2026-03-30 / M9

- 自动化通过：
  - `npm run typecheck:app`
  - `npm run typecheck:tests`
  - `npm run lint -- --quiet`
  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run test:e2e:browser`
  - `npm run audit:ui-architecture:report`
  - `npm run audit:interaction-contract:report`
  - `npm run audit:build:report`
  - `npm run audit:performance:report`
- 浏览器验证：
  - `npx playwright test tests/visual/migration-harness.spec.ts --project=chromium-desktop`
- 关键结论：
  - `src/options/components/shared/*` 仍保留并被生产代码直接使用的旧 shared 入口，例如：
    - `BaseComponent.ts`
    - `DaisyCard.ts`
    - `DaisyRadioGroup.ts`
    - `DaisyTable.ts`
    - `FormComponents.ts`
    - `ThemeSwitcher.ts`
    - `listBuilder.ts`
  - `src/options/styles/design-tokens.css` 已删除，不再保留 compatibility wrapper
  - `docs/final-acceptance-report-2026-03-29.md` 宣称：
    - `src/options/components/shared/Daisy*.ts` 已删除
    - 迁移已“最终通过”
      但当前代码真值与该结论不一致
  - 因此 `M9.1` 与 `M9.4` 不能判定为完成，`M9` 顶层也不能打勾
