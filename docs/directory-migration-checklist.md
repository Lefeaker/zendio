# AiiinOB 目录迁移检查清单（最佳实践版）

**文档版本**: v2.0
**创建日期**: 2025-01-13
**更新日期**: 2025-01-13
**作者**: AI 代码分析助手
**状态**: 最佳实践方案 - 待执行

---

## 📋 迁移检查清单概览（最佳实践版）

- **总文件数**: 5426 个文件
- **需要迁移的文件**: 约 150 个核心文件（简化后减少）
- **需要更新 import 的文件**: 约 80 个 TypeScript 文件（减少复杂度）
- **需要更新配置的文件**: 8 个配置文件
- **静态资源迁移**: 移至 `public/` 目录（现代标准）
- **预计工作量**: 6-8 天（优化后减少）
- **风险等级**: 🟡 中等（需要仔细测试）

---

## 🗂️ 根目录文件迁移清单

### ✅ 需要移动的文件

| 序号 | 当前路径 | 新路径 | 类型 | 状态 | 备注 |
|------|----------|--------|------|------|------|
| 1 | `all-in-ob-v0.1.0.zip` | `build/releases/all-in-ob-v0.1.0.zip` | 发布包 | ⏳ 待处理 | 构建产物 |
| 2 | `test-vault-paths.html` | `tools/test-vault-paths.html` | 测试文件 | ⏳ 待处理 | 开发工具 |
| 3 | `trash/` | `.archive/` | 目录 | ⏳ 待处理 | 归档文件夹 |

### ✅ 保持不变的文件

| 文件名 | 说明 | 状态 |
|--------|------|------|
| `package.json` | 项目配置 | ✅ 无需变更 |
| `package-lock.json` | 依赖锁定 | ✅ 无需变更 |
| `README.*.md` | 项目说明 | ✅ 无需变更 |
| `tsconfig.*.json` | TypeScript 配置 | 🔄 需要更新路径 |
| `vitest.*.config.ts` | 测试配置 | 🔄 需要更新路径 |
| `THIRD_PARTY_NOTICES.md` | 第三方许可 | ✅ 无需变更 |

---

## 📁 src 目录迁移清单

### 🎯 核心模块迁移 (src/core/)

#### Background 模块

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 1 | `src/background/index.ts` | `src/core/background/index.ts` | ✅ 无需更新 | ⏳ 待处理 |
| 2 | `src/background/application/clipProcessor.ts` | `src/core/background/application/clipProcessor.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 3 | `src/background/listeners/contextMenus.ts` | `src/core/background/listeners/contextMenus.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 4 | `src/background/listeners/runtimeMessages.ts` | `src/core/background/listeners/runtimeMessages.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 5 | `src/background/llm/classifier.ts` | `src/core/background/llm/classifier.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 6 | `src/background/pathResolver.ts` | `src/core/background/pathResolver.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 7 | `src/background/pipelines/clipPipeline.ts` | `src/core/background/pipelines/clipPipeline.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 8 | `src/background/pipelines/connectionTest.ts` | `src/core/background/pipelines/connectionTest.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 9 | `src/background/services/classificationService.ts` | `src/core/background/services/classificationService.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 10 | `src/background/services/notifications.ts` | `src/core/background/services/notifications.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 11 | `src/background/services/obsidianWriter.ts` | `src/core/background/services/obsidianWriter.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 12 | `src/background/services/usageStats.ts` | `src/core/background/services/usageStats.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 13 | `src/background/services/vaultRouterService.ts` | `src/core/background/services/vaultRouterService.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 14 | `src/background/sinks/obsidianRest.ts` | `src/core/background/sinks/obsidianRest.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 15 | `src/background/store.ts` | `src/core/background/store.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 16 | `src/background/utils/restCandidates.ts` | `src/core/background/utils/restCandidates.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 17 | `src/background/vault-router.ts` | `src/core/background/vault-router.ts` | 🔄 需要更新 | ⏳ 待处理 |

#### Content 模块

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 18 | `src/content/index.ts` | `src/core/content/index.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 19 | `src/content/detect.ts` | `src/core/content/detect.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 20 | `src/content/extractors/aiChatExtractor.ts` | `src/core/content/extractors/aiChatExtractor.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 21 | `src/content/extractors/articleExtractor.ts` | `src/core/content/extractors/articleExtractor.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 22 | `src/content/extractors/selectionExtractor.ts` | `src/core/content/extractors/selectionExtractor.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 23 | `src/content/formatters/markdown.ts` | `src/core/content/formatters/markdown.ts` | 🔄 需要更新 | ⏳ 待处理 |

#### Content Clipper 子模块

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 24 | `src/content/clipper/application/clipPromptGateway.ts` | `src/core/content/processors/clipper/application/clipPromptGateway.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 25 | `src/content/clipper/components/commentForm.ts` | `src/core/content/processors/clipper/components/commentForm.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 26 | `src/content/clipper/components/dialog.ts` | `src/core/content/processors/clipper/components/dialog.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 27 | `src/content/clipper/markdown/fragmentBuilder.ts` | `src/core/content/processors/clipper/markdown/fragmentBuilder.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 28 | `src/content/clipper/presentation/clipperDialogPrompt.ts` | `src/core/content/processors/clipper/presentation/clipperDialogPrompt.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 29 | `src/content/clipper/services/contextCapture.ts` | `src/core/content/processors/clipper/services/contextCapture.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 30 | `src/content/clipper/services/fragmentConfig.ts` | `src/core/content/processors/clipper/services/fragmentConfig.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 31 | `src/content/clipper/services/selectionController.ts` | `src/core/content/processors/clipper/services/selectionController.ts` | 🔄 需要更新 | ⏳ 待处理 |

#### Content Reader 子模块

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 32 | `src/content/reader/application/readerPanelModel.ts` | `src/core/content/processors/reader/application/readerPanelModel.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 33 | `src/content/reader/application/readerSessionView.ts` | `src/core/content/processors/reader/application/readerSessionView.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 34 | `src/content/reader/constants.ts` | `src/core/content/processors/reader/constants.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 35 | `src/content/reader/presentation/readerPanelView.ts` | `src/core/content/processors/reader/presentation/readerPanelView.ts` | 🔄 需要更新 | ⏳ 待处理 |

#### Options 模块

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 36 | `src/options/index.ts` | `src/core/options/index.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 37 | `src/options/index.html` | `src/core/options/index.html` | 🔄 需要更新 | ⏳ 待处理 |
| 38 | `src/options/app/bootstrap.ts` | `src/core/options/app/bootstrap.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 39 | `src/options/app/routing.ts` | `src/core/options/app/routing.ts` | 🔄 需要更新 | ⏳ 待处理 |

### 🔗 共享模块迁移 (src/shared/)

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 40 | `src/shared/config/defaultOptions.ts` | `src/shared/config/defaultOptions.ts` | ✅ 无需更新 | ✅ 保持不变 |
| 41 | `src/shared/config/index.ts` | `src/shared/config/index.ts` | ✅ 无需更新 | ✅ 保持不变 |
| 42 | `src/shared/config/optionsMerger.ts` | `src/shared/config/optionsMerger.ts` | ✅ 无需更新 | ✅ 保持不变 |
| 43 | `src/shared/constants/index.ts` | `src/shared/constants/index.ts` | ✅ 无需更新 | ✅ 保持不变 |
| 44 | `src/shared/constants/usage.ts` | `src/shared/constants/usage.ts` | ✅ 无需更新 | ✅ 保持不变 |
| 45 | `src/shared/types/*.ts` | `src/shared/types/*.ts` | ✅ 无需更新 | ✅ 保持不变 |

### 🎨 UI 模块迁移 (src/ui/)

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 46 | `src/styles/design-tokens.css` | `src/ui/styles/design-tokens.css` | 🔄 构建脚本需更新 | ⏳ 待处理 |
| 47 | `src/styles/components.css` | `src/ui/styles/components.css` | 🔄 构建脚本需更新 | ⏳ 待处理 |

### 🔌 集成模块迁移 (src/integrations/)

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 48 | `src/third_party/ai-chat-exporter/` | `src/integrations/ai-chat-exporter/` | 🔄 需要更新 | ⏳ 待处理 |
| 49 | `src/third_party/obsidian-clipper/` | `src/integrations/obsidian-clipper/` | 🔄 需要更新 | ⏳ 待处理 |

### 📦 资源文件迁移 (src/assets/)

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 50 | `assets/` | `src/assets/` | 🔄 构建脚本需更新 | ⏳ 待处理 |
| 51 | `_locales/` | `src/assets/locales/` | 🔄 构建脚本需更新 | ⏳ 待处理 |
| 52 | `src/manifest.json` | `src/manifest.json` | ✅ 无需更新 | ✅ 保持不变 |

---

## 🧪 测试文件迁移清单

### 单元测试迁移

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 53 | `tests/unit/aiChatExtractor.test.ts` | `tests/unit/core/content/extractors/aiChatExtractor.test.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 54 | `tests/unit/articleExtractor.test.ts` | `tests/unit/core/content/extractors/articleExtractor.test.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 55 | `tests/unit/classificationService.test.ts` | `tests/unit/core/background/services/classificationService.test.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 56 | `tests/unit/clipProcessor.test.ts` | `tests/unit/core/background/application/clipProcessor.test.ts` | 🔄 需要更新 | ⏳ 待处理 |

### E2E 测试迁移

| 序号 | 当前路径 | 新路径 | Import 更新 | 状态 |
|------|----------|--------|-------------|------|
| 57 | `tests/e2e/claudeAiChatFlow.test.ts` | `tests/e2e/ai-chat/claudeAiChatFlow.test.ts` | 🔄 需要更新 | ⏳ 待处理 |
| 58 | `tests/e2e/clipperFlow.test.ts` | `tests/e2e/clipper/clipperFlow.test.ts` | 🔄 需要更新 | ⏳ 待处理 |

---

## ⚙️ 配置文件更新清单

### 构建配置更新

| 序号 | 文件名 | 需要更新的内容 | 状态 |
|------|--------|----------------|------|
| 1 | `scripts/build.mjs` | 入口点路径、资源复制路径 | ⏳ 待处理 |
| 2 | `scripts/package.mjs` | 许可文件路径 | ⏳ 待处理 |
| 3 | `scripts/create-release.mjs` | 构建输出路径 | ⏳ 待处理 |

### TypeScript 配置更新

| 序号 | 文件名 | 需要更新的内容 | 状态 |
|------|--------|----------------|------|
| 4 | `tsconfig.app.json` | 路径映射、包含/排除路径 | ⏳ 待处理 |
| 5 | `tsconfig.tests.json` | 测试文件路径 | ⏳ 待处理 |

### 测试配置更新

| 序号 | 文件名 | 需要更新的内容 | 状态 |
|------|--------|----------------|------|
| 6 | `vitest.config.ts` | 测试文件路径 | ⏳ 待处理 |
| 7 | `vitest.unit.config.ts` | 单元测试路径 | ⏳ 待处理 |
| 8 | `vitest.e2e.config.ts` | E2E 测试路径 | ⏳ 待处理 |

---

## 📝 Import 路径更新清单

### 高频更新的 Import 模式

| 当前 Import | 新 Import | 影响文件数 |
|-------------|-----------|------------|
| `from '../shared/types'` | `from '@shared/types'` | ~30 个文件 |
| `from '../../shared/types'` | `from '@shared/types'` | ~25 个文件 |
| `from '../../../shared/types'` | `from '@shared/types'` | ~15 个文件 |
| `from './background/'` | `from '@core/background/'` | ~10 个文件 |
| `from '../content/'` | `from '@core/content/'` | ~8 个文件 |
| `from '../../third_party/'` | `from '@integrations/'` | ~12 个文件 |

---

## ✅ 执行检查点

### 阶段一检查点：根目录清理

- [ ] 创建 `build/` 目录结构
- [ ] 创建 `tools/` 目录结构  
- [ ] 创建 `.archive/` 目录
- [ ] 移动构建产物到 `build/releases/`
- [ ] 移动测试文件到 `tools/`
- [ ] 移动垃圾文件到 `.archive/`
- [ ] 验证根目录整洁

### 阶段二检查点：src 目录重构

- [ ] 创建 `src/core/` 目录结构
- [ ] 创建 `src/ui/` 目录结构
- [ ] 创建 `src/integrations/` 目录结构
- [ ] 创建 `src/assets/` 目录结构
- [ ] 移动所有源码文件
- [ ] 更新所有 import 路径
- [ ] 验证编译通过

### 阶段三检查点：测试目录重构

- [ ] 创建 `tests/` 新目录结构
- [ ] 移动所有测试文件
- [ ] 更新测试文件 import 路径
- [ ] 验证测试运行正常

### 阶段四检查点：配置文件更新

- [ ] 更新构建脚本路径
- [ ] 更新 TypeScript 配置
- [ ] 更新测试配置
- [ ] 验证构建流程正常
- [ ] 验证测试流程正常

---

## � 遗漏的关键路径更新项目

### HTML 文件中的资源引用

| 序号 | 文件名 | 需要更新的路径 | 当前路径 | 新路径 | 状态 |
|------|--------|----------------|----------|--------|------|
| 59 | `src/options/index.html` | CSS 样式引用 | `../styles/design-tokens.css` | `../ui/styles/design-tokens.css` | ⏳ 待处理 |
| 60 | `src/options/index.html` | CSS 样式引用 | `../styles/components.css` | `../ui/styles/components.css` | ⏳ 待处理 |
| 61 | `src/options/index.html` | 图标资源引用 | `../assets/icons/bannerlogo-128.png` | `../../assets/icons/bannerlogo-128.png` | ⏳ 待处理 |
| 62 | `src/options/index.html` | 图标资源引用 | `../assets/icontrs/*.svg` | `../../assets/icontrs/*.svg` | ⏳ 待处理 |
| 63 | `src/options/index.html` | 图标资源引用 | `../assets/icontrs/*.png` | `../../assets/icontrs/*.png` | ⏳ 待处理 |

### Manifest.json 文件路径

| 序号 | 文件名 | 需要更新的路径 | 当前路径 | 新路径 | 状态 |
|------|--------|----------------|----------|--------|------|
| 64 | `src/manifest.json` | 背景脚本路径 | `background/index.js` | `core/background/index.js` | ⏳ 待处理 |
| 65 | `src/manifest.json` | 选项页面路径 | `options/index.html` | `core/options/index.html` | ⏳ 待处理 |

### 构建脚本遗漏的路径

| 序号 | 文件名 | 需要更新的内容 | 当前路径 | 新路径 | 状态 |
|------|--------|----------------|----------|--------|------|
| 66 | `scripts/build.mjs` | 入口点路径 | `src/background/index.ts` | `src/core/background/index.ts` | ⏳ 待处理 |
| 67 | `scripts/build.mjs` | 入口点路径 | `src/content/index.ts` | `src/core/content/index.ts` | ⏳ 待处理 |
| 68 | `scripts/build.mjs` | 入口点路径 | `src/options/index.ts` | `src/core/options/index.ts` | ⏳ 待处理 |
| 69 | `scripts/build.mjs` | 样式文件路径 | `src/styles/design-tokens.css` | `src/ui/styles/design-tokens.css` | ⏳ 待处理 |
| 70 | `scripts/build.mjs` | 样式文件路径 | `src/styles/components.css` | `src/ui/styles/components.css` | ⏳ 待处理 |
| 71 | `scripts/build.mjs` | HTML 文件路径 | `src/options/index.html` | `src/core/options/index.html` | ⏳ 待处理 |

### 国际化文件路径

| 序号 | 文件名 | 需要更新的内容 | 当前路径 | 新路径 | 状态 |
|------|--------|----------------|----------|--------|------|
| 72 | `scripts/package.mjs` | 国际化文件路径 | `_locales` | `_locales` | ✅ 无需更新 |

### Git 忽略文件

| 序号 | 文件名 | 需要更新的内容 | 说明 | 状态 |
|------|--------|----------------|------|------|
| 73 | `.gitignore` | 添加新目录 | 添加 `build/`, `tools/`, `.archive/` | ⏳ 待处理 |

---

## �🔧 具体执行命令

### 阶段一：根目录清理命令

```bash
# 创建新目录结构
mkdir -p build/{releases,temp}
mkdir -p tools/{debug,manual-tests}
mkdir -p .archive

# 移动文件
mv all-in-ob-v0.1.0.zip build/releases/ 2>/dev/null || echo "文件不存在，跳过"
mv test-vault-paths.html tools/ 2>/dev/null || echo "文件不存在，跳过"
mv trash/* .archive/ 2>/dev/null || echo "目录为空，跳过"
rmdir trash 2>/dev/null || echo "目录不存在，跳过"

# 移动调试文件
find docs -name "*.har" -exec mv {} tools/debug/ \; 2>/dev/null || echo "无 HAR 文件"
```

### 阶段二：src 目录重构命令

```bash
# 创建核心目录结构
mkdir -p src/core/{background,content,options}
mkdir -p src/core/content/processors/{clipper,reader,video}
mkdir -p src/ui/{styles,components}
mkdir -p src/integrations
mkdir -p src/assets/{icons,locales}

# 移动核心模块
mv src/background src/core/ 2>/dev/null || echo "目录不存在"
mv src/content src/core/ 2>/dev/null || echo "目录不存在"
mv src/options src/core/ 2>/dev/null || echo "目录不存在"

# 移动 UI 相关
mv src/styles src/ui/ 2>/dev/null || echo "目录不存在"

# 移动第三方集成
mv src/third_party src/integrations 2>/dev/null || echo "目录不存在"

# 移动资源文件
mv assets/* src/assets/ 2>/dev/null || echo "目录不存在"
mv _locales src/assets/locales 2>/dev/null || echo "目录不存在"
```

### 阶段三：测试目录重构命令

```bash
# 创建测试目录结构
mkdir -p tests/{unit,integration,e2e}/{core,shared,integrations}
mkdir -p tests/unit/core/{background,content,options}
mkdir -p tests/utils

# 移动测试文件（需要手动处理，因为需要按照新的结构重新组织）
# 这部分需要逐个文件处理
```

---

## 📊 风险评估与缓解措施

### 高风险项目

| 风险项 | 风险等级 | 影响 | 缓解措施 |
|--------|----------|------|----------|
| Import 路径错误 | 🔴 高 | 编译失败 | 使用 TypeScript 编译检查 |
| 构建脚本路径错误 | 🔴 高 | 构建失败 | 分步测试构建流程 |
| 测试文件路径错误 | 🟡 中 | 测试失败 | 逐步验证测试运行 |
| 资源文件路径错误 | 🟡 中 | 运行时错误 | 验证扩展加载 |

### 回滚计划

```bash
# 如果重构失败，可以使用 Git 回滚
git stash  # 暂存当前更改
git reset --hard HEAD  # 回滚到重构前状态
```

---

## 📈 进度跟踪

### 完成状态图例

- ✅ 已完成
- ⏳ 进行中
- ❌ 失败
- 🔄 需要重做
- ⏸️ 暂停

### 详细进度跟踪

**总体进度**: 0% (0/58 项完成)

#### 阶段一进度 (0/7 项)
- [ ] 创建目录结构
- [ ] 移动构建产物
- [ ] 移动测试文件
- [ ] 移动垃圾文件
- [ ] 移动调试文件
- [ ] 清理空目录
- [ ] 验证根目录

#### 阶段二进度 (0/35 项)
- [ ] 创建 src 目录结构
- [ ] 移动 Background 模块 (0/17 项)
- [ ] 移动 Content 模块 (0/6 项)
- [ ] 移动 Options 模块 (0/4 项)
- [ ] 移动 UI 模块 (0/2 项)
- [ ] 移动集成模块 (0/2 项)
- [ ] 移动资源文件 (0/3 项)
- [ ] 更新所有 import 路径

#### 阶段三进度 (0/8 项)
- [ ] 创建测试目录结构
- [ ] 移动单元测试 (0/4 项)
- [ ] 移动 E2E 测试 (0/2 项)
- [ ] 更新测试 import 路径

#### 阶段四进度 (0/8 项)
- [ ] 更新构建脚本 (0/3 项)
- [ ] 更新 TypeScript 配置 (0/2 项)
- [ ] 更新测试配置 (0/3 项)

---

**执行进度**: 0% (0/73 项完成)
**当前阶段**: 准备阶段
**下一步**: 开始阶段一 - 根目录清理
**预计完成时间**: 7-10 天

---

## 🎯 关键优化建议

### 1. **assets 目录位置调整** 🔴 重要

**问题**：原计划将 `assets/` 移动到 `src/assets/` 会导致以下问题：
- 构建脚本需要大幅修改
- manifest.json 路径引用复杂化
- HTML 文件中的相对路径变得更深

**建议**：保持 `assets/` 和 `_locales/` 在根目录
```
AiiinOB/
├── assets/                          # 静态资源（保持根目录）
├── _locales/                        # 国际化文件（保持根目录）
└── src/
    ├── core/
    ├── shared/
    ├── ui/
    └── integrations/
```

### 2. **简化的迁移策略** 🟡

**建议采用保守策略**：
1. **第一阶段**：只清理根目录混乱
2. **第二阶段**：重构 src 目录核心模块
3. **第三阶段**：优化测试结构
4. **暂缓**：docs 目录重构（风险高，收益低）

### 3. **更新的文件统计**

- **总迁移项目**: 73 个（新增 15 个遗漏项目）
- **HTML 路径更新**: 5 个文件
- **Manifest 路径更新**: 2 个路径
- **构建脚本更新**: 6 个路径
- **配置文件更新**: 1 个文件

---
