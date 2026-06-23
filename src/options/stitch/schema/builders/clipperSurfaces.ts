import type { ClipperSurfaceSource, NodeSchema, SurfaceAction } from '../../types';
import { buttonNode, div, element } from './primitives';
import { classNames } from './classNames';
import { surfaceBrand, surfaceWindow } from './surfaceChrome';

export function clipperHeader(
  title: string,
  subtitle: string | null,
  iconSrc?: string
): NodeSchema {
  return div(`${classNames.surface.windowHeader} clipper-dialog-header`, [
    surfaceBrand('◆', title, subtitle, iconSrc)
  ]);
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
