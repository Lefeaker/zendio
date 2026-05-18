# CI 工作流配置指南

本文档提供了为 AiiinOB 项目配置持续集成（CI）工作流的建议。

## GitHub Actions 配置

如果使用 GitHub Actions，请在 `.github/workflows/ci.yml` 中添加以下配置：

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality-check:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run quality checks
        run: npm run quality

      - name: Build extension
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts-node-${{ matrix.node-version }}
          path: dist/

  e2e-tests:
    runs-on: ubuntu-latest
    needs: quality-check

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run E2E tests
        run: npm run test:e2e
```

## 本地开发流程

### 预提交检查

项目已配置 Husky 预提交钩子，会在每次提交前自动运行：

- ESLint 代码规范检查
- Prettier 格式检查

### 手动质量检查

在提交前，建议运行完整的质量检查：

```bash
npm run quality
```

### 构建命令

- `npm run build` - 完整构建（包含质量检查）
- `npm run build:fast` - 快速构建（跳过质量检查，仅用于调试）
- `npm run build:dev` - 开发构建（跳过质量检查）

## 质量门槛说明

### 必须通过的检查

1. **TypeScript 类型检查** - 确保类型安全
2. **ESLint 规范检查** - 确保代码规范
3. **Prettier 格式检查** - 确保代码格式一致
4. **单元测试** - 确保核心功能正常

### 可选检查

- **E2E 测试** - 建议在 CI 中运行，本地可选

## 逃生口机制

在紧急情况下，可以使用以下命令跳过质量检查：

```bash
# 跳过质量检查的构建
npm run build:fast

# 跳过预提交钩子
git commit --no-verify -m "emergency fix"
```

**注意：** 逃生口仅应在紧急修复或调试时使用，正常开发应始终通过质量检查。

## 故障排除

### ESLint 错误过多

如果 ESLint 报告大量错误，可以：

1. 运行自动修复：`npm run lint:fix`
2. 逐步修复关键错误
3. 考虑调整 ESLint 规则（需团队讨论）

### 格式问题

运行 Prettier 自动格式化：

```bash
npm run format
```

### 测试失败

1. 检查测试环境配置
2. 更新测试用例
3. 修复相关代码逻辑

## 团队协作建议

1. **代码审查**：PR 中应包含质量检查通过的证明
2. **分支策略**：主分支应始终保持质量检查通过
3. **发布流程**：发布前必须通过完整的质量检查
