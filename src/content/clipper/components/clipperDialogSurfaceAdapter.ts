import type { Messages } from '@i18n';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';
import { createClipperSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';

export type ClipperSurfaceActionId =
  | 'reader'
  | 'video'
  | 'cancel'
  | 'clip'
  | 'resource:close'
  | 'export-destination:select';

export type ClipperSurfaceActionHandlers = Record<ClipperSurfaceActionId, (event?: Event) => void>;

export type BuildClipperSurfaceOptions = {
  selectedText: string;
  iconUrl: string;
  commentPlaceholder: string;
  labels: {
    title: string;
    selectionPreview: string;
    commentLabel: string;
  };
  source: {
    title: string;
    host: string;
    initials: string;
    verifiedLabel: string;
  };
  actions: Array<{
    id: 'reader' | 'video' | 'clip';
    label: string;
    variant: 'primary' | 'secondary';
  }>;
  destination?: ExportDestinationSurfacePreview;
  handlers: ClipperSurfaceActionHandlers;
};

export function buildClipperDialogSurface(options: BuildClipperSurfaceOptions): HTMLElement {
  return renderStitchRuntimeSurface({
    surfaceId: 'clipper',
    appData: createClipperSurfaceContent({
      selectedText: options.selectedText,
      iconUrl: options.iconUrl,
      commentPlaceholder: options.commentPlaceholder,
      labels: options.labels,
      source: options.source,
      ...(options.destination ? { destination: options.destination } : {}),
      actions: options.actions
    }),
    actions: options.handlers
  });
}

export function resolveSelectionPreviewLabel(messages: Messages | null): string {
  return (
    (messages as Record<string, string> | null)?.clipperSelectionPreviewLabel ?? 'Selection Preview'
  );
}
