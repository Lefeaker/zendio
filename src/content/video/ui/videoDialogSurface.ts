import type { VideoPanelCapture, VideoPanelTexts } from '../application/videoPanelModel';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';
import { createVideoSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';
import { applyVideoDialogPanelCompatibilityAttributes } from './videoDialogPanelCompatibility';

type CaptureSource = 'button' | 'note-input';

interface VideoDialogSurfaceActions {
  addCapture: (source: CaptureSource) => void;
  finish: () => void;
  cancel: () => void;
  selectDestination: (id: string) => void;
  toggleCollapse: () => void;
  closeResource: () => void;
  deleteCapture: (id: string) => void;
  toggleScreenshot: (id: string) => void;
  expandCollapsedPanel: () => void;
}

interface VideoDialogSurfaceOptions {
  texts: VideoPanelTexts;
  captures: VideoPanelCapture[];
  counter: string;
  iconUrl: string;
  destination: ExportDestinationSurfacePreview | undefined;
  collapsed: boolean;
  editingCaptureId: string | null;
  actions: VideoDialogSurfaceActions;
}

export function createVideoDialogSurface({
  texts,
  captures,
  counter,
  iconUrl,
  destination,
  collapsed,
  editingCaptureId,
  actions
}: VideoDialogSurfaceOptions): HTMLElement {
  const content = createVideoSurfaceContent({
    texts,
    captures,
    counter,
    iconUrl,
    ...(destination ? { destination } : {}),
    actions: [
      { id: 'video:finish', label: texts.finish, variant: 'primary' },
      { id: 'video:cancel', label: texts.cancel, variant: 'ghost' }
    ]
  });
  if (collapsed) {
    content.surfaces.video.labels.subtitle = '';
  }
  content.surfaces.video.captures = content.surfaces.video.captures.map((capture) =>
    capture.id === editingCaptureId ? { ...capture, editing: true } : capture
  );

  const surface = renderStitchRuntimeSurface({
    surfaceId: 'video',
    appData: content,
    actions: {
      'video:add': () => actions.addCapture('button'),
      'video:add-note': () => actions.addCapture('note-input'),
      'video:finish': actions.finish,
      'video:cancel': actions.cancel,
      'export-destination:select': (event) => {
        const id = resolveActionId(event, 'destinationId');
        if (id) {
          actions.selectDestination(id);
        }
      },
      'session:toggleCollapse': actions.toggleCollapse,
      'resource:close': actions.closeResource,
      'video:delete': (event) => {
        const id = resolveActionId(event, 'captureId');
        if (id) {
          actions.deleteCapture(id);
        }
      },
      'video:toggle-screenshot': (event) => {
        const id = resolveActionId(event, 'captureId');
        if (id) {
          actions.toggleScreenshot(id);
        }
      }
    }
  });

  applyVideoDialogPanelCompatibilityAttributes({
    surface,
    collapsed,
    expandCollapsedPanel: actions.expandCollapsedPanel
  });
  return surface;
}

function resolveActionId(event: Event, datasetKey: 'captureId' | 'destinationId'): string | null {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (datasetKey === 'destinationId') {
    return target?.dataset.destinationId ?? null;
  }
  return (
    target?.dataset[datasetKey] ??
    target?.closest<HTMLElement>('[data-capture-id]')?.dataset.captureId ??
    null
  );
}
