import type { LocaleDefinition } from '../localeDefinition';
import type { Messages } from '../messages';
import { schemaShellMessagesJa as schemaShellMessagesLocale } from '../schemaShellMessages';

const runtime: Messages = {
  // General
  extensionName: 'All in Ob',
  extensionSubtitle: 'クリッパーを設定して、よりスマートなコンテンツ管理を実現',

  // Usage dashboard
  usageDashboardTitle: '利用状況ダッシュボード',
  usageDashboardSubtitle: 'クリップ種別ごとの保存回数をひと目で確認',
  usageTotalLabel: '保存合計',
  usageAiLabel: 'AI 会話',
  usageFragmentLabel: 'リーディング + ビデオ + フラグメント',
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
  apiConfigHint:
    'ここは既定の Vault です。ルーティングルールに一致しないクリップはすべてここに保存されます。',
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

  restSummaryAdditionalVaults: 'Additional vaults',
  routingSummaryVaults: 'Configured vaults',
  routingSummaryRules: 'Routing rules',
  routingSummaryEnabledRules: 'Enabled rules',
  routingSummaryDefaultVault: 'Default vault',
  legacyPanelToggleLabel: 'Open legacy editor',
  legacyPanelMissingForm: 'Legacy form not found. Please refresh.',
  languageSummaryCurrent: 'Current language',
  languageSummaryAvailable: 'Available languages',
  templatesSummaryArticle: 'Article & video path',
  templatesSummaryFragment: 'Fragment path',
  templatesSummaryReading: 'Reading path mode',
  templatesSummaryAi: 'AI chat path',
  templatesSummaryDomainMappings: 'Domain mappings',
  aiSummaryUserName: 'User display name',
  aiSummaryTimestamp: 'Include timestamps',
  videoSummaryFloatingPrompt: 'Floating prompt',
  readingSummaryMode: 'Export mode',
  readingSummaryTheme: 'Highlight theme',
  fragmentSummaryFootnotes: 'Footnote format',
  fragmentSummaryModifierKeys: 'Modifier keys',
  transferSummaryCopy: 'Copy configuration',
  transferSummaryImport: 'Import configuration',

  // Template Configuration
  templateConfigTitle: '記事・動画のパステンプレート',
  templateConfigHint: '保存するコンテンツの種類ごとにファイル名テンプレートを定義できます',
  articleTemplateLabel: '記事・動画パステンプレート',
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
  templateVariableNote:
    '{slug} はタイトルをスラッグ化した文字列です。{HHmmss}/{HHmm} で保存時刻を埋め込み、小文字 {mm} は引き続き月を表します。',

  // Domain Mapping
  domainMappingTitle: 'ドメインマッピング設定',
  domainMappingHint:
    'よく使うドメインにわかりやすい別名を設定できます（例: medium.com → 「Medium」）',
  domainLabel: 'ドメイン',
  folderNameLabel: 'フォルダ名',
  addMappingButton: '+ マッピングを追加',
  domainMappingDomainPlaceholder: '例: medium.com',
  domainMappingNamePlaceholder: '例: Medium',
  domainMappingDeleteButton: '削除',

  // YAML Configuration
  yamlFieldArrayPlaceholder: '1 行に 1 項目',
  yamlFieldArrayHint:
    '1 行につき 1 項目を入力します。エクスポート時に YAML 配列として出力されます。',
  yamlFieldArrayPreviewEmpty: '項目はまだありません',
  yamlFieldValuePathExamplesTitle: 'よく使うコンテキストキー',
  yamlFieldValuePathExamples: 'meta.author\nstats.wordCount\nextra.notes[0]',
  yamlDomainTitle: 'ドメイン別設定',
  yamlDomainHint:
    'ドメインごとに YAML フィールドを上書きできます。グローバル設定より優先されます。',
  yamlDomainAddRule: '+ ドメインルールを追加',
  yamlDomainEmpty: 'ドメイン固有のルールはまだありません。',
  yamlDomainPlaceholder: '例: example.com または *.example.com',
  yamlDomainContentTypeLabel: 'コンテンツ種別',
  yamlDomainAddField: '+ フィールドを追加',
  yamlDomainRemoveRule: 'ルールを削除',
  yamlDomainFieldEmpty: 'フィールドが設定されていません',
  yamlDomainFieldEnabled: '有効',
  yamlDomainFieldRemove: '削除',
  yamlDomainFieldValuePlaceholder: '既定値 (任意)',
  yamlDomainFieldArrayPlaceholder: '1 行に 1 項目',
  yamlDomainFieldArrayHint: '複数行入力に対応。エクスポート時は YAML 配列になります。',
  yamlDomainFieldArrayPreviewEmpty: '配列項目はまだありません',
  yamlDomainValuePathLabel: 'Value path (任意)',
  yamlDomainValuePathPlaceholder: '例: meta.author',
  yamlDomainErrorDomainRequired: 'ドメインは必須です。',
  yamlDomainErrorDomainDuplicate: 'このコンテンツ種別には同じドメインのルールが既に存在します。',
  yamlDomainErrorFieldRequired: '少なくとも 1 つフィールドを追加してください。',
  yamlDomainErrorFieldDuplicate: '同じルール内に重複したフィールドがあります。',
  yamlDomainErrorFieldUnsupported: 'このコンテンツ種別で利用できないフィールドです:',
  yamlDomainErrorValueInvalid: '既定値がフィールドタイプと一致しません:',
  yamlDomainErrorValuePathInvalid: 'Value path に空白を含めることはできません。',
  yamlDomainWarningUnresolved: '保存する前にハイライトされたエラーを修正してください。',

  // Config Transfer
  configTransferTitle: '設定の同期',
  configTransferHint: '一度コピーすれば、どのブラウザでもすぐに同期できます。',
  copyConfigButton: '設定をコピー',
  importConfigButton: 'クリップボードから保存',
  configTransferNote:
    '操作ではシステムのクリップボードを使用します。ブラウザに権限が付与されているか確認してください。',
  copyConfigSuccess: '✅ 設定をクリップボードにコピーしました',
  importSuccess: '✅ 設定をインポートして保存しました',
  importParseFailed: '❌ 設定の解析に失敗しました',
  emptyImportError: 'クリップボードが空です。先に設定をコピーしてください',
  clipboardUnavailable: 'クリップボードにアクセスできません。手動でコピーしてください',
  clipboardReadUnavailable:
    'クリップボードを読み取れません。ブラウザで権限を許可してから再試行してください',
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
  pureModeHint:
    '有効にすると、Deep Research レポートの内容のみをキャプチャし、会話メッセージは含めません',
  multipleReportsInfo:
    'ℹ️ 複数のレポートについて: Gemini は一度に 1 つの完全なレポートのみを表示できます。複数のレポートを保存するには、各レポートを個別に開いてクリップしてください。',

  readingConfigTitle: '読書モード',
  readingConfigHint: '読書モードで保存する内容を選択します',
  readingExportModeLabel: 'エクスポート内容',
  readingExportModeHighlights: 'ハイライトのみ保存',
  readingExportModeFull: '全文を保存しハイライトを残す',
  readingExportModeDescription:
    '「全文」を選択すると、整形済みの原文も保存され、全文にハイライトと脚注が残ります。',
  readingHighlightThemeLabel: 'ハイライトカラー',
  readingHighlightThemeDescription:
    '読書モードページのハイライト背景のみ変更され、エクスポートされる Markdown には影響しません。',
  readingHighlightThemeGradient: 'パープル×ブルーのグラデーション（デフォルト）',
  readingHighlightThemePurple: 'パープル（単色）',
  readingHighlightThemeNeonYellow: 'ネオンイエロー',
  readingHighlightThemeNeonGreen: 'ネオングリーン',
  readingHighlightThemeNeonOrange: 'ネオンオレンジ',

  fragmentConfigTitle: 'フラグメントクリップ設定',
  fragmentConfigHint: '選択したテキストのクリップ形式や挙動をカスタマイズ',
  fragmentUseFootnoteLabel: '脚注形式を使用（推奨）',
  fragmentUseFootnoteHint:
    '有効にすると、コメントがObsidian脚注形式で保存され、Sidebar Highlightsプラグインと互換性があります',
  fragmentCaptureContextHint:
    '有効にすると、選択したテキストの周囲のコンテキストを取得し、実際の選択部分を==ハイライト==でマークします',
  fragmentFootnoteExampleTitle: '脚注形式の例：',
  fragmentModifierToggleLabel: '修飾キーで自動クリップ/読書を有効にする',
  fragmentModifierToggleDescription:
    '選択した修飾キーを押しながらテキストをドラッグすると、クリッパーダイアログや読書モードのハイライトが自動的に開きます。',
  fragmentModifierKeysLabel: '修飾キーの設定',
  fragmentModifierKeysDescription:
    '自動操作を発動するには、選択したすべての修飾キーを同時に押す必要があります。',
  fragmentModifierKeyAlt: 'Option / Alt',
  fragmentModifierKeyMeta: 'Command',
  fragmentModifierKeyCtrl: 'Control',
  fragmentModifierKeyShift: 'Shift',
  fragmentKeyboardShortcutsLabel: 'クリッパーダイアログのキーボードショートカットを有効にする',
  fragmentKeyboardShortcutsHint:
    'クリッパーダイアログで：ダブルEnterでリーダーモードに入る、Cmd+Enter（Mac）またはAlt+Enter（Windows）で直接クリップ',

  // Clipper dialog keyboard shortcuts
  clipperCommentEditCompleted:
    'コメント編集が完了しました。以下のキーボードショートカットを使用できます：',
  clipperShortcutHintDoubleEnter: 'ダブルEnter',
  clipperShortcutHintModifierEnter: '直接クリップ',
  clipperShortcutHintEscape: 'キャンセル',

  // Button shortcut hints
  clipperShortcutDoubleEnter: 'ダブル ↵',
  clipperShortcutModifierEnter: 'Cmd ↵',
  clipperShortcutEsc: 'Esc',
  clipperShortcutSetupLink: 'ショートカットを設定してスムーズに',

  // Classifier Configuration
  classifierConfigTitle: 'AI 補助分類とサマリー',
  classifierConfigHint: 'LLM を利用してクリップ内容を自動分類し、サマリー化します',
  enableClassifierLabel: 'スマート分類を有効にする',
  classifierUnstableNotice:
    '⚠️ この分類機能はまだ安定しておらず、動作が不安定になる可能性があります。',
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
  testConnectionButton_short: '⚡ テスト',

  // Messages
  saveSuccess: '✅ 設定が保存されました',
  saveFailed: '❌ 保存に失敗しました',
  configFixed: '✅ 設定が修復され保存されました',
  fixFailed: '❌ 修復に失敗しました',
  reloadPrompt: '修復された設定を確認するにはページを再読み込みしてください',
  connectionTesting: '接続をテストしています...',
  connectionSuccessShort: '接続に成功しました',
  portConflictDetected:
    '⚠️ ポート競合を検出しました: {ports}。Obsidian で各ボルトに異なるポートを設定してから再試行してください。',
  connectionFailureHintsTitle: '対処方法：',
  connectionFailureHintCheckApiKey:
    'Obsidian Local REST API の設定と API キーが一致しているか確認してください',
  connectionFailureHintCheckVault:
    'Vault 名が Obsidian Local REST API プラグインの設定と一致しているか確認してください',
  connectionFailureHintCheckService:
    'Obsidian と Local REST API プラグインが起動しているか確認してください',
  connectionFailureHintGeneric:
    'ネットワーク状況を確認し、必要に応じて Local REST API を再起動してください',

  // Diagnosis
  diagnosisTitle: '設定診断',
  diagnosisDescription: '「設定を診断」をクリックすると、検査結果と修復候補をここで確認できます。',
  diagnosisSummaryHint:
    '診断では REST API、パステンプレート、ドメインマッピング、マルチボールトルーティングなどを確認し、詳細レポートを表示します。',
  diagnosisResultTitle: '診断結果',

  // Notifications
  clipSuccess: 'Obsidian に保存されました',
  clipFailed: 'クリップに失敗しました',
  extractionFailed: 'コンテンツの抽出に失敗しました',
  connectionFailed: '接続に失敗しました',
  scriptInjectionFailed: 'コンテンツスクリプトの注入に失敗しました',
  classificationFallbackTitle: '分類サービスで問題が発生しました。既定の分類を適用しました',
  classificationFallbackMessage: '理由: {reason}',
  classificationFallbackDefaultReason: '不明なエラー',

  // Context Menu
  clipFullPage: 'ページ全体を Obsidian にクリップ',
  clipSelection: '選択範囲を Obsidian にクリップ',
  readerStart: '🖍️ 読書ハイライトモードを開始',
  contextMenuVideoMode: '🎬 動画キャプチャーモードを開始',

  // Reader Mode
  readerPanelTitle: '読書ハイライト中',
  readerPanelStatus: 'テキストを選択してハイライトと注釈を追加',
  readerPanelHint:
    'ヒント：テキストを選択してマウスを離すと注釈ダイアログが表示され、空欄のままでハイライトのみ保存できます。',
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

  // Privacy Settings
  privacySettingsTitle: 'プライバシーとデータ',
  privacySettingsDescription: '匿名の利用状況とエラー報告の収集設定をここで管理します。',
  privacySettingsNote: 'データ収集とエラー報告の制御',
  analyticsDebugTitle: 'デバッグモード',
  analyticsDebugDescription:
    '有効にすると GA4 DebugView へイベントを送信し、コンソールにリクエスト詳細を出力します。問題調査時のみ利用してください。',
  analyticsDebugDisabledHint:
    '「利用状況の分析」と「エラー報告」を有効にしてからデバッグモードをオンにできます。',
  analyticsDebugEnabled: 'デバッグモードを有効にしました。調査が終わったら必ずオフにしてください。',
  analyticsDebugDisabled: 'デバッグモードを無効にしました。',
  analyticsConsentTitle: '利用状況の分析',
  analyticsConsentDescription:
    '匿名化された利用統計を収集し、拡張機能の改善に役立てます。個人を特定できる情報は取得しません。',
  errorReportingConsentTitle: 'エラー報告',
  errorReportingConsentDescription:
    'サニタイズされたエラー情報を自動送信し、問題解析を支援します。',
  errorReportingDetailsTitle: '収集される内容',
  errorReportingCollectedTitle: '収集される情報:',
  errorReportingCollectedError: 'エラーの種類と重大度',
  errorReportingCollectedBrowser: 'ブラウザー名とメジャーバージョン',
  errorReportingCollectedExtension: '拡張機能のバージョン',
  errorReportingCollectedTimestamp: 'エラーが発生した時刻',
  errorReportingNotCollectedTitle: '収集されない情報:',
  errorReportingNotCollectedPersonal: '個人を特定できる情報',
  errorReportingNotCollectedUrls: '閲覧した正確な URL',
  errorReportingNotCollectedContent: 'クリップした内容やページ本文',
  errorReportingNotCollectedPasswords: 'パスワードや機密データ',
  savePrivacySettings: '設定を保存',
  clearAllAnalyticsData: 'すべてのデータを削除',
  privacyFooterText:
    '私たちはあなたのプライバシーを大切にします。いつでも設定を変更したり、収集済みデータの削除を依頼できます。',
  privacyPolicyLink: 'プライバシーポリシー',
  dataUsageLink: 'データ利用について',
  privacySettingsSaved: 'プライバシー設定を保存しました',
  privacyDataWillBeCleared:
    'データ収集を停止しました。既存の分析データは 24 時間以内に削除されます。',
  privacySettingsError: '設定の保存に失敗しました。もう一度お試しください。',
  confirmClearAllData: '分析データをすべて削除しますか？この操作は元に戻せません。',
  allDataCleared: '分析データをすべて削除しました。',
  clearDataError: 'データの削除に失敗しました。しばらくしてから再試行してください。',

  // Video Mode
  videoPanelTitle: '動画キャプチャーモード',
  videoPanelStatus: '重要なタイムポイントやテキスト抜粋を記録',
  videoPanelHint:
    'ヒント: テキストを選択すると自動で追加されます。Enter を 2 回押すと保存、Esc でキャンセルします。',
  videoPanelAdd: '現在のタイムスタンプを保存',
  videoPanelFinish: '完了してエクスポート',
  videoPanelCancel: '終了',
  videoPanelCounter: '{count} 件のエントリを保存済み',
  videoPanelCounterZero: '0 件のエントリを保存済み',
  videoConfigTitle: '動画モード',
  videoConfigHint: '対応する動画サイトでメモ用のプロンプトを表示できます',
  videoFloatingPromptLabel: '動画ページにフローティングボタンを表示する',
  videoFloatingPromptHint: 'YouTube と bilibili をサポート。右下にショートカットが表示されます。',
  videoPromptCustomizationTitle: 'フローティングプロンプト文言とショートカット',
  videoPromptLabelTitle: 'プロンプトボタンの文言',
  videoPromptLabelPlaceholder: '例：動画メモを開始',
  videoPromptLabelHint:
    'スクリーンリーダーやホバー表示で使う、フローティングボタンの aria-label として表示されます。',
  videoPromptShortcutTitle: 'プロンプトのショートカット',
  videoPromptShortcutPlaceholder: '例：Alt+V',
  videoPromptShortcutHint:
    'フローティングプロンプトに表示されます。覚えやすい Alt/Cmd の組み合わせがおすすめです。',
  videoSupportedPlatformsTitle: '対応プラットフォーム',
  videoPlatformSupportedBadge: 'SUPPORTED',
  videoEnableButton: '動画メモを有効化',
  videoSaveConfigButton: '動画設定を保存',
  videoPlatformYoutubeName: 'YouTube',
  videoPlatformYoutubeDescription:
    'watch / short ページに対応し、フローティングプロンプトを自動検出してワンクリックで動画メモモードに入れます。',
  videoPlatformBilibiliName: 'Bilibili',
  videoPlatformBilibiliDescription:
    'BV/AV ページに対応し、弾幕エリアの余白を保ったままショートカット案内を表示します。',
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
  videoPromptDismiss: '動画プロンプトを閉じる',

  // Support Prompt
  supportPromptDialogLabel: 'All in Ob を応援する',
  supportPromptTitle: 'All in Ob を応援する',
  supportPromptKoFiTitle: 'Ko-fi',
  supportPromptKoFiDescription: 'コーヒーを一杯ごちそうする',
  supportPromptAfdianTitle: '爱发电',
  supportPromptAfdianDescription: '中国向け支援プラットフォーム',
  supportPromptGithubTitle: 'GitHub',
  supportPromptGithubDescription: 'フィードバックを送る',
  supportPromptFeedbackGroupLabel: 'クイックフィードバック',
  supportPromptLikeLabel: '高評価',
  supportPromptDislikeLabel: '低評価',
  supportPromptDismiss: '外側をクリックすると閉じます',
  supportPromptStatusSuccess: '送信に成功しました',
  supportPromptStatusSuccessWithVault: '{vault} に送信しました',
  supportPromptStatusWarning: '保存しましたが分類はフォールバックしました',
  supportPromptStatusWarningWithReason: '保存しましたが分類に失敗しました: {reason}',
  supportPromptStatusFailure: '送信に失敗しました',
  supportPromptStatusFailureWithReason: '送信に失敗しました、{reason}',
  supportPromptLikeThankYou: '応援ありがとうございます！',
  supportPromptReviewLinkLabel: 'レビューを書く',
  supportPromptReviewAcknowledgedLabel: 'レビューは書きました',
  supportPromptDislikeToastTitle: 'フィードバックをお寄せください',
  supportPromptDislikeRedditLinkLabel: 'Reddit でディスカッション',

  // Dialog
  clipDialogTitle: '選択範囲をクリップ',
  clipDialogInstructions: 'Tab キーで操作間を移動し、Alt + 矢印キーでダイアログを移動します。',
  commentLabel: 'コメントを追加（オプション）',
  commentPlaceholder: 'ここに考え、メモ、コメントを書いてください...',
  cancelButton: 'キャンセル',
  cancelButton_short: 'キャンセル',
  clipButton: 'クリップ',
  clipButton_short: 'クリップ',
  openReaderButton: '読書モードを開始',
  addToReaderButton: '読書モードに追加',
  openVideoModeButton: 'ビデオモードを開始',

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

  yamlConfigTitle: 'YAML 設定',
  yamlConfigNote: 'YAML フィールドの統一設定（プレビュー）',
  yamlConfigPlaceholder:
    'この機能は計画中のため、現在はレイアウトプレビューを表示しています。今後、カスタムフィールドタイプ、対象コンテンツタイプ、既定値をサポート予定です。',
  yamlConfigHint: 'Manage the YAML fields exported for each content type.',
  yamlFieldNameLabel: 'Field',
  yamlFieldTypeLabel: 'Type',
  yamlFieldArticleLabel: 'Article',
  yamlFieldClipperLabel: 'Clipper',
  yamlFieldVideoLabel: 'Video',
  yamlFieldAiLabel: 'AI',
  yamlFieldDefaultValueLabel: 'Value',
  yamlFieldActionsLabel: 'Actions',
  yamlFieldAddButton: '+ Add field',
  yamlFieldDeleteButton: 'Delete',
  yamlFieldCustomNamePlaceholder: 'Field name',
  yamlFieldDefaultPlaceholder: 'Field value',
  yamlFieldAdvancedShowLabel: 'Show source',
  yamlFieldAdvancedHideLabel: 'Hide source',
  yamlFieldValuePathLabel: 'Value path',
  yamlFieldValuePathPlaceholder: 'e.g. meta.author or extra.notes[0]',
  yamlFieldValuePathHint:
    'Optional: map this field to data in the capture context. Leave empty to use captured or default values.',
  yamlFieldAvailabilityNote:
    'Disable a switch to hide a field. Newly added fields apply to the selected export types.',
  yamlDefaultGroupLabel: 'Default fields',
  yamlFilterAllLabel: 'All',
  yamlCustomGroupLabel: 'Custom fields',
  yamlFieldErrorValuePathInvalid: 'Value path cannot contain spaces.',
  yamlConfigMigrated: 'Legacy YAML configuration has been updated to the latest format.',
  yamlConfigAutoSaved: 'YAML configuration saved.',
  templatesAutoSaved: 'Template settings saved automatically.',
  infoDialogTitle: 'お知らせ',
  infoDialogConfirm: '了解',

  // Routing Rules
  routingRulesTitle: 'ルーティングルール',
  routingRulesHint:
    'ドメイン、キーワード、または URL パターンでターゲット Vault を自動選択します。一致しない場合は既定の Vault に保存されます。',
  routingRulesPriorityNote:
    'ヒント：優先度が高いルールほど先に一致し、対象ボールトは有効のままにしてください。',
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

  // Onboarding Page
  onboardingTitle: 'All in Ob へようこそ',
  onboardingSubtitle: 'クリッパー拡張機能を素早く設定しましょう',
  onboardingWelcomeMessage:
    'All in Ob をインストールしていただき、ありがとうございます！このガイドでは、拡張機能を素早く設定して、ウェブコンテンツやAI会話をObsidianに簡単に保存できるようにします。',

  // Step 1: API Configuration
  step1Title: 'Obsidian Local REST API の設定（必須）',
  step1Description:
    'まず、ObsidianにLocal REST APIプラグインをインストールして設定する必要があります。これは拡張機能とObsidianの橋渡しです。',

  step1Detail1: 'Obsidianで「Local REST API」プラグインをインストールして有効化',
  step1Detail2: 'プラグイン設定で「Enable Non-encrypted (HTTP) Server」を有効にする',
  step1Detail3: 'HTTPS URL（通常は https://127.0.0.1:27124）をメモ',
  step1Detail4: 'HTTP URL（通常は http://127.0.0.1:27123）をメモ',
  step1Detail5: 'ObsidianのVault名を記録し、Local REST APIのAPIキーをコピー',
  step1Detail6: '上記の情報を拡張機能に入力し、接続テストを実行',
  step1ActionPrimary: 'API を設定',
  step1ActionSecondary: '後で設定',

  // Step 2: Additional Vaults
  step2Title: '追加Vaultの設定（オプション）',
  step2Description:
    '複数のObsidian Vaultがある場合、追加のVaultを設定してルーティングルールを設定し、異なるタイプのコンテンツを対応するVaultに自動保存できます。',

  step2Detail1: '複数のObsidian Vaultをサポート',
  step2Detail2: 'ドメイン、キーワード、URLパターンに基づくルーティングルールの設定',
  step2Detail3: '例：技術記事を仕事用Vaultに、個人コンテンツを個人用Vaultに保存',
  step2Detail4: 'ルールに一致しないコンテンツはデフォルトVaultに保存',
  step2ActionPrimary: '追加Vaultを設定',
  step2ActionSecondary: 'このステップをスキップ',

  // Step 3: Main Features
  step3Title: '主要機能',
  step3Description: '拡張機能の主要機能について素早く学んで、より良く使用できるようにしましょう。',

  step3Section1Title: 'ウェブクリッピング',
  step3Section1Detail1:
    'ウェブページの空白部分をクリックして、ページ全体をクリップ（ページの読み込み完了を待ち、画像リソースが完全に読み込まれるようにスクロール）',
  step3Section1Detail2: '主要なAIチャット対話を自動認識し、フォーマットされたAI対話記録を保存',
  step3Section2Title: 'クリッピング/リーディングモード',
  step3Section2Detail1:
    'テキストを選択して右クリック、または補助キーを開いて補助キーを押してコンテンツを選択し、コンテンツにコメントを追加して、選択したコンテンツと注釈をObsidianに保存',
  step3Section2Detail2:
    'リーディングモードに入り、同じページで複数のフラグメントを選択してコメントし、一緒にObsidianに保存',
  step3Section2Detail3:
    'リーディングモードでページレイアウトに応じてテキストフラグメントを自動配置、選択したテキストの番号をクリックしてワンクリック位置決め',
  step3Section2Detail4:
    'リーディングモードで全文をObsidianに保存、選択したコンテンツをハイライト形式で表示',
  step3Section2Detail5:
    'フラグメントでもリーディングモードの選択コンテンツでも、ページの正確なリンクを保存し、いつでもワンクリックでウェブページの位置に戻る',
  step3Section2Detail6:
    'Obsidianにsidebar highlightsプラグインをインストールして、注釈コンテンツをより便利に表示',
  step3Section3Title: 'ビデオモード',
  step3Section3Detail1:
    'YouTubeやbilibiliの再生ページに対応、ビデオモードを開いて、いつでもビデオのタイムスタンプを記録してメモを追加',
  step3Section3Detail2:
    'タイムスタンプの横の番号をクリックして、ワンクリック位置決めで繰り返し視聴',
  step3Section3Detail3: 'ページテキストを選択して、素晴らしいコメントをワンクリックキャプチャ',
  step3Section3Detail4:
    'Obsidianに保存後、いつでもワンクリックでビデオの正確なタイムスタンプに戻る',
  step3ActionPrimary: '詳細設定を表示',
  step3ActionSecondary: '後で学ぶ',

  // Step 4: Auxiliary Features
  step4Title: '補助機能',
  step4Description: '拡張機能は様々な補助機能も提供し、使用体験をより便利にします。',

  step4Detail1:
    '同じデバイスの複数ブラウザで、現在の設定をワンクリックコピー、ペーストして同期、重複設定不要',
  step4Detail2: 'ドメインマッピング：一般的なウェブサイトをフレンドリーなフォルダ名にマッピング',
  step4Detail3: 'カスタムパス設定、必要に応じてパスを調整',
  step4Detail4: 'スマート診断：設定に問題？スマート診断で迅速なトラブルシューティング',
  step4ActionPrimary: '詳細設定を表示',
  step4ActionSecondary: '後で学ぶ',

  // Step 5: More Features
  step5Title: 'より多くの素晴らしい機能、継続的な反復',
  step5Description: '拡張機能は継続的に発展し、より多くのインテリジェント機能をお届けします。',

  step5Detail1: 'AI機能を導入し、よりスムーズで、よりインテリジェントに',
  step5Detail2:
    '双方向インタラクション、もはやメモを保存するだけでなく、ブラウザとObsidianの架け橋',
  step5Detail3: '改善提案を歓迎、開発は容易ではありません、サポートに感謝',
  step5ActionPrimary: '提案を提出',
  step5ActionSecondary: 'サポートを表示',

  // Onboarding Actions
  skipOnboarding: 'ガイドをスキップ',
  completeOnboarding: 'ガイドを完了',
  onboardingFooterNote: 'これらのオプションは設定ページでいつでも再設定できます。',
  onboardingCompleted: 'ガイド完了！',
  onboardingCompletedMessage:
    '拡張機能の設定ガイドが正常に完了しました。これでAll in Obを使用してウェブコンテンツを保存できます！',
  onboardingLinkText: 'ガイド',

  // Footer links
  footerSuggestionsLink: '提案',
  footerSupportLink: 'サポート',
  footerContactLink: '作者に連絡',

  suggestionsModalTitle: 'ご意見をお寄せください',
  suggestionsModalDescription:
    'All in Ob を良くするためのアイデアを歓迎します。以下の方法からご連絡ください。',
  suggestionsModalReddit: 'Reddit で交流',
  suggestionsModalXiaohongshu: '小紅書コミュニティ',
  suggestionsModalGithub: 'GitHub Issue',
  suggestionsModalQrPlaceholder:
    'QR コードは近日追加予定です。まずは Reddit でのご連絡をお待ちしています。',

  // Contact modal
  contactModalTitle: '作者に連絡',
  contactModalDescription:
    'このプロダクトを応援いただける方、作者と交流したい方は、<br><a href="https://www.reddit.com/user/sxnian/" target="_blank" rel="noopener noreferrer">reddit</a> で気軽に声をかけてください。<br>作者は現在就職活動中です。応援いただけると励みになります。',
  contactModalCloseButton: '閉じる',

  // Support modal (onboarding)
  supportModalTitle: 'ご支援ありがとうございます',
  supportModalDescription:
    '開発は簡単ではありません。このプラグインがお役に立てば、以下の方法でご支援いただけると幸いです：',
  supportLinkKofi: 'Ko-fi',
  supportLinkAfdian: 'Afdian',

  // Version and changelog
  versionNumber: 'v0.2.0',
  changelogModalTitle: '更新履歴',

  ...schemaShellMessagesLocale,

  // Fragment examples
  fragmentFootnoteExampleContent: 'これは選択されたテキストの内容です',
  fragmentFootnoteExampleComment: 'これは私のコメントです',
  fragmentContextHighlightExampleTitle: 'コンテキストハイライトの例：',
  fragmentContextHighlightExampleContent:
    '前のコンテキスト ==これは選択されたテキスト== 後のコンテキスト'
};

const jaJP: LocaleDefinition = {
  runtime,
  static: {
    extName: 'All in Ob',
    extDescription:
      'AI強化のウェブクリッパーで、チャットやスニペット、記事をObsidianに保存できます。'
  }
};

export default jaJP;
