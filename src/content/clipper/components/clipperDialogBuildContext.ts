import type { Messages } from '@i18n';
import type { ClipPayload } from '@shared/types';
import type { BuildClipperSurfaceOptions } from './clipperDialogSurfaceAdapter';
import { resolveSelectionPreviewLabel } from './clipperDialogSurfaceAdapter';
import { generateClipperTitle } from '../utils/datetime';
import type { ReaderModeBehavior } from './dialogTypes';

type SurfaceAction = BuildClipperSurfaceOptions['actions'][number];

interface ResolveDialogMessage {
  <Key extends keyof Messages>(this: void, key: Key, fallback: string): string;
}

interface ClipperDialogActionOptions {
  allowReaderMode: boolean;
  readerModeBehavior: ReaderModeBehavior;
  allowVideoMode: boolean;
  getMessage: ResolveDialogMessage;
  getFallback<Key extends keyof Messages>(this: void, key: Key): string;
}

interface ClipperDialogLabelOptions {
  messages: Messages | null;
  getMessage: ResolveDialogMessage;
  getFallback<Key extends keyof Messages>(this: void, key: Key): string;
}

export function createClipperDialogSourceContext(
  doc: Document
): BuildClipperSurfaceOptions['source'] {
  const sourceUrl = doc.location.href;
  const sourceHost = doc.location.hostname || 'current page';
  const sourceTitle = doc.title || sourceUrl;
  const sourceInitials =
    sourceHost
      .split('.')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 3) || 'PG';

  return {
    title: sourceTitle,
    host: sourceHost,
    initials: sourceInitials,
    verifiedLabel: sourceUrl
  };
}

export function createClipperDestinationPayload(doc: Document, selectedText: string): ClipPayload {
  const url = doc.location.href;
  const parsedDomain = doc.location.hostname || undefined;
  const pageTitle = doc.title || parsedDomain || 'Untitled';
  return {
    markdown: selectedText || pageTitle,
    title: generateClipperTitle(pageTitle, new Date()),
    type: 'clipper',
    meta: {
      url,
      sourceUrl: url,
      resolvedUrl: url,
      ...(parsedDomain ? { domain: parsedDomain } : {})
    }
  };
}

export function resolveClipperDestinationId(event: Event | undefined): string | null {
  const target = event?.currentTarget ?? event?.target;
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.dataset.destinationId ?? null;
}

export function createClipperDialogLabels({
  messages,
  getMessage,
  getFallback
}: ClipperDialogLabelOptions): BuildClipperSurfaceOptions['labels'] {
  return {
    title: getMessage('clipDialogTitle', getFallback('clipDialogTitle')),
    selectionPreview: resolveSelectionPreviewLabel(messages),
    commentLabel: getMessage('commentLabel', getFallback('commentLabel'))
  };
}

export function createClipperDialogActions({
  allowReaderMode,
  readerModeBehavior,
  allowVideoMode,
  getMessage,
  getFallback
}: ClipperDialogActionOptions): SurfaceAction[] {
  return [
    ...(allowReaderMode
      ? [
          {
            id: 'reader' as const,
            label:
              readerModeBehavior === 'append'
                ? getMessage('addToReaderButton', getFallback('addToReaderButton'))
                : getMessage('openReaderButton', getFallback('openReaderButton')),
            variant: 'secondary' as const
          }
        ]
      : []),
    ...(allowVideoMode
      ? [
          {
            id: 'video' as const,
            label: getMessage('openVideoModeButton', getFallback('openVideoModeButton')),
            variant: 'secondary' as const
          }
        ]
      : []),
    {
      id: 'clip',
      label: getMessage('clipButton', getFallback('clipButton')),
      variant: 'primary'
    }
  ];
}
