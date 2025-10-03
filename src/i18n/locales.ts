/**
 * Internationalization (i18n) - Language definitions
 */

export type Language = 'zh-CN' | 'en' | 'ja';

export interface Messages {
  // General
  extensionName: string;
  extensionSubtitle: string;
  
  // Settings page sections
  settingsTitle: string;
  languageSettings: string;
  languageLabel: string;
  languageHint: string;
  
  // API Configuration
  apiConfigTitle: string;
  apiConfigHint: string;
  httpsUrlLabel: string;
  httpsUrlHint: string;
  httpUrlLabel: string;
  httpUrlHint: string;
  vaultNameLabel: string;
  vaultNamePlaceholder: string;
  vaultNameHint: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  apiKeyHint: string;
  
  // Template Configuration
  templateConfigTitle: string;
  articleTemplateLabel: string;
  articleTemplateHint: string;
  fragmentTemplateLabel: string;
  fragmentTemplateHint: string;
  aiTemplateLabel: string;
  aiTemplateHint: string;
  availableVariables: string;
  
  // Domain Mapping
  domainMappingTitle: string;
  domainMappingHint: string;
  domainLabel: string;
  folderNameLabel: string;
  addMappingButton: string;
  
  // Config Transfer
  configTransferTitle: string;
  configTransferHint: string;
  copyConfigButton: string;
  importConfigButton: string;
  configTransferNote: string;
  copyConfigSuccess: string;
  importSuccess: string;
  importParseFailed: string;
  emptyImportError: string;
  clipboardUnavailable: string;
  clipboardReadUnavailable: string;
  invalidTaxonomy: string;
  
  // AI Chat Configuration
  aiChatConfigTitle: string;
  aiChatConfigHint: string;
  includeTimestampsLabel: string;
  includeTimestampsHint: string;
  userNameLabel: string;
  userNamePlaceholder: string;
  userNameHint: string;
  
  // Deep Research Configuration
  deepResearchConfigTitle: string;
  deepResearchConfigHint: string;
  pureModeLabel: string;
  pureModeHint: string;
  multipleReportsInfo: string;
  
  // Classifier Configuration
  classifierConfigTitle: string;
  classifierConfigHint: string;
  enableClassifierLabel: string;
  providerLabel: string;
  endpointLabel: string;
  endpointPlaceholder: string;
  modelLabel: string;
  modelPlaceholder: string;
  taxonomyLabel: string;
  taxonomyHint: string;
  
  // Buttons
  saveButton: string;
  diagnoseButton: string;
  fixButton: string;
  reloadButton: string;
  testConnectionButton: string;

  // Messages
  saveSuccess: string;
  saveFailed: string;
  configFixed: string;
  fixFailed: string;
  reloadPrompt: string;
  connectionTesting: string;

  // Diagnosis
  diagnosisTitle: string;
  
  // Notifications
  clipSuccess: string;
  clipFailed: string;
  extractionFailed: string;
  connectionFailed: string;
  scriptInjectionFailed: string;
  
  // Context Menu
  clipFullPage: string;
  clipSelection: string;

  // Dialog
  clipDialogTitle: string;
  commentLabel: string;
  commentPlaceholder: string;
  cancelButton: string;
  clipButton: string;

  // Multi-Vault
  additionalVaultsTitle: string;
  additionalVaultsHint: string;
  addVaultButton: string;
  multiVaultNameLabel: string;
  multiVaultNamePlaceholder: string;
  deleteVaultButton: string;
  defaultVaultBadge: string;

  // Routing Rules
  routingRulesTitle: string;
  routingRulesHint: string;
  addRuleButton: string;
  ruleTypeLabel: string;
  ruleTypeDomain: string;
  ruleTypeKeyword: string;
  ruleTypeUrlPattern: string;
  rulePatternLabel: string;
  rulePatternPlaceholder: string;
  ruleTargetVaultLabel: string;
  rulePriorityLabel: string;
  ruleDescriptionLabel: string;
  ruleDescriptionPlaceholder: string;
  ruleEnabledLabel: string;
  deleteRuleButton: string;
  editRuleButton: string;
}

export const messages: Record<Language, Messages> = {
  'zh-CN': {
    // General
    extensionName: 'All in Obsidian',
    extensionSubtitle: '配置你的剪藏插件，让内容管理更智能',
    
    // Settings page sections
    settingsTitle: '设置',
    languageSettings: '语言设置',
    languageLabel: '界面语言',
    languageHint: '💡 选择你喜欢的界面语言',
    
    // API Configuration
    apiConfigTitle: 'Obsidian Local REST API',
    apiConfigHint: '💡 配置 HTTPS 和 HTTP 两个 URL，扩展会智能选择可用的连接方式',
    httpsUrlLabel: 'HTTPS URL',
    httpsUrlHint: '通常端口为 27124，适用于安全连接',
    httpUrlLabel: 'HTTP URL',
    httpUrlHint: '通常端口为 27123，作为备用连接',
    vaultNameLabel: 'Vault 名称',
    vaultNamePlaceholder: 'YourVault',
    vaultNameHint: '你的 Obsidian 仓库名称',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: '你的 API 密钥',
    apiKeyHint: '在 Obsidian Local REST API 插件设置中获取',
    
    // Template Configuration
    templateConfigTitle: '路径模板配置',
    articleTemplateLabel: '文章路径模板',
    articleTemplateHint: '用于完整的网页文章剪藏',
    fragmentTemplateLabel: '片段路径模板',
    fragmentTemplateHint: '用于选中文本片段的快速剪藏',
    aiTemplateLabel: 'AI 对话路径模板',
    aiTemplateHint: '用于 AI 聊天对话的剪藏',
    availableVariables: '可用变量：',
    
    // Domain Mapping
    domainMappingTitle: '域名映射配置',
    domainMappingHint: '💡 为特定域名自定义文件夹名称',
    domainLabel: '域名',
    folderNameLabel: '文件夹名称',
    addMappingButton: '+ 添加映射',
    
    // Config Transfer
    configTransferTitle: '配置同步',
    configTransferHint: '💡 一键复制与导入，跨浏览器同步更轻松',
    copyConfigButton: '复制配置',
    importConfigButton: '导入并保存',
    configTransferNote: '操作会使用系统剪贴板，请确认浏览器已授权访问后再继续。',
    copyConfigSuccess: '✅ 配置已复制到剪贴板',
    importSuccess: '✅ 配置已导入并保存',
    importParseFailed: '❌ 配置解析失败',
    emptyImportError: '剪贴板为空，请先复制配置',
    clipboardUnavailable: '无法访问剪贴板，请手动复制',
    clipboardReadUnavailable: '无法读取剪贴板，请在浏览器设置中授予权限后重试',
    invalidTaxonomy: '分类器 Taxonomy 不是有效的 JSON',
    
    // AI Chat Configuration
    aiChatConfigTitle: 'AI 对话剪藏配置',
    aiChatConfigHint: '💡 自定义 AI 对话的剪藏格式和内容',
    includeTimestampsLabel: '包含消息时间戳',
    includeTimestampsHint: '在每条消息后显示发送时间（如果可用）',
    userNameLabel: '用户名称',
    userNamePlaceholder: 'USER',
    userNameHint: '自定义用户消息的显示名称，默认为 "USER"',
    
    // Deep Research Configuration
    deepResearchConfigTitle: 'Gemini Deep Research 配置',
    deepResearchConfigHint: '💡 自定义 Deep Research 报告的捕捉方式',
    pureModeLabel: '提纯模式（只捕捉报告内容）',
    pureModeHint: '启用后，只捕捉 Deep Research 报告内容，不包含对话消息',
    multipleReportsInfo: 'ℹ️ 关于多个报告: Gemini 一次只能显示一个完整报告。如需保存多个报告，请分别打开每个报告并点击剪藏。',
    
    // Classifier Configuration
    classifierConfigTitle: '智能分类配置（可选）',
    classifierConfigHint: '💡 使用 LLM 自动分类和标记剪藏内容',
    enableClassifierLabel: '启用智能分类',
    providerLabel: 'LLM 提供商',
    endpointLabel: 'API 端点',
    endpointPlaceholder: 'http://localhost:11434/api/chat',
    modelLabel: '模型名称',
    modelPlaceholder: 'llama3.1',
    taxonomyLabel: '分类体系',
    taxonomyHint: '定义分类体系，JSON 格式',
    
    // Buttons
    saveButton: '💾 保存配置',
    diagnoseButton: '🔍 诊断配置',
    fixButton: '🔧 修复配置',
    reloadButton: '🔄 重新加载',
    testConnectionButton: '⚡ 测试连接',
    
    // Messages
    saveSuccess: '✅ 配置已保存',
    saveFailed: '❌ 保存失败',
    configFixed: '✅ 配置已修复并保存',
    fixFailed: '❌ 修复失败',
    reloadPrompt: '请重新加载页面查看修复后的配置',
    connectionTesting: '正在测试连接...',
    
    // Diagnosis
    diagnosisTitle: '配置诊断',
    
    // Notifications
    clipSuccess: '已保存到 Obsidian',
    clipFailed: '剪藏失败',
    extractionFailed: '内容提取失败',
    connectionFailed: '连接失败',
    scriptInjectionFailed: '无法注入内容脚本',
    
    // Context Menu
    clipFullPage: '剪藏整个页面到 Obsidian',
    clipSelection: '✂️ 剪藏选中内容到 Obsidian',
    
    // Dialog
    clipDialogTitle: '📎 剪藏选中内容',
    commentLabel: '💭 添加你的评论（可选）：',
    commentPlaceholder: '在这里写下你的想法、笔记或评论...',
    cancelButton: '取消',
    clipButton: '✂️ 剪藏',

    // Multi-Vault
    additionalVaultsTitle: '额外仓库',
    additionalVaultsHint: '💡 添加更多仓库，通过路由规则自动分配内容',
    addVaultButton: '+ 添加仓库',
    multiVaultNameLabel: '仓库名称',
    multiVaultNamePlaceholder: '我的笔记仓库',
    deleteVaultButton: '删除',
    defaultVaultBadge: '默认仓库',

    // Routing Rules
    routingRulesTitle: '路由规则',
    routingRulesHint: '💡 根据域名、关键词或 URL 模式自动选择目标仓库',
    addRuleButton: '+ 添加规则',
    ruleTypeLabel: '规则类型',
    ruleTypeDomain: '域名匹配',
    ruleTypeKeyword: '关键词匹配',
    ruleTypeUrlPattern: 'URL 模式',
    rulePatternLabel: '匹配模式',
    rulePatternPlaceholder: '例如：example.com 或 关键词1,关键词2',
    ruleTargetVaultLabel: '目标仓库',
    rulePriorityLabel: '优先级',
    ruleDescriptionLabel: '规则描述',
    ruleDescriptionPlaceholder: '例如：技术文章保存到工作仓库',
    ruleEnabledLabel: '启用',
    deleteRuleButton: '删除',
    editRuleButton: '编辑',
  },
  
  'en': {
    // General
    extensionName: 'All in Obsidian',
    extensionSubtitle: 'Configure your clipper for smarter content management',
    
    // Settings page sections
    settingsTitle: 'Settings',
    languageSettings: 'Language Settings',
    languageLabel: 'Interface Language',
    languageHint: '💡 Choose your preferred interface language',
    
    // API Configuration
    apiConfigTitle: 'Obsidian Local REST API',
    apiConfigHint: '💡 Configure both HTTPS and HTTP URLs, the extension will intelligently choose the available connection',
    httpsUrlLabel: 'HTTPS URL',
    httpsUrlHint: 'Usually port 27124, for secure connections',
    httpUrlLabel: 'HTTP URL',
    httpUrlHint: 'Usually port 27123, as fallback connection',
    vaultNameLabel: 'Vault Name',
    vaultNamePlaceholder: 'YourVault',
    vaultNameHint: 'Your Obsidian vault name',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'Your API key',
    apiKeyHint: 'Get it from Obsidian Local REST API plugin settings',
    
    // Template Configuration
    templateConfigTitle: 'Path Template Configuration',
    articleTemplateLabel: 'Article Path Template',
    articleTemplateHint: 'For full webpage article clipping',
    fragmentTemplateLabel: 'Fragment Path Template',
    fragmentTemplateHint: 'For quick clipping of selected text fragments',
    aiTemplateLabel: 'AI Chat Path Template',
    aiTemplateHint: 'For AI chat conversation clipping',
    availableVariables: 'Available variables:',
    
    // Domain Mapping
    domainMappingTitle: 'Domain Mapping Configuration',
    domainMappingHint: '💡 Customize folder names for specific domains',
    domainLabel: 'Domain',
    folderNameLabel: 'Folder Name',
    addMappingButton: '+ Add Mapping',
    
    // Config Transfer
    configTransferTitle: 'Configuration Sync',
    configTransferHint: '💡 Copy once and import anywhere to keep browsers in sync.',
    copyConfigButton: 'Copy configuration',
    importConfigButton: 'Import from clipboard',
    configTransferNote: 'These actions use the system clipboard—ensure the browser is allowed to access it.',
    copyConfigSuccess: '✅ Configuration copied to clipboard',
    importSuccess: '✅ Configuration imported and saved',
    importParseFailed: '❌ Failed to parse configuration',
    emptyImportError: 'Clipboard is empty, please copy a configuration first',
    clipboardUnavailable: 'Clipboard unavailable, please copy manually',
    clipboardReadUnavailable: 'Unable to read the clipboard. Grant clipboard permissions and try again.',
    invalidTaxonomy: 'Classifier taxonomy must be valid JSON',
    
    // AI Chat Configuration
    aiChatConfigTitle: 'AI Chat Clipping Configuration',
    aiChatConfigHint: '💡 Customize the format and content of AI chat clips',
    includeTimestampsLabel: 'Include message timestamps',
    includeTimestampsHint: 'Show send time after each message (if available)',
    userNameLabel: 'User Name',
    userNamePlaceholder: 'USER',
    userNameHint: 'Customize the display name for user messages, default is "USER"',
    
    // Deep Research Configuration
    deepResearchConfigTitle: 'Gemini Deep Research Configuration',
    deepResearchConfigHint: '💡 Customize how Deep Research reports are captured',
    pureModeLabel: 'Pure Mode (capture report content only)',
    pureModeHint: 'When enabled, only capture Deep Research report content, excluding conversation messages',
    multipleReportsInfo: 'ℹ️ About multiple reports: Gemini can only display one complete report at a time. To save multiple reports, open each report separately and clip them.',
    
    // Classifier Configuration
    classifierConfigTitle: 'Smart Classification Configuration (Optional)',
    classifierConfigHint: '💡 Use LLM to automatically classify and tag clipped content',
    enableClassifierLabel: 'Enable Smart Classification',
    providerLabel: 'LLM Provider',
    endpointLabel: 'API Endpoint',
    endpointPlaceholder: 'http://localhost:11434/api/chat',
    modelLabel: 'Model Name',
    modelPlaceholder: 'llama3.1',
    taxonomyLabel: 'Taxonomy',
    taxonomyHint: 'Define classification taxonomy in JSON format',
    
    // Buttons
    saveButton: '💾 Save Configuration',
    diagnoseButton: '🔍 Diagnose Configuration',
    fixButton: '🔧 Fix Configuration',
    reloadButton: '🔄 Reload',
    testConnectionButton: '⚡ Test Connection',
    
    // Messages
    saveSuccess: '✅ Configuration saved',
    saveFailed: '❌ Save failed',
    configFixed: '✅ Configuration fixed and saved',
    fixFailed: '❌ Fix failed',
    reloadPrompt: 'Please reload the page to see the fixed configuration',
    connectionTesting: 'Testing connection...',
    
    // Diagnosis
    diagnosisTitle: 'Configuration Diagnosis',
    
    // Notifications
    clipSuccess: 'Saved to Obsidian',
    clipFailed: 'Clip failed',
    extractionFailed: 'Content extraction failed',
    connectionFailed: 'Connection failed',
    scriptInjectionFailed: 'Failed to inject content script',
    
    // Context Menu
    clipFullPage: 'Clip full page to Obsidian',
    clipSelection: '✂️ Clip selection to Obsidian',
    
    // Dialog
    clipDialogTitle: '📎 Clip Selection',
    commentLabel: '💭 Add your comment (optional):',
    commentPlaceholder: 'Write your thoughts, notes or comments here...',
    cancelButton: 'Cancel',
    clipButton: '✂️ Clip',

    // Multi-Vault
    additionalVaultsTitle: 'Additional Vaults',
    additionalVaultsHint: '💡 Add more vaults and automatically route content using rules',
    addVaultButton: '+ Add Vault',
    multiVaultNameLabel: 'Vault Name',
    multiVaultNamePlaceholder: 'My Notes Vault',
    deleteVaultButton: 'Delete',
    defaultVaultBadge: 'Default Vault',

    // Routing Rules
    routingRulesTitle: 'Routing Rules',
    routingRulesHint: '💡 Automatically select target vault based on domain, keywords, or URL patterns',
    addRuleButton: '+ Add Rule',
    ruleTypeLabel: 'Rule Type',
    ruleTypeDomain: 'Domain Match',
    ruleTypeKeyword: 'Keyword Match',
    ruleTypeUrlPattern: 'URL Pattern',
    rulePatternLabel: 'Match Pattern',
    rulePatternPlaceholder: 'e.g., example.com or keyword1,keyword2',
    ruleTargetVaultLabel: 'Target Vault',
    rulePriorityLabel: 'Priority',
    ruleDescriptionLabel: 'Description',
    ruleDescriptionPlaceholder: 'e.g., Save tech articles to work vault',
    ruleEnabledLabel: 'Enabled',
    deleteRuleButton: 'Delete',
    editRuleButton: 'Edit',
  },
  
  'ja': {
    // General
    extensionName: 'All in Obsidian',
    extensionSubtitle: 'クリッパーを設定して、よりスマートなコンテンツ管理を実現',
    
    // Settings page sections
    settingsTitle: '設定',
    languageSettings: '言語設定',
    languageLabel: 'インターフェース言語',
    languageHint: '💡 お好みのインターフェース言語を選択してください',
    
    // API Configuration
    apiConfigTitle: 'Obsidian Local REST API',
    apiConfigHint: '💡 HTTPS と HTTP の両方の URL を設定すると、拡張機能が利用可能な接続を自動的に選択します',
    httpsUrlLabel: 'HTTPS URL',
    httpsUrlHint: '通常はポート 27124、セキュア接続用',
    httpUrlLabel: 'HTTP URL',
    httpUrlHint: '通常はポート 27123、フォールバック接続用',
    vaultNameLabel: 'Vault 名',
    vaultNamePlaceholder: 'YourVault',
    vaultNameHint: 'Obsidian の Vault 名',
    apiKeyLabel: 'API キー',
    apiKeyPlaceholder: 'API キー',
    apiKeyHint: 'Obsidian Local REST API プラグインの設定から取得',
    
    // Template Configuration
    templateConfigTitle: 'パステンプレート設定',
    articleTemplateLabel: '記事パステンプレート',
    articleTemplateHint: '完全なウェブページ記事のクリッピング用',
    fragmentTemplateLabel: 'フラグメントパステンプレート',
    fragmentTemplateHint: '選択したテキストフラグメントの高速クリッピング用',
    aiTemplateLabel: 'AI チャットパステンプレート',
    aiTemplateHint: 'AI チャット会話のクリッピング用',
    availableVariables: '利用可能な変数：',
    
    // Domain Mapping
    domainMappingTitle: 'ドメインマッピング設定',
    domainMappingHint: '💡 特定のドメインのフォルダ名をカスタマイズ',
    domainLabel: 'ドメイン',
    folderNameLabel: 'フォルダ名',
    addMappingButton: '+ マッピングを追加',
    
    // Config Transfer
    configTransferTitle: '設定の同期',
    configTransferHint: '💡 一度コピーすれば、どのブラウザでもすぐに同期できます。',
    copyConfigButton: '設定をコピー',
    importConfigButton: 'クリップボードから保存',
    configTransferNote: '操作ではシステムのクリップボードを使用します。ブラウザに権限が付与されているか確認してください。',
    copyConfigSuccess: '✅ 設定をクリップボードにコピーしました',
    importSuccess: '✅ 設定をインポートして保存しました',
    importParseFailed: '❌ 設定の解析に失敗しました',
    emptyImportError: 'クリップボードが空です。先に設定をコピーしてください',
    clipboardUnavailable: 'クリップボードにアクセスできません。手動でコピーしてください',
    clipboardReadUnavailable: 'クリップボードを読み取れません。ブラウザで権限を許可してから再試行してください',
    invalidTaxonomy: '分類器のタクソノミーは有効な JSON である必要があります',
    
    // AI Chat Configuration
    aiChatConfigTitle: 'AI チャットクリップ設定',
    aiChatConfigHint: '💡 AI チャットクリップの形式と内容をカスタマイズ',
    includeTimestampsLabel: 'メッセージのタイムスタンプを含める',
    includeTimestampsHint: '各メッセージの後に送信時刻を表示（利用可能な場合）',
    userNameLabel: 'ユーザー名',
    userNamePlaceholder: 'USER',
    userNameHint: 'ユーザーメッセージの表示名をカスタマイズ、デフォルトは "USER"',
    
    // Deep Research Configuration
    deepResearchConfigTitle: 'Gemini Deep Research 設定',
    deepResearchConfigHint: '💡 Deep Research レポートのキャプチャ方法をカスタマイズ',
    pureModeLabel: 'ピュアモード（レポート内容のみキャプチャ）',
    pureModeHint: '有効にすると、Deep Research レポートの内容のみをキャプチャし、会話メッセージは含めません',
    multipleReportsInfo: 'ℹ️ 複数のレポートについて: Gemini は一度に 1 つの完全なレポートのみを表示できます。複数のレポートを保存するには、各レポートを個別に開いてクリップしてください。',
    
    // Classifier Configuration
    classifierConfigTitle: 'スマート分類設定（オプション）',
    classifierConfigHint: '💡 LLM を使用してクリップされたコンテンツを自動的に分類およびタグ付け',
    enableClassifierLabel: 'スマート分類を有効にする',
    providerLabel: 'LLM プロバイダー',
    endpointLabel: 'API エンドポイント',
    endpointPlaceholder: 'http://localhost:11434/api/chat',
    modelLabel: 'モデル名',
    modelPlaceholder: 'llama3.1',
    taxonomyLabel: '分類体系',
    taxonomyHint: 'JSON 形式で分類体系を定義',
    
    // Buttons
    saveButton: '💾 設定を保存',
    diagnoseButton: '🔍 設定を診断',
    fixButton: '🔧 設定を修復',
    reloadButton: '🔄 再読み込み',
    testConnectionButton: '⚡ 接続テスト',
    
    // Messages
    saveSuccess: '✅ 設定が保存されました',
    saveFailed: '❌ 保存に失敗しました',
    configFixed: '✅ 設定が修復され保存されました',
    fixFailed: '❌ 修復に失敗しました',
    reloadPrompt: '修復された設定を確認するにはページを再読み込みしてください',
    connectionTesting: '接続をテストしています...',
    
    // Diagnosis
    diagnosisTitle: '設定診断',
    
    // Notifications
    clipSuccess: 'Obsidian に保存されました',
    clipFailed: 'クリップに失敗しました',
    extractionFailed: 'コンテンツの抽出に失敗しました',
    connectionFailed: '接続に失敗しました',
    scriptInjectionFailed: 'コンテンツスクリプトの注入に失敗しました',
    
    // Context Menu
    clipFullPage: 'ページ全体を Obsidian にクリップ',
    clipSelection: '✂️ 選択範囲を Obsidian にクリップ',
    
    // Dialog
    clipDialogTitle: '📎 選択範囲をクリップ',
    commentLabel: '💭 コメントを追加（オプション）：',
    commentPlaceholder: 'ここに考え、メモ、コメントを書いてください...',
    cancelButton: 'キャンセル',
    clipButton: '✂️ クリップ',

    // Multi-Vault
    additionalVaultsTitle: '追加 Vault',
    additionalVaultsHint: '💡 さらに Vault を追加し、ルールに基づいて自動的にコンテンツを振り分け',
    addVaultButton: '+ Vault を追加',
    multiVaultNameLabel: 'Vault 名',
    multiVaultNamePlaceholder: 'マイノート Vault',
    deleteVaultButton: '削除',
    defaultVaultBadge: 'デフォルト Vault',

    // Routing Rules
    routingRulesTitle: 'ルーティングルール',
    routingRulesHint: '💡 ドメイン、キーワード、または URL パターンに基づいて自動的にターゲット Vault を選択',
    addRuleButton: '+ ルールを追加',
    ruleTypeLabel: 'ルールタイプ',
    ruleTypeDomain: 'ドメインマッチ',
    ruleTypeKeyword: 'キーワードマッチ',
    ruleTypeUrlPattern: 'URL パターン',
    rulePatternLabel: 'マッチパターン',
    rulePatternPlaceholder: '例：example.com または キーワード1,キーワード2',
    ruleTargetVaultLabel: 'ターゲット Vault',
    rulePriorityLabel: '優先度',
    ruleDescriptionLabel: '説明',
    ruleDescriptionPlaceholder: '例：技術記事を仕事用 Vault に保存',
    ruleEnabledLabel: '有効',
    deleteRuleButton: '削除',
    editRuleButton: '編集',
  },
};
