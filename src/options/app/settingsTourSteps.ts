import type { Messages } from '@i18n';
import type { SettingsGuideStep } from '@shared/settingsGuide';
import { fragmentKeyboardShortcutsHint } from './fragmentModifierOptions';

export interface SettingsTourStep {
  id: SettingsGuideStep;
  title: string;
  selector: string;
  text: string[];
  practice: 'fragment' | 'reader' | 'video' | 'library';
  link?: readonly [string, string];
}
export const SETTINGS_TOUR_GROUPS = {
  overview: 'schemaOverviewTitle',
  storage: 'schemaStorageTitle',
  'capture-sources': 'schemaCaptureSourcesTitle',
  'capture-behavior': 'schemaCaptureBehaviorTitle',
  output: 'schemaOutputTitle',
  maintenance: 'schemaMaintenanceTitle'
} as const satisfies Record<string, keyof Messages>;

export function settingsTourSteps(m: Messages, firefox: boolean): SettingsTourStep[] {
  const step = (
    id: SettingsGuideStep,
    title: string,
    selector: string,
    text: string[],
    practice: SettingsTourStep['practice'] = 'fragment',
    link?: SettingsTourStep['link']
  ): SettingsTourStep => ({ id, title, selector, text, practice, ...(link ? { link } : {}) });
  return [
    step(
      'overview',
      m.schemaOverviewUsageGroupTitle,
      '.card:has([data-role="usage-chart-shell"])',
      [m.settingsTourOverview]
    ),
    step('appearance', m.schemaOverviewInterfaceGroupTitle, '.interface-theme-grid', [
      m.settingsTourAppearance
    ]),
    step('privacy', m.schemaOverviewPrivacyGroupTitle, '.card:has(.consent-inline-grid)', [
      m.settingsTourPrivacy
    ]),
    step('vault', m.settingsConnectVault, '.card:has(.storage-vault-table-scroll)', [
      firefox ? m.settingsVaultFirefox : m.settingsVaultLocal
    ]),
    step(
      'rest',
      m.settingsTourRestTitle,
      '.storage-vault-table-scroll tbody tr:first-child td:has(input[type="password"])',
      [m.settingsVaultRest],
      'fragment',
      ['Local REST API with MCP', 'https://github.com/coddingtonbear/obsidian-local-rest-api']
    ),
    step('routing', m.routingRulesTitle, '.card:has(.routing-rules-table-scroll)', [
      m.settingsTourRouting
    ]),
    step(
      'sources',
      m.schemaCaptureSourcesAiConversationTitle,
      '.card:has(.ai-platform-link-row)',
      [m.settingsTourSources],
      'library'
    ),
    step(
      'video',
      m.schemaCaptureSourcesVideoEntryBehaviorTitle,
      '.row:has(.video-entry-toggle-row)',
      [m.settingsTourVideo],
      'video'
    ),
    step(
      'attachments',
      m.schemaCaptureSourcesAttachmentPathGroupTitle,
      '.video-attachment-path-config',
      [
        m.schemaCaptureSourcesScreenshotLocationDescription,
        m.schemaCaptureSourcesScreenshotFilenameDescription,
        m.schemaCaptureSourcesMarkdownUrlDescription,
        m.schemaCaptureSourcesAttachmentGuidancePrefix +
          m.schemaCaptureSourcesAttachmentGuidanceLink +
          m.schemaCaptureSourcesAttachmentGuidanceSuffix
      ],
      'video',
      [
        'Custom Attachment Location',
        'https://github.com/mnaoumov/obsidian-custom-attachment-location'
      ]
    ),
    step(
      'reading',
      m.readingExportModeLabel,
      '.row:has([data-value="full"])',
      [m.settingsTourReading],
      'reader'
    ),
    step(
      'highlight',
      m.readingHighlightThemeLabel,
      '.row:has(.highlight-theme-control)',
      [m.readingHighlightThemeDescription, m.schemaCaptureBehaviorSidebarHighlightsNote],
      'reader',
      ['Sidebar Highlights', 'https://github.com/trevware/obsidian-sidebar-highlights']
    ),
    step('selection', m.fragmentSelectionTriggerModeLabel, '.selection-trigger-inline', [
      m.settingsTourSelection
    ]),
    step(
      'context',
      m.schemaCaptureBehaviorCaptureContextTitle,
      '.row:has(.fragment-context-inline)',
      [m.fragmentCaptureContextHint, m.settingsTourContext]
    ),
    step('shortcuts', m.fragmentKeyboardShortcutsLabel, '.row:has(.keyboard-shortcuts-inline)', [
      fragmentKeyboardShortcutsHint(m)
    ]),
    step(
      'output',
      m.templateConfigTitle,
      '.card:has(.token-row)',
      [m.settingsTourOutput],
      'library'
    ),
    step(
      'mappings',
      m.domainMappingTitle,
      '.card:has(.domain-mapping-table-scroll)',
      [m.settingsTourMappings],
      'library'
    ),
    step(
      'yaml',
      m.yamlConfigTitle,
      '.card:has([data-stitch-widget="yaml-config"])',
      [m.settingsTourYaml],
      'library'
    ),
    step(
      'maintenance',
      m.schemaMaintenanceConfigurationTransferTitle,
      '.settings-transfer-card',
      [m.settingsTourTransfer],
      'library'
    ),
    step(
      'diagnostics',
      m.diagnosisTitle,
      '.settings-diagnostics-card',
      [m.settingsTourDiagnostics],
      'library'
    ),
    step(
      'ai',
      m.aiConfigTitle,
      '.ai-config-widget',
      [m.aiConfigDescription, m.aiConfigManual],
      'library'
    )
  ];
}
