export function getChangelogByLanguage(language: string): string {
  const changelogs: Record<string, string> = {
    'zh-CN': `
      <h2>v0.2.1 - 2026-06-29</h2>
      <p>正值毕业，兵荒马乱相伴。</p>
      <h3>✨ 主要更新</h3>
      <ul>
        <li>AI 对话导出稳定性增强。</li>
        <li>加固了 AI 对话页面的导出识别能力，降低导出失败、内容缺失或角色判断错误的概率。</li>
        <li>AI 对话范围识别更可靠，页面标签、角色标记或候选内容变化时，更不容易导出错内容。</li>
        <li>选项页中的 AI 平台支持列表会跟随实际导出能力同步更新，避免支持状态与实际导出能力不一致。</li>
        <li>优化了部分性能表现，并完善了 Chrome 与 Firefox 发布前检查。</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.2.0 - 2026-06-10</h2>
      <h3>✨ 主要更新</h3>
      <ul>
        <li><strong>新版设置中心</strong>: 重构选项页，集中管理使用概览、界面语言、隐私数据、存储、采集、输出和维护工具。</li>
        <li><strong>多 Vault 与智能路由</strong>: 支持配置多个 Obsidian 仓库，并按域名、关键词或 URL Pattern 自动选择目标仓库。</li>
        <li><strong>更可靠的 Obsidian 写入</strong>: 支持 HTTPS / HTTP 双连接、连接测试和 REST API 回退。</li>
        <li><strong>Chrome 本地路径写入</strong>: Chrome / Chromium 浏览器授权本地 Vault 文件夹后，可按模板路径直接写入本地目录，权限缺失或写入失败时自动回退 REST API。</li>
        <li><strong>面板路径自由选择</strong>: 剪藏、阅读和视频面板可切换保存目标并预览输出路径，支持在 Vault、本地目录或下载路径之间选择。</li>
        <li><strong>片段剪藏与阅读模式增强</strong>: 新增上下文捕捉、脚注格式、快捷键、高亮主题和阅读导出方式配置。</li>
        <li><strong>视频笔记</strong>: 支持 YouTube / 哔哩哔哩时间点记录、字幕或评论片段捕捉，以及批注编辑。</li>
        <li><strong>AI 对话导出扩展</strong>: 支持 ChatGPT、Claude、Gemini、Copilot、通义、DeepSeek、Kimi、豆包、Monica、Perplexity 等平台。</li>
        <li><strong>结构化输出</strong>: 新增 YAML 配置、路径模板、域名映射、配置迁移和诊断修复工具。</li>
        <li><strong>多语言界面</strong>: 正式支持 12 种界面语言，并覆盖新版设置页主要入口。</li>
      </ul>

      <h3>🔧 使用建议</h3>
      <ul>
        <li>先在 Storage 中配置默认仓库，再按需要添加附加仓库和路由规则。</li>
        <li>Chrome / Chromium 浏览器可选本地 Vault 文件夹写入；Firefox 继续使用 REST API 路径。</li>
        <li>AI 页面总结、阅读顶部总结和字幕翻译仍在规划中，本版本不作为已发布能力开放。</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-10-13</h2>
      <h3>🎉 初始版本</h3>
      <ul>
        <li>网页剪藏基础能力上线</li>
        <li>Obsidian Local REST API 集成</li>
        <li>基础路径模板和域名映射</li>
        <li>AI 分类器支持</li>
        <li>AI 对话导出起步支持</li>
        <li>多语言界面起步支持</li>
      </ul>
    `,
    en: `
      <h2>v0.2.1 - 2026-06-29</h2>
      <p>Graduation arrived with deadline chaos alongside it.</p>
      <h3>✨ Highlights</h3>
      <ul>
        <li>AI chat export stability has been improved.</li>
        <li>AI chat page detection is stronger, reducing export failures, missing content, and incorrect role detection.</li>
        <li>Conversation-scope detection is more reliable when page labels, role markers, or candidate content change, so exports are less likely to capture the wrong content.</li>
        <li>The AI platform support list in Options now follows actual export capability, avoiding mismatches between displayed support and real behavior.</li>
        <li>Some performance behavior was optimized, and Chrome / Firefox pre-release checks were completed.</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.2.0 - 2026-06-10</h2>
      <h3>✨ Highlights</h3>
      <ul>
        <li><strong>New settings center</strong>: Rebuilt Options around overview, language, privacy, storage, capture, output, and maintenance workflows.</li>
        <li><strong>Multi-vault routing</strong>: Configure multiple Obsidian vaults and route by domain, keyword, or URL pattern.</li>
        <li><strong>More reliable Obsidian writes</strong>: Added HTTPS / HTTP dual endpoints, connection tests, and REST API fallback.</li>
        <li><strong>Chrome local path writes</strong>: Chromium browsers can write directly into an authorized Local Vault folder using configured path templates, with REST fallback when permission or writing fails.</li>
        <li><strong>Panel path choices</strong>: Clipper, Reader, and Video panels can switch save targets and preview output paths across Vault, local-folder, and download destinations.</li>
        <li><strong>Fragment and reading upgrades</strong>: Configure context capture, footnote format, shortcuts, highlight themes, and reading export modes.</li>
        <li><strong>Video notes</strong>: Capture YouTube / Bilibili timestamps, subtitle or comment fragments, and editable notes.</li>
        <li><strong>Expanded AI chat export</strong>: Supports ChatGPT, Claude, Gemini, Copilot, Tongyi, DeepSeek, Kimi, Doubao, Monica, Perplexity, and more.</li>
        <li><strong>Structured output</strong>: Added YAML configuration, path templates, domain mappings, configuration transfer, and diagnostics/repair tools.</li>
        <li><strong>Multilingual UI</strong>: Officially supports 12 interface languages across the main Options flows.</li>
      </ul>

      <h3>🔧 Notes</h3>
      <ul>
        <li>Configure the default vault first, then add extra vaults and routing rules as needed.</li>
        <li>Chrome / Chromium browsers can use optional Local Vault folder writes; Firefox continues to use the REST API path.</li>
        <li>Page summary, reading overlay summary, and subtitle translation remain planned features and are not shipped as active v0.2.0 capabilities.</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-10-13</h2>
      <h3>🎉 Initial Release</h3>
      <ul>
        <li>Initial web clipping workflow</li>
        <li>Obsidian Local REST API integration</li>
        <li>Basic path templates and domain mappings</li>
        <li>AI classifier support</li>
        <li>Early AI chat export support</li>
        <li>Early multilingual UI support</li>
      </ul>
    `,
    ja: `
      <h2>v0.2.1 - 2026-06-29</h2>
      <p>卒業の時期を迎え、慌ただしさも一緒にやってきました。</p>
      <h3>✨ 主な更新</h3>
      <ul>
        <li>AI チャット出力の安定性を強化しました。</li>
        <li>AI チャットページの出力検出を強化し、出力失敗、内容欠落、ロール判定ミスの可能性を下げました。</li>
        <li>ページラベル、ロールマーカー、候補コンテンツが変わっても、会話範囲をより正確に認識し、誤った内容を出力しにくくしました。</li>
        <li>Options の AI プラットフォーム対応一覧は実際の出力機能と同期し、表示上の対応状況と実際の動作の不一致を避けます。</li>
        <li>一部のパフォーマンスを最適化し、Chrome / Firefox のリリース前チェックを整えました。</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.2.0 - 2026-06-10</h2>
      <h3>✨ 主な更新</h3>
      <ul>
        <li><strong>新しい設定センター</strong>: 概要、言語、プライバシー、保存先、キャプチャ、出力、メンテナンスをまとめて管理できます。</li>
        <li><strong>複数 Vault ルーティング</strong>: 複数の Obsidian Vault を設定し、ドメイン、キーワード、URL Pattern で保存先を自動選択できます。</li>
        <li><strong>Obsidian 書き込みの信頼性向上</strong>: HTTPS / HTTP の二系統接続、接続テスト、REST API フォールバックに対応しました。</li>
        <li><strong>Chrome ローカルパス書き込み</strong>: Chromium ブラウザーでは、許可したローカル Vault フォルダーへテンプレートパスに沿って直接書き込み、権限不足や失敗時は REST API に戻ります。</li>
        <li><strong>パネル内の保存先選択</strong>: Clipper、Reader、Video パネルで保存先と出力パスを切り替え、Vault、ローカルフォルダー、ダウンロード先を選べます。</li>
        <li><strong>フラグメントと読書モードの強化</strong>: コンテキスト取得、脚注形式、ショートカット、ハイライトテーマ、読書エクスポート方式を設定できます。</li>
        <li><strong>動画ノート</strong>: YouTube / Bilibili のタイムスタンプ、字幕やコメントの断片、編集可能なメモを保存できます。</li>
        <li><strong>AI チャット出力の拡張</strong>: ChatGPT、Claude、Gemini、Copilot、Tongyi、DeepSeek、Kimi、Doubao、Monica、Perplexity などに対応しました。</li>
        <li><strong>構造化出力</strong>: YAML 設定、パステンプレート、ドメインマッピング、設定移行、診断と修復ツールを追加しました。</li>
        <li><strong>多言語 UI</strong>: 主要な Options フローで 12 種類のインターフェース言語を正式サポートしました。</li>
      </ul>

      <h3>🔧 補足</h3>
      <ul>
        <li>まずデフォルト Vault を設定し、必要に応じて追加 Vault とルーティングルールを追加してください。</li>
        <li>Chromium ブラウザーでは任意のローカル Vault フォルダー書き込みを利用できます。Firefox は引き続き REST API 経由で保存します。</li>
        <li>ページ要約、読書オーバーレイ要約、字幕翻訳は計画中の機能であり、v0.2.0 の有効な公開機能ではありません。</li>
      </ul>

      <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

      <h2>v0.1.0 - 2025-10-13</h2>
      <h3>🎉 初回リリース</h3>
      <ul>
        <li>基本的なウェブクリッピング機能を公開</li>
        <li>Obsidian Local REST API統合</li>
        <li>基本的なパステンプレートとドメインマッピング</li>
        <li>AI分類器サポート</li>
        <li>AIチャット出力の初期対応</li>
        <li>多言語 UI の初期対応</li>
      </ul>
    `
  };

  return language === 'zh-CN' ? changelogs['zh-CN'] : changelogs[language] || changelogs.en;
}
