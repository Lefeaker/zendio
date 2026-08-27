import type { NodeSchema, VideoSurfaceCapture } from '@ui/stitch-runtime';
import { RUNTIME_SURFACE_FALLBACK_MESSAGES } from '@i18n/catalog/runtimeSurfaceFallbackMessages';
import { runtimeClassNames as classNames } from './classNames';
import { div, element } from './primitives';

export function sessionItemMarker(label: string, kind: 'index' | 'time' = 'index'): NodeSchema {
  return element(
    'div',
    { className: classNames.session.marker, dataset: { role: 'session-item-marker' } },
    [
      element('span', {
        className: kind === 'time' ? classNames.session.markerTime : classNames.session.markerIndex,
        text: label
      })
    ]
  );
}

export function videoTimestampMarker(
  capture: VideoSurfaceCapture,
  screenshotLabels: { capture: string; remove: string } = {
    capture: RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeVideoCaptureScreenshotLabel,
    remove: RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeVideoRemoveScreenshotLabel
  }
): NodeSchema {
  const screenshotState = capture.screenshotState ?? (capture.hasScreenshot ? 'on' : 'off');
  const hasScreenshotIntent = screenshotState !== 'off';
  return div([classNames.session.marker, 'video-timestamp-marker'].join(' '), [
    element('button', {
      className: ['video-screenshot-toggle', `is-${screenshotState}`].join(' '),
      type: 'button',
      ariaLabel: hasScreenshotIntent ? screenshotLabels.remove : screenshotLabels.capture,
      ariaPressed: hasScreenshotIntent ? 'true' : 'false',
      dataset: {
        actionId: 'video:toggle-screenshot',
        captureId: capture.id,
        screenshotState
      },
      onClick: { id: 'video:toggle-screenshot' }
    }),
    element('span', {
      className: classNames.session.markerTime,
      text: capture.markerLabel ?? capture.summary
    })
  ]);
}

export function sessionItemCloseButton(
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

export function sessionItemCard(
  marker: NodeSchema,
  text: string,
  commentPreview: string | undefined,
  fallbackComment: string,
  editing: boolean | undefined,
  editorValue: string,
  editorPlaceholder: string,
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
    [marker, div(classNames.session.content, [editor, actions ?? null]), trailingAction ?? null]
  );
}
