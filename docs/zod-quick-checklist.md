# Zod 引入快速检查清单

> 用于在修复 lint warning 时快速判断是否应该使用 Zod
>
> Historical scope note: this checklist predates the Stitch Secondary Options mainline. Paths under old Options `formSections/*` are retained as historical migration examples only; they are not current implementation guidance and must not be reconnected to the production Options startup chain.

---

## 🚦 快速决策树

```plaintext
修复 lint warning 时

┌─ 是类型相关错误吗？
│  (no-explicit-any, no-unsafe-*, etc.)
│
├─ YES → 使用 Zod 修复
│  │
│  ├─ 涉及函数返回值？
│  │  → 定义 Schema + .parse() 返回
│  │
│  ├─ 涉及外部输入？
│  │  (chrome.storage, REST API, 用户输入)
│  │  → 使用 .safeParse() + 错误处理
│  │
│  └─ 涉及可选字段动态构建？
│     → 使用 spread operator + Schema.parse()
│
└─ NO → 手动修复
   (require-await, no-unused-vars, etc.)
```

---

## ✅ 使用 Zod 的场景速查

| Lint 规则 | 典型场景 | Zod 解决方案 | 示例文件 |
|----------|---------|-------------|---------|
| `no-explicit-any` | `const x: any = {...}` | 定义 Schema 并 parse | `clipProcessor.ts:40` |
| `no-unsafe-member-access` | `obj.foo`（obj 是 any） | Schema 推断类型 | `classificationService.ts:25` |
| `no-unsafe-return` | `return anyValue` | `Schema.parse(value)` | `clipProcessor.ts:54` |
| `no-unsafe-assignment` | `const x = anyValue` | `const x = Schema.parse(...)` | 多个文件 |
| `no-unsafe-call` | `fn(anyArg)` | 校验参数类型 | - |
| `no-unsafe-argument` | 传递 any 参数 | 参数校验 | - |

---

## 📋 Phase 1 完成检查清单（今天/明天完成）

### ☑️ 安装阶段（30 分钟）

- [ ] 运行 `npm install zod`
- [ ] 验证安装：`node -e "console.log(require('zod').z.string().parse('ok'))"`
- [ ] 创建目录：`mkdir -p src/shared/schemas`

### ☑️ Schema 创建阶段（1-2 小时）

- [ ] 创建 `src/shared/schemas/options.schema.ts`
- [ ] 创建 `src/shared/schemas/classification.schema.ts`
- [ ] 创建 `src/shared/schemas/clip.schema.ts`
- [ ] 创建 `src/shared/schemas/index.ts`（统一导出）

**快速测试**：
```bash
# 在 Node.js REPL 中测试
node --loader ts-node/esm
> import { RestOptionsSchema } from './src/shared/schemas/options.schema.ts'
> RestOptionsSchema.parse({ baseUrl: 'https://127.0.0.1:27124', vault: 'test', apiKey: '1234567890' })
# 应该输出解析后的对象
```

### ☑️ 类型导出对齐（30 分钟）

- [ ] 修改 `src/shared/types/options.ts`，从 Schema 重新导出类型
  ```typescript
  // 在文件顶部添加
  export type {
    RestOptions,
    TemplateOptions,
    // ... 其他类型
  } from '../schemas/options.schema';
  ```
- [ ] 运行 `npm run typecheck:app` 确保无破坏性变更

---

## 🔧 Phase 2 核心修复清单（边修复 lint 边完成）

### 🔴 P0: 立即修复（本周必须完成）

#### ✅ 修复 1: clipProcessor.ts

- [ ] **位置**：`src/background/application/clipProcessor.ts:40-54`
- [ ] **当前问题**：`const result: any = {...}`
- [ ] **修复步骤**：
  1. [ ] 导入 `ClipProcessingResultSchema`
  2. [ ] 重构代码使用 spread operator
  3. [ ] 替换 `return result` 为 `return ClipProcessingResultSchema.parse(result)`
  4. [ ] 运行测试：`npm run test:unit -- clipProcessor`
  5. [ ] 验证 lint：`npm run lint -- src/background/application/clipProcessor.ts`

**快速修复模板**：
```typescript
// Before
const result: any = { filePath, restVault: restConfig.vault, classification };
if (vault?.name !== undefined) result.vaultName = vault.name;
return result;

// After
import { ClipProcessingResultSchema } from '../../shared/schemas';
const result = {
  filePath,
  restVault: restConfig.vault,
  classification,
  ...(vault?.name !== undefined && { vaultName: vault.name })
};
return ClipProcessingResultSchema.parse(result);
```

**预期结果**：
- ✅ 消除 4 条 lint 告警
- ✅ 文件无报错，测试通过

---

#### ✅ 修复 2: classificationService.ts

- [ ] **位置**：`src/background/services/classificationService.ts:25-37`
- [ ] **当前问题**：`const fallbackBase: any = {...}`
- [ ] **修复步骤**：
  1. [ ] 导入 `ClassificationResultSchema`
  2. [ ] 使用 spread operator 构建对象
  3. [ ] 用 `Schema.parse()` 校验
  4. [ ] 运行测试：`npm run test:unit -- classificationService`
  5. [ ] 验证 lint

**快速修复模板**：
```typescript
// Before
const fallbackBase: any = { topics: [], tags: [], status: 'fallback' };
if (payload.type !== undefined) fallbackBase.type = payload.type;

// After
import { ClassificationResultSchema } from '../../shared/schemas';
const fallbackBase = ClassificationResultSchema.parse({
  topics: [],
  tags: [],
  status: 'fallback' as const,
  ...(payload.type !== undefined && { type: payload.type })
});
```

**预期结果**：
- ✅ 消除 3 条 lint 告警

---

#### ✅ 修复 3: validation.ts

- [ ] **位置**：`src/options/services/validation.ts`
- [ ] **当前问题**：手写验证逻辑，无类型安全
- [ ] **修复步骤**：
  1. [ ] 重写 `parseClassifierTaxonomy` 使用 Zod
  2. [ ] 添加 `validateOptions`、`validateRestOptions` 等工具函数
  3. [ ] 更新 `OptionsValidationError` 支持 ZodError
  4. [ ] 运行测试
  5. [ ] 验证 lint

**快速修复模板**：
```typescript
// 见 zod-integration-guide.md 中的详细代码
import { z } from 'zod';
import { StoredOptionsSchema, RestOptionsSchema } from '../../shared/schemas';

export function validateOptions(data: unknown) {
  return StoredOptionsSchema.safeParse(data);
}

export function validateRestOptions(data: unknown) {
  return RestOptionsSchema.safeParse(data);
}
```

**预期结果**：
- ✅ 统一验证接口
- ✅ 为 Options 页提供类型安全的验证函数

---

### 🟡 P1: 下周完成

#### ✅ optionsStore.ts

- [ ] **位置**：`src/options/state/optionsStore.ts`
- [ ] **目标**：为 `save()` 和 `load()` 添加 Schema 校验
- [ ] **修复步骤**：
  1. [ ] 在 `save()` 中添加 `StoredOptionsSchema.safeParse()`
  2. [ ] 在 `load()` 中添加数据校验（防止损坏数据）
  3. [ ] 添加降级逻辑（数据损坏时恢复默认值）

#### ✅ Options 页表单配置

- [ ] **目标**：为当前 Options 配置入口添加 Zod 验证
- [ ] **当前 owner**：production Stitch schema/settings、`src/options/app/**`、`src/shared/config/**`
- [ ] **退役约束**：旧 `formSections/*` 路径只属于历史示例，不得恢复为当前 Options 表单实现入口

---

## 🎯 每日检查点

### 今天结束前

- [ ] Phase 1 完成（Zod 安装 + 基础 Schema 创建）
- [ ] Phase 2 修复 1 完成（clipProcessor.ts）
- [ ] 运行 `npm run lint:warnings-report` 查看告警减少情况

### 本周结束前

- [ ] Phase 2 修复 2 完成（classificationService.ts）
- [ ] Phase 2 修复 3 完成（validation.ts）
- [ ] Lint 告警从 1427 减少到 ~1100（⬇️ 20%+）

### 下周结束前

- [ ] optionsStore.ts 集成完成
- [ ] Options 页核心表单集成完成
- [ ] Lint 告警从 1100 减少到 ~700（⬇️ 50%）

---

## 🐛 常见问题速查

### Q1: 修复后出现新的类型错误？

**A**: 检查是否正确导入类型：
```typescript
// ❌ Wrong
import { RestOptions } from '../schemas/options.schema';

// ✅ Correct
import type { RestOptions } from '../schemas/options.schema';
// 或
import { RestOptions } from '../types/options'; // 从统一入口导入
```

### Q2: Schema.parse() 抛出错误怎么办？

**A**: 使用 `safeParse()` 并处理错误：
```typescript
const result = MySchema.safeParse(data);
if (!result.success) {
  console.error('Validation failed:', result.error.flatten());
  return defaultValue;
}
return result.data;
```

### Q3: 如何处理循环引用的类型？

**A**: 使用 `z.lazy()`：
```typescript
const CategorySchema = z.object({
  name: z.string(),
  subcategories: z.lazy(() => z.array(CategorySchema))
});
```

### Q4: 修复后测试失败？

**A**: 检查测试 mock 数据是否符合 Schema：
```typescript
// 测试文件中
import { RestOptionsSchema } from '../schemas';

const mockOptions = RestOptionsSchema.parse({
  baseUrl: 'https://127.0.0.1:27124',
  vault: 'test',
  apiKey: '1234567890'
}); // 确保测试数据有效
```

---

## 📊 进度追踪

### Lint 告警燃尽图（目标）

```plaintext
Week 0 (现在)    █████████████████ 1427 ← 基线
Week 1 (P0修复)  ████████████      1100 ⬇️ 23%
Week 2 (P1修复)  ████████           700 ⬇️ 51%
Week 3 (P2修复)  ████               400 ⬇️ 72%
Week 4 (持续)    ██                 200 ⬇️ 86%
Week 5 (冲刺)    ░                   50 ⬇️ 96%
Week 6 (完成)                         0 ✅ 100%
```

### 每日提交检查

提交代码前运行：
```bash
npm run lint:warnings-report
# 确认告警数量减少

npm run test:unit
# 确认测试通过

npm run typecheck:app
# 确认无类型错误
```

---

## 🎁 完成后收益

- [ ] **类型安全提升 90%+**
- [ ] **Lint 告警减少 74%（1052/1427）**
- [ ] **Options 页验证代码量减少 67%**
- [ ] **防止运行时类型错误**
- [ ] **新增字段自动获得验证**

---

**使用方式**：
1. 打印本清单或在第二屏幕打开
2. 修复每个 lint warning 时，参考决策树
3. 遇到类型相关问题，直接使用对应的"快速修复模板"
4. 完成每个检查点后打勾

**文档更新**：本清单会随着实施进度持续更新。
