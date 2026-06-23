import type {
  ExportDestinationSurfacePreview,
  NodeSchema,
  RuntimeSessionLabels,
  SurfaceAction,
  VideoSurfaceCapture
} from '../../types';
import { buttonNode, div, element } from './primitives';
import { classNames } from './classNames';
import {
  sessionItemCard,
  sessionItemCloseButton,
  sessionItemMarker,
  videoTimestampMarker
} from './surfaceSessionItems';
import { exportDestinationRow, surfaceFooter } from './surfaceChrome';

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
