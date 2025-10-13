# AiiinOB 目录迁移检查清单（最佳实践版）

**文档版本**: v2.0  
**创建日期**: 2025-01-13  
**作者**: AI 代码分析助手  
**状态**: 最佳实践方案 - 待执行  

---

## 📋 迁移概览

- **总迁移项目**: 52 个（优化后减少）
- **TypeScript 文件**: 60+ 个需要更新 import 路径（简化后）
- **配置文件**: 8 个需要更新
- **静态资源**: 移至 `public/` 目录（现代标准）
- **预计工作量**: 5-7 天（优化后减少）
- **风险等级**: 🟡 中等（需要仔细测试）

---

## 🚀 阶段一：静态资源重组（关键变更）

### 📁 创建目录结构
```bash
mkdir -p public/{icons,_locales}
mkdir -p build/{dist,releases,temp}
mkdir -p tools/{debug,manual-tests}
mkdir -p .archive
```

### 📦 静态资源迁移清单

| 序号 | 当前路径 | 新路径 | 说明 | 状态 |
|------|----------|--------|------|------|
| 1 | `assets/icons/bannerlogo-16.png` | `public/icons/bannerlogo-16.png` | 16px 图标 | ⏳ 待处理 |
| 2 | `assets/icons/bannerlogo-32.png` | `public/icons/bannerlogo-32.png` | 32px 图标 | ⏳ 待处理 |
| 3 | `assets/icons/bannerlogo-48.png` | `public/icons/bannerlogo-48.png` | 48px 图标 | ⏳ 待处理 |
| 4 | `assets/icons/bannerlogo-128.png` | `public/icons/bannerlogo-128.png` | 128px 图标 | ⏳ 待处理 |
| 5 | `assets/icons/bannerlogo-256.png` | `public/icons/bannerlogo-256.png` | 256px 图标 | ⏳ 待处理 |
| 6 | `assets/icontrs/*` | `public/icons/` | 其他图标资源 | ⏳ 待处理 |
| 7 | `_locales/en/` | `public/_locales/en/` | 英文国际化 | ⏳ 待处理 |
| 8 | `_locales/ja/` | `public/_locales/ja/` | 日文国际化 | ⏳ 待处理 |
| 9 | `_locales/zh_CN/` | `public/_locales/zh_CN/` | 中文国际化 | ⏳ 待处理 |
| 10 | `src/manifest.json` | `public/manifest.json` | 扩展清单 | ⏳ 待处理 |

### 🗑️ 根目录清理清单

| 序号 | 当前路径 | 新路径 | 说明 | 状态 |
|------|----------|--------|------|------|
| 11 | `all-in-ob-v0.1.0.zip` | `build/releases/` | 发布包 | ⏳ 待处理 |
| 12 | `test-vault-paths.html` | `tools/` | 测试文件 | ⏳ 待处理 |
| 13 | `trash/` | `.archive/` | 垃圾文件 | ⏳ 待处理 |
| 14 | `docs/www.bilibili.com.har` | `tools/debug/` | 调试文件 | ⏳ 待处理 |
| 15 | `dist/` | `build/dist/` | 构建输出 | ⏳ 待处理 |

### 🧹 清理空目录
```bash
rmdir assets/icons assets/icontrs assets _locales trash
```

---

## 🔄 阶段二：src 目录重构（最佳实践）

### 📁 目录重命名清单

| 序号 | 当前路径 | 新路径 | 说明 | 状态 |
|------|----------|--------|------|------|
| 16 | `src/content/` | `src/content-scripts/` | 标准命名 | ⏳ 待处理 |
| 17 | `src/third_party/` | `src/lib/` | 现代命名 | ⏳ 待处理 |

### 📝 Import 路径更新清单

需要更新的主要文件：

| 序号 | 文件路径 | 更新内容 | 状态 |
|------|----------|----------|------|
| 18 | `src/background/index.ts` | 更新 content 相关 import | ⏳ 待处理 |
| 19 | `src/content-scripts/index.ts` | 更新内部 import 路径 | ⏳ 待处理 |
| 20 | `src/options/index.ts` | 更新 shared 相关 import | ⏳ 待处理 |
| 21 | `src/shared/` 下所有文件 | 更新交叉引用 | ⏳ 待处理 |

### 🔧 批量更新脚本
```bash
# 更新 content 相关路径
find src -name "*.ts" -exec sed -i 's|from '\''./content|from '\''./content-scripts|g' {} \;
find src -name "*.ts" -exec sed -i 's|from '\''../content|from '\''../content-scripts|g' {} \;

# 更新 third_party 相关路径
find src -name "*.ts" -exec sed -i 's|from '\''../third_party|from '\''../lib|g' {} \;
find src -name "*.ts" -exec sed -i 's|from '\''./third_party|from '\''./lib|g' {} \;
```

---

## ⚙️ 阶段三：配置文件更新

### 🔧 构建脚本更新清单

| 序号 | 文件路径 | 更新内容 | 状态 |
|------|----------|----------|------|
| 22 | `scripts/build.mjs` | 更新入口点路径和输出目录 | ⏳ 待处理 |
| 23 | `scripts/package.mjs` | 更新资源复制路径 | ⏳ 待处理 |
| 24 | `scripts/create-release.mjs` | 更新发布路径 | ⏳ 待处理 |

### 📋 TypeScript 配置更新

| 序号 | 文件路径 | 更新内容 | 状态 |
|------|----------|----------|------|
| 25 | `tsconfig.app.json` | 添加路径映射 | ⏳ 待处理 |
| 26 | `vitest.config.ts` | 更新测试路径 | ⏳ 待处理 |
| 27 | `vitest.unit.config.ts` | 更新单元测试路径 | ⏳ 待处理 |
| 28 | `vitest.e2e.config.ts` | 更新 E2E 测试路径 | ⏳ 待处理 |

### 🌐 HTML 文件更新

| 序号 | 文件路径 | 更新内容 | 状态 |
|------|----------|----------|------|
| 29 | `src/options/index.html` | 更新 CSS 引用路径 | ⏳ 待处理 |

---

## 🧪 阶段四：测试目录重构（扁平化）

### 📁 测试目录重组

| 序号 | 当前路径 | 新路径 | 说明 | 状态 |
|------|----------|--------|------|------|
| 30 | `tests/unit/` | `tests/unit/` | 保持扁平化 | ⏳ 待处理 |
| 31 | `tests/integration/` | `tests/integration/` | 保持扁平化 | ⏳ 待处理 |
| 32 | `tests/e2e/` | `tests/e2e/` | 保持扁平化 | ⏳ 待处理 |

---

## ✅ 验证检查清单

### 🔍 构建验证

- [ ] `npm run build` 成功执行
- [ ] `build/dist/` 目录结构正确
- [ ] `public/manifest.json` 路径引用正确
- [ ] 所有静态资源正确复制

### 🧪 测试验证

- [ ] `npm run test` 成功执行
- [ ] 所有单元测试通过
- [ ] 集成测试正常运行
- [ ] E2E 测试正常运行

### 📦 打包验证

- [ ] `npm run package` 成功执行
- [ ] 生成的扩展包结构正确
- [ ] 扩展在浏览器中正常加载
- [ ] 所有功能正常工作

---

## 🎯 执行命令汇总

### 阶段一命令
```bash
# 创建目录
mkdir -p public/{icons,_locales} build/{dist,releases,temp} tools/{debug,manual-tests} .archive

# 移动静态资源
mv assets/icons/* public/icons/
mv assets/icontrs/* public/icons/
mv _locales/* public/_locales/
mv src/manifest.json public/manifest.json

# 清理根目录
mv all-in-ob-v0.1.0.zip build/releases/
mv test-vault-paths.html tools/
mv trash/* .archive/
mv docs/www.bilibili.com.har tools/debug/
mv dist build/

# 清理空目录
rmdir assets/icons assets/icontrs assets _locales trash
```

### 阶段二命令
```bash
# 重命名目录
mv src/content src/content-scripts
mv src/third_party src/lib

# 批量更新 import 路径
find src -name "*.ts" -exec sed -i 's|from '\''./content|from '\''./content-scripts|g' {} \;
find src -name "*.ts" -exec sed -i 's|from '\''../content|from '\''../content-scripts|g' {} \;
find src -name "*.ts" -exec sed -i 's|from '\''../third_party|from '\''../lib|g' {} \;
find src -name "*.ts" -exec sed -i 's|from '\''./third_party|from '\''./lib|g' {} \;
```

---

**总计**: 32 个主要迁移项目  
**预计完成时间**: 5-7 天  
**建议执行**: 🟢 强烈推荐（符合最佳实践）  

---
