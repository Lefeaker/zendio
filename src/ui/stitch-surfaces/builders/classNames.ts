export const surfaceClassNames = {
  stage: 'surface-stage',
  window: 'surface-window',
  windowHeader: 'surface-window-header',
  windowBody: 'surface-window-body',
  windowFooter: 'surface-window-footer',
  windowBrand: 'surface-window-brand',
  windowIcon: 'surface-window-icon',
  windowTitle: 'surface-window-title',
  windowSubtitle: 'surface-window-subtitle',
  headingCopy: 'surface-heading-copy',
  actionRow: 'surface-action-row'
} as const;

export const clipperClassNames = {
  shell: 'clipper-surface-window',
  body: 'clipper-surface-body',
  previewBlock: 'clipper-preview-block',
  preview: 'clipper-selection-preview',
  textarea: 'clipper-comment-textarea',
  sourceRow: 'clipper-source-row',
  sourceBadge: 'clipper-source-badge',
  sourceMeta: 'clipper-source-meta',
  sourceStatus: 'clipper-source-status',
  footerBar: 'clipper-footer-bar',
  footerSecondary: 'clipper-footer-secondary',
  footerPrimary: 'clipper-footer-primary'
} as const;

export const sessionClassNames = {
  bodyReader: 'reader-surface-body',
  bodyVideo: 'video-surface-body',
  panelRail: 'session-panel-rail',
  resizeHandle: 'session-panel-resize-handle',
  heightResizeHandle: 'session-panel-height-resize-handle',
  list: 'session-item-list',
  item: 'session-item-card',
  readerItem: 'reader-session-item-card',
  addCaptureItem: 'session-add-capture-card',
  marker: 'session-item-marker',
  markerTime: 'session-item-marker-time',
  markerIndex: 'session-item-marker-index',
  addCaptureButton: 'session-add-capture-button',
  collapseTrigger: 'session-panel-collapse-trigger surface-window-header-action',
  content: 'session-item-content',
  readerContent: 'reader-session-item-content',
  readerSelection: 'reader-selection-text session-item-primary-line',
  readerNoteInput: 'reader-note-input',
  itemCloseTrigger: 'session-item-close-trigger',
  commentInput: 'session-item-comment-input',
  footerCounter: 'session-counter',
  footerBar: 'session-footer-bar',
  footerActions: 'session-footer-actions'
} as const;

export const runtimeClassNames = {
  surface: surfaceClassNames,
  clipper: clipperClassNames,
  session: sessionClassNames
} as const;
