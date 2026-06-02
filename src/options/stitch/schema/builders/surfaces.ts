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
import { buttonNode, div, element, span, strong } from './primitives';
import { classNames } from './classNames';

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

export function sessionPanelShell(windowClassName: string, children: NodeSchema[]): NodeSchema {
  return div(classNames.session.panelRail, [
    element('div', {
      className: classNames.session.heightResizeHandle,
      role: 'separator',
      ariaLabel: 'Resize panel height',
      dataset: { role: 'session-panel-height-resize-handle' }
    }),
    element('div', {
      className: classNames.session.resizeHandle,
      role: 'separator',
      ariaLabel: 'Resize panel',
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
  iconSrc?: string
): NodeSchema {
  return div(classNames.surface.windowHeader, [
    surfaceBrand(iconGlyph, labels.title, labels.subtitle, iconSrc),
    element('button', {
      className: classNames.session.collapseTrigger,
      type: 'button',
      text: '⌄',
      ariaLabel: 'Collapse panel',
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
  destination?: ExportDestinationSurfacePreview
): NodeSchema | null {
  if (!destination) {
    return null;
  }

  return div('export-destination-row', [
    element('details', { className: 'export-destination-menu' }, [
      element('summary', { className: 'export-destination-summary' }, [
        div('export-destination-copy', [
          element('span', { className: 'export-destination-eyebrow', text: '保存到' }),
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
          text: '配置仓库',
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

function sessionItemMarker(label: string, kind: 'index' | 'time' = 'index'): NodeSchema {
  return div(classNames.session.marker, [
    element('span', {
      className: kind === 'time' ? classNames.session.markerTime : classNames.session.markerIndex,
      text: label
    })
  ]);
}

function videoTimestampMarker(capture: VideoSurfaceCapture): NodeSchema {
  const hasScreenshot = Boolean(capture.hasScreenshot);
  return div([classNames.session.marker, 'video-timestamp-marker'].join(' '), [
    element('button', {
      className: ['video-screenshot-toggle', hasScreenshot ? 'is-on' : 'is-off'].join(' '),
      type: 'button',
      ariaLabel: hasScreenshot ? 'Remove screenshot' : 'Capture screenshot',
      dataset: {
        actionId: 'video:toggle-screenshot',
        captureId: capture.id,
        screenshotState: hasScreenshot ? 'on' : 'off'
      },
      onClick: { id: 'video:toggle-screenshot' }
    }),
    element('span', {
      className: classNames.session.markerTime,
      text: capture.markerLabel ?? capture.summary
    })
  ]);
}

function sessionItemCloseButton(
  label: string,
  actionId: 'reader:delete' | 'video:delete',
  dataset: Record<string, string>
): NodeSchema {
  return element('button', {
    className: classNames.session.itemCloseTrigger,
    type: 'button',
    text: '×',
    ariaLabel: label,
    dataset: { actionId, ...dataset },
    onClick: { id: actionId }
  });
}

function sessionItemCard(
  marker: NodeSchema,
  text: string,
  commentPreview: string | undefined,
  fallbackComment: string,
  editing: boolean | undefined,
  editorValue: string,
  editorPlaceholder: string,
  meta: NodeChild | NodeChild[] | string | null,
  dataset?: Record<string, string>,
  actions?: NodeSchema,
  editorKind: 'input' | 'textarea' = 'textarea',
  trailingAction?: NodeSchema
): NodeSchema {
  const inputValue = editing ? editorValue : text || commentPreview || fallbackComment;
  const editorDataset = dataset?.captureId ? { dataset: { captureInput: dataset.captureId } } : {};
  const editor: NodeSchema =
    editorKind === 'input'
      ? {
          kind: 'input',
          className: classNames.session.commentInput,
          type: 'text',
          value: inputValue,
          placeholder: editorPlaceholder,
          ...editorDataset
        }
      : {
          kind: 'textarea',
          className: classNames.session.commentInput,
          value: inputValue,
          placeholder: editorPlaceholder,
          ...editorDataset
        };

  return element(
    'article',
    { className: classNames.session.item, ...(dataset ? { dataset } : {}) },
    [
      marker,
      div(classNames.session.content, [
        editor,
        meta
          ? typeof meta === 'string'
            ? div(classNames.session.metaRow, [meta])
            : div(classNames.session.metaRow, Array.isArray(meta) ? meta : [meta])
          : null,
        actions ?? null
      ]),
      trailingAction ?? null
    ]
  );
}

export function sessionStatusStrip(
  text: string,
  type: 'summary' | 'status' = 'summary'
): NodeSchema {
  return div(
    type === 'summary' ? classNames.surface.summaryStrip : classNames.surface.statusStrip,
    [
      type === 'summary' ? { kind: 'badge', label: 'AI Summary', variant: 'violet' } : null,
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
  labels: RuntimeSessionLabels
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

  const displayText = capture.editing
    ? (capture.fullText ?? capture.summary)
    : (capture.commentPreview ?? capture.comment ?? '');

  return sessionItemCard(
    videoTimestampMarker(capture),
    displayText,
    capture.commentPreview,
    '',
    capture.editing,
    capture.draft ?? capture.comment ?? '',
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
          dataset: { actionId: 'video:add' },
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
          dataset: { actionId: 'video:add-note' },
          onClick: { id: 'video:add-note' }
        }
      ])
    ]
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
  destination?: ExportDestinationSurfacePreview
): NodeSchema {
  return div(classNames.session.footerBar, [
    linked ?? null,
    exportDestinationRow(destination),
    surfaceFooter([
      div(classNames.session.footerCounter, [counter]),
      div(
        classNames.session.footerActions,
        actions.map((action) => buttonNode(action.label, action.variant ?? 'ghost', action.id))
      )
    ])
  ]);
}
