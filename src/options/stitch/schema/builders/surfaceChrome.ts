import type {
  ButtonVariant,
  NodeChild,
  NodeSchema,
  ExportDestinationSurfacePreview,
  RuntimeSessionLabels,
  SurfaceAction
} from '../../types';
import { RUNTIME_SURFACE_FALLBACK_MESSAGES } from '@i18n/catalog/runtimeSurfaceFallbackMessages';
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

export function sessionPanelShell(
  windowClassName: string,
  children: NodeSchema[],
  ariaLabels: {
    resizeHeight: string;
    resizePanel: string;
  } = {
    resizeHeight: RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceResizePanelHeightAriaLabel,
    resizePanel: RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceResizePanelAriaLabel
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

export function surfaceBrand(
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

export function sessionHeader(
  labels: RuntimeSessionLabels,
  iconGlyph: string,
  iconSrc?: string,
  collapseAriaLabel = RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceCollapsePanelAriaLabel
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

export function exportDestinationRow(
  destination?: ExportDestinationSurfacePreview,
  labels: {
    saveToLabel: string;
    configureVaultLabel: string;
  } = {
    saveToLabel: RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceSaveToLabel,
    configureVaultLabel: RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceConfigureVaultLabel
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
            label: RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeAiSummaryBadge,
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
