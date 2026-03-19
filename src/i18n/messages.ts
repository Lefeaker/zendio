/**
 * Shared i18n message contract used by all locales.
 */
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
  restSummaryAdditionalVaults: string;
  routingSummaryVaults: string;
  routingSummaryRules: string;
  routingSummaryEnabledRules: string;
  routingSummaryDefaultVault: string;
  legacyPanelToggleLabel: string;
  legacyPanelMissingForm: string;
  languageSummaryCurrent: string;
  languageSummaryAvailable: string;
  templatesSummaryArticle: string;
  templatesSummaryFragment: string;
  templatesSummaryReading: string;
  templatesSummaryAi: string;
  templatesSummaryDomainMappings: string;
  aiSummaryUserName: string;
  aiSummaryTimestamp: string;
  videoSummaryFloatingPrompt: string;
  readingSummaryMode: string;
  readingSummaryTheme: string;
  fragmentSummaryFootnotes: string;
  fragmentSummaryModifierKeys: string;
  transferSummaryCopy: string;
  transferSummaryImport: string;

  // Template Configuration
  templateConfigTitle: string;
  templateConfigHint: string;
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
  templateVariableNote: string;

  // Domain Mapping
  domainMappingTitle: string;
  domainMappingHint: string;
  domainLabel: string;
  folderNameLabel: string;
  addMappingButton: string;
  domainMappingDomainPlaceholder: string;
  domainMappingNamePlaceholder: string;
  domainMappingDeleteButton: string;

  // YAML Configuration
  yamlFieldArrayPlaceholder: string;
  yamlFieldArrayHint: string;
  yamlFieldArrayPreviewEmpty: string;
  yamlFieldValuePathExamplesTitle: string;
  yamlFieldValuePathExamples: string;
  yamlDomainTitle: string;
  yamlDomainHint: string;
  yamlDomainAddRule: string;
  yamlDomainEmpty: string;
  yamlDomainPlaceholder: string;
  yamlDomainContentTypeLabel: string;
  yamlDomainAddField: string;
  yamlDomainRemoveRule: string;
  yamlDomainFieldEmpty: string;
  yamlDomainFieldEnabled: string;
  yamlDomainFieldRemove: string;
  yamlDomainFieldValuePlaceholder: string;
  yamlDomainFieldArrayPlaceholder: string;
  yamlDomainFieldArrayHint: string;
  yamlDomainFieldArrayPreviewEmpty: string;
  yamlDomainValuePathLabel: string;
  yamlDomainValuePathPlaceholder: string;
  yamlDomainErrorDomainRequired: string;
  yamlDomainErrorDomainDuplicate: string;
  yamlDomainErrorFieldRequired: string;
  yamlDomainErrorFieldDuplicate: string;
  yamlDomainErrorFieldUnsupported: string;
  yamlDomainErrorValueInvalid: string;
  yamlDomainErrorValuePathInvalid: string;
  yamlDomainWarningUnresolved: string;

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
  fragmentConfigTitle: string;
  fragmentConfigHint: string;
  fragmentUseFootnoteLabel: string;
  fragmentUseFootnoteHint: string;
  fragmentCaptureContextHint: string;
  fragmentFootnoteExampleTitle: string;
  fragmentModifierToggleLabel: string;
  fragmentModifierToggleDescription: string;
  fragmentModifierKeysLabel: string;
  fragmentModifierKeysDescription: string;
  fragmentModifierKeyAlt: string;
  fragmentModifierKeyMeta: string;
  fragmentModifierKeyCtrl: string;
  fragmentModifierKeyShift: string;
  fragmentKeyboardShortcutsLabel: string;
  fragmentKeyboardShortcutsHint: string;
  fragmentContextLengthLabel?: string;
  fragmentContextLengthHint?: string;
  fragmentContextModeLabel?: string;
  fragmentContextModeSentences?: string;
  fragmentContextModeChars?: string;
  fragmentContextModeHint?: string;

  // Clipper dialog keyboard shortcuts
  clipperCommentEditCompleted: string;
  clipperShortcutHintDoubleEnter: string;
  clipperShortcutHintModifierEnter: string;
  clipperShortcutHintEscape: string;

  // Button shortcut hints
  clipperShortcutDoubleEnter: string;
  clipperShortcutModifierEnter: string;
  clipperShortcutEsc: string;
  clipperShortcutSetupLink: string;

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
  testConnectionButton_short?: string;

  // Messages
  saveSuccess: string;
  saveFailed: string;
  configFixed: string;
  fixFailed: string;
  reloadPrompt: string;
  connectionTesting: string;
  connectionSuccessShort: string;
  portConflictDetected: string;
  connectionFailureHintsTitle: string;
  connectionFailureHintCheckApiKey: string;
  connectionFailureHintCheckVault: string;
  connectionFailureHintCheckService: string;

  // YAML Config (experimental)
  yamlConfigHint?: string;
  yamlFieldNameLabel?: string;
  yamlFieldTypeLabel?: string;
  yamlFieldArticleLabel?: string;
  yamlFieldClipperLabel?: string;
  yamlFieldVideoLabel?: string;
  yamlFieldAiLabel?: string;
  yamlFieldDefaultValueLabel?: string;
  yamlFieldActionsLabel?: string;
  yamlFieldAddButton?: string;
  yamlFieldDeleteButton?: string;
  yamlFieldCustomNamePlaceholder?: string;
  yamlFieldDefaultPlaceholder?: string;
  yamlFieldAvailabilityNote?: string;
  yamlDefaultGroupLabel?: string;
  yamlFilterAllLabel?: string;
  yamlCustomGroupLabel?: string;
  yamlFieldAdvancedShowLabel?: string;
  yamlFieldAdvancedHideLabel?: string;
  yamlFieldValuePathLabel?: string;
  yamlFieldValuePathPlaceholder?: string;
  yamlFieldValuePathHint?: string;
  yamlFieldErrorNameRequired?: string;
  yamlFieldErrorNamePattern?: string;
  yamlFieldErrorNameDuplicate?: string;
  yamlFieldErrorModeRequired?: string;
  yamlFieldErrorTypeRequired?: string;
  yamlFieldErrorValueInvalid?: string;
  yamlFieldErrorValuePathInvalid?: string;
  yamlFieldSaveBlockedWarning?: string;
  yamlConfigMigrated?: string;
  yamlConfigAutoSaved?: string;
  templatesAutoSaved?: string;
  connectionFailureHintGeneric: string;

  // Diagnosis
  diagnosisTitle: string;

  // Notifications
  clipSuccess: string;
  clipFailed: string;
  extractionFailed: string;
  connectionFailed: string;
  scriptInjectionFailed: string;
  classificationFallbackTitle: string;
  classificationFallbackMessage: string;
  classificationFallbackDefaultReason: string;

  // Context Menu
  clipFullPage: string;
  clipSelection: string;
  readerStart: string;
  contextMenuVideoMode: string;

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

  // Privacy Settings
  privacySettingsTitle: string;
  privacySettingsDescription: string;
  privacySettingsNote: string;
  analyticsDebugTitle: string;
  analyticsDebugDescription: string;
  analyticsDebugDisabledHint: string;
  analyticsDebugEnabled: string;
  analyticsDebugDisabled: string;
  analyticsConsentTitle: string;
  analyticsConsentDescription: string;
  errorReportingConsentTitle: string;
  errorReportingConsentDescription: string;
  errorReportingDetailsTitle: string;
  errorReportingCollectedTitle: string;
  errorReportingCollectedError: string;
  errorReportingCollectedBrowser: string;
  errorReportingCollectedExtension: string;
  errorReportingCollectedTimestamp: string;
  errorReportingNotCollectedTitle: string;
  errorReportingNotCollectedPersonal: string;
  errorReportingNotCollectedUrls: string;
  errorReportingNotCollectedContent: string;
  errorReportingNotCollectedPasswords: string;
  savePrivacySettings: string;
  clearAllAnalyticsData: string;
  privacyFooterText: string;
  privacyPolicyLink: string;
  dataUsageLink: string;
  privacySettingsSaved: string;
  privacyDataWillBeCleared: string;
  privacySettingsError: string;
  confirmClearAllData: string;
  allDataCleared: string;
  clearDataError: string;

  // Video Mode
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
  videoPromptDismiss: string;

  // Support Prompt
  supportPromptDialogLabel: string;
  supportPromptTitle: string;
  supportPromptKoFiTitle: string;
  supportPromptKoFiDescription: string;
  supportPromptAfdianTitle: string;
  supportPromptAfdianDescription: string;
  supportPromptGithubTitle: string;
  supportPromptGithubDescription: string;
  supportPromptFeedbackGroupLabel: string;
  supportPromptLikeLabel: string;
  supportPromptDislikeLabel: string;
  supportPromptDismiss: string;
  supportPromptStatusSuccess: string;
  supportPromptStatusSuccessWithVault: string;
  supportPromptStatusWarning: string;
  supportPromptStatusWarningWithReason: string;
  supportPromptStatusFailure: string;
  supportPromptStatusFailureWithReason: string;
  supportPromptLikeThankYou: string;
  supportPromptReviewLinkLabel: string;
  supportPromptReviewAcknowledgedLabel: string;
  supportPromptDislikeToastTitle: string;
  supportPromptDislikeRedditLinkLabel: string;
  supportPromptDislikeQrLinkLabel: string;
  supportPromptDislikeQrPlaceholder: string;

  // Dialog
  clipDialogTitle: string;
  clipDialogInstructions: string;
  commentLabel: string;
  commentPlaceholder: string;
  cancelButton: string;
  cancelButton_short?: string;
  clipButton: string;
  clipButton_short?: string;
  openReaderButton: string;
  addToReaderButton: string;
  openVideoModeButton: string;

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

  // YAML Config (Preview)
  yamlConfigTitle: string;
  yamlConfigNote: string;
  yamlConfigPlaceholder: string;

  // Dialog Helpers
  infoDialogTitle: string;
  infoDialogConfirm: string;

  // Onboarding Page
  onboardingTitle: string;
  onboardingSubtitle: string;
  onboardingWelcomeMessage: string;

  // Step 1: API Configuration
  step1Title: string;
  step1Description: string;
  step1Detail1: string;
  step1Detail2: string;
  step1Detail3: string;
  step1Detail4: string;
  step1Detail5: string;
  step1Detail6: string;
  step1ActionPrimary: string;
  step1ActionSecondary: string;

  // Step 2: Additional Vaults
  step2Title: string;
  step2Description: string;
  step2Detail1: string;
  step2Detail2: string;
  step2Detail3: string;
  step2Detail4: string;
  step2ActionPrimary: string;
  step2ActionSecondary: string;

  // Step 3: Main Features
  step3Title: string;
  step3Description: string;
  step3Section1Title: string;
  step3Section1Detail1: string;
  step3Section1Detail2: string;
  step3Section2Title: string;
  step3Section2Detail1: string;
  step3Section2Detail2: string;
  step3Section2Detail3: string;
  step3Section2Detail4: string;
  step3Section2Detail5: string;
  step3Section2Detail6: string;
  step3Section3Title: string;
  step3Section3Detail1: string;
  step3Section3Detail2: string;
  step3Section3Detail3: string;
  step3Section3Detail4: string;
  step3ActionPrimary: string;
  step3ActionSecondary: string;

  // Step 4: Auxiliary Features
  step4Title: string;
  step4Description: string;
  step4Detail1: string;
  step4Detail2: string;
  step4Detail3: string;
  step4Detail4: string;
  step4ActionPrimary: string;
  step4ActionSecondary: string;

  // Step 5: More Features
  step5Title: string;
  step5Description: string;
  step5Detail1: string;
  step5Detail2: string;
  step5Detail3: string;
  step5ActionPrimary: string;
  step5ActionSecondary: string;

  // Onboarding Actions
  skipOnboarding: string;
  completeOnboarding: string;
  onboardingFooterNote: string;
  onboardingCompleted: string;
  onboardingCompletedMessage: string;
  onboardingLinkText: string;

  // Footer links
  footerSuggestionsLink: string;
  footerSupportLink: string;
  footerContactLink: string;

  // Suggestions modal
  suggestionsModalTitle: string;
  suggestionsModalDescription: string;
  suggestionsModalReddit: string;
  suggestionsModalXiaohongshu: string;
  suggestionsModalGithub: string;
  suggestionsModalQrPlaceholder: string;

  // Contact modal
  contactModalTitle: string;
  contactModalDescription: string;
  contactModalCloseButton: string;

  // Support modal (onboarding)
  supportModalTitle: string;
  supportModalDescription: string;
  supportLinkKofi: string;
  supportLinkAfdian: string;

  // Version and changelog
  versionNumber: string;
  changelogModalTitle: string;

  // Fragment examples
  fragmentFootnoteExampleContent: string;
  fragmentFootnoteExampleComment: string;
  fragmentContextHighlightExampleTitle: string;
  fragmentContextHighlightExampleContent: string;

}
