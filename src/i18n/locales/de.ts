import type { LocaleDefinition } from '../localeDefinition';
import type { Messages } from '../messages';

const runtime: Messages = {
  // General
  extensionName: 'All in Ob',
  extensionSubtitle: 'Konfigurieren Sie Ihren Clipper für intelligenteres Content-Management',

  // Usage dashboard
  usageDashboardTitle: 'Nutzungsübersicht',
  usageDashboardSubtitle: 'Sehen Sie, wie oft jeder Clip-Typ gespeichert wird',
  usageTotalLabel: 'Gesamte Speicherungen',
  usageAiLabel: 'KI-Gespräche',
  usageFragmentLabel: 'Lesen + Video + Fragmente',
  usageArticleLabel: 'Artikel',

  // Settings page sections
  settingsTitle: 'Einstellungen',
  languageSettings: 'Spracheinstellungen',
  languageLabel: 'Oberflächensprache',
  languageHint: 'Wählen Sie Ihre bevorzugte Sprache für die Benutzeroberfläche',
  featureUnstableNote: 'Funktion instabil',
  featureUntestedNote: 'Noch nicht getestet, könnte instabil sein',

  // API Configuration
  apiConfigTitle: 'Obsidian Local REST API',
  apiConfigHint:
    'Dies ist der Standard-Tresor; alles, was nicht den Routing-Regeln entspricht, wird hier gespeichert.',
  httpsUrlLabel: 'HTTPS URL',
  httpsUrlHint: 'Normalerweise Port 27124, für sichere Verbindungen',
  additionalVaultHttpsHint:
    'Verwenden Sie einen eindeutigen Port; nicht mit anderen Tresoren teilen',
  httpUrlLabel: 'HTTP URL',
  httpUrlHint: 'Normalerweise Port 27123, als Fallback-Verbindung',
  vaultNameLabel: 'Tresor-Name',
  vaultNamePlaceholder: 'IhrTresor',
  vaultNameHint: 'Der Name Ihres Obsidian-Tresors',
  apiKeyLabel: 'API-Schlüssel',
  apiKeyPlaceholder: 'Ihr API-Schlüssel',
  apiKeyHint: 'Erhalten Sie dies aus den Obsidian Local REST API Plugin-Einstellungen',
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
  templateConfigTitle: 'Pfad-Template-Konfiguration',
  templateConfigHint: 'Definieren Sie Namensvorlagen für jede gespeicherte Inhaltsart',
  articleTemplateLabel: 'Artikel-Pfad-Template',
  articleTemplateHint: 'Zum Speichern vollständiger Artikel von Webseiten',
  fragmentTemplateLabel: 'Fragment-Pfad-Template',
  fragmentTemplateHint: 'Für schnelles Speichern durch Auswahl oder Clipper-Panel',
  readingTemplateLabel: 'Lesemodus-Pfad-Template',
  readingTemplateHint: 'Wählen Sie, wo Lesemodus-Exporte gespeichert werden sollen',
  readingTemplateOptionArticle: 'Gleicher Pfad wie Artikel',
  readingTemplateOptionFragment: 'Gleicher Pfad wie Fragment',
  readingTemplateOptionCustom: 'Benutzerdefinierter Pfad',
  aiTemplateLabel: 'KI-Chat-Pfad-Template',
  aiTemplateHint: 'Zum Speichern von KI-Chat-Gesprächen',
  availableVariables: 'Verfügbare Variablen:',
  templateVariableNote:
    '{slug} ist der slugifizierte Titel. Verwenden Sie {HHmmss} oder {HHmm}, um die Aufnahmezeit einzubetten; kleingeschriebenes {mm} steht weiterhin für den Monat.',

  // Domain Mapping
  domainMappingTitle: 'Domain-Mapping-Konfiguration',
  domainMappingHint:
    'Konfigurieren Sie benutzerfreundliche Ordnernamen für häufige Domains (z.B. medium.com zu "Medium" zuordnen)',
  domainLabel: 'Domain',
  folderNameLabel: 'Ordnername',
  addMappingButton: '+ Mapping hinzufügen',
  domainMappingDomainPlaceholder: 'z.B. medium.com',
  domainMappingNamePlaceholder: 'z.B. Medium',
  domainMappingDeleteButton: 'Löschen',

  // YAML Configuration
  yamlFieldArrayPlaceholder: 'Ein Eintrag pro Zeile',
  yamlFieldArrayHint: 'Gib pro Zeile einen Eintrag ein; beim Export entsteht ein YAML-Array.',
  yamlFieldArrayPreviewEmpty: 'Noch keine Einträge',
  yamlFieldValuePathExamplesTitle: 'Häufige Kontext-Schlüssel',
  yamlFieldValuePathExamples: 'meta.author\nstats.wordCount\nextra.notes[0]',
  yamlDomainTitle: 'Domain-Overrides',
  yamlDomainHint:
    'Lege domainspezifische YAML-Felder fest. Sie überschreiben die globalen Einstellungen.',
  yamlDomainAddRule: '+ Domain-Regel hinzufügen',
  yamlDomainEmpty: 'Noch keine domainspezifischen Regeln.',
  yamlDomainPlaceholder: 'z.B. example.com oder *.example.com',
  yamlDomainContentTypeLabel: 'Inhaltstyp',
  yamlDomainAddField: '+ Feld hinzufügen',
  yamlDomainRemoveRule: 'Regel entfernen',
  yamlDomainFieldEmpty: 'Keine Felder konfiguriert',
  yamlDomainFieldEnabled: 'Aktiviert',
  yamlDomainFieldRemove: 'Entfernen',
  yamlDomainFieldValuePlaceholder: 'Standardwert (optional)',
  yamlDomainFieldArrayPlaceholder: 'Ein Eintrag pro Zeile',
  yamlDomainFieldArrayHint: 'Unterstützt mehrere Zeilen; der Export erstellt ein YAML-Array.',
  yamlDomainFieldArrayPreviewEmpty: 'Noch keine Array-Einträge',
  yamlDomainValuePathLabel: 'Value path (optional)',
  yamlDomainValuePathPlaceholder: 'z.B. meta.author',
  yamlDomainErrorDomainRequired: 'Domain darf nicht leer sein.',
  yamlDomainErrorDomainDuplicate:
    'Für diesen Inhaltstyp existiert bereits eine Regel für diese Domain.',
  yamlDomainErrorFieldRequired: 'Füge mindestens ein Feld hinzu.',
  yamlDomainErrorFieldDuplicate: 'In derselben Regel sind Felder doppelt vorhanden.',
  yamlDomainErrorFieldUnsupported: 'Feld ist für diesen Inhaltstyp nicht verfügbar:',
  yamlDomainErrorValueInvalid: 'Standardwert passt nicht zum Feldtyp:',
  yamlDomainErrorValuePathInvalid: 'Value path darf keine Leerzeichen enthalten.',
  yamlDomainWarningUnresolved: 'Behebe die markierten Fehler, bevor du speicherst.',

  // Config Transfer
  configTransferTitle: 'Konfigurationssynchronisation',
  configTransferHint: 'Einmal kopieren und überall importieren, um Browser zu synchronisieren.',
  copyConfigButton: 'Konfiguration kopieren',
  importConfigButton: 'Aus Zwischenablage importieren',
  configTransferNote:
    'Diese Aktionen verwenden die System-Zwischenablage—stellen Sie sicher, dass der Browser Zugriffsberechtigung hat.',
  copyConfigSuccess: '✅ Konfiguration in Zwischenablage kopiert',
  importSuccess: '✅ Konfiguration importiert und gespeichert',
  importParseFailed: '❌ Konfiguration konnte nicht geparst werden',
  emptyImportError: 'Zwischenablage leer, bitte kopieren Sie zuerst die Konfiguration',
  clipboardUnavailable: 'Zwischenablage nicht verfügbar, bitte manuell kopieren',
  clipboardReadUnavailable:
    'Zwischenablage kann nicht gelesen werden. Gewähren Sie Zwischenablage-Berechtigungen und versuchen Sie es erneut.',
  invalidTaxonomy: 'Klassifikator-Taxonomie muss gültiges JSON sein',

  // AI Chat Configuration
  aiChatConfigTitle: 'KI-Chat-Speicher-Konfiguration',
  aiChatConfigHint: 'Konfigurieren Sie Format und Inhalt von KI-Chat-Speicherungen',
  aiSupportedPlatformsToggle: 'Unterstützte KI-Plattformen anzeigen',
  includeTimestampsLabel: 'Nachrichten-Zeitstempel einschließen',
  includeTimestampsHint: 'Sendezeit nach jeder Nachricht anzeigen (falls verfügbar)',
  userNameLabel: 'Benutzername',
  userNamePlaceholder: 'BENUTZER',
  userNameHint: 'Angezeigten Namen für Benutzernachrichten anpassen, Standard "BENUTZER"',
  captureContextLabel: 'Umgebenden Kontext erfassen (experimentell)',

  // Deep Research Configuration
  deepResearchConfigTitle: 'Gemini Deep Research Konfiguration',
  deepResearchConfigHint: 'Konfigurieren Sie, wie Deep Research Berichte erfasst werden',
  pureModeLabel: 'Reiner Modus (nur Berichtsinhalt erfassen)',
  pureModeHint:
    'Wenn aktiviert, erfasst nur den Deep Research Berichtsinhalt, schließt Gesprächsnachrichten aus',
  multipleReportsInfo:
    'ℹ️ Über mehrere Berichte: Gemini kann nur einen vollständigen Bericht gleichzeitig anzeigen. Um mehrere Berichte zu speichern, öffnen Sie jeden Bericht separat und speichern Sie sie.',

  readingConfigTitle: 'Lesemodus',
  readingConfigHint: 'Wählen Sie, wie der Lesesitzungs-Export Inhalte erfassen soll',
  readingExportModeLabel: 'Inhalt exportieren',
  readingExportModeHighlights: 'Nur hervorgehobene Ausschnitte',
  readingExportModeFull: 'Vollständiger Artikel mit Hervorhebungen',
  readingExportModeDescription:
    'Bei Auswahl von "Vollständiger Artikel" wird der bereinigte Artikelkörper mit eingebetteten Hervorhebungen und Fußnoten gespeichert.',
  readingHighlightThemeLabel: 'Hervorhebungsfarbe',
  readingHighlightThemeDescription:
    'Betrifft nur den Hervorhebungsstil im Lesemodus; das exportierte Markdown bleibt unverändert.',
  readingHighlightThemeGradient: 'Lila-blauer Gradient (Standard)',
  readingHighlightThemePurple: 'Einfarbig lila',
  readingHighlightThemeNeonYellow: 'Neongelb',
  readingHighlightThemeNeonGreen: 'Neongrün',
  readingHighlightThemeNeonOrange: 'Neonorange',

  fragmentConfigTitle: 'Fragment-Speicher-Konfiguration',
  fragmentConfigHint: 'Konfigurieren Sie, wie Textauswahlen gespeichert und formatiert werden',
  fragmentUseFootnoteLabel: 'Fußnoten-Format verwenden (empfohlen)',
  fragmentUseFootnoteHint:
    'Wenn aktiviert, werden Kommentare im Obsidian-Fußnoten-Format gespeichert, kompatibel mit dem Sidebar Highlights Plugin',
  fragmentCaptureContextHint:
    'Wenn aktiviert, erfasst Kontext um den ausgewählten Text und markiert die tatsächliche Hervorhebung mit ==Hervorhebung==',
  fragmentFootnoteExampleTitle: 'Beispiel für Fußnoten-Format:',
  fragmentModifierToggleLabel: 'Modifikatortasten-Aktivierung für Speichern/Lesen aktivieren',
  fragmentModifierToggleDescription:
    'Wenn Sie die ausgewählten Modifikatortasten gedrückt halten und ziehen, um Text auszuwählen, öffnet sich automatisch der Clipper-Dialog oder die Lese-Hervorhebung.',
  fragmentModifierKeysLabel: 'Modifikatortasten-Auswahl',
  fragmentModifierKeysDescription:
    'Alle markierten Modifikatortasten müssen zusammen gehalten werden, um die automatische Aktion zu aktivieren.',
  fragmentModifierKeyAlt: 'Option / Alt',
  fragmentModifierKeyMeta: 'Command',
  fragmentModifierKeyCtrl: 'Control',
  fragmentModifierKeyShift: 'Shift',
  fragmentKeyboardShortcutsLabel: 'Clipper-Dialog-Tastenkürzel aktivieren',
  fragmentKeyboardShortcutsHint:
    'Im Clipper-Dialog: Doppel-Enter für Lesemodus, Cmd+Enter (Mac) oder Alt+Enter (Windows) für direktes Speichern',

  // Clipper dialog keyboard shortcuts
  clipperCommentEditCompleted:
    'Kommentar-Bearbeitung abgeschlossen, Sie können Tastenkürzel verwenden, um die folgenden Aktionen auszuführen:',
  clipperShortcutHintDoubleEnter: 'Doppel-Enter',
  clipperShortcutHintModifierEnter: 'Direkt speichern',
  clipperShortcutHintEscape: 'Abbrechen',

  // Button shortcut hints
  clipperShortcutDoubleEnter: 'Doppel ↵',
  clipperShortcutModifierEnter: 'Cmd ↵',
  clipperShortcutEsc: 'Esc',
  clipperShortcutSetupLink: 'Tastenkürzel für reibungslosere Erfahrung einrichten',

  // Classifier Configuration
  classifierConfigTitle: 'KI-Klassifikation und Zusammenfassung',
  classifierConfigHint:
    'LLM verwenden, um gespeicherte Inhalte automatisch zu klassifizieren und zusammenzufassen',
  enableClassifierLabel: 'Intelligente Klassifikation aktivieren',
  classifierUnstableNotice:
    '⚠️ Diese Klassifikationsfunktion ist experimentell und könnte instabil sein.',
  providerLabel: 'LLM-Anbieter',
  endpointLabel: 'API-Endpunkt',
  endpointPlaceholder: 'http://localhost:11434/api/chat',
  modelLabel: 'Modellname',
  modelPlaceholder: 'llama3.1',
  taxonomyLabel: 'Taxonomie',
  taxonomyHint: 'Klassifikations-Taxonomie im JSON-Format definieren',

  // Buttons
  saveButton: '💾 Konfiguration speichern',
  diagnoseButton: '🔍 Konfiguration diagnostizieren',
  fixButton: '🔧 Konfiguration reparieren',
  reloadButton: '🔄 Neu laden',
  testConnectionButton: '⚡ Verbindung testen',
  testConnectionButton_short: '⚡ Testen',

  // Messages
  saveSuccess: '✅ Konfiguration gespeichert',
  saveFailed: '❌ Speichern fehlgeschlagen',
  configFixed: '✅ Konfiguration repariert und gespeichert',
  fixFailed: '❌ Reparatur fehlgeschlagen',
  reloadPrompt: 'Bitte laden Sie die Seite neu, um die reparierte Konfiguration zu sehen',
  connectionTesting: 'Verbindung wird getestet...',
  connectionSuccessShort: 'Verbindung erfolgreich',
  portConflictDetected:
    '⚠️ Port-Konflikt erkannt: {ports}. Bitte weisen Sie eindeutige Ports in Obsidian zu, bevor Sie es erneut versuchen.',
  connectionFailureHintsTitle: 'Nächste Schritte: ',
  connectionFailureHintCheckApiKey:
    'Überprüfen Sie, ob der API-Schlüssel mit den Local REST API Einstellungen übereinstimmt',
  connectionFailureHintCheckVault:
    'Bestätigen Sie, dass der Tresor-Name mit dem Local REST API Plugin übereinstimmt',
  connectionFailureHintCheckService:
    'Stellen Sie sicher, dass Obsidian und das Local REST API Plugin laufen',
  connectionFailureHintGeneric: 'Netzwerk überprüfen oder Local REST API Service neu starten',

  // Diagnosis
  diagnosisTitle: 'Konfigurationsdiagnose',
  diagnosisDescription:
    'Klicke auf „Konfiguration diagnostizieren“, um Prüfergebnisse und Reparaturhinweise hier anzuzeigen.',
  diagnosisSummaryHint:
    'Die Diagnose prüft REST API, Pfadvorlagen, Domain-Zuordnungen, Multi-Vault-Routing und verwandte Einstellungen und erstellt einen Detailbericht.',
  diagnosisResultTitle: 'Diagnoseergebnisse',

  // Notifications
  clipSuccess: 'In Obsidian gespeichert',
  clipFailed: 'Speichern fehlgeschlagen',
  extractionFailed: 'Inhaltsextraktion fehlgeschlagen',
  connectionFailed: 'Verbindung fehlgeschlagen',
  scriptInjectionFailed: 'Content-Script-Injektion fehlgeschlagen',
  classificationFallbackTitle: 'Klassifikator-Warnung: Standard-Kategorien angewendet',
  classificationFallbackMessage: 'Grund: {reason}',
  classificationFallbackDefaultReason: 'Unbekannter Fehler',

  // Context Menu
  clipFullPage: 'Vollständige Seite in Obsidian speichern',
  clipSelection: 'Auswahl in Obsidian speichern',
  readerStart: '🖍️ Eingebettete Lese-Erfassung starten',
  contextMenuVideoMode: '🎬 Video-Erfassungsmodus betreten',

  // Reader Mode
  readerPanelTitle: 'Lesesitzung aktiv',
  readerPanelStatus: 'Text auswählen zum Hervorheben und Annotieren',
  readerPanelHint:
    'Tipp: Maus loslassen, um Annotations-Dialog zu öffnen; leer lassen, um nur Hervorhebung zu speichern.',
  readerPanelFinish: 'Beenden und exportieren',
  readerPanelCancel: 'Abbrechen',
  readerPanelCounter: '{count} Hervorhebungen gesammelt',
  readerPanelCounterZero: '0 Hervorhebungen gesammelt',
  readerHighlightEditLabel: 'Notiz bearbeiten',
  readerHighlightDeleteLabel: 'Hervorhebung löschen',
  readerHighlightNoComment: 'Noch keine Notiz',
  readerHighlightSaveLabel: 'Notiz speichern',
  readerHighlightCancelLabel: 'Abbrechen',
  readerHighlightEditPlaceholder: 'Bearbeiten Sie Ihre Notiz hier...',
  readerHighlightFocusLabel: 'Zu Hervorhebung {index} gehen',
  readerHintNoHighlights: 'Noch keine Hervorhebungen. Wählen Sie zuerst Text aus.',
  readerHintExporting: 'Markdown wird generiert...',
  readerHintFailure: 'Export fehlgeschlagen, versuchen Sie es später erneut.',
  readerHintSelectionFailure: 'Hervorhebung fehlgeschlagen, versuchen Sie es erneut.',

  // Privacy Settings
  privacySettingsTitle: 'Datenschutz und Daten',
  privacySettingsDescription:
    'Verwalten Sie Analytik-Sammlung und anonyme Fehlerberichterstattung.',
  privacySettingsNote: 'Datensammlung und Fehlerberichterstattung verwalten',
  analyticsDebugTitle: 'Debug-Modus',
  analyticsDebugDescription:
    'Wenn aktiviert, senden wir Ereignisse an GA4 DebugView und protokollieren Anfrage-Details in der Konsole. Nur zur Fehlerbehebung verwenden.',
  analyticsDebugDisabledHint:
    'Aktivieren Sie sowohl "Nutzungsanalytik" als auch "Fehlerberichterstattung", bevor Sie den Debug-Modus aktivieren.',
  analyticsDebugEnabled:
    'Debug-Modus aktiviert. Vergessen Sie nicht, ihn nach dem Debugging zu deaktivieren.',
  analyticsDebugDisabled: 'Debug-Modus deaktiviert.',
  analyticsConsentTitle: 'Nutzungsanalytik',
  analyticsConsentDescription:
    'Anonymisierte Nutzungsmetriken sammeln, um die Erweiterung zu verbessern. Keine persönlichen Informationen werden gespeichert.',
  errorReportingConsentTitle: 'Fehlerberichterstattung',
  errorReportingConsentDescription:
    'Automatisch bereinigte Fehlerberichte senden, damit wir Probleme schnell diagnostizieren können.',
  errorReportingDetailsTitle: 'Erfahren Sie, was enthalten ist',
  errorReportingCollectedTitle: 'Gesammelte Informationen:',
  errorReportingCollectedError: 'Fehlertyp und Schweregrad',
  errorReportingCollectedBrowser: 'Browser-Name und Hauptversion',
  errorReportingCollectedExtension: 'Erweiterungsversion',
  errorReportingCollectedTimestamp: 'Wann der Fehler aufgetreten ist',
  errorReportingNotCollectedTitle: 'Nicht gesammelt:',
  errorReportingNotCollectedPersonal: 'Persönlich identifizierbare Informationen',
  errorReportingNotCollectedUrls: 'Genaue URLs, die Sie besuchen',
  errorReportingNotCollectedContent: 'Gespeicherte Inhalte oder Seitentext',
  errorReportingNotCollectedPasswords: 'Passwörter oder sensible Formulardaten',
  savePrivacySettings: 'Einstellungen speichern',
  clearAllAnalyticsData: 'Alle Daten löschen',
  privacyFooterText:
    'Wir sind dem Schutz Ihrer Privatsphäre verpflichtet. Sie können diese Einstellungen jederzeit aktualisieren oder die Löschung gesammelter Daten anfordern.',
  privacyPolicyLink: 'Datenschutzrichtlinie',
  dataUsageLink: 'Datennutzungsdetails',
  privacySettingsSaved: 'Datenschutzeinstellungen gespeichert',
  privacyDataWillBeCleared:
    'Datensammlung deaktiviert. Bestehende Analytik wird innerhalb von 24 Stunden gelöscht.',
  privacySettingsError: 'Einstellungen konnten nicht gespeichert werden, versuchen Sie es erneut.',
  confirmClearAllData:
    'Alle Analytik-Daten löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
  allDataCleared: 'Alle Analytik-Daten wurden gelöscht.',
  clearDataError: 'Daten konnten nicht gelöscht werden, versuchen Sie es erneut.',

  // Video Mode
  videoPanelTitle: 'Video-Erfassungsmodus',
  videoPanelStatus: 'Zeitstempel und schnelle Notizen erfassen',
  videoPanelHint:
    'Tipp: Textauswahl fügt es automatisch hinzu; Enter zweimal drücken, um Notizen zu speichern, Esc zum Abbrechen.',
  videoPanelAdd: 'Aktuellen Zeitstempel erfassen',
  videoPanelFinish: 'Beenden und exportieren',
  videoPanelCancel: 'Abbrechen',
  videoPanelCounter: '{count} Einträge gespeichert',
  videoPanelCounterZero: '0 Einträge gespeichert',
  videoConfigTitle: 'Video-Modus',
  videoConfigHint:
    'Eingabeaufforderungen auf unterstützten Video-Websites anzeigen, um Zeitstempel und Notizen zu erfassen',
  videoFloatingPromptLabel: 'Schwebende Eingabeaufforderung auf Video-Seiten anzeigen',
  videoFloatingPromptHint:
    'Funktioniert auf YouTube und Bilibili. Eine Schnellzugriffs-Blase erscheint in der unteren rechten Ecke.',
  videoPromptCustomizationTitle: 'Text und Shortcut des Floating-Prompts',
  videoPromptLabelTitle: 'Beschriftung des Prompt-Buttons',
  videoPromptLabelPlaceholder: 'z. B. Video-Notizen starten',
  videoPromptLabelHint:
    'Wird als aria-label des Floating-Buttons für Screenreader und Hover-Hinweise verwendet.',
  videoPromptShortcutTitle: 'Prompt-Shortcut',
  videoPromptShortcutPlaceholder: 'z. B. Alt+V',
  videoPromptShortcutHint:
    'Wird im Floating-Prompt angezeigt. Bevorzuge Alt/Cmd-Kombinationen, damit sie leichter zu merken sind.',
  videoSupportedPlatformsTitle: 'Unterstützte Plattformen',
  videoPlatformSupportedBadge: 'SUPPORTED',
  videoEnableButton: 'Video-Notizen aktivieren',
  videoSaveConfigButton: 'Videoeinstellungen speichern',
  videoPlatformYoutubeName: 'YouTube',
  videoPlatformYoutubeDescription:
    'Unterstützt watch- und short-Seiten, erkennt den Floating-Prompt automatisch und öffnet den Video-Notizmodus mit einem Klick.',
  videoPlatformBilibiliName: 'Bilibili',
  videoPlatformBilibiliDescription:
    'Unterstützt BV/AV-Seiten, lässt Platz für Danmaku und zeigt den Shortcut-Hinweis an.',
  videoTimestampSectionTitle: 'Video-Zeitstempel',
  videoFragmentSectionTitle: 'Erfasste Fragmente',
  videoCaptureEditLabel: 'Notiz bearbeiten',
  videoCaptureDeleteLabel: 'Erfassung löschen',
  videoCaptureNoComment: 'Noch keine Notiz',
  videoCaptureSaveLabel: 'Notiz speichern',
  videoCaptureCancelLabel: 'Abbrechen',
  videoCaptureEditPlaceholder: 'Eine Notiz für diesen Zeitstempel hinzufügen...',
  videoCaptureFocusLabel: 'Zu Erfassung {index} gehen',
  videoHintNoVideo: 'Warten auf Video-Element...',
  videoHintReady:
    'Klicken Sie auf +, um den aktuellen Zeitstempel zu erfassen. Notizen werden automatisch gespeichert.',
  videoHintNoCaptures: 'Noch keine Erfassungen. Beginnen Sie mit einem Klick auf die +-Taste.',
  videoHintSaving: 'Erfassung wird gespeichert...',
  videoHintExporting: 'Markdown-Export wird generiert...',
  videoHintFailure: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
  clipSelectionVideo: 'In Video-Erfassungspanel ausschneiden',
  videoPromptTitle: 'Video-Modus verfügbar',
  videoPromptDescription:
    'Klicken Sie, um den Video-Modus zu starten und Zeitstempel und Notizen zu speichern.',
  videoPromptAction: 'Video-Modus starten',
  videoPromptDismiss: 'Video-Eingabeaufforderung verwerfen',

  // Support Prompt
  supportPromptDialogLabel: 'All in Ob unterstützen',
  supportPromptTitle: 'All in Ob unterstützen',
  supportPromptKoFiTitle: 'Ko-fi',
  supportPromptKoFiDescription: 'Kaufen Sie mir einen Kaffee',
  supportPromptAfdianTitle: 'Afdian',
  supportPromptAfdianDescription: 'Chinesische Spenden-Plattform',
  supportPromptGithubTitle: 'GitHub',
  supportPromptGithubDescription: 'Feedback senden',
  supportPromptFeedbackGroupLabel: 'Schnelles Feedback',
  supportPromptLikeLabel: 'Gefällt mir',
  supportPromptDislikeLabel: 'Gefällt mir nicht',
  supportPromptDismiss: 'Klicken Sie irgendwo außerhalb zum Schließen',
  supportPromptStatusSuccess: 'Übermittlung erfolgreich',
  supportPromptStatusSuccessWithVault: 'Erfolgreich an {vault} gesendet',
  supportPromptStatusWarning: 'Gespeichert, aber Klassifikation fehlgeschlagen',
  supportPromptStatusWarningWithReason: 'Gespeichert, aber Klassifikation fehlgeschlagen: {reason}',
  supportPromptStatusFailure: 'Übermittlung fehlgeschlagen',
  supportPromptStatusFailureWithReason: 'Übermittlung fehlgeschlagen, {reason}',
  supportPromptLikeThankYou: 'Danke für die Ermutigung!',
  supportPromptReviewLinkLabel: 'Eine Bewertung schreiben',
  supportPromptReviewAcknowledgedLabel: 'Ich habe bereits eine Bewertung hinterlassen',
  supportPromptDislikeToastTitle: 'Teilen Sie Ihr Feedback',
  supportPromptDislikeRedditLinkLabel: 'Auf Reddit diskutieren',
  supportPromptDislikeQrLinkLabel: 'Xiaohongshu-Gruppe beitreten',
  supportPromptDislikeQrPlaceholder: 'QR-Code kommt bald',

  // Dialog
  clipDialogTitle: 'Auswahl ausschneiden',
  clipDialogInstructions:
    'Verwenden Sie Tab, um zwischen Steuerelementen zu wechseln. Drücken Sie Alt + Pfeiltasten, um den Dialog zu verschieben.',
  commentLabel: 'Kommentar hinzufügen (optional)',
  commentPlaceholder: 'Geben Sie hier Ihre Gedanken, Notizen oder Kommentare ein...',
  cancelButton: 'Abbrechen',
  cancelButton_short: 'Abbrechen',
  clipButton: 'Ausschneiden',
  clipButton_short: 'Clippen',
  openReaderButton: 'Lesemodus betreten',
  addToReaderButton: 'Zur Lesesitzung hinzufügen',
  openVideoModeButton: 'Video-Modus betreten',

  // Multi-Vault
  additionalVaultsTitle: 'Zusätzliche Tresore',
  additionalVaultsHint:
    'Fügen Sie weitere Tresore hinzu und leiten Sie Inhalte automatisch mit Regeln weiter.',
  addVaultButton: '+ Tresor hinzufügen',
  multiVaultNameLabel: 'Tresor-Name',
  multiVaultNamePlaceholder: 'Mein Notizen-Tresor',
  multiVaultNameHint: 'Benutzerfreundlicher Name zur Identifikation dieses Tresors',
  deleteVaultButton: 'Löschen',
  deleteVaultConfirm: 'Diesen Tresor löschen? Zugehörige Routing-Regeln werden ebenfalls gelöscht.',
  defaultVaultBadge: 'Standard-Tresor',
  deleteVaultDialogTitle: 'Tresor löschen',
  deleteRuleDialogTitle: 'Regel löschen',

  yamlConfigTitle: 'YAML-Konfiguration',
  yamlConfigNote: 'Einheitliche Konfiguration für YAML-Felder festlegen (Vorschau)',
  yamlConfigPlaceholder:
    'Diese Funktion befindet sich noch in Planung. Das aktuelle Layout ist eine Vorschau; künftige Versionen unterstützen benutzerdefinierte Feldtypen, Inhaltstypen und Standardwerte.',
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
  infoDialogTitle: 'Hinweis',
  infoDialogConfirm: 'Verstanden',

  // Routing Rules
  routingRulesTitle: 'Routing-Regeln',
  routingRulesHint:
    'Automatisch einen Ziel-Tresor nach Domain, Schlüsselwörtern oder URL-Mustern auswählen. Elemente, die nicht übereinstimmen, gehen in den Standard-Tresor.',
  routingRulesPriorityNote:
    'Tipp: Regeln mit höherer Priorität greifen zuerst, und Ziel-Tresore müssen aktiviert bleiben.',
  vaultRulesTitle: 'Routing-Regeln',
  ruleEmptyPlaceholder:
    'Noch keine Regeln. Fügen Sie eine hinzu, um Clips zu diesem Tresor zu leiten.',
  addRuleButton: '+ Regel hinzufügen',
  ruleTypeLabel: 'Regeltyp',
  ruleTypeDomain: 'Domain-Übereinstimmung',
  ruleTypeKeyword: 'Schlüsselwort-Übereinstimmung',
  ruleTypeUrlPattern: 'URL-Muster',
  rulePatternLabel: 'Übereinstimmungsmuster',
  rulePatternPlaceholder: 'z.B. example.com;news.example.com oder wort1,wort2',
  ruleTargetVaultLabel: 'Ziel-Tresor',
  rulePriorityLabel: 'Priorität',
  rulePriorityHint: 'Höhere Zahlen bedeuten höhere Priorität.',
  ruleDescriptionLabel: 'Beschreibung',
  ruleDescriptionPlaceholder: 'z.B. Tech-Artikel in Arbeits-Tresor speichern',
  ruleDescriptionHint: 'Hilft Ihnen zu erinnern, wofür diese Regel ist.',
  ruleEnabledLabel: 'Aktiviert',
  deleteRuleButton: 'Löschen',
  ruleDeleteConfirm: 'Diese Regel löschen?',
  ruleNoVaultOption: 'Fügen Sie zuerst einen zusätzlichen Tresor hinzu',
  ruleAddVaultPrompt: 'Bitte fügen Sie zuerst einen zusätzlichen Tresor hinzu.',
  editRuleButton: 'Bearbeiten',

  // Onboarding Page
  onboardingTitle: 'Willkommen bei All in Ob',
  onboardingSubtitle: 'Lassen Sie uns Ihre Clipper-Erweiterung schnell einrichten',
  onboardingWelcomeMessage:
    'Danke für die Installation von All in Ob! Diese Anleitung hilft Ihnen, die Erweiterung schnell einzurichten, damit Sie einfach Web-Inhalte und KI-Gespräche in Obsidian speichern können.',

  // Step 1: API Configuration
  step1Title: 'Obsidian Local REST API konfigurieren (Erforderlich)',
  step1Description:
    'Zuerst müssen Sie das Local REST API Plugin in Obsidian installieren und konfigurieren. Dies ist die Brücke zwischen der Erweiterung und Obsidian.',

  step1Detail1: 'Installieren und aktivieren Sie das "Local REST API" Plugin in Obsidian',
  step1Detail2: 'Aktivieren Sie "Unverschlüsselter Server (HTTP)" in den Plugin-Einstellungen',
  step1Detail3: 'Notieren Sie sich die HTTPS URL (normalerweise https://127.0.0.1:27124)',
  step1Detail4: 'Notieren Sie sich die HTTP URL (normalerweise http://127.0.0.1:27123)',
  step1Detail5:
    'Registrieren Sie Ihren Obsidian-Tresor-Namen und kopieren Sie den Local REST API-Schlüssel',
  step1Detail6:
    'Füllen Sie die obigen Informationen in der Erweiterung aus und führen Sie den Verbindungstest durch',
  step1ActionPrimary: 'API konfigurieren',
  step1ActionSecondary: 'Später konfigurieren',

  // Step 2: Additional Vaults
  step2Title: 'Zusätzliche Tresore konfigurieren (Optional)',
  step2Description:
    'Wenn Sie mehrere Obsidian-Tresore haben, können Sie zusätzliche Tresore konfigurieren und Routing-Regeln einrichten, um verschiedene Inhaltstypen automatisch in entsprechende Tresore zu speichern.',

  step2Detail1: 'Unterstützung für mehrere Obsidian-Tresore',
  step2Detail2: 'Routing-Regeln basierend auf Domain, Schlüsselwörtern oder URL-Mustern einrichten',
  step2Detail3:
    'Beispiel: Tech-Artikel in Arbeits-Tresor speichern, persönliche Inhalte in persönlichen Tresor',
  step2Detail4: 'Inhalte, die keiner Regel entsprechen, werden im Standard-Tresor gespeichert',
  step2ActionPrimary: 'Zusätzliche Tresore konfigurieren',
  step2ActionSecondary: 'Diesen Schritt überspringen',

  // Step 3: Main Features
  step3Title: 'Hauptfunktionen',
  step3Description:
    'Lassen Sie uns schnell die Hauptfunktionen der Erweiterung lernen, um Ihnen bei der besseren Nutzung zu helfen.',

  step3Section1Title: 'Web-Clipping',
  step3Section1Detail1:
    'Klicken Sie auf leere Bereiche von Webseiten, um ganze Seiten zu clippen (warten Sie, bis die Seite vollständig geladen ist und scrollen Sie, um alle Bilder zu laden)',
  step3Section1Detail2:
    'Erkennt automatisch Haupt-KI-Chat-Gespräche und speichert formatierte KI-Dialog-Aufzeichnungen',
  step3Section2Title: 'Clipping-/Lesemodus',
  step3Section2Detail1:
    'Rechtsklick auf ausgewählten Text oder Hilfstasten verwenden, um Inhalte auszuwählen, Kommentare hinzuzufügen und ausgewählte Inhalte mit Anmerkungen in Obsidian zu speichern',
  step3Section2Detail2:
    'Lesemodus betreten, um mehrere Fragmente auf derselben Seite auszuwählen, zu kommentieren und zusammen in Obsidian zu speichern',
  step3Section2Detail3:
    'Lesemodus organisiert automatisch Textfragmente entsprechend dem Seitenlayout, klicken Sie auf Fragmentnummern für schnelle Navigation',
  step3Section2Detail4:
    'Lesemodus kann vollständigen Text in Obsidian mit hervorgehobenem ausgewählten Inhalt speichern',
  step3Section2Detail5:
    'Ob Fragmente oder Lesemodus-Auswahlen, präzise Seitenlinks werden gespeichert, um mit einem Klick zu Web-Positionen zurückzukehren',
  step3Section2Detail6:
    'Installieren Sie das Sidebar Highlights Plugin in Obsidian für bequemere Anmerkungsvisualisierung',
  step3Section3Title: 'Video-Modus',
  step3Section3Detail1:
    'Angepasste YouTube- oder Bilibili-Wiedergabeseiten, öffnen Sie den Video-Modus, um Video-Zeitstempel aufzuzeichnen und jederzeit Notizen hinzuzufügen',
  step3Section3Detail2:
    'Klicken Sie auf Nummern neben Zeitstempeln für Ein-Klick-Navigation und wiederholte Anzeige',
  step3Section3Detail3: 'Seitentext auswählen und aufregende Kommentare mit einem Klick erfassen',
  step3Section3Detail4:
    'Nach dem Speichern in Obsidian jederzeit mit einem Klick zu präzisen Video-Zeitstempeln zurückkehren',
  step3ActionPrimary: 'Detaillierte Einstellungen anzeigen',
  step3ActionSecondary: 'Später lernen',

  // Step 4: Auxiliary Features
  step4Title: 'Hilfsfunktionen',
  step4Description:
    'Die Erweiterung bietet auch verschiedene Hilfsfunktionen, um Ihre Erfahrung bequemer zu machen.',

  step4Detail1:
    'Mehrere Browser auf demselben Gerät: aktuelle Konfiguration mit einem Klick kopieren, einfügen zum Synchronisieren, keine wiederholte Konfiguration erforderlich',
  step4Detail2: 'Domain-Mapping: häufige Websites zu benutzerfreundlichen Ordnernamen zuordnen',
  step4Detail3: 'Benutzerdefinierte Pfadkonfiguration, Pfade nach Ihren Bedürfnissen anpassen',
  step4Detail4:
    'Intelligente Diagnose: Konfigurationsprobleme? Intelligente Diagnose für schnelle Problemlösung',
  step4ActionPrimary: 'Detaillierte Einstellungen anzeigen',
  step4ActionSecondary: 'Später lernen',

  // Step 5: More Features
  step5Title: 'Weitere aufregende Funktionen, kontinuierliche Iteration',
  step5Description:
    'Die Erweiterung entwickelt sich ständig weiter, um Ihnen intelligentere Funktionen zu bringen.',

  step5Detail1: 'Einführung von KI-Funktionen für reibungslosere und intelligentere Erfahrung',
  step5Detail2:
    'Bidirektionale Interaktion, nicht mehr nur Notizen speichern, sondern eine Brücke zwischen Browser und Obsidian',
  step5Detail3:
    'Willkommen, Verbesserungen vorzuschlagen, Entwicklung ist nicht einfach, danke für Ihre Unterstützung',
  step5ActionPrimary: 'Vorschläge senden',
  step5ActionSecondary: 'Unterstützung zeigen',

  // Onboarding Actions
  skipOnboarding: 'Anleitung überspringen',
  completeOnboarding: 'Anleitung abschließen',
  onboardingFooterNote:
    'Sie können diese Optionen jederzeit auf der Einstellungsseite neu konfigurieren.',
  onboardingCompleted: 'Anleitung abgeschlossen!',
  onboardingCompletedMessage:
    'Sie haben die Erweiterungs-Setup-Anleitung erfolgreich abgeschlossen. Jetzt können Sie All in Ob verwenden, um Ihre Web-Inhalte zu speichern!',
  onboardingLinkText: 'Anleitung',

  // Footer links
  footerSuggestionsLink: 'Vorschläge',
  footerSupportLink: 'Unterstützung',
  footerContactLink: 'Autor kontaktieren',

  suggestionsModalTitle: 'Teilen Sie Ihre Vorschläge',
  suggestionsModalDescription:
    'Danke, dass Sie helfen, All in Ob zu verbessern. Sie können den Autor über einen der folgenden Kanäle kontaktieren:',
  suggestionsModalReddit: 'Auf Reddit chatten',
  suggestionsModalXiaohongshu: 'Xiaohongshu beitreten',
  suggestionsModalGithub: 'GitHub Issue',
  suggestionsModalQrPlaceholder:
    'QR-Code wird bald hinzugefügt. Zögern Sie nicht, über Reddit zu schreiben.',

  // Contact modal
  contactModalTitle: 'Autor kontaktieren',
  contactModalDescription:
    'Wenn Sie dieses Produkt schätzen oder sich verbinden möchten, <br>zögern Sie nicht, auf <a href="https://www.reddit.com/user/sxnian/" target="_blank" rel="noopener noreferrer">reddit</a> Kontakt aufzunehmen.<br>Der Autor sucht derzeit nach Arbeit—danke fürs Weitererzählen!',
  contactModalCloseButton: 'Schließen',

  // Support modal (onboarding)
  supportModalTitle: 'Danke für Ihre Unterstützung',
  supportModalDescription:
    'Entwicklung ist nicht einfach. Wenn dieses Plugin Ihnen hilft, sind Sie willkommen, auf folgende Weise zu unterstützen:',
  supportLinkKofi: 'Ko-fi',
  supportLinkAfdian: 'Afdian',

  // Version and changelog
  versionNumber: 'v0.2.0',
  changelogModalTitle: 'Änderungsprotokoll',

  // Fragment examples
  fragmentFootnoteExampleContent: 'Dies ist der Inhalt des ausgewählten Textes',
  fragmentFootnoteExampleComment: 'Dies ist mein Kommentar',
  fragmentContextHighlightExampleTitle: 'Beispiel für Kontext-Hervorhebung:',
  fragmentContextHighlightExampleContent:
    'Kontext davor ==dies ist der ausgewählte Text== Kontext danach'
};

const de: LocaleDefinition = {
  runtime,
  static: {
    extName: 'All in Ob',
    extDescription:
      'KI-verbesserter Web-Clipper zum Speichern von Chats, Fragmenten und Artikeln in Obsidian.'
  }
};

export default de;
