import type { Messages } from '@i18n';
import type { SettingsGuideStep } from '@shared/settingsGuide';

export function settingsTourSteps(m: Messages, firefox: boolean) {
  return [
    {
      id: 'overview',
      title: m.schemaOverviewTitle,
      selector: '.card',
      text: [m.settingsTourOverview]
    },
    {
      id: 'vault',
      title: m.settingsConnectVault,
      selector: '.storage-vault-table-scroll',
      text: [firefox ? m.settingsVaultFirefox : m.settingsVaultLocal, m.settingsVaultRest],
      link: ['Local REST API with MCP', 'https://github.com/coddingtonbear/obsidian-local-rest-api']
    },
    {
      id: 'routing',
      title: m.routingRulesTitle,
      selector: '.routing-rules-table-scroll',
      text: [m.settingsTourRouting]
    },
    {
      id: 'sources',
      title: m.schemaCaptureSourcesTitle,
      selector: '.video-attachment-path-config',
      text: [
        m.settingsTourSources,
        m.schemaCaptureSourcesAttachmentGuidancePrefix +
          m.schemaCaptureSourcesAttachmentGuidanceLink +
          m.schemaCaptureSourcesAttachmentGuidanceSuffix
      ],
      link: [
        'Custom Attachment Location',
        'https://github.com/mnaoumov/obsidian-custom-attachment-location'
      ]
    },
    {
      id: 'reading',
      title: m.readingConfigTitle,
      selector: '.highlight-theme-control',
      text: [m.settingsTourReading, m.schemaCaptureBehaviorSidebarHighlightsNote],
      link: ['Sidebar Highlights', 'https://github.com/trevware/obsidian-sidebar-highlights']
    },
    {
      id: 'selection',
      title: m.fragmentSelectionTriggerModeLabel,
      selector: '.selection-trigger-inline',
      text: [m.settingsTourSelection]
    },
    { id: 'output', title: m.schemaOutputTitle, selector: '.card', text: [m.settingsTourOutput] },
    {
      id: 'maintenance',
      title: m.schemaMaintenanceTitle,
      selector: '.group .card',
      text: [m.settingsTourMaintenance]
    },
    {
      id: 'ai',
      title: m.aiConfigTitle,
      selector: '.ai-config-widget',
      text: [m.aiConfigDescription, m.aiConfigManual]
    }
  ] satisfies Array<{
    id: SettingsGuideStep;
    title: string;
    selector: string;
    text: string[];
    link?: string[];
  }>;
}
