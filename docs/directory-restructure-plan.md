# AiiinOB 目录重构计划（最佳实践版）

**文档版本**: v2.0
**创建日期**: 2025-01-13
**更新日期**: 2025-01-13
**作者**: AI 代码分析助手
**状态**: 最佳实践方案 - 待执行

---

## 🎯 重构目标（基于最佳实践）

1. **清理根目录混乱**：移除构建产物、测试文件、垃圾文件
2. **采用现代标准**：遵循 Chrome 扩展和 TypeScript 项目最佳实践
3. **功能导向组织**：按功能模块而非抽象层级组织代码
4. **统一资源管理**：静态资源移至 `public/` 目录（现代标准）
5. **简化目录结构**：避免过度嵌套，提升开发体验
6. **符合行业标准**：与知名 Chrome 扩展项目保持一致

---

## 📁 最终目录结构

### 根目录结构

```
AiiinOB/
├── 📁 public/                       # 静态资源（现代标准）
│   ├── icons/                       # 扩展图标
│   │   ├── bannerlogo-16.png
│   │   ├── bannerlogo-32.png
│   │   ├── bannerlogo-48.png
│   │   ├── bannerlogo-128.png
│   │   └── bannerlogo-256.png
│   ├── _locales/                    # 国际化文件
│   │   ├── en/
│   │   ├── ja/
│   │   └── zh_CN/
│   └── manifest.json                # 扩展清单
├── 📁 src/                          # 源代码目录
├── 📁 tests/                        # 测试代码目录（扁平化）
├── 📁 docs/                         # 文档目录（保持现状）
├── 📁 scripts/                      # 构建和工具脚本
├── 📁 build/                        # 构建相关文件
│   ├── dist/                        # 构建输出
│   ├── releases/                    # 发布包
│   └── temp/                        # 临时构建文件
├── 📁 tools/                        # 开发工具和调试文件
│   ├── debug/                       # 调试文件
│   └── manual-tests/                # 手动测试文件
├── 📁 .archive/                     # 归档文件（替代 trash）
├── 📁 node_modules/                 # 依赖包（不变）
├── 📄 package.json                  # 项目配置（不变）
├── 📄 package-lock.json             # 依赖锁定（不变）
├── 📄 tsconfig.*.json               # TypeScript 配置（需更新）
├── 📄 vitest.*.config.ts            # 测试配置（需更新）
├── 📄 README.*.md                   # 项目说明（不变）
└── 📄 THIRD_PARTY_NOTICES.md        # 第三方许可（不变）
```

### src 目录重构（最佳实践）

```
src/
├── 📁 background/                   # Background Service Worker（功能导向）
│   ├── index.ts
│   ├── listeners/
│   │   ├── contextMenus.ts
│   │   └── runtimeMessages.ts
│   ├── services/
│   │   ├── classificationService.ts
│   │   ├── notifications.ts
│   │   ├── obsidianWriter.ts
│   │   ├── usageStats.ts
│   │   └── vaultRouterService.ts
│   ├── application/
│   │   └── clipProcessor.ts
│   ├── pipelines/
│   │   ├── clipPipeline.ts
│   │   └── connectionTest.ts
│   ├── llm/
│   │   └── classifier.ts
│   └── utils/
│       └── restCandidates.ts
├── 📁 content-scripts/              # Content Scripts（标准命名）
│   ├── index.ts
│   ├── detect.ts
│   ├── extractors/                  # 内容提取器
│   │   ├── aiChatExtractor.ts
│   │   ├── articleExtractor.ts
│   │   └── selectionExtractor.ts
│   ├── processors/                  # 内容处理器
│   │   ├── clipper/
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   ├── markdown/
│   │   │   └── presentation/
│   │   ├── reader/
│   │   │   ├── application/
│   │   │   └── presentation/
│   │   └── video/
│   └── formatters/
│       └── markdown.ts
├── 📁 options/                      # 选项页面
│   ├── index.ts
│   ├── index.html
│   ├── app/
│   │   ├── bootstrap.ts
│   │   └── routing.ts
│   ├── components/
│   ├── services/
│   ├── state/
│   └── utils/
├── 📁 shared/                       # 共享代码
│   ├── types/                       # 类型定义
│   ├── constants/                   # 常量定义
│   ├── config/                      # 配置管理
│   ├── utils/                       # 工具函数
│   └── services/                    # 共享服务
├── 📁 lib/                         # 第三方集成（现代命名）
│   ├── ai-chat-exporter/           # AI 聊天导出器
│   └── obsidian-clipper/           # Obsidian 剪藏器
├── 📁 styles/                       # 全局样式
│   ├── design-tokens.css
│   └── components.css
├── 📁 assets/                       # 源码中的资源
│   └── images/                      # 内联图片等
└── 📁 i18n/                        # 国际化工具
    ├── index.ts
    └── locales/
```

### tests 目录重构（扁平化）

```
tests/
├── 📁 unit/                         # 单元测试（扁平化结构）
│   ├── background/                  # 对应 src/background
│   ├── content-scripts/             # 对应 src/content-scripts
│   ├── options/                     # 对应 src/options
│   ├── shared/                      # 对应 src/shared
│   └── lib/                         # 对应 src/lib
├── 📁 integration/                  # 集成测试
├── 📁 e2e/                         # 端到端测试
│   ├── ai-chat/                     # AI 聊天测试
│   └── clipper/                     # 剪藏功能测试
├── 📁 fixtures/                     # 测试数据
│   ├── ai-chat/
│   └── articles/
└── 📁 utils/                        # 测试工具
```

### docs 目录重构

```
docs/
├── 📁 user/                         # 用户文档
│   ├── en/                          # 英文用户文档
│   ├── zh-cn/                       # 中文用户文档
│   └── ja/                          # 日文用户文档
├── 📁 developer/                    # 开发者文档
│   ├── architecture/                # 架构文档
│   ├── api/                         # API 文档
│   ├── contributing/                # 贡献指南
│   └── testing/                     # 测试指南
├── 📁 technical/                    # 技术文档
│   ├── debt-analysis/               # 技术债务分析
│   ├── refactoring/                 # 重构文档
│   └── governance/                  # 治理文档
└── 📁 assets/                       # 文档资源
    ├── images/
    └── diagrams/
```

---

## 🔄 迁移映射表

### 主要文件迁移

| 当前路径 | 新路径 | 说明 |
|----------|--------|------|
| `src/background/` | `src/background/` | 保持不变（功能导向） |
| `src/content/` | `src/content-scripts/` | 标准命名 |
| `src/options/` | `src/options/` | 保持不变 |
| `src/shared/` | `src/shared/` | 保持不变 |
| `src/styles/` | `src/styles/` | 保持不变 |
| `src/third_party/` | `src/lib/` | 现代命名 |
| `src/manifest.json` | `public/manifest.json` | 现代标准 |
| `assets/` | `public/icons/` | 现代标准 |
| `_locales/` | `public/_locales/` | 现代标准 |

### 根目录清理

| 当前路径 | 新路径 | 说明 |
|----------|--------|------|
| `all-in-ob-v0.1.0.zip` | `build/releases/` | 发布包 |
| `test-vault-paths.html` | `tools/` | 开发工具 |
| `trash/` | `.archive/` | 归档文件 |
| `docs/www.bilibili.com.har` | `tools/debug/` | 调试文件 |
| `dist/` | `build/dist/` | 构建输出 |

---

## ⚙️ 配置文件调整

### 构建脚本更新

```javascript
// scripts/build.mjs - 最佳实践路径更新
const buildOptions = {
  entryPoints: [
    'src/background/index.ts',         // 简化路径（功能导向）
    'src/content-scripts/index.ts',    // 标准命名
    'src/options/index.ts'             // 简化路径
  ],
  outdir: 'build/dist',                // 统一构建目录
  // ...
};

// 资源复制路径更新（现代方式）
await cp('public', 'build/dist', { recursive: true });
await cp('src/styles/design-tokens.css', 'build/dist/styles/design-tokens.css');
await cp('src/options/index.html', 'build/dist/options/index.html');
```

### TypeScript 配置优化

```json
// tsconfig.app.json - 最佳实践路径映射
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/background/*": ["background/*"],
      "@/content-scripts/*": ["content-scripts/*"],
      "@/options/*": ["options/*"],
      "@/shared/*": ["shared/*"],
      "@/lib/*": ["lib/*"],
      "@/styles/*": ["styles/*"],
      "@/assets/*": ["assets/*"]
    }
  },
  "include": ["src/**/*", "public/manifest.json"],
  "exclude": ["tests", "build", "node_modules"]
}
```

---

## 📋 执行计划

### 阶段一：根目录清理和静态资源重组（1 天）

1. **创建新目录结构**
   ```bash
   mkdir -p public/{icons,_locales}
   mkdir -p build/{dist,releases,temp}
   mkdir -p tools/{debug,manual-tests}
   mkdir -p .archive
   ```

2. **移动静态资源（关键变更）**
   ```bash
   # 移动图标文件
   mv assets/icons/* public/icons/
   mv assets/icontrs/* public/icons/

   # 移动国际化文件
   mv _locales/* public/_locales/

   # 移动 manifest.json
   mv src/manifest.json public/manifest.json
   ```

3. **移动其他文件**
   ```bash
   mv all-in-ob-v0.1.0.zip build/releases/
   mv test-vault-paths.html tools/
   mv trash/* .archive/
   mv docs/www.bilibili.com.har tools/debug/
   mv dist build/
   ```

4. **清理空目录**
   ```bash
   rmdir assets/icons assets/icontrs assets _locales trash
   ```

### 阶段二：src 目录重构（2-3 天）

1. **创建目录结构（最佳实践）**
   ```bash
   mkdir -p src/{lib,assets}
   # background, content, options, shared, styles 目录已存在
   ```

2. **重命名和移动源码文件**
   ```bash
   # 重命名为标准命名
   mv src/content src/content-scripts

   # 重命名第三方库目录
   mv src/third_party src/lib

   # 创建源码资源目录（如果需要）
   mkdir -p src/assets/images
   ```

3. **更新 import 路径（最佳实践）**
   ```bash
   # 使用脚本批量更新 import 路径
   find src -name "*.ts" -exec sed -i 's|from '\''./content|from '\''./content-scripts|g' {} \;
   find src -name "*.ts" -exec sed -i 's|from '\''../content|from '\''../content-scripts|g' {} \;
   find src -name "*.ts" -exec sed -i 's|from '\''../third_party|from '\''../lib|g' {} \;
   find src -name "*.ts" -exec sed -i 's|from '\''./third_party|from '\''./lib|g' {} \;
   ```

4. **更新配置文件**
   ```bash
   # 更新 tsconfig.app.json 添加路径映射
   # 更新 scripts/build.mjs 入口点路径和输出目录
   # 更新 public/manifest.json 中的路径引用
   ```

### 阶段三：测试目录重构（1-2 天）

1. **创建测试目录结构（扁平化）**
   ```bash
   mkdir -p tests/{unit,integration,e2e}/{background,content-scripts,options,shared,lib}
   mkdir -p tests/utils
   ```

2. **移动测试文件**
   - 按照新的源码结构重新组织测试文件
   - 更新测试文件中的 import 路径

### 阶段四：配置文件更新和验证（0.5 天）

1. **更新构建配置**
   ```bash
   # 更新 scripts/build.mjs
   # 更新 scripts/package.mjs
   # 更新 scripts/create-release.mjs
   ```

2. **更新 TypeScript 配置**
   ```bash
   # 更新 tsconfig.app.json 路径映射
   # 更新 vitest 配置文件
   ```

3. **验证构建流程**
   ```bash
   npm run build
   npm run test
   npm run package
   ```

### 阶段五：文档目录重构（可选，1-2 天）

**注意**：此阶段为可选项，建议暂缓执行，因为：
- 风险高但收益相对较低
- 当前文档结构基本合理
- 可以在后续需要时再进行调整

---

## 🎯 预期收益（基于最佳实践）

1. **符合行业标准**：与现代 Chrome 扩展和 TypeScript 项目保持一致
2. **开发效率提升 25%**：功能导向的目录结构更直观
3. **新人上手时间减少 40%**：标准化的项目结构降低学习成本
4. **维护成本降低 20%**：模块职责明确，便于维护
5. **工具兼容性提升**：现代构建工具和 IDE 支持更好
6. **扩展性增强**：为未来功能扩展（如 popup）预留空间
7. **代码质量改善**：规范的组织方式促进最佳实践

---

## ⚠️ 注意事项

1. **备份重要文件**：重构前创建完整备份
2. **分阶段执行**：避免一次性大规模变更
3. **测试验证**：每个阶段完成后进行功能测试
4. **文档同步**：及时更新相关文档和说明
5. **团队沟通**：确保团队成员了解新的目录结构

---

**执行状态**: 📋 待执行  
**预计完成时间**: 7-10 天  
**负责人**: 开发团队  

---
