import type { VideoPanelCapture, VideoPanelTexts } from '../application/videoPanelModel';
import type { ExportDestinationSurfacePreview, RuntimeSurfaceContent } from '@ui/stitch-runtime';
import { createVideoSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import {
  renderStitchRuntimeSessionSurface,
  renderStitchRuntimeSessionTemplate,
  type RuntimeSurfaceHandle
} from '@content/stitch/runtimeSurfaceRenderer';

interface VideoDialogSurfaceOptions {
  texts: VideoPanelTexts;
  captures: VideoPanelCapture[];
  counter: string;
  iconUrl: string;
  destination: ExportDestinationSurfacePreview | undefined;
  editingCaptureId: string | null;
}

export function createVideoDialogSurfaceContent({
  texts,
  captures,
  counter,
  iconUrl,
  destination,
  editingCaptureId
}: VideoDialogSurfaceOptions): RuntimeSurfaceContent {
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
  content.video.captures = content.video.captures.map((capture) =>
    capture.id === editingCaptureId ? { ...capture, editing: true } : capture
  );
  return content;
}

export function renderVideoDialogSurface(content: RuntimeSurfaceContent): RuntimeSurfaceHandle {
  return renderStitchRuntimeSessionSurface({ surfaceId: 'video', appData: content });
}

export function renderVideoDialogSurfaceTemplate(content: RuntimeSurfaceContent): HTMLElement {
  return renderStitchRuntimeSessionTemplate({ surfaceId: 'video', appData: content });
}
