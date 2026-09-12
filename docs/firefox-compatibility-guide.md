# Zendio Firefox 兼容性指南

## 📋 概述

本文档详细说明了 Zendio 项目对 Firefox 浏览器的兼容性支持，包括实现方案、使用方法和注意事项。

## 🔧 技术实现

### 1. 平台适配架构

Zendio 采用平台适配层模式，为不同浏览器提供统一的 API 接口：

```
src/platform/
├── chrome/          # Chrome 平台实现
├── firefox/         # Firefox 平台实现
├── interfaces/      # 统一接口定义
├── services.ts      # 平台服务配置
└── types.ts         # 类型定义
```

### 2. 主要差异处理

#### Manifest 文件差异

| 特性       | Chrome           | Firefox                                   |
| ---------- | ---------------- | ----------------------------------------- |
| Background | `service_worker` | `scripts` fallback for AMO MV3 validation |
| Action API | `action`         | `browserAction` (旧版)                    |
| 扩展 ID    | 自动生成         | 需要在 `browser_specific_settings` 中指定 |

#### API 差异

| API           | Chrome             | Firefox                             |
| ------------- | ------------------ | ----------------------------------- |
| 全局对象      | `chrome.*`         | `browser.*`                         |
| Promise 支持  | 需要 polyfill      | 原生支持                            |
| Scripting API | `chrome.scripting` | `browser.tabs.executeScript` (回退) |

> ℹ️ 0.2.0 的 Firefox release manifest 使用 `background.scripts`，避免 AMO
> 对 MV3 `background.service_worker` fallback 的阻断错误。Firefox manifest 同步声明
> `browser_specific_settings.gecko.data_collection_permissions`，并将桌面与 Android
> `strict_min_version` 设为 `142.0`。仓库内静态 manifest 契约会在创建 XPI 前验证这些
> 字段。本地 `addons-linter 10.10.0` 在 XPI 创建前对相同最终 dist 执行 bounded
> self-hosted lint；AMO upload validation 仍是商店提交阶段的独立权威校验。

#### Messaging 监听器契约

Chrome 与 Firefox 平台适配器使用同一套消息监听语义：

- 同步返回 `undefined` 表示当前监听器不响应，后续监听器仍可提供结果；异步
  `undefined` 已经占用响应通道，因此统一归一化为 JSON 安全的 `null`。
- 同步抛出和异步拒绝都只发送固定标记
  `{ __zendioTransportError: { code: 'MESSAGE_LISTENER_FAILED' } }`。标记不包含异常文本、
  堆栈、`cause`、原始拒绝值或用户数据。
- `send` 与 `sendToTab` 仅把上述精确标记转换为
  `MessageListenerInvocationError`；普通业务结果（包括 `{ error: string }`）保持成功结果，
  浏览器原生发送错误保持原始拒绝。
- Firefox 监听器直接返回原生 Promise，不组合 `sendResponse` 与 `return true`；Chrome
  继续使用回调和布尔 keepalive，并发送同一个归一化结果。
- 发送者字段只映射浏览器实际提供的 `id`、tab/window/frame ID、直接 URL 或
  `tab.url`。只有原生发送者确实提供 `origin` 时才复制该字段，不从 URL 推导安全源。
- 注销函数只移除注册时的精确包装监听器一次。注销前已经开始的异步响应仍会完成，
  但不会遗留新的监听器。

### 3. 浏览器检测

```typescript
import { detectBrowser, isFirefox } from '../shared/utils/browserDetection';

const browser = detectBrowser(); // 'firefox' | 'chrome' | 'edge' | ...
const isFF = isFirefox(); // boolean
```

## 🚀 构建和开发

### 开发环境

```bash
# Firefox 开发模式
npm run dev:firefox

# Firefox 构建
npm run build:firefox

# Firefox 快速构建（跳过检查）
npm run build:firefox:fast
```

### 安装测试

1. **Firefox 开发版安装**：

   ```bash
   # 构建 Firefox 版本
   npm run build:firefox

   # 打开 Firefox
   # 访问 about:debugging#/runtime/this-firefox
   # 点击 "临时载入附加组件"
   # 选择 build/dist/manifest.json
   ```

2. **Firefox 正式版安装**：
   - 需要签名的 .xpi 文件
   - 或使用 Firefox Developer Edition / Nightly

## 📦 打包与受保护发布

### 本地打包

```bash
# 构建 Firefox 版本并生成未签名 XPI
npm run package:firefox

# 对已生成的 isolated Firefox dist 单独运行同一个 bounded linter
npm run lint:firefox:addons
```

- 输出：`<扩展名>-v<版本号>.xpi`，位于仓库根目录，可用于开发者模式临时加载。
- 脚本会自动复制许可证文件，并复用 `manifest.firefox.json`。

### Mozilla AMO 受保护发布

本地脚本只构建、打包和验证无凭据工件。正式发布唯一入口是
`.github/workflows/release-firefox-amo.yml`：tag 事件固定使用 `listed`；手动事件必须提供
当前 `main` 的 exact `expected_sha`，并显式选择 `listed` 或 `unlisted`。

工作流先在无 Environment、无商店凭据的 `prepare` job 中完成同 SHA 的 CI provenance、
public GA config、isolated Firefox build、portable manifest、pinned geckodriver、exact-XPI smoke 和 immutable artifact
上传。受保护的 `submit` job 通过 `firefox-amo-release` Environment 审批后，在新 runner 上
重新安装锁定依赖，按 exact artifact ID/digest 下载并验证相同工件，再执行 fresh main/CI
reauthorization。AMO 凭据只在最后一个 `firefox-submit-v1` mutation step 可见，并由仓库自有的
AMO API v5 adapter 使用；prepare、verify 和 smoke 均不接收这些凭据。

- `listed` 使用零审核等待，成功意味着 AMO 已接受并进入审核流程。
- `unlisted` 使用有界等待，并要求唯一下载的 signed XPI 通过重新审计。
- upload、version submit 或 source patch 任一 mutation 开始后出现超时、连接丢失或未知响应，
  结果一律是 `unknown-submission-state`，不得 rerun job 或重试 CLI。owner 必须先在 AMO
  后台核对 exact add-on ID/version/channel，并记录 recovery decision。
- 只有 durable state 明确证明 mutation call count 为零的 pre-mutation failure，才允许通过新的、
  再次审批的手动 workflow run 重试；GitHub 的 Re-run jobs 永远不具备发布资格。
- Environment 只保存 AMO store credentials 和 reviewer policy；三项 `ZENDIO_GA_*` public
  build values 来自冻结的 repository/organization Variables。
- 已保存的 upload UUID 继续使用兼容路径 `store-state/firefox/web-ext-upload/upload-uuid.json`；
  这个目录名是历史状态格式，不表示运行时仍依赖 `web-ext`。

## 🎨 样式适配

### Firefox 特定样式

```css
/* Firefox 特定样式 */
.is-firefox {
  -moz-osx-font-smoothing: grayscale;
  scrollbar-width: thin;
}

.is-firefox-mobile {
  font-size: 18px;
}
```

### 样式加载

Firefox 特定样式会自动加载：

```typescript
// 自动添加浏览器类到 HTML
addBrowserClassToHtml(); // 添加 .is-firefox 类
```

## 🧪 测试

### 本地发布工件验证

正式 Firefox 发布候选不再把普通 `package:firefox:isolated` 输出直接当作发布证据。控制器会在私有 attempt 根内完成构建，然后依次运行：

```bash
node scripts/prepare-firefox-release.mjs \
  --attempt-root "$ATTEMPT_ROOT" \
  --config-mode standalone-synthetic \
  --transport-mode local-private-v1 \
  --dist-dir "$ATTEMPT_ROOT/dist-firefox" \
  --release-dir "$ATTEMPT_ROOT/release-root/release" \
  --result-json "$ATTEMPT_ROOT/prepare-result.json"

node scripts/verify-firefox-release.mjs \
  --manifest "$ATTEMPT_ROOT/release-root/release/manifest.json" \
  --transport-mode local-private-v1

node scripts/run-bounded-command.mjs \
  --profile firefox-geckodriver-provision-v1 -- \
  --output-dir "$ATTEMPT_ROOT/geckodriver"

node scripts/run-bounded-command.mjs \
  --profile firefox-smoke-v1 -- \
  --manifest "$ATTEMPT_ROOT/release-root/release/manifest.json" \
  --transport-mode local-private-v1 \
  --result-json "$ATTEMPT_ROOT/firefox-smoke-result.json"
```

portable manifest 将 exact XPI、AMO source archive、dist inventory、Git tree、工具链和公开 GA 配置指纹绑定在一起。`local-private-v1` 仅接受 0700 目录和 0600 文件；工作流下载后的验证必须显式选择 `github-artifact-v1`，且不得由路径或文件 mode 自动推断 transport。

exact-XPI smoke 使用固定版本和 SHA-256 的官方 geckodriver `0.37.1` 启动锁匹配的
Playwright Firefox，并通过 WebDriver BiDi 安装同一 XPI。门禁依次验证 install 返回的 Gecko
ID、geckodriver system-access context 中 AddonManager 的相同 ID / manifest version / active state、
uninstall、reinstall、再次 identity/state 验证，以及有界关闭和私有 profile 清理。system-access
只对当前私有 smoke session 开启，子进程环境不含 AMO 凭据。它不会把 unpacked source
directory 冒充 XPI 安装证据，也不会读取用户 Firefox profile、系统 Firefox 或默认浏览器缓存。
该阶段只做本地、无凭据验证；AMO submit、push 和 publish 不属于这个阶段。

本地 XPI 创建前先执行仓库自有的 manifest 与 release-surface 静态检查，包括 Firefox MV3
background、Gecko ID、最低版本、data-collection 声明、必需 background bundle 和 archive
inventory；随后由 `firefox-addons-lint-v1` 调用锁定的 `addons-linter 10.10.0`，固定
`--self-hosted --output=json --boring`。errors/command failure 阻断 package，warnings/notices 原样
可见。其 `image-size` 依赖通过 root `$image-size` override 指向 tracked、真实命名的
`@zendio/addons-linter-image-metadata-adapter 0.1.0`；adapter 不冒充上游补丁、不访问网络，binary
解析委托 `probe-image-size 7.4.0`，只保留 bounded SVG/CgBI compatibility。AMO validation 非成功、
超时或返回错误时仍不会进入 version/source mutation；不得用 audit suppression、warning 隐藏、
advisory 重分类或 caller-selected timeout/args 绕过任一层。

### 单元测试

```bash
# 运行 Firefox 特定测试
npm run verify:runtime && node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts tests/unit/platform/firefox

# 运行所有测试
npm test
```

### E2E 测试

```bash
# Firefox E2E 测试（需要安装 Firefox）
npm run test:e2e:browser:firefox
```

## 📝 开发注意事项

### 1. API 使用

**✅ 推荐做法**：

```typescript
// 使用平台服务
import { getPlatformServices } from '../platform/services';

const services = getPlatformServices();
await services.storage.sync.set({ key: 'value' });
```

**❌ 避免直接使用**：

```typescript
// 不要直接使用浏览器 API
chrome.storage.sync.set({ key: 'value' }); // 在 Firefox 中不可用
```

### 2. 错误处理

```typescript
import { isFirefox } from '../shared/utils/browserDetection';

try {
  if (isFirefox()) {
    // Firefox 特定逻辑
  } else {
    // Chrome 特定逻辑
  }
} catch (error) {
  console.error('Browser-specific error:', error);
}
```

### 3. 功能检测

```typescript
import { getBrowserCapabilities } from '../shared/utils/browserDetection';

const capabilities = getBrowserCapabilities();
if (capabilities.serviceWorker) {
  // 使用 Service Worker 功能
}
```

## 🐛 常见问题

### 1. 扩展无法加载

**问题**：Firefox 提示 "无法加载扩展"

**解决方案**：

- 检查 `manifest.firefox.json` 语法
- 确保 `browser_specific_settings.gecko.id` 已设置
- 检查最低版本要求 `strict_min_version`
- 本地发布前运行 `npm run package:firefox`；该命令会在生成 XPI 前验证最终
  `build/dist` 的 Firefox manifest/background/release-surface，运行 bounded addons-linter，再审计 XPI inventory
- 可对 isolated dist 运行 `npm run lint:firefox:addons`；本地 lint/package 成功不等于 AMO 商店提交成功

### 2. API 不可用

**问题**：某些 Chrome API 在 Firefox 中不存在

**解决方案**：

- 使用平台适配层
- 添加功能检测
- 提供回退方案

### 3. 样式显示异常

**问题**：Firefox 中样式与 Chrome 不一致

**解决方案**：

- 检查 CSS 前缀（`-moz-` vs `-webkit-`）
- 使用 Firefox 特定样式文件
- 测试不同 Firefox 版本

## 📊 兼容性矩阵

| 功能       | Chrome | Firefox | 状态 |
| ---------- | ------ | ------- | ---- |
| 基础剪藏   | ✅     | ✅      | 完成 |
| 右键菜单   | ✅     | ✅      | 完成 |
| 快捷键     | ✅     | ✅      | 完成 |
| 通知       | ✅     | ✅      | 完成 |
| 选项页面   | ✅     | ✅      | 完成 |
| 多语言     | ✅     | ✅      | 完成 |
| 视频模式   | ✅     | ✅      | 完成 |
| 阅读器模式 | ✅     | ✅      | 完成 |

## 🔄 更新和维护

### 版本同步

Firefox 版本与 Chrome 版本保持同步：

- 版本号相同
- 功能特性一致
- 同时发布更新

### 测试流程

1. Chrome 版本开发完成
2. 运行 Firefox 兼容性测试
3. 修复 Firefox 特定问题
4. 同时发布两个版本

## 📚 参考资源

- [Firefox WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Firefox WebDriver BiDi WebExtension module](https://firefox-source-docs.mozilla.org/remote/WebDriverBiDi/webExtension.html)
- [Mozilla geckodriver releases](https://github.com/mozilla/geckodriver/releases)
- [AMO Add-ons API v5](https://mozilla.github.io/addons-server/topics/api/addons.html)
- [Chrome Extension API](https://developer.chrome.com/docs/extensions/)
- [WebExtensions Polyfill](https://github.com/mozilla/webextension-polyfill)
- [Browser Compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_compatibility_for_manifest.json)

---

**维护者**：前端团队

**最后更新**：2026-08-26

**适用版本**：Zendio v0.2.0+

## Local release smoke with an existing Playwright browser

`firefox-prepare-v1`, `firefox-verify-v1`, and `firefox-smoke-v1` accept the existing
`PLAYWRIGHT_BROWSERS_PATH` input for a preverified, current-user-owned shared cache
in local `local-private-v1` runs. The admitted shared root is the OS account's
canonical default: `~/Library/Caches/ms-playwright` on macOS or
`~/.cache/ms-playwright` on Linux. Changing `HOME` for private test state does not
change that toolchain root. Arbitrary cache roots and CI/GitHub callers are rejected. Forwarded `HOME` and
`TMPDIR` must not target the shared cache or its descendants, including relative
paths and filesystem aliases. The ordinary account HOME may remain an ancestor
of the cache.

The command owner checks the locked Playwright packages and browser descriptor,
exact Firefox revision directory, empty `INSTALLATION_COMPLETE`, canonical owned
paths without group/other write access, and a native executable. It retains and
rechecks file identity and content hashes before execution. The smoke binds
Playwright's actual executable path to that input; the BiDi session must report the
locked Firefox version before any XPI installation. These checks consume a trusted,
previously verified local toolchain; they do not authenticate a downloaded browser
archive or substitute for real exact-XPI smoke evidence.

Browser binaries remain readonly inputs. The attempt root must be disjoint from
the shared cache in both containment directions. Fresh `home`, `tmp`, Firefox
profiles, output and result files remain inside the private attempt, and the npm
configuration files remain the attempt's exact empty private files. No browser
installation is performed by these consumers. The existing private
`<attempt>/playwright-browsers` route and CI installation receipts are unchanged;
protected artifact verification and signed submission keep their existing isolation.
Geckodriver continues to use the existing pinned provisioner and private attempt
location. Final acceptance still requires prepare, verify, and the actual packaged
XPI installation/bootstrap/uninstall/reinstall smoke.

## Release preparation directory and linter environment

The prepare workflow writes `<attempt>/release`; verification, exact-XPI smoke,
and artifact upload consume that same directory. The preparation owner requires
the `release` basename and preserves its existing no-replacement publication rules.

Public GA build settings remain available to the preparation process for artifact
identity validation. The linter command omits GA build settings without changing the parent environment.
It preserves the attempt root and npm configuration authority for the bounded command
profile, which validates those inputs before closing the child environment.
Ambient HTTP(S) proxies remain forbidden; this does not relax the generic command
execution policy or the protected signing/submission boundary.
