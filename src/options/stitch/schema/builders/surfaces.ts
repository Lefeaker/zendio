import type {
  ButtonVariant,
  NodeChild,
  NodeSchema,
  ClipperSurfaceSource,
  ExportDestinationSurfacePreview,
  ReaderSurfaceHighlight,
  RuntimeSessionLabels,
  SurfaceAction,
  VideoSurfaceCapture
} from '../../types';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';
import { buttonNode, div, element, span, strong } from './primitives';
import { classNames } from './classNames';
import {
  sessionItemCard,
  sessionItemCloseButton,
  sessionItemMarker,
  videoTimestampMarker
} from './surfaceSessionItems';

export function surfaceStage(children: NodeSchema[]): NodeSchema {
  return element('div', { className: classNames.surface.stage }, children);
}

export function surfaceWindow(className: string, children: NodeSchema[]): NodeSchema {
  return element(
    'div',
    { className: [classNames.surface.window, className].filter(Boolean).join(' ') },
    children
  );
}

export function sessionPanelShell(
  windowClassName: string,
  children: NodeSchema[],
  ariaLabels: {
    resizeHeight: string;
    resizePanel: string;
  } = {
    resizeHeight:
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceResizePanelHeightAriaLabel,
    resizePanel: DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceResizePanelAriaLabel
  }
): NodeSchema {
  return div(classNames.session.panelRail, [
    element('div', {
      className: classNames.session.heightResizeHandle,
      role: 'separator',
      ariaLabel: ariaLabels.resizeHeight,
      dataset: { role: 'session-panel-height-resize-handle' }
    }),
    element('div', {
      className: classNames.session.resizeHandle,
      role: 'separator',
      ariaLabel: ariaLabels.resizePanel,
      dataset: { role: 'session-panel-resize-handle' }
    }),
    surfaceWindow(windowClassName, children)
  ]);
}

export function surfaceHeader(
  title: string,
  subtitle: string | null,
  pills: string[] = []
): NodeSchema {
  return div(classNames.surface.windowHeader, [
    div(classNames.surface.headingCopy, [
      strong(title, classNames.surface.windowTitle),
      subtitle ? span(classNames.surface.windowSubtitle, subtitle) : null
    ]),
    pills.length
      ? div(
          classNames.surface.pillRow,
          pills.map((pill) => ({ kind: 'pill', label: pill }))
        )
      : null
  ]);
}

function surfaceBrand(
  iconGlyph: string,
  title: string,
  subtitle: string | null,
  iconSrc?: string
): NodeSchema {
  return div(classNames.surface.windowBrand, [
    div(classNames.surface.windowIcon, [
      iconSrc
        ? element('img', {
            className: 'surface-window-icon-image',
            src: iconSrc,
            alt: ''
          })
        : span(classNames.surface.windowIconGlyph, iconGlyph)
    ]),
    div(classNames.surface.headingCopy, [
      strong(title, classNames.surface.windowTitle),
      subtitle ? span(classNames.surface.windowSubtitle, subtitle) : null
    ])
  ]);
}

export function clipperHeader(
  title: string,
  subtitle: string | null,
  iconSrc?: string
): NodeSchema {
  return div(`${classNames.surface.windowHeader} clipper-dialog-header`, [
    surfaceBrand('◆', title, subtitle, iconSrc)
  ]);
}

export function sessionHeader(
  labels: RuntimeSessionLabels,
  iconGlyph: string,
  iconSrc?: string,
  collapseAriaLabel = DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceCollapsePanelAriaLabel
): NodeSchema {
  return div(classNames.surface.windowHeader, [
    surfaceBrand(iconGlyph, labels.title, labels.subtitle, iconSrc),
    element('button', {
      className: classNames.session.collapseTrigger,
      type: 'button',
      text: '⌄',
      ariaLabel: collapseAriaLabel,
      dataset: { actionId: 'session:toggleCollapse' },
      onClick: { id: 'session:toggleCollapse' }
    })
  ]);
}

export function actionRow(
  actions: Array<{ id?: string; label: string; variant?: ButtonVariant }>,
  compact = false
): NodeSchema {
  return div(
    [classNames.surface.actionRow, compact ? classNames.surface.actionRowCompact : '']
      .filter(Boolean)
      .join(' '),
    actions.map((action) => ({
      kind: 'button',
      label: action.label,
      variant: action.variant ?? 'ghost',
      ...(action.id ? { action: action.id } : {})
    }))
  );
}

export function surfaceBody(className: string, children: NodeChild[]): NodeSchema {
  return div([classNames.surface.windowBody, className].filter(Boolean).join(' '), children);
}

export function surfaceFooter(children: NodeChild[], className?: string): NodeSchema {
  return div([classNames.surface.windowFooter, className].filter(Boolean).join(' '), children);
}

export function runtimeList(children: NodeSchema[]): NodeSchema {
  return div(classNames.runtime.list, children);
}

export function runtimeMeta(childrenOrText: NodeChild[] | string): NodeSchema {
  if (typeof childrenOrText === 'string') {
    return element('div', { className: classNames.runtime.meta, text: childrenOrText });
  }
  return div(classNames.runtime.meta, childrenOrText);
}

export function runtimeCommentBox(text: string): NodeSchema {
  return element('div', { className: classNames.runtime.commentBox, text });
}

export function surfaceActions(actions: SurfaceAction[]): NodeSchema {
  return actionRow(actions);
}

export function clipperShell(children: NodeSchema[]): NodeSchema {
  return surfaceWindow(classNames.clipper.shell, children);
}

export function selectionPreviewBox(_label: string, text: string): NodeSchema {
  return div(classNames.clipper.previewBlock, [
    element('div', { className: classNames.clipper.preview, text })
  ]);
}

export function commentEditorBlock(_label: string, placeholder: string): NodeSchema {
  return div('field clipper-comment-form', [
    {
      kind: 'textarea',
      value: '',
      placeholder,
      className: classNames.clipper.textarea,
      dataset: {
        role: 'clipper-comment-input'
      }
    },
    element('div', {
      className: 'clipper-comment-completed-hint',
      text: '',
      style: { display: 'none' }
    })
  ]);
}

export function sourceMetaRow(source: ClipperSurfaceSource): NodeSchema {
  return div(classNames.clipper.sourceRow, [
    div(classNames.clipper.sourceBadge, [source.initials]),
    div(classNames.clipper.sourceMeta, [
      element('strong', { text: source.host }),
      source.title ? element('span', { text: source.title }) : null
    ]),
    element('span', {
      className: classNames.clipper.sourceStatus,
      text: '✓',
      ariaLabel: source.verifiedLabel
    })
  ]);
}

export function exportDestinationRow(
  destination?: ExportDestinationSurfacePreview,
  labels: {
    saveToLabel: string;
    configureVaultLabel: string;
  } = {
    saveToLabel: DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceSaveToLabel,
    configureVaultLabel: DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceConfigureVaultLabel
  }
): NodeSchema | null {
  if (!destination) {
    return null;
  }

  return div('export-destination-row', [
    element('details', { className: 'export-destination-menu' }, [
      element('summary', { className: 'export-destination-summary' }, [
        div('export-destination-copy', [
          element('span', { className: 'export-destination-eyebrow', text: labels.saveToLabel }),
          element('strong', { className: 'export-destination-label', text: destination.label }),
          element('span', { className: 'export-destination-path', text: destination.path })
        ])
      ]),
      div(
        'export-destination-options',
        destination.options.map((option) =>
          element(
            'button',
            {
              className: ['export-destination-option', option.selected ? 'is-selected' : '']
                .filter(Boolean)
                .join(' '),
              type: 'button',
              dataset: {
                actionId: 'export-destination:select',
                destinationId: option.id
              },
              onClick: { id: 'export-destination:select' }
            },
            [
              element('span', { className: 'export-destination-option-label', text: option.label }),
              element('span', { className: 'export-destination-option-path', text: option.path })
            ]
          )
        )
      )
    ]),
    !destination.hasConfiguredVault && destination.setupUrl
      ? element('a', {
          className: 'export-destination-setup-link',
          text: labels.configureVaultLabel,
          href: destination.setupUrl,
          target: '_blank',
          rel: 'noopener noreferrer'
        })
      : null
  ]);
}

export function clipperActionBar(actions: SurfaceAction[]): NodeSchema {
  const visibleActions = actions.filter((action) => action.id !== 'cancel');
  const primaryActions = visibleActions.filter((action) => action.variant === 'primary');
  const secondaryActions = visibleActions.filter((action) => action.variant !== 'primary');

  return div(classNames.clipper.footerBar, [
    div(
      classNames.clipper.footerSecondary,
      secondaryActions.map((action) =>
        buttonNode(action.label, action.variant ?? 'ghost', action.id)
      )
    ),
    div(
      classNames.clipper.footerPrimary,
      primaryActions.map((action) =>
        buttonNode(action.label, action.variant ?? 'primary', action.id)
      )
    )
  ]);
}

export function sessionStatusStrip(
  text: string,
  type: 'summary' | 'status' = 'summary'
): NodeSchema {
  return div(
    type === 'summary' ? classNames.surface.summaryStrip : classNames.surface.statusStrip,
    [
      type === 'summary'
        ? {
            kind: 'badge',
            label: DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeAiSummaryBadge,
            variant: 'violet'
          }
        : null,
      span(
        type === 'summary' ? classNames.surface.summaryText : classNames.surface.summaryText,
        text
      )
    ]
  );
}

export function sessionItemList(items: NodeSchema[]): NodeSchema {
  return div(classNames.session.list, items);
}

export function readerHighlightItem(
  highlight: ReaderSurfaceHighlight,
  labels: RuntimeSessionLabels
): NodeSchema {
  return element(
    'article',
    {
      className: [classNames.session.item, classNames.session.readerItem].join(' '),
      dataset: { highlightId: highlight.id }
    },
    [
      sessionItemMarker(String(highlight.index), 'index'),
      div(classNames.session.readerContent, [
        element('p', {
          className: classNames.session.readerSelection,
          text: highlight.editing ? highlight.fullText : highlight.excerpt
        }),
        {
          kind: 'input',
          className: [classNames.session.commentInput, classNames.session.readerNoteInput].join(
            ' '
          ),
          type: 'text',
          value: highlight.draft ?? highlight.comment ?? highlight.commentPreview ?? '',
          placeholder: labels.notePlaceholder,
          dataset: { highlightInput: highlight.id }
        }
      ]),
      sessionItemCloseButton(labels.deleteLabel, 'reader:delete', { highlightId: highlight.id })
    ]
  );
}

export function videoCaptureItem(
  capture: VideoSurfaceCapture,
  labels: RuntimeSessionLabels,
  screenshotLabels?: {
    capture: string;
    remove: string;
  }
): NodeSchema {
  if (capture.kind === 'fragment') {
    const selectionText = capture.fullText ?? capture.summary;
    return element(
      'article',
      {
        className: [
          classNames.session.item,
          classNames.session.readerItem,
          'video-fragment-session-item-card'
        ].join(' '),
        dataset: { captureId: capture.id, captureKind: 'fragment' }
      },
      [
        sessionItemMarker(String(capture.index), 'index'),
        div(classNames.session.readerContent, [
          element('p', {
            className: classNames.session.readerSelection,
            text: selectionText
          }),
          {
            kind: 'input',
            className: [classNames.session.commentInput, classNames.session.readerNoteInput].join(
              ' '
            ),
            type: 'text',
            value: capture.draft ?? capture.comment ?? capture.commentPreview ?? '',
            placeholder: labels.fragmentNotePlaceholder ?? labels.notePlaceholder,
            dataset: { captureInput: capture.id }
          }
        ]),
        sessionItemCloseButton(labels.deleteLabel, 'video:delete', { captureId: capture.id })
      ]
    );
  }

  const inputValue = capture.draft ?? capture.comment ?? '';

  return sessionItemCard(
    videoTimestampMarker(capture, screenshotLabels),
    '',
    undefined,
    inputValue,
    capture.editing,
    inputValue,
    labels.notePlaceholder,
    null,
    { captureId: capture.id, captureKind: 'timestamp' },
    undefined,
    'input',
    sessionItemCloseButton(labels.deleteLabel, 'video:delete', { captureId: capture.id })
  );
}

export function sessionPlaceholderItem(label: string, placeholder: string): NodeSchema {
  return sessionItemCard(
    sessionItemMarker(label, 'time'),
    '',
    undefined,
    '',
    false,
    '',
    placeholder,
    null
  );
}

export function videoAddCaptureItem(label: string, placeholder: string): NodeSchema {
  return element(
    'article',
    { className: [classNames.session.item, classNames.session.addCaptureItem].join(' ') },
    [
      div(classNames.session.marker, [
        element('button', {
          className: classNames.session.addCaptureButton,
          type: 'button',
          text: '+',
          ariaLabel: label,
          dataset: { actionId: 'video:add', role: 'add-btn' },
          onClick: { id: 'video:add' }
        })
      ]),
      div(classNames.session.content, [
        {
          kind: 'input',
          className: classNames.session.commentInput,
          type: 'text',
          value: '',
          placeholder,
          readOnly: true,
          dataset: { actionId: 'video:add-note', role: 'add-note-input' },
          onClick: { id: 'video:add-note' }
        }
      ])
    ]
  );
}

function videoFooterActionRole(actionId?: string): string | undefined {
  switch (actionId) {
    case 'video:finish':
      return 'finish-btn';
    case 'video:cancel':
      return 'close-btn';
    default:
      return undefined;
  }
}

function videoFooterActionButton(action: SurfaceAction): NodeSchema {
  const role = videoFooterActionRole(action.id);
  return buttonNode(
    action.label,
    action.variant ?? 'ghost',
    action.id,
    undefined,
    role ? { role } : undefined
  );
}

export function linkedContentFooter(title: string, meta: string): NodeSchema {
  return div(classNames.session.linkedSection, [
    div(classNames.surface.linkedCopy, [
      element('strong', { className: classNames.session.linkedTitle, text: title }),
      element('span', { className: classNames.session.linkedMeta, text: meta })
    ]),
    element('span', { className: classNames.session.linkedAction, text: '↗' })
  ]);
}

export function sessionFooterBar(
  counter: string,
  actions: SurfaceAction[],
  linked?: NodeSchema | null,
  destination?: ExportDestinationSurfacePreview,
  destinationLabels?: {
    saveToLabel: string;
    configureVaultLabel: string;
  }
): NodeSchema {
  return div(classNames.session.footerBar, [
    linked ?? null,
    exportDestinationRow(destination, destinationLabels),
    surfaceFooter([
      div(classNames.session.footerCounter, [counter]),
      div(
        classNames.session.footerActions,
        actions.map((action) => buttonNode(action.label, action.variant ?? 'ghost', action.id))
      )
    ])
  ]);
}

export function videoFooterBar(
  counter: string,
  actions: SurfaceAction[],
  linked?: NodeSchema | null,
  destination?: ExportDestinationSurfacePreview,
  destinationLabels?: {
    saveToLabel: string;
    configureVaultLabel: string;
  }
): NodeSchema {
  return div(classNames.session.footerBar, [
    linked ?? null,
    exportDestinationRow(destination, destinationLabels),
    surfaceFooter([
      div(classNames.session.footerCounter, [counter]),
      div(
        classNames.session.footerActions,
        actions.map((action) => videoFooterActionButton(action))
      )
    ])
  ]);
}
