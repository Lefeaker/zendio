# 试用版本创建指南

本指南介绍如何为 Zendio 扩展创建带有时间限制的试用版本，用于分发给测试用户。

## 快速开始

### 创建默认试用版本（7天）

```bash
npm run package:trial
```

### 创建自定义试用期的版本

```bash
# 创建14天试用版本
npm run package:trial -- --days=14
```

### 快速打包（跳过构建）

如果您刚刚构建过项目，可以跳过构建步骤：

```bash
npm run package:trial:quick
```

## 详细选项

### 命令行参数

- `--days=N`: 设置试用天数（默认：7天）
- `--skip-build`: 跳过构建步骤，直接打包已有的 `build/dist-chrome-trial`
- `--help`, `-h`: 显示帮助信息

### 示例

```bash
# 创建14天试用版本
npm run package:trial -- --days=14

# 跳过构建，直接打包30天试用版本
npm run package:trial -- --skip-build --days=30
```

`package:trial` 使用独立输出目录 `build/dist-chrome-trial`。默认流程会先运行 `build:fast -- --outdir build/dist-chrome-trial`，然后调用 `scripts/package.mjs --dist-dir build/dist-chrome-trial --trial`。它不得修改 `package.json`，也不得复用正式 Chrome / Firefox package 输出目录。

## 试用版本特性

### Artifact channel

- 试用版本通过 `trial-config.json` 标记本地首次安装生命周期。
- 试用标记是 artifact channel，不是订阅证明、远程授权证明或私有 Pro 能力证明。
- Public Zendio runtime 不包含 Pro UI、远程 entitlement endpoint、customer identifier、subscription state、payment state 或 private server behavior。

### 用户体验

1. **安装时**：自动激活试用期
2. **使用中**：右上角显示剩余时间
3. **即将过期**：弹出提醒通知
4. **已过期**：本地试用生命周期可显示过期状态

### 时间显示

- 剩余时间 > 1天：显示"剩余 X 天"
- 剩余时间 < 1天：显示"剩余 X 小时"
- 已过期：显示"已过期"

## 分发流程

### 1. 创建试用版本

```bash
npm run package:trial -- --days=14
```

### 2. 获取打包文件

打包完成后，会在项目根目录生成类似以下文件：

```
zendio-(试用版)-v0.2.0.zip
```

### 3. 分发给用户

将 zip 文件发送给测试用户，并提供安装说明：

1. 下载并解压 zip 文件
2. 打开 Chrome 浏览器
3. 访问 `chrome://extensions/`
4. 开启右上角的"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的文件夹

### 4. 用户反馈

- 用户可以在试用期内正常使用所有功能
- 扩展会自动提醒用户剩余时间
- 试用包不携带联系信息或私有商业 metadata

## 技术实现

### 核心组件

1. **trial-manager.ts**: 试用期管理核心逻辑
2. **trial-notice.ts**: 用户界面提示组件
3. **package-trial.mjs**: 试用版本打包脚本

### 存储机制

- 使用 Chrome Storage API 存储试用配置
- 配置包含：过期时间、试用天数、版本信息
- 自动在首次安装时激活

### 检查机制

- 后台脚本每小时检查一次试用状态
- 用户界面组件每分钟更新一次显示
- Public production feature entrypoints 当前不使用试用状态做 Pro/subscription gating

## 注意事项

### 安全考虑

- 试用期检查在客户端进行，不能作为商业授权边界
- 建议试用期不超过30天
- 远程 entitlement、customer identifiers、subscription status、payment state 与 private server behavior 均属于 private overlay owner，不进入 tracked public source

### 用户体验

- 提供清晰的过期提醒
- 避免过于频繁的提醒通知
- 确保试用期内功能完全可用

### 测试建议

1. 创建短期试用版本（如1小时）进行测试
2. 验证过期提醒是否正常显示
3. 确认 public feature entrypoints 没有新增 Pro/subscription gating
4. 测试不同时区的用户体验

## 故障排除

### 常见问题

**Q: 试用版本没有显示剩余时间？**
A: 检查是否正确集成了 trial-notice 组件到页面中。

**Q: 过期后功能仍然可用？**
A: P02 后 public runtime 不把 trial state 当作 Pro/subscription entitlement；不要在 public feature entrypoints 新增私有商业 gating。

**Q: 打包失败？**
A: 确保先运行 `npm run build` 构建项目。

**Q: Chrome 扩展加载失败，提示版本号无效？**
A: Chrome 扩展的版本号必须是纯数字格式（如 0.2.0），不能包含文本后缀（如 -trial）。如果遇到此问题，请检查 build/dist/manifest.json 中的 version 字段，确保格式正确。

### 调试方法

1. 打开浏览器开发者工具
2. 查看 Console 中的 `[trial]` 相关日志
3. 检查 Chrome Storage 中的试用配置
4. 使用 `clearTrialConfig()` 清除配置重新测试

## 更新日志

- v1.0.0: 初始版本，支持基本的时间限制功能
- v1.1.0: 添加用户界面提示组件
- v1.2.0: 完善打包脚本和命令行工具
- v1.3.0: 规范试用包隔离输出与 public/private commercial boundary
