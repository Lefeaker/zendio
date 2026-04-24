export const schemaClassNames = {
  shell: {
    app: 'schema-shell-app',
    sidebar: 'schema-shell-sidebar',
    brand: 'schema-shell-brand',
    navGroup: 'schema-shell-nav-group',
    resourceGroup: 'schema-shell-resource-group',
    navTitle: 'schema-shell-nav-title',
    nav: 'schema-shell-nav',
    navDot: 'schema-shell-nav-dot',
    resourceLink: 'schema-shell-resource-link',
    main: 'schema-shell-main'
  },
  common: {
    pill: 'schema-pill',
    compactInlineNotice: 'compact-inline-notice'
  },
  settings: {
    themeSegmentedShell: 'schema-settings-theme-segmented',
    themeSegmentedTrack: 'schema-settings-theme-track',
    themeSegmentedOption: 'schema-settings-theme-option',
    themeSegmentedOptionActive: 'is-active',
    interfaceThemeGrid: 'field-grid-2 interface-theme-grid',
    aiPlatformShell: 'schema-settings-ai-platform-shell',
    aiPlatformSummary: 'schema-settings-ai-platform-summary',
    aiPlatformLinkRow: 'ai-platform-link-row',
    aiPlatformLink: 'ai-platform-link',
    deepResearchTitleInline: 'deep-research-title-inline',
    purifyModeNotice: 'purify-mode-notice'
  },
  resource: {
    modalStack: 'resource-modal-stack',
    modalSection: 'resource-modal-section',
    modalSectionTitle: 'resource-modal-section-title',
    modalSectionHead: 'resource-modal-section-head',
    list: 'schema-resource-list',
    linkCard: 'schema-resource-link-card',
    linkCardStatic: 'static'
  },
  output: {
    section: 'schema-output-section',
    card: 'schema-output-card',
    widgetHost: 'schema-output-widget-host',
    tokenBlock: 'schema-output-token-block',
    yamlFilterRow: 'yaml-filter-row',
    yamlFilter: 'yaml-filter',
    yamlFilterActive: 'is-active',
    yamlCheck: 'yaml-check',
    yamlCheckOn: 'is-on',
    yamlDomainRule: 'yaml-domain-rule',
    yamlRuleMeta: 'yaml-rule-meta',
    yamlPreview: 'yaml-preview'
  }
} as const;

export function joinSchemaClassNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
