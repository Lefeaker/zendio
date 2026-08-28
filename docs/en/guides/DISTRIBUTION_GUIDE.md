# 扩展构建与分发指南

最后更新：2026-08-28

## 当前输出路径

- `npm run build`：运行标准质量门禁并生成 Chrome production tree `build/dist/`。
- `npm run package`：从当前 Chrome build 生成并审计 `zendio-v<package-version>.zip`。
- `npm run release`：生成 `build/releases/zendio-v<package-version>-release.zip`，内部包含
  `extension/`、安装指南和 README。
- `npm run package:chrome:isolated` / `npm run package:firefox:isolated`：分别使用
  `build/dist-chrome` / `build/dist-firefox`，不得跨浏览器复用 dist。

`build/` 和压缩包都是 disposable generated output，不提交到 Git。

## 版本唯一来源

版本号只手写在根 `package.json`。修改后运行：

```bash
npm run release:metadata:sync
npm run release:metadata:check
```

同步命令会更新 package-lock root version、`public/manifest.json`、
`public/manifest.firefox.json` 与各 release locale runtime catalog 的 `versionNumber`。
不要另建第二个 manifest 版本来源，也不要在 UI 或文档中硬编码 release version。

## 本地开发者模式安装

Chrome/Edge：

1. 运行 `npm run build`。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`。
3. 启用开发者模式，选择“加载已解压的扩展程序”。
4. 选择仓库中的 `build/dist/`。

Firefox：

1. 运行 `npm run build:firefox`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 临时加载 `build/dist/manifest.json`。

## 离线分发包

```bash
npm run release
```

将 `build/releases/zendio-v<package-version>-release.zip` 交给接收者。接收者解压后在
Chrome/Edge 开发者模式中选择 `extension/` 文件夹。该方式是本地 side-load，不等同于
Chrome Web Store 或 AMO 发布。

## 发布前工程验证

至少运行当前 source-of-truth 中的标准门禁：

```bash
npm run release:metadata:check
npm run quality
npm run verify:preflight
npm run build
npm run audit:release-surface:report
```

Firefox package 还必须使用自身 isolated build/package 与 manifest/release-surface checks。
完整命令见 [`../../engineering-entrypoints.md`](../../engineering-entrypoints.md)。

## Store handoff

本地 package alias 不拥有真实发布 authority。Chrome Web Store 与 Firefox AMO 的 live
delivery 分别由受保护 workflow 拥有：

- `.github/workflows/release-chrome-webstore.yml`
- `.github/workflows/release-firefox-amo.yml`

两者都先由无凭据 prepare job 绑定 exact SHA、required CI、package/lock 与 immutable
artifact；credentials 只进入受保护 Environment 中唯一 mutation step。upload/submit 开始后的
未知响应必须先在 store dashboard/API reconciliation，禁止盲目重试。

## 用户更新

Side-load 用户可用新 `extension/` 覆盖旧目录并在扩展管理页重新加载，或移除后重新加载。
Store 用户按商店更新策略接收版本。无论哪种方式，先保留上一版本工件作为可回滚输入。
