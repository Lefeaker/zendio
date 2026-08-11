import {
  clipperClassNames,
  sessionClassNames,
  surfaceClassNames
} from '@ui/stitch-surfaces/builders/classNames';

export const classNames = {
  surface: surfaceClassNames,
  resource: {
    modalSection: 'resource-modal-section',
    modalSectionTitle: 'resource-modal-section-title',
    modalSectionHead: 'resource-modal-section-head'
  },
  yaml: {
    filterRow: 'yaml-filter-row',
    filter: 'yaml-filter',
    active: 'is-active',
    check: 'yaml-check',
    checkOn: 'is-on',
    domainRule: 'yaml-domain-rule',
    ruleMeta: 'yaml-rule-meta',
    groupRow: 'yaml-group-row'
  },
  table: {
    centerCell: 'table-cell-center'
  },
  common: {
    emptyState: 'empty-state',
    outputBox: 'output-box',
    surfaceHelperText: 'surface-helper-text'
  },
  settings: {
    interfaceThemeGrid: 'field-grid-2 interface-theme-grid',
    aiPlatformLinkRow: 'ai-platform-link-row',
    aiPlatformLink: 'ai-platform-link'
  },
  clipper: clipperClassNames,
  session: sessionClassNames
} as const;
