
# P1-3 构建流程质量门槛修复手册

本文档针对 “构建流程缺失质量检查导致问题代码进入产物” 的技术债务，提供排查、修复与验证的分阶段方案。目标是在不破坏既有打包脚本（`esbuild` + 资源复制）的前提下，为 `npm run build` 注入可靠的类型、规范与测试门槛，并在 CI 与日常开发中形成闭环。

---

## 0. 适用范围与前置准备

- 涉及模块：`AiiinOB/scripts/build.mjs`、`AiiinOB/package.json`、待新增的 `scripts/quality-check.mjs`、未来的 CI 工作流（若使用 GitHub Actions，位于 `.github/workflows/`）。
- 基线依赖：已执行 `npm install`，并可在本地成功运行 `npm run typecheck` 与 `npm run test:unit`。
- 约束条件：
  - 保持 `npm run dev` 的启动速度；开发模式可以跳过慢检查，但需提供显式开关。
  - 兼容现有 `npm run package`、`npm run package:ci` 等上层脚本，不让新增质量门槛阻塞发布。
- 推荐在准备阶段收集以下信息，后续用于对账：
  - `git status` 确认无遗留 dirty 文件。
  - `npm run build` 的现有日志，验证确实没有质量检查。

---

## 1. 现状复盘与缺口确认

1. **复现缺失门槛**  
   - 在 `AiiinOB/` 目录执行 `npm run build`，注意构建日志只包含 esbuild 输出和资源复制信息。  
   - 手动向任一 `*.ts` 文件注入明显的语法错误（如漏写括号），再次执行 `npm run build` 依旧成功，证明类型检查未被调用。  
   - 删除或破坏 `tests/unit` 中的关键断言，运行 `npm run build` 仍不会失败，可证实没有测试环节。
2. **梳理现有脚本**  
   - `AiiinOB/package.json` 的 `scripts` 段已有 `typecheck`、`test:unit`、`test:e2e`，但 `build` 直接调用 `node scripts/build.mjs --mode=prod`。  
   - `scripts/build.mjs` 仅负责 esbuild 构建与资源复制，缺乏调用质量工具的逻辑。
3. **质量工具缺口**  
   - 仓库尚未安装 ESLint/Prettier，无法对代码风格进行静态校验。  
   - 没有集中脚本串联 `typecheck`、`lint`、`test`，也无 CI 工具统一执行。

> 产出：问题复现记录 + 脚本现状笔记，为后续改造提供基线。

---

## 2. 质量工具落地（lint / format / type）

1. **安装与初始化 ESLint**  
   - 安装依赖：`npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier`。  
   - 新增配置 `AiiinOB/.eslintrc.cjs`（节点模块风格更易共享）：
     ```js
     module.exports = {
       root: true,
       parser: '@typescript-eslint/parser',
       parserOptions: { project: ['./tsconfig.app.json', './tsconfig.tests.json'] },
       env: { browser: true, node: true, es2022: true },
       plugins: ['@typescript-eslint'],
       extends: [
         'eslint:recommended',
         'plugin:@typescript-eslint/recommended',
         'plugin:@typescript-eslint/recommended-requiring-type-checking',
         'prettier'
       ],
       ignorePatterns: ['dist/', 'releases/', 'tmp/', '*.config.ts'],
       rules: {
         '@typescript-eslint/no-floating-promises': 'error',
         '@typescript-eslint/explicit-function-return-type': 'off'
       }
     };
     ```
   - 可视需要补充 `AiiinOB/.eslintignore`：`dist`, `releases`, `tmp`, `tests/fixtures/**`.
2. **集成 Prettier**  
   - 安装依赖：`npm install --save-dev prettier eslint-plugin-prettier`（若不需要 ESLint 内联 Prettier，可省略插件）。  
   - 新增 `AiiinOB/.prettierrc.json`：
     ```json
     {
       "semi": true,
       "singleQuote": true,
       "tabWidth": 2,
       "trailingComma": "none",
       "printWidth": 100
     }
     ```
   - 创建 `AiiinOB/.prettierignore`，与 `.eslintignore` 保持一致。
3. **复用既有 TypeScript 检查**  
   - 维持 `npm run typecheck` 执行 `tsc -p tsconfig.app.json && tsc -p tsconfig.tests.json`，确保编译器能检查源码与测试。  
   - 若未来将脚本拆分，可在 `tsconfig.app.json` 中启用 `noEmit: true`，避免类型检查意外生成产物。

> 产出：ESLint/Prettier/TypeScript 配置文件 + 新增 devDependencies。

---

## 3. 构建脚本改造：集中质量门槛

1. **新增 `scripts/quality-check.mjs`**  
   - 使用原生 `child_process`（避免额外依赖）顺序执行质量脚本：
     ```js
     import { spawnSync } from 'node:child_process';

     const checks = [
       { name: 'TypeScript 类型检查', cmd: ['npm', 'run', 'typecheck'] },
       { name: 'ESLint 规范检查', cmd: ['npm', 'run', 'lint'] },
       { name: 'Prettier 格式检查', cmd: ['npm', 'run', 'format:check'] },
       { name: '单元测试', cmd: ['npm', 'run', 'test:unit'] }
     ];

     for (const { name, cmd } of checks) {
       console.log(`⏳ ${name}...`);
       const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' });
       if (result.status !== 0) {
         console.error(`❌ ${name} 失败，停止构建`);
         process.exit(result.status ?? 1);
       }
       console.log(`✅ ${name} 通过\n`);
     }

     console.log('🎉 质量检查全部通过');
     ```
   - 为长耗时检查预留扩展点：可根据后续需求追加 `npm run test:e2e`（可通过参数开关控制）。
2. **更新 `package.json` 脚本**  
   - 添加：
     ```json
     {
       "scripts": {
         "lint": "eslint src tests --ext .ts,.tsx,.js",
         "lint:fix": "npm run lint -- --fix",
         "format": "prettier --write \"{src,tests,docs}/**/*.{ts,tsx,js,jsx,json,md}\"",
         "format:check": "prettier --check \"{src,tests,docs}/**/*.{ts,tsx,js,jsx,json,md}\"",
         "quality": "node scripts/quality-check.mjs",
         "build": "npm run quality && node scripts/build.mjs --mode=prod",
         "build:fast": "node scripts/build.mjs --mode=prod --skip-checks",
         "build:dev": "node scripts/build.mjs --watch --skip-checks"
       }
     }
     ```
   - 保留历史兼容性：`npm run package` 继续依赖 `npm run build`，默认走全套门槛；若重构大体量脚本，可提供 `npm run package -- --skip-checks` 形式的逃生口。
3. **修改 `scripts/build.mjs`**  
   - 解析新增的 `--skip-checks` 参数；当 `--mode=prod` 且未跳过时调用 `runQualityChecks()`。  
   - 为防止循环依赖，在 `build.mjs` 顶部懒加载质量脚本：
     ```js
     if (prod && !skipChecks) {
       const { runQualityChecks } = await import('./quality-check.mjs');
       await runQualityChecks();
     }
     ```
   - 开发模式（`npm run dev`）自动传入 `--skip-checks`，保证 watch 模式只关注快速构建。

> 产出：质量门槛脚本 + 更新后的构建流程，确保生产构建前置质量检查。

---

## 4. 开发流程与 CI 集成

1. **本地预检**  
   - 建议通过 Husky 或 lefthook 创建 pre-commit 钩子：`npx husky add .husky/pre-commit "npm run lint && npm run format:check"`，实现轻量级校验。  
   - 对大型变更，可在提交信息中注明已执行 `npm run quality`，便于 CR 交叉确认。
2. **CI 工作流**  
   - 若仓库使用 GitHub Actions，在 `.github/workflows/ci.yml` 中新增步骤：
     ```yaml
     - name: Install dependencies
       run: npm install
     - name: Quality gate
       run: npm run quality
     - name: Build extension
       run: npm run build
     ```
   - 针对 e2e 测试可单独配置 nightly 任务（例如 `npm run test:e2e`），避免拖慢每次 Push。
3. **团队宣导**  
   - 在 `AiiinOB/docs/tech-debt-action-plan.md` 或 `README.zh-CN.md` 更新开发流程段落，声明质量门槛成为发布前必备步骤。  
   - 对于脚本的逃生口（`--skip-checks`），明确只允许在 Debug 或紧急回滚时使用。

> 产出：本地钩子示例 + CI 步骤建议 + 文档同步清单。

---

## 5. 验证策略

1. **脚本级验证**  
   - 手动引入 ESLint 违规（如未使用变量），运行 `npm run lint` 应失败并给出定位。  
   - 修改 TypeScript 代码使其类型错误（例如返回值不匹配），`npm run quality` 应在类型检查阶段失败。  
   - 暂时禁用单元测试断言，`npm run quality` 应在 `test:unit` 阶段失败。
2. **构建流程验证**  
   - 通过 `npm run build` 确认在所有检查通过后仍能生成 `dist/`。  
   - 使用 `npm run build:fast` 验证跳过质量检查时的兼容行为，确保脚本参数解析正确。
3. **CI 验证**  
   - 提交包含 lint/type 错误的测试分支，确认 CI 自动失败；修复后 CI 通过。  
   - 若已配置 nightly e2e，观察其结果是否受新增脚本影响。

> 产出：验证日志 + 失败案例截图（可附于 PR），证明质量门槛生效。

---

## 6. 发布与回滚计划

1. **分阶段合并**  
   - 建议拆分为至少两次提交：① 引入 ESLint/Prettier 配置与脚本；② 改造 `build.mjs` 与新增 `quality-check.mjs`。  
   - 每次提交附带 `npm run quality` 输出，确保评审时可复现。
2. **回滚策略**  
   - 若质量脚本阻塞紧急发布，可临时在 `package.json` 中将 `build` 指回原始命令，同时保留新脚本文件以便后续恢复。  
   - 仍需保留 `build:fast` 作为兼容选项，并在回滚描述中说明使用原因。
3. **后续优化**  
   - 根据团队反馈评估是否将 `npm run test:e2e` 纳入默认质量门槛，或通过环境变量（如 `CI=true`）自动启用。  
   - 考虑引入 `eslint-plugin-import`、`eslint-plugin-unused-imports` 等插件强化模块依赖治理。

> 产出：提交计划 + 回滚预案 + 后续增强 backlog。

---

通过以上步骤，可以为 AiiinOB 的构建流程补齐必备的质量门槛，在类型安全、代码规范与单元测试层面形成闭环，降低问题代码流入发布包的概率，并为未来的 CI 自动化与发布治理打下基础。
