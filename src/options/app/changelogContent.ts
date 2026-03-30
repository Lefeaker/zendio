export function getChangelogByLanguage(language: string): string {
  const changelogs: Record<string, string> = {
    'zh-CN': `
      <h2>v0.2.0 - 2025-09-30</h2>
      <h3>✨ 新增功能</h3>
      <ul>
        <li><strong>双 URL 配置</strong>: 现在可以分别配置 HTTPS 和 HTTP 两个 URL
          <ul>
            <li>在选项页面添加了 <code>HTTPS URL</code> 和 <code>HTTP URL</code> 两个独立字段</li>
            <li>扩展会智能选择可用的连接方式</li>
            <li>向后兼容旧的 <code>baseUrl</code> 配置</li>
          </ul>
        </li>
      </ul>

      <h3>🔧 改进</h3>
      <ul>
        <li><strong>智能容错机制增强</strong>
          <ul>
            <li>优先使用用户配置的 HTTPS 和 HTTP URL</li>
            <li>自动在多个协议和端口之间切换</li>
            <li>详细的日志输出，方便调试</li>
          </ul>
        </li>
      </ul>

      <h3>📝 配置说明</h3>
      <p><strong>新的配置方式</strong>（推荐）:</p>
      <pre><code>HTTPS URL: https://127.0.0.1:27124/
HTTP URL:  http://127.0.0.1:27123/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <p><strong>旧的配置方式</strong>（仍然支持）:</p>
      <pre><code>Base URL:  https://127.0.0.1:27124/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <h3>🎯 使用建议</h3>
      <ul>
        <li>配置两个 URL（HTTPS 和 HTTP），让扩展自动选择可用的连接</li>
        <li>如果不确定端口，可以在 Obsidian 的 Local REST API 插件设置中查看</li>
        <li>通常 HTTPS 端口为 27124，HTTP 端口为 27123</li>
      </ul>

      <h3>📚 技术细节</h3>
      <ul>
        <li>修改了 <code>src/background/store.ts</code> 添加 <code>httpsUrl</code> 和 <code>httpUrl</code> 字段</li>
        <li>更新了 <code>src/options/index.html</code> 和 <code>src/options/index.ts</code> 配置页面</li>
        <li>增强了 <code>src/background/sinks/obsidianRest.ts</code> 的容错逻辑</li>
        <li>改进了 <code>src/background/index.ts</code> 的连接测试功能</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-09-26</h2>
      <h3>🎉 初始版本</h3>
      <ul>
        <li>基本的网页剪藏功能</li>
        <li>Obsidian Local REST API 集成</li>
        <li>模板系统</li>
        <li>AI 分类器支持</li>
        <li>多平台 AI 聊天记录导出（ChatGPT、Claude、Gemini 等）</li>
        <li>域名映射配置</li>
        <li>多语言支持（中文、英文、日文）</li>
      </ul>
    `,
    en: `
      <h2>v0.2.0 - 2025-09-30</h2>
      <h3>✨ New Features</h3>
      <ul>
        <li><strong>Dual URL Configuration</strong>: Now you can configure HTTPS and HTTP URLs separately
          <ul>
            <li>Added separate <code>HTTPS URL</code> and <code>HTTP URL</code> fields in options page</li>
            <li>Extension intelligently chooses available connection method</li>
            <li>Backward compatible with old <code>baseUrl</code> configuration</li>
          </ul>
        </li>
      </ul>

      <h3>🔧 Improvements</h3>
      <ul>
        <li><strong>Enhanced Smart Fallback Mechanism</strong>
          <ul>
            <li>Prioritize user-configured HTTPS and HTTP URLs</li>
            <li>Automatically switch between multiple protocols and ports</li>
            <li>Detailed logging output for easier debugging</li>
          </ul>
        </li>
      </ul>

      <h3>📝 Configuration Guide</h3>
      <p><strong>New Configuration Method</strong> (Recommended):</p>
      <pre><code>HTTPS URL: https://127.0.0.1:27124/
HTTP URL:  http://127.0.0.1:27123/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <p><strong>Old Configuration Method</strong> (Still Supported):</p>
      <pre><code>Base URL:  https://127.0.0.1:27124/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <h3>🎯 Usage Recommendations</h3>
      <ul>
        <li>Configure both URLs (HTTPS and HTTP) to let the extension automatically choose available connection</li>
        <li>If unsure about ports, check in Obsidian's Local REST API plugin settings</li>
        <li>Usually HTTPS port is 27124, HTTP port is 27123</li>
      </ul>

      <h3>📚 Technical Details</h3>
      <ul>
        <li>Modified <code>src/background/store.ts</code> to add <code>httpsUrl</code> and <code>httpUrl</code> fields</li>
        <li>Updated <code>src/options/index.html</code> and <code>src/options/index.ts</code> configuration pages</li>
        <li>Enhanced fallback logic in <code>src/background/sinks/obsidianRest.ts</code></li>
        <li>Improved connection testing functionality in <code>src/background/index.ts</code></li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-09-26</h2>
      <h3>🎉 Initial Release</h3>
      <ul>
        <li>Basic web clipping functionality</li>
        <li>Obsidian Local REST API integration</li>
        <li>Template system</li>
        <li>AI classifier support</li>
        <li>Multi-platform AI chat export (ChatGPT, Claude, Gemini, etc.)</li>
        <li>Domain mapping configuration</li>
        <li>Multi-language support (Chinese, English, Japanese)</li>
      </ul>
    `,
    ja: `
      <h2>v0.2.0 - 2025-09-30</h2>
      <h3>✨ 新機能</h3>
      <ul>
        <li><strong>デュアルURL設定</strong>: HTTPSとHTTPのURLを個別に設定可能
          <ul>
            <li>オプションページに<code>HTTPS URL</code>と<code>HTTP URL</code>の独立したフィールドを追加</li>
            <li>拡張機能が利用可能な接続方法を自動選択</li>
            <li>従来の<code>baseUrl</code>設定との後方互換性</li>
          </ul>
        </li>
      </ul>

      <h3>🔧 改善</h3>
      <ul>
        <li><strong>スマートフォールバック機能の強化</strong>
          <ul>
            <li>ユーザー設定のHTTPSおよびHTTP URLを優先</li>
            <li>複数のプロトコルとポート間で自動切り替え</li>
            <li>デバッグしやすい詳細なログ出力</li>
          </ul>
        </li>
      </ul>

      <h3>📝 設定ガイド</h3>
      <p><strong>新しい設定方法</strong>（推奨）:</p>
      <pre><code>HTTPS URL: https://127.0.0.1:27124/
HTTP URL:  http://127.0.0.1:27123/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <p><strong>従来の設定方法</strong>（引き続きサポート）:</p>
      <pre><code>Base URL:  https://127.0.0.1:27124/
Vault:     your-vault-name
API Key:   your-api-key</code></pre>

      <h3>🎯 使用推奨事項</h3>
      <ul>
        <li>両方のURL（HTTPSとHTTP）を設定して、拡張機能が利用可能な接続を自動選択できるようにする</li>
        <li>ポートが不明な場合は、ObsidianのLocal REST APIプラグイン設定で確認</li>
        <li>通常、HTTPSポートは27124、HTTPポートは27123</li>
      </ul>

      <h3>📚 技術詳細</h3>
      <ul>
        <li><code>src/background/store.ts</code>を修正して<code>httpsUrl</code>と<code>httpUrl</code>フィールドを追加</li>
        <li><code>src/options/index.html</code>と<code>src/options/index.ts</code>設定ページを更新</li>
        <li><code>src/background/sinks/obsidianRest.ts</code>のフォールバックロジックを強化</li>
        <li><code>src/background/index.ts</code>の接続テスト機能を改善</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-09-26</h2>
      <h3>🎉 初回リリース</h3>
      <ul>
        <li>基本的なウェブクリッピング機能</li>
        <li>Obsidian Local REST API統合</li>
        <li>テンプレートシステム</li>
        <li>AI分類器サポート</li>
        <li>マルチプラットフォームAIチャットエクスポート（ChatGPT、Claude、Geminiなど）</li>
        <li>ドメインマッピング設定</li>
        <li>多言語サポート（中国語、英語、日本語）</li>
      </ul>
    `
  };

  return changelogs[language] || changelogs['zh-CN'];
}
