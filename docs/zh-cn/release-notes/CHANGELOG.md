# 更新日志

## [0.2.0] - 2025-09-30

### ✨ 新增功能

- **双 URL 配置**: 现在可以分别配置 HTTPS 和 HTTP 两个 URL
  - 在选项页面添加了 `HTTPS URL` 和 `HTTP URL` 两个独立字段
  - 扩展会智能选择可用的连接方式
  - 向后兼容旧的 `baseUrl` 配置

### 🔧 改进

- **智能容错机制增强**
  - 优先使用用户配置的 HTTPS 和 HTTP URL
  - 自动在多个协议和端口之间切换
  - 详细的日志输出，方便调试

### 📝 配置说明

**新的配置方式**（推荐）:

```
HTTPS URL: https://127.0.0.1:27124/
HTTP URL:  http://127.0.0.1:27123/
Vault:     your-vault-name
API Key:   your-api-key
```

**旧的配置方式**（仍然支持）:

```
Base URL:  https://127.0.0.1:27124/
Vault:     your-vault-name
API Key:   your-api-key
```

### 🎯 使用建议

1. 配置两个 URL（HTTPS 和 HTTP），让扩展自动选择可用的连接
2. 如果不确定端口，可以在 Obsidian 的 Local REST API 插件设置中查看
3. 通常 HTTPS 端口为 27124，HTTP 端口为 27123

### 📚 技术细节

- 修改了 `src/background/store.ts` 添加 `httpsUrl` 和 `httpUrl` 字段
- 更新了 `src/options/index.html` 和 `src/options/index.ts` 配置页面
- 增强了 `src/background/sinks/obsidianRest.ts` 的容错逻辑
- 改进了 `src/background/index.ts` 的连接测试功能

---

## [0.1.0] - 2025-09-26

### 🎉 初始版本

- 基本的网页剪藏功能
- Obsidian Local REST API 集成
- 模板系统
- AI 分类器支持
