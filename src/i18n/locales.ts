/**
 * Internationalization (i18n) - Language definitions
 */

export type Language = 'zh-CN' | 'en' | 'ja';

export interface Messages {
  // General
  extensionName: string;
  extensionSubtitle: string;
  
  // Usage dashboard
  usageDashboardTitle: string;
  usageDashboardSubtitle: string;
  usageTotalLabel: string;
  usageAiLabel: string;
  usageFragmentLabel: string;
  usageArticleLabel: string;
  
  // Settings page sections
  settingsTitle: string;
  languageSettings: string;
  languageLabel: string;
  languageHint: string;
  featureUnstableNote: string;
  featureUntestedNote: string;
  
  // API Configuration
  apiConfigTitle: string;
  apiConfigHint: string;
  httpsUrlLabel: string;
  httpsUrlHint: string;
  additionalVaultHttpsHint: string;
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
  readingTemplateLabel: string;
  readingTemplateHint: string;
  readingTemplateOptionArticle: string;
  readingTemplateOptionFragment: string;
  readingTemplateOptionCustom: string;
  aiTemplateLabel: string;
  aiTemplateHint: string;
  availableVariables: string;
  
  // Domain Mapping
  domainMappingTitle: string;
  domainMappingHint: string;
  domainLabel: string;
  folderNameLabel: string;
  addMappingButton: string;
  domainMappingDomainPlaceholder: string;
  domainMappingNamePlaceholder: string;
  domainMappingDeleteButton: string;
  
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
  aiSupportedPlatformsToggle: string;
  includeTimestampsLabel: string;
  includeTimestampsHint: string;
  userNameLabel: string;
  userNamePlaceholder: string;
  userNameHint: string;
  captureContextLabel: string;
  
  // Deep Research Configuration
  deepResearchConfigTitle: string;
  deepResearchConfigHint: string;
  pureModeLabel: string;
  pureModeHint: string;
  multipleReportsInfo: string;

  // Reading Config
  readingConfigTitle: string;
  readingConfigHint: string;
  readingExportModeLabel: string;
  readingExportModeHighlights: string;
  readingExportModeFull: string;
  readingExportModeDescription: string;
  readingHighlightThemeLabel: string;
  readingHighlightThemeDescription: string;
  readingHighlightThemeGradient: string;
  readingHighlightThemePurple: string;
  readingHighlightThemeNeonYellow: string;
  readingHighlightThemeNeonGreen: string;
  readingHighlightThemeNeonOrange: string;

  // Fragment Capture Config
  fragmentConfigHint: string;
  fragmentModifierToggleLabel: string;
  fragmentModifierToggleDescription: string;
  fragmentModifierKeysLabel: string;
  fragmentModifierKeysDescription: string;
  fragmentModifierKeyAlt: string;
  fragmentModifierKeyMeta: string;
  fragmentModifierKeyCtrl: string;
  fragmentModifierKeyShift: string;
  
  // Classifier Configuration
  classifierConfigTitle: string;
  classifierConfigHint: string;
  enableClassifierLabel: string;
  classifierUnstableNotice: string;
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
  portConflictDetected: string;

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
  readerStart: string;

  // Reader Mode
  readerPanelTitle: string;
  readerPanelStatus: string;
  readerPanelHint: string;
  readerPanelFinish: string;
  readerPanelCancel: string;
  readerPanelCounter: string;
  readerPanelCounterZero: string;
  readerHighlightEditLabel: string;
  readerHighlightDeleteLabel: string;
  readerHighlightNoComment: string;
  readerHighlightSaveLabel: string;
  readerHighlightCancelLabel: string;
  readerHighlightEditPlaceholder: string;
  readerHighlightFocusLabel: string;
  readerHintNoHighlights: string;
  readerHintExporting: string;
  readerHintFailure: string;
  readerHintSelectionFailure: string;

  // Video Mode
  contextMenuVideoMode: string;
  videoPanelTitle: string;
  videoPanelStatus: string;
  videoPanelHint: string;
  videoPanelAdd: string;
  videoPanelFinish: string;
  videoPanelCancel: string;
  videoPanelCounter: string;
  videoPanelCounterZero: string;
  videoConfigTitle: string;
  videoConfigHint: string;
  videoFloatingPromptLabel: string;
  videoFloatingPromptHint: string;
  videoTimestampSectionTitle: string;
  videoFragmentSectionTitle: string;
  videoCaptureEditLabel: string;
  videoCaptureDeleteLabel: string;
  videoCaptureNoComment: string;
  videoCaptureSaveLabel: string;
  videoCaptureCancelLabel: string;
  videoCaptureEditPlaceholder: string;
  videoCaptureFocusLabel: string;
  videoHintNoVideo: string;
  videoHintReady: string;
  videoHintNoCaptures: string;
  videoHintSaving: string;
  videoHintExporting: string;
  videoHintFailure: string;
  clipSelectionVideo: string;
  videoPromptTitle: string;
  videoPromptDescription: string;
  videoPromptAction: string;

  // Dialog
  clipDialogTitle: string;
  commentLabel: string;
  commentPlaceholder: string;
  cancelButton: string;
  clipButton: string;
  openReaderButton: string;
  addToReaderButton: string;

  // Multi-Vault
  additionalVaultsTitle: string;
  additionalVaultsHint: string;
  addVaultButton: string;
  multiVaultNameLabel: string;
  multiVaultNamePlaceholder: string;
  multiVaultNameHint: string;
  deleteVaultButton: string;
  deleteVaultConfirm: string;
  defaultVaultBadge: string;
  deleteVaultDialogTitle: string;

  // Routing Rules
  routingRulesTitle: string;
  routingRulesHint: string;
  vaultRulesTitle: string;
  ruleEmptyPlaceholder: string;
  addRuleButton: string;
  ruleTypeLabel: string;
  ruleTypeDomain: string;
  ruleTypeKeyword: string;
  ruleTypeUrlPattern: string;
  rulePatternLabel: string;
  rulePatternPlaceholder: string;
  ruleTargetVaultLabel: string;
  rulePriorityLabel: string;
  rulePriorityHint: string;
  ruleDescriptionLabel: string;
  ruleDescriptionPlaceholder: string;
  ruleDescriptionHint: string;
  ruleEnabledLabel: string;
  deleteRuleButton: string;
  ruleDeleteConfirm: string;
  ruleNoVaultOption: string;
  ruleAddVaultPrompt: string;
  editRuleButton: string;
  deleteRuleDialogTitle: string;

  // Dialog Helpers
  infoDialogTitle: string;
  infoDialogConfirm: string;
}

export const messages: Record<Language, Messages> = {
  'zh-CN': {
    // General
    extensionName: 'All in Ob',
    extensionSubtitle: '配置你的剪藏插件，让内容管理更智能',
    
    // Usage dashboard
    usageDashboardTitle: '使用统计看板',
    usageDashboardSubtitle: '实时了解不同类型的剪藏次数',
    usageTotalLabel: '总计保存',
    usageAiLabel: 'AI 对话',
    usageFragmentLabel: '碎片 + 阅读',
    usageArticleLabel: '文章',
    
    // Settings page sections
    settingsTitle: '设置',
    languageSettings: '语言设置',
    languageLabel: '界面语言',
    languageHint: '选择你喜欢的界面语言',
    featureUnstableNote: '功能尚不稳定',
    featureUntestedNote: '功能未测试，暂不稳定',
    
    // API Configuration
    apiConfigTitle: 'Obsidian Local REST API',
    apiConfigHint: '这是默认仓库，不符合路由规则的内容将保存到这里',
    httpsUrlLabel: 'HTTPS URL',
    httpsUrlHint: '通常端口为 27124，适用于安全连接',
    additionalVaultHttpsHint: '请勿与其他仓库相同',
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
    fragmentTemplateHint: '用于选中文本片段与快捷剪藏',
    readingTemplateLabel: '阅读模式路径模板',
    readingTemplateHint: '配置阅读模式导出的保存路径',
    readingTemplateOptionArticle: '与文章路径相同',
    readingTemplateOptionFragment: '与片段路径相同',
    readingTemplateOptionCustom: '自定义',
    aiTemplateLabel: 'AI 对话路径模板',
    aiTemplateHint: '用于 AI 聊天对话的剪藏',
    availableVariables: '可用变量：',
    
    // Domain Mapping
    domainMappingTitle: '域名映射配置',
    domainMappingHint: '将常用站点映射为更友好的名称，例如将 mp.weixin.qq.com 映射为 “公众号”',
    domainLabel: '域名',
    folderNameLabel: '文件夹名称',
    addMappingButton: '+ 添加映射',
    domainMappingDomainPlaceholder: '例如: mp.weixin.qq.com',
    domainMappingNamePlaceholder: '例如: 公众号',
    domainMappingDeleteButton: '删除',
    
    // Config Transfer
    configTransferTitle: '配置同步',
    configTransferHint: '一键复制与导入，跨浏览器同步更轻松',
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
    aiChatConfigHint: '自定义 AI 对话的剪藏格式和内容',
    aiSupportedPlatformsToggle: '查看适配AI平台',
    includeTimestampsLabel: '包含消息时间戳',
    includeTimestampsHint: '在每条消息后显示发送时间（如果可用）',
    userNameLabel: '用户名称',
    userNamePlaceholder: 'USER',
    userNameHint: '自定义用户消息的显示名称，默认为 "USER"',
    captureContextLabel: '捕捉上下文（该功能尚不稳定）',
    
    // Deep Research Configuration
    deepResearchConfigTitle: 'Gemini Deep Research 配置',
    deepResearchConfigHint: '自定义 Deep Research 报告的捕捉方式',
    pureModeLabel: '提纯模式（只捕捉报告内容）',
    pureModeHint: '启用后，只捕捉 Deep Research 报告内容，不包含对话消息',
    multipleReportsInfo: 'ℹ️ 关于多个报告: Gemini 一次只能显示一个完整报告。如需保存多个报告，请分别打开每个报告并点击剪藏。',

    readingConfigTitle: '阅读模式',
    readingConfigHint: '选择导出阅读模式时保存的内容形式',
    readingExportModeLabel: '导出内容',
   readingExportModeHighlights: '仅保存高亮片段',
   readingExportModeFull: '保存全文并标注高亮',
   readingExportModeDescription: '选择“全文”时，会同时保存经过清洗的原文，并在全文中保留你的高亮与脚注。',
    readingHighlightThemeLabel: '高亮颜色',
    readingHighlightThemeDescription: '仅影响阅读模式页面的高亮背景，不会改变导出的 Markdown 内容。',
    readingHighlightThemeGradient: '渐变紫蓝（默认）',
    readingHighlightThemePurple: '纯紫色',
    readingHighlightThemeNeonYellow: '荧光黄',
    readingHighlightThemeNeonGreen: '荧光绿',
    readingHighlightThemeNeonOrange: '荧光橙',

    fragmentConfigHint: '自定义选中文本剪藏的格式和行为',
    fragmentModifierToggleLabel: '启用辅助键触发剪藏/阅读',
    fragmentModifierToggleDescription: '按住所选的辅助键并拖动鼠标选择文本时，将自动打开剪藏窗口或阅读模式高亮。',
    fragmentModifierKeysLabel: '辅助键设置',
    fragmentModifierKeysDescription: '需要同时按下所有勾选的辅助键才会触发自动操作。',
    fragmentModifierKeyAlt: 'Option / Alt',
    fragmentModifierKeyMeta: 'Command',
    fragmentModifierKeyCtrl: 'Control',
    fragmentModifierKeyShift: 'Shift',

    // Classifier Configuration
    classifierConfigTitle: 'AI辅助分类与总结',
    classifierConfigHint: '使用 LLM 自动分类和标记剪藏内容',
    enableClassifierLabel: '启用智能分类',
    classifierUnstableNotice: '⚠️ 该部分功能尚不稳定，启用后可能影响剪藏速度',
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
    portConflictDetected: '⚠️ 检测到端口冲突：{ports}。请在 Obsidian 中为每个仓库配置不同的端口后再试一次。',
    
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
    clipSelection: '剪藏选中内容到 Obsidian',
    readerStart: '🖍️ 开启阅读高亮模式',
    contextMenuVideoMode: '🎬 进入视频捕捉模式',

    // Reader Mode
    readerPanelTitle: '阅读高亮中',
    readerPanelStatus: '选中内容后即可添加批注',
    readerPanelHint: '提示：松开鼠标后会弹出批注面板，可留空直接保存高亮。',
    readerPanelFinish: '完成并导出',
    readerPanelCancel: '取消',
    readerPanelCounter: '已收集 {count} 条高亮',
    readerPanelCounterZero: '已收集 0 条高亮',
    readerHighlightEditLabel: '修改批注',
    readerHighlightDeleteLabel: '删除高亮',
    readerHighlightNoComment: '暂无批注',
    readerHighlightSaveLabel: '保存批注',
    readerHighlightCancelLabel: '取消',
    readerHighlightEditPlaceholder: '在这里编辑批注...',
    readerHighlightFocusLabel: '滚动到第 {index} 条高亮',
    readerHintNoHighlights: '还没有高亮内容，先选中文本试试。',
    readerHintExporting: '正在生成 Markdown...',
    readerHintFailure: '导出失败，请稍后重试。',
    readerHintSelectionFailure: '高亮失败，请重试。',

    // Video Mode
    videoPanelTitle: '视频片段捕捉',
    videoPanelStatus: '记录时间点与文本片段',
    videoPanelHint: '提示：选中文本会自动保存到面板；按 Enter 两次保存批注，Esc 取消编辑。',
    videoPanelAdd: '捕捉当前时间点',
    videoPanelFinish: '完成并导出',
    videoPanelCancel: '退出',
    videoPanelCounter: '已保存 {count} 条记录',
    videoPanelCounterZero: '已保存 0 条记录',
    videoConfigTitle: '视频模式',
    videoConfigHint: '可在视频网站自动提示进入视频笔记模式',
    videoFloatingPromptLabel: '在视频网站显示浮动提示按钮',
    videoFloatingPromptHint: '支持 YouTube 与哔哩哔哩，默认在右下角显示提醒，点击即可开启视频模式。',
    videoTimestampSectionTitle: '视频时间点',
    videoFragmentSectionTitle: '文本摘录',
    videoCaptureEditLabel: '编辑备注',
    videoCaptureDeleteLabel: '删除时间点',
    videoCaptureNoComment: '暂无备注',
    videoCaptureSaveLabel: '保存备注',
    videoCaptureCancelLabel: '取消',
    videoCaptureEditPlaceholder: '为这个时间点补充备注...',
    videoCaptureFocusLabel: '定位到第 {index} 条记录',
    videoHintNoVideo: '等待视频加载中...',
    videoHintReady: '点击 + 保存当前时间点，备注会自动保存。',
    videoHintNoCaptures: '还没有保存记录，先点一下左上角的 + 试试。',
    videoHintSaving: '正在保存...',
    videoHintExporting: '正在生成 Markdown...',
    videoHintFailure: '操作失败，请稍后重试。',
    clipSelectionVideo: '剪藏到片段捕捉',
    videoPromptTitle: '可开启视频模式',
    videoPromptDescription: '点击开启视频模式，记录当前视频时间点和笔记。',
    videoPromptAction: '开启视频模式',

    // Dialog
    clipDialogTitle: '剪藏选中内容',
    commentLabel: '添加评论（可选）',
    commentPlaceholder: '在这里写下你的想法、笔记或评论...',
    cancelButton: '取消',
    clipButton: '剪藏',
    openReaderButton: '进入阅读模式',
    addToReaderButton: '保存到阅读模式',

    // Multi-Vault
    additionalVaultsTitle: '额外仓库',
    additionalVaultsHint: '添加更多仓库，通过路由规则自动分配内容',
    addVaultButton: '+ 添加仓库',
    multiVaultNameLabel: '仓库名称',
    multiVaultNamePlaceholder: '我的笔记仓库',
    multiVaultNameHint: '用于识别此仓库的友好名称',
    deleteVaultButton: '删除',
    deleteVaultConfirm: '确定要删除这个仓库吗？相关的路由规则也会被删除。',
    defaultVaultBadge: '默认仓库',
    deleteVaultDialogTitle: '删除仓库',
    deleteRuleDialogTitle: '删除规则',
    infoDialogTitle: '提示',
    infoDialogConfirm: '好的',

    // Routing Rules
    routingRulesTitle: '路由规则',
    routingRulesHint: '根据域名、关键词或 URL 模式自动选择目标仓库。不符合任何规则的内容将保存到默认仓库',
    vaultRulesTitle: '路由规则',
    ruleEmptyPlaceholder: '暂无规则，点击右侧按钮为该仓库添加规则',
    addRuleButton: '+ 添加规则',
    ruleTypeLabel: '规则类型',
    ruleTypeDomain: '域名匹配',
    ruleTypeKeyword: '关键词匹配',
    ruleTypeUrlPattern: 'URL 模式',
    rulePatternLabel: '匹配模式',
    rulePatternPlaceholder: '例如：example.com;news.example.com 或 关键词1,关键词2',
    ruleTargetVaultLabel: '目标仓库',
    rulePriorityLabel: '优先级',
    rulePriorityHint: '数字越大优先级越高',
    ruleDescriptionLabel: '规则描述',
    ruleDescriptionPlaceholder: '例如：技术文章保存到工作仓库',
    ruleDescriptionHint: '帮助你记住这个规则的用途',
    ruleEnabledLabel: '启用',
    deleteRuleButton: '删除',
    ruleDeleteConfirm: '确定要删除这个规则吗？',
    ruleNoVaultOption: '请先添加额外仓库',
    ruleAddVaultPrompt: '请先添加额外仓库',
    editRuleButton: '编辑',
  },
  
  'en': {
    // General
    extensionName: 'All in Ob',
    extensionSubtitle: 'Configure your clipper for smarter content management',
    
    // Usage dashboard
    usageDashboardTitle: 'Usage Overview',
    usageDashboardSubtitle: 'See how often each type of clip is saved',
    usageTotalLabel: 'Total Saves',
    usageAiLabel: 'AI Conversations',
    usageFragmentLabel: 'Fragments + Reader',
    usageArticleLabel: 'Articles',
    
    // Settings page sections
    settingsTitle: 'Settings',
    languageSettings: 'Language Settings',
    languageLabel: 'Interface Language',
    languageHint: 'Choose your preferred interface language',
    featureUnstableNote: 'Feature is unstable',
    featureUntestedNote: 'Not yet tested, may be unstable',
    
    // API Configuration
    apiConfigTitle: 'Obsidian Local REST API',
    apiConfigHint: 'This is the default vault; anything outside the routing rules will fall back here.',
    httpsUrlLabel: 'HTTPS URL',
    httpsUrlHint: 'Usually port 27124, for secure connections',
    additionalVaultHttpsHint: 'Use a unique port; do not share with other vaults',
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
    fragmentTemplateHint: 'For quick clipping via selection or the clipper panel',
    readingTemplateLabel: 'Reading Mode Path Template',
    readingTemplateHint: 'Choose where reading-mode exports should be saved',
    readingTemplateOptionArticle: 'Same as article path',
    readingTemplateOptionFragment: 'Same as fragment path',
    readingTemplateOptionCustom: 'Custom path',
    aiTemplateLabel: 'AI Chat Path Template',
    aiTemplateHint: 'For AI chat conversation clipping',
    availableVariables: 'Available variables:',
    
    // Domain Mapping
    domainMappingTitle: 'Domain Mapping Configuration',
    domainMappingHint: 'Customize friendly folder names for frequent domains (for example, map medium.com to "Medium")',
    domainLabel: 'Domain',
    folderNameLabel: 'Folder Name',
    addMappingButton: '+ Add Mapping',
    domainMappingDomainPlaceholder: 'e.g., medium.com',
    domainMappingNamePlaceholder: 'e.g., Medium',
    domainMappingDeleteButton: 'Remove',
    
    // Config Transfer
    configTransferTitle: 'Configuration Sync',
    configTransferHint: 'Copy once and import anywhere to keep browsers in sync.',
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
    aiChatConfigHint: 'Customize the format and content of AI chat clips',
    aiSupportedPlatformsToggle: 'View supported AI platforms',
    includeTimestampsLabel: 'Include message timestamps',
    includeTimestampsHint: 'Show send time after each message (if available)',
    userNameLabel: 'User Name',
    userNamePlaceholder: 'USER',
    userNameHint: 'Customize the display name for user messages, default is "USER"',
    captureContextLabel: 'Capture surrounding context (experimental)',
    
    // Deep Research Configuration
    deepResearchConfigTitle: 'Gemini Deep Research Configuration',
    deepResearchConfigHint: 'Customize how Deep Research reports are captured',
    pureModeLabel: 'Pure Mode (capture report content only)',
    pureModeHint: 'When enabled, only capture Deep Research report content, excluding conversation messages',
    multipleReportsInfo: 'ℹ️ About multiple reports: Gemini can only display one complete report at a time. To save multiple reports, open each report separately and clip them.',

    readingConfigTitle: 'Reading Mode',
    readingConfigHint: 'Choose how the reading session export should capture content',
    readingExportModeLabel: 'Export content',
    readingExportModeHighlights: 'Only highlighted passages',
    readingExportModeFull: 'Full article with highlights',
    readingExportModeDescription: 'When selecting “Full article”, the cleaned article body is saved with your highlights and footnotes embedded.',
    readingHighlightThemeLabel: 'Highlight color',
    readingHighlightThemeDescription: 'Only affects highlight styling inside reader mode; exported Markdown stays unchanged.',
    readingHighlightThemeGradient: 'Purple–blue gradient (default)',
    readingHighlightThemePurple: 'Solid purple',
    readingHighlightThemeNeonYellow: 'Neon yellow',
    readingHighlightThemeNeonGreen: 'Neon green',
    readingHighlightThemeNeonOrange: 'Neon orange',

    fragmentConfigHint: 'Customize how text selections are clipped and formatted',
    fragmentModifierToggleLabel: 'Enable modifier key trigger for clipping/reading',
    fragmentModifierToggleDescription: 'When you hold the chosen modifier keys and drag to select text, the clipper dialog or reading highlight will open automatically.',
    fragmentModifierKeysLabel: 'Modifier key selection',
    fragmentModifierKeysDescription: 'All checked modifier keys must be held down together to trigger the automatic action.',
    fragmentModifierKeyAlt: 'Option / Alt',
    fragmentModifierKeyMeta: 'Command',
    fragmentModifierKeyCtrl: 'Control',
    fragmentModifierKeyShift: 'Shift',

    // Classifier Configuration
    classifierConfigTitle: 'AI-assisted Classification & Summaries',
    classifierConfigHint: 'Use an LLM to automatically classify and summarize clipped content',
    enableClassifierLabel: 'Enable Smart Classification',
    classifierUnstableNotice: '⚠️ This classifier feature is experimental and may be unstable.',
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
    portConflictDetected: '⚠️ Port conflict detected: {ports}. Please assign unique ports in Obsidian before trying again.',
    
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
    clipSelection: 'Clip selection to Obsidian',
    readerStart: '🖍️ Start inline reading capture',
    contextMenuVideoMode: '🎬 Enter video capture mode',

    // Reader Mode
    readerPanelTitle: 'Reading session active',
    readerPanelStatus: 'Select text to highlight and annotate',
    readerPanelHint: 'Tip: release the mouse to open the annotation dialog; leave it blank to save highlight only.',
    readerPanelFinish: 'Finish & export',
    readerPanelCancel: 'Cancel',
    readerPanelCounter: 'Collected {count} highlights',
    readerPanelCounterZero: 'Collected 0 highlights',
    readerHighlightEditLabel: 'Edit note',
    readerHighlightDeleteLabel: 'Remove highlight',
    readerHighlightNoComment: 'No note yet',
    readerHighlightSaveLabel: 'Save note',
    readerHighlightCancelLabel: 'Cancel',
    readerHighlightEditPlaceholder: 'Edit the note here...',
    readerHighlightFocusLabel: 'Jump to highlight {index}',
    readerHintNoHighlights: 'No highlights yet. Select some text first.',
    readerHintExporting: 'Generating Markdown...',
    readerHintFailure: 'Export failed, please try again later.',
    readerHintSelectionFailure: 'Failed to highlight, please try again.',

    // Video Mode
    videoPanelTitle: 'Video capture mode',
    videoPanelStatus: 'Capture timestamps and quick notes',
    videoPanelHint: 'Tip: Selecting text adds it automatically; press Enter twice to save notes, Esc to cancel.',
    videoPanelAdd: 'Capture current timestamp',
    videoPanelFinish: 'Finish & export',
    videoPanelCancel: 'Cancel',
    videoPanelCounter: 'Saved {count} entries',
    videoPanelCounterZero: 'Saved 0 entries',
    videoConfigTitle: 'Video mode',
    videoConfigHint: 'Show prompts on supported video sites to capture timestamps and notes',
    videoFloatingPromptLabel: 'Display floating prompt on video pages',
    videoFloatingPromptHint: 'Works on YouTube and Bilibili. A shortcut bubble appears in the lower-right corner.',
    videoTimestampSectionTitle: 'Video timestamps',
    videoFragmentSectionTitle: 'Captured fragments',
    videoCaptureEditLabel: 'Edit note',
    videoCaptureDeleteLabel: 'Remove capture',
    videoCaptureNoComment: 'No note yet',
    videoCaptureSaveLabel: 'Save note',
    videoCaptureCancelLabel: 'Cancel',
    videoCaptureEditPlaceholder: 'Add a note for this timestamp...',
    videoCaptureFocusLabel: 'Jump to capture {index}',
    videoHintNoVideo: 'Waiting for video element to be ready...',
    videoHintReady: 'Click + to capture current timestamp. Notes are saved automatically.',
    videoHintNoCaptures: 'No captures yet. Start by clicking the + button.',
    videoHintSaving: 'Saving capture...',
    videoHintExporting: 'Generating Markdown export...',
    videoHintFailure: 'Something went wrong. Please try again.',
    clipSelectionVideo: 'Clip to video capture panel',
    videoPromptTitle: 'Video mode available',
    videoPromptDescription: 'Click to launch video mode and start saving timestamps and notes.',
    videoPromptAction: 'Start video mode',

    // Dialog
    clipDialogTitle: 'Clip Selection',
    commentLabel: 'Add a comment (optional)',
    commentPlaceholder: 'Write your thoughts, notes or comments here...',
    cancelButton: 'Cancel',
    clipButton: 'Clip',
    openReaderButton: 'Enter reading mode',
    addToReaderButton: 'Add to reading session',

    // Multi-Vault
    additionalVaultsTitle: 'Additional Vaults',
    additionalVaultsHint: 'Add more vaults and automatically route content using rules.',
    addVaultButton: '+ Add Vault',
    multiVaultNameLabel: 'Vault Name',
    multiVaultNamePlaceholder: 'My Notes Vault',
    multiVaultNameHint: 'Friendly name to identify this vault',
    deleteVaultButton: 'Delete',
    deleteVaultConfirm: 'Delete this vault? Related routing rules will also be removed.',
    defaultVaultBadge: 'Default Vault',
    deleteVaultDialogTitle: 'Remove Vault',
    deleteRuleDialogTitle: 'Remove Rule',
    infoDialogTitle: 'Notice',
    infoDialogConfirm: 'Got it',

    // Routing Rules
    routingRulesTitle: 'Routing Rules',
    routingRulesHint: 'Automatically choose a target vault by domain, keywords, or URL patterns. Items that do not match go to the default vault.',
    vaultRulesTitle: 'Routing Rules',
    ruleEmptyPlaceholder: 'No rules yet. Add one to route clips into this vault.',
    addRuleButton: '+ Add Rule',
    ruleTypeLabel: 'Rule Type',
    ruleTypeDomain: 'Domain Match',
    ruleTypeKeyword: 'Keyword Match',
    ruleTypeUrlPattern: 'URL Pattern',
    rulePatternLabel: 'Match Pattern',
    rulePatternPlaceholder: 'e.g., example.com;news.example.com or keyword1,keyword2',
    ruleTargetVaultLabel: 'Target Vault',
    rulePriorityLabel: 'Priority',
    rulePriorityHint: 'Higher numbers indicate higher priority.',
    ruleDescriptionLabel: 'Description',
    ruleDescriptionPlaceholder: 'e.g., Save tech articles to work vault',
    ruleDescriptionHint: 'Helps you remember what this rule is for.',
    ruleEnabledLabel: 'Enabled',
    deleteRuleButton: 'Delete',
    ruleDeleteConfirm: 'Delete this rule?',
    ruleNoVaultOption: 'Add an additional vault first',
    ruleAddVaultPrompt: 'Please add an additional vault first.',
    editRuleButton: 'Edit',
  },
  
  'ja': {
    // General
    extensionName: 'All in Ob',
    extensionSubtitle: 'クリッパーを設定して、よりスマートなコンテンツ管理を実現',
    
    // Usage dashboard
    usageDashboardTitle: '利用状況ダッシュボード',
    usageDashboardSubtitle: 'クリップ種別ごとの保存回数をひと目で確認',
    usageTotalLabel: '保存合計',
    usageAiLabel: 'AI 会話',
    usageFragmentLabel: 'フラグメント + リーダー',
    usageArticleLabel: '記事',
    
    // Settings page sections
    settingsTitle: '設定',
    languageSettings: '言語設定',
    languageLabel: 'インターフェース言語',
    languageHint: 'お好みのインターフェース言語を選択してください',
    featureUnstableNote: '機能はまだ安定していません',
    featureUntestedNote: '未テストの機能で、不安定な場合があります',
    
    // API Configuration
    apiConfigTitle: 'Obsidian Local REST API',
    apiConfigHint: 'ここは既定の Vault です。ルーティングルールに一致しないクリップはすべてここに保存されます。',
    httpsUrlLabel: 'HTTPS URL',
    httpsUrlHint: '通常はポート 27124、セキュア接続用',
    additionalVaultHttpsHint: '他の Vault と同じポートを使用しないでください',
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
    fragmentTemplateHint: '選択範囲やクリッパーパネルでの保存に使用',
    readingTemplateLabel: '読書モードパステンプレート',
    readingTemplateHint: '読書モードで保存するファイルの保存先を設定',
    readingTemplateOptionArticle: '記事テンプレートと同じ',
    readingTemplateOptionFragment: 'フラグメントテンプレートと同じ',
    readingTemplateOptionCustom: 'カスタム',
    aiTemplateLabel: 'AI チャットパステンプレート',
    aiTemplateHint: 'AI チャット会話のクリッピング用',
    availableVariables: '利用可能な変数：',
    
    // Domain Mapping
    domainMappingTitle: 'ドメインマッピング設定',
    domainMappingHint: 'よく使うドメインにわかりやすい別名を設定できます（例: medium.com → 「Medium」）',
    domainLabel: 'ドメイン',
    folderNameLabel: 'フォルダ名',
    addMappingButton: '+ マッピングを追加',
    domainMappingDomainPlaceholder: '例: medium.com',
    domainMappingNamePlaceholder: '例: Medium',
    domainMappingDeleteButton: '削除',
    
    // Config Transfer
    configTransferTitle: '設定の同期',
    configTransferHint: '一度コピーすれば、どのブラウザでもすぐに同期できます。',
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
    aiChatConfigHint: 'AI チャットクリップの形式と内容をカスタマイズ',
    aiSupportedPlatformsToggle: '対応AIプラットフォームを表示',
    includeTimestampsLabel: 'メッセージのタイムスタンプを含める',
    includeTimestampsHint: '各メッセージの後に送信時刻を表示（利用可能な場合）',
    userNameLabel: 'ユーザー名',
    userNamePlaceholder: 'USER',
    userNameHint: 'ユーザーメッセージの表示名をカスタマイズ、デフォルトは "USER"',
    captureContextLabel: 'コンテキストを取得（実験的機能）',
    
    // Deep Research Configuration
    deepResearchConfigTitle: 'Gemini Deep Research 設定',
    deepResearchConfigHint: 'Deep Research レポートのキャプチャ方法をカスタマイズ',
    pureModeLabel: 'ピュアモード（レポート内容のみキャプチャ）',
    pureModeHint: '有効にすると、Deep Research レポートの内容のみをキャプチャし、会話メッセージは含めません',
    multipleReportsInfo: 'ℹ️ 複数のレポートについて: Gemini は一度に 1 つの完全なレポートのみを表示できます。複数のレポートを保存するには、各レポートを個別に開いてクリップしてください。',

    readingConfigTitle: '読書モード',
    readingConfigHint: '読書モードで保存する内容を選択します',
    readingExportModeLabel: 'エクスポート内容',
    readingExportModeHighlights: 'ハイライトのみ保存',
    readingExportModeFull: '全文を保存しハイライトを残す',
    readingExportModeDescription: '「全文」を選択すると、整形済みの原文も保存され、全文にハイライトと脚注が残ります。',
    readingHighlightThemeLabel: 'ハイライトカラー',
    readingHighlightThemeDescription: '読書モードページのハイライト背景のみ変更され、エクスポートされる Markdown には影響しません。',
    readingHighlightThemeGradient: 'パープル×ブルーのグラデーション（デフォルト）',
    readingHighlightThemePurple: 'パープル（単色）',
    readingHighlightThemeNeonYellow: 'ネオンイエロー',
    readingHighlightThemeNeonGreen: 'ネオングリーン',
    readingHighlightThemeNeonOrange: 'ネオンオレンジ',

    fragmentConfigHint: '選択したテキストのクリップ形式や挙動をカスタマイズ',
    fragmentModifierToggleLabel: '修飾キーで自動クリップ/読書を有効にする',
    fragmentModifierToggleDescription: '選択した修飾キーを押しながらテキストをドラッグすると、クリッパーダイアログや読書モードのハイライトが自動的に開きます。',
    fragmentModifierKeysLabel: '修飾キーの設定',
    fragmentModifierKeysDescription: '自動操作を発動するには、選択したすべての修飾キーを同時に押す必要があります。',
    fragmentModifierKeyAlt: 'Option / Alt',
    fragmentModifierKeyMeta: 'Command',
    fragmentModifierKeyCtrl: 'Control',
    fragmentModifierKeyShift: 'Shift',

    // Classifier Configuration
    classifierConfigTitle: 'AI 補助分類とサマリー',
    classifierConfigHint: 'LLM を利用してクリップ内容を自動分類し、サマリー化します',
    enableClassifierLabel: 'スマート分類を有効にする',
    classifierUnstableNotice: '⚠️ この分類機能はまだ安定しておらず、動作が不安定になる可能性があります。',
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
    portConflictDetected: '⚠️ ポート競合を検出しました: {ports}。Obsidian で各ボルトに異なるポートを設定してから再試行してください。',
    
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
    clipSelection: '選択範囲を Obsidian にクリップ',
    readerStart: '🖍️ 読書ハイライトモードを開始',
    contextMenuVideoMode: '🎬 動画キャプチャーモードを開始',

    // Reader Mode
    readerPanelTitle: '読書ハイライト中',
    readerPanelStatus: 'テキストを選択してハイライトと注釈を追加',
    readerPanelHint: 'ヒント：テキストを選択してマウスを離すと注釈ダイアログが表示され、空欄のままでハイライトのみ保存できます。',
    readerPanelFinish: '完了してエクスポート',
    readerPanelCancel: 'キャンセル',
    readerPanelCounter: 'ハイライト {count} 件を収集',
    readerPanelCounterZero: 'ハイライト 0 件を収集',
    readerHighlightEditLabel: '注釈を編集',
    readerHighlightDeleteLabel: 'ハイライトを削除',
    readerHighlightNoComment: '注釈はありません',
    readerHighlightSaveLabel: '注釈を保存',
    readerHighlightCancelLabel: 'キャンセル',
    readerHighlightEditPlaceholder: 'ここに注釈を編集...',
    readerHighlightFocusLabel: 'ハイライト {index} に移動',
    readerHintNoHighlights: 'まだハイライトがありません。先にテキストを選択してください。',
    readerHintExporting: 'Markdown を生成しています...',
    readerHintFailure: 'エクスポートに失敗しました。後でもう一度お試しください。',
    readerHintSelectionFailure: 'ハイライトに失敗しました。もう一度お試しください。',

    // Video Mode
    videoPanelTitle: '動画キャプチャーモード',
    videoPanelStatus: '重要なタイムポイントやテキスト抜粋を記録',
    videoPanelHint: 'ヒント: テキストを選択すると自動で追加されます。Enter を 2 回押すと保存、Esc でキャンセルします。',
    videoPanelAdd: '現在のタイムスタンプを保存',
    videoPanelFinish: '完了してエクスポート',
    videoPanelCancel: '終了',
    videoPanelCounter: '{count} 件のエントリを保存済み',
    videoPanelCounterZero: '0 件のエントリを保存済み',
    videoConfigTitle: '動画モード',
    videoConfigHint: '対応する動画サイトでメモ用のプロンプトを表示できます',
    videoFloatingPromptLabel: '動画ページにフローティングボタンを表示する',
    videoFloatingPromptHint: 'YouTube と bilibili をサポート。右下にショートカットが表示されます。',
    videoTimestampSectionTitle: '動画タイムスタンプ',
    videoFragmentSectionTitle: 'テキスト抜粋',
    videoCaptureEditLabel: 'メモを編集',
    videoCaptureDeleteLabel: 'タイムスタンプを削除',
    videoCaptureNoComment: 'メモはまだありません',
    videoCaptureSaveLabel: 'メモを保存',
    videoCaptureCancelLabel: 'キャンセル',
    videoCaptureEditPlaceholder: 'このタイムスタンプのメモを入力...',
    videoCaptureFocusLabel: '{index} 番目のエントリへ移動',
    videoHintNoVideo: '動画の読み込みを待機中...',
    videoHintReady: '＋を押して現在のタイムスタンプを保存。メモは自動で保存されます。',
    videoHintNoCaptures: 'まだ保存したタイムスタンプはありません。左上の＋を押してみましょう。',
    videoHintSaving: '保存中...',
    videoHintExporting: 'Markdown を生成中...',
    videoHintFailure: 'エラーが発生しました。もう一度お試しください。',
    clipSelectionVideo: '動画キャプチャにクリップ',
    videoPromptTitle: '動画モードが利用できます',
    videoPromptDescription: '動画モードを開始して、タイムスタンプとメモを記録しましょう。',
    videoPromptAction: '動画モードを開く',

    // Dialog
    clipDialogTitle: '選択範囲をクリップ',
    commentLabel: 'コメントを追加（オプション）',
    commentPlaceholder: 'ここに考え、メモ、コメントを書いてください...',
    cancelButton: 'キャンセル',
    clipButton: 'クリップ',
    openReaderButton: '読書モードを開始',
    addToReaderButton: '読書モードに追加',

    // Multi-Vault
    additionalVaultsTitle: '追加 Vault',
    additionalVaultsHint: 'Vault を追加して、ルールに基づき自動でコンテンツを振り分けます。',
    addVaultButton: '+ Vault を追加',
    multiVaultNameLabel: 'Vault 名',
    multiVaultNamePlaceholder: 'マイノート Vault',
    multiVaultNameHint: 'この Vault を識別する表示名',
    deleteVaultButton: '削除',
    deleteVaultConfirm: 'この Vault を削除しますか？関連するルーティングルールも削除されます。',
    defaultVaultBadge: 'デフォルト Vault',
    deleteVaultDialogTitle: 'Vault の削除',
    deleteRuleDialogTitle: 'ルールの削除',
    infoDialogTitle: 'お知らせ',
    infoDialogConfirm: '了解',

    // Routing Rules
    routingRulesTitle: 'ルーティングルール',
    routingRulesHint: 'ドメイン、キーワード、または URL パターンでターゲット Vault を自動選択します。一致しない場合は既定の Vault に保存されます。',
    vaultRulesTitle: 'ルーティングルール',
    ruleEmptyPlaceholder: 'ルールがまだありません。この Vault に振り分けるルールを追加してください。',
    addRuleButton: '+ ルールを追加',
    ruleTypeLabel: 'ルールタイプ',
    ruleTypeDomain: 'ドメインマッチ',
    ruleTypeKeyword: 'キーワードマッチ',
    ruleTypeUrlPattern: 'URL パターン',
    rulePatternLabel: 'マッチパターン',
    rulePatternPlaceholder: '例：example.com;news.example.com または キーワード1,キーワード2',
    ruleTargetVaultLabel: 'ターゲット Vault',
    rulePriorityLabel: '優先度',
    rulePriorityHint: '数値が大きいほど優先度が高くなります。',
    ruleDescriptionLabel: '説明',
    ruleDescriptionPlaceholder: '例：技術記事を仕事用 Vault に保存',
    ruleDescriptionHint: 'ルールの用途を思い出しやすくします。',
    ruleEnabledLabel: '有効',
    deleteRuleButton: '削除',
    ruleDeleteConfirm: 'このルールを削除しますか？',
    ruleNoVaultOption: '先に追加の Vault を作成してください',
    ruleAddVaultPrompt: '先に追加の Vault を作成してください。',
    editRuleButton: '編集',
  },
};
