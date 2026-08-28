# Zod 边界检查清单

最后更新：2026-08-28

Zod 已是仓库锁定依赖。普通开发不安装、更新或用 ad-hoc loader 试跑 Zod；直接复用现有
schema owner 与 repository-local test commands。

## 何时使用

- 外部/持久化输入：WebExtension storage、runtime message、REST response、导入文件。
- 配置 replacement/patch、catalog/generated data 或版本化 durable envelope。
- 需要从 `unknown` 得到可维护 domain type，且失败必须显式分类。

不要为了消除 lint warning 就机械增加 schema。纯内部 typed value、固定枚举和已经由上游
schema 验证的对象应保持窄 TypeScript contract。

## 当前 owner

- Options root/section schema：`src/shared/schemas/options.schema.ts`
- Stored Options normalize/migration：`src/shared/config/storedOptionsCodec.ts`
- classification/clip/runtime message schemas：`src/shared/schemas/**`
- Options production UI：`src/options/stitch/**`、`src/options/app/**`
- YAML production UI：`src/options/yaml-config-editor/**`

旧 `formSections/*`、旧 Options validation service 与 dated Phase checklist 只是历史迁移材料，
不得作为新 implementation owner 恢复。

## 实现检查

- [ ] schema 使用 `strictObject` / explicit union，未知字段策略明确。
- [ ] `safeParse` failure 映射到 typed error/code，不把 raw issue 或用户数据发送到 telemetry。
- [ ] parse 只发生在信任边界；内部流程不重复 parse 同一 snapshot。
- [ ] StoredOptions 与 CompleteOptions 的 partial/full 语义保持一致。
- [ ] patch 只修改声明路径；strict replace 在写入前完整编码。
- [ ] migration 保持 lossless/forward-compatible 字段，失败时不破坏当前可读 session。
- [ ] schema-derived type 从 owner 导出，不再手写平行 interface。
- [ ] 不新增 broad allowlist、fallback `any` 或 unchecked assertion。

## Focused 验证

Options/config schema 变更至少运行：

```bash
node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts \
  tests/unit/shared/schemas/optionsBoundarySchemas.test.ts \
  tests/unit/shared/storedOptionsCodec.test.ts \
  tests/unit/background/optionsMutationCoordinator.test.ts
npm run typecheck:app
npm run typecheck:tests
npm run typecheck:strict
npm run lint -- --quiet
```

跨 runtime message、导入导出或 production copy 时，再运行受影响 owner tests、`quality` 与
`verify:preflight`。不要运行 `lint:warnings-report`，除非任务明确授权同步 warning baseline。

## Review 问题

1. 输入是否真的来自不可信边界？
2. success/failure/cancel/supersede/late-completion 是否保持同一 schema/authority？
3. parse failure 是否 fail closed，且不会 partial write？
4. schema change 是否需要 migration、catalog/generated refresh 或 backward compatibility test？
5. 是否复用了现有 owner，而不是创建第二套 validation service？
