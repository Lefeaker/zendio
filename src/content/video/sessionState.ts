import type { PageI18nController } from '@i18n';
import type { FeatureTimer } from '../../shared/analytics';
import type { ReaderHighlightTheme } from '../../shared/types/options';
import type { FragmentClipperOptions } from '../../shared/types/options';
import type { VideoPlatform } from './utils';
import type { VideoCapture, VideoFragmentCapture, VideoTimestampCapture } from './types';
import type { VideoPlatformAdapter } from './platforms';
import type { VideoHintContext } from './videoHintManager';

export class VideoSessionState {
  captures: VideoCapture[] = [];
  commentDrafts: Record<string, string> = {};
  videoElement: HTMLVideoElement | null = null;
  storageKey: string | null = null;
  videoTitle = '';
  videoUrl = '';
  platform: VideoPlatform = 'unknown';
  videoId: string | null = null;
  canonicalUrl = '';
  exporting = false;
  saving = false;
  stopOptionsWatcher: (() => void) | null = null;
  stopLanguageWatcher: (() => void) | null = null;
  controller: PageI18nController | null = null;
  suppressSelectionCapture = false;
  platformAdapter: VideoPlatformAdapter | null = null;
  fragmentConfig: FragmentClipperOptions | null = null;
  highlightTheme: ReaderHighlightTheme;
  analyticsTimer: FeatureTimer | null = null;

  constructor(defaultHighlightTheme: ReaderHighlightTheme) {
    this.highlightTheme = defaultHighlightTheme;
  }
}

export interface VideoPanelCaptureGroups {
  timestamps: VideoTimestampCapture[];
  fragments: VideoFragmentCapture[];
}

export function buildVideoHintContext(
  state: Pick<VideoSessionState, 'videoElement' | 'captures'>
): VideoHintContext {
  return {
    videoAvailable: Boolean(state.videoElement),
    hasCaptures: state.captures.length > 0
  };
}

export function replaceVideoCaptures(
  state: VideoSessionState,
  captures: VideoCapture[]
): VideoCapture[] {
  state.captures = [...captures];
  return state.captures;
}

export function partitionVideoPanelCaptures(
  captures: VideoCapture[],
  getFragmentElement: (capture: VideoFragmentCapture) => HTMLElement | null
): VideoPanelCaptureGroups {
  const timestamps = captures
    .filter((capture): capture is VideoTimestampCapture => capture.kind === 'timestamp')
    .sort((a, b) => {
      if (a.timeSec === b.timeSec) {
        return a.createdAt - b.createdAt;
      }
      return a.timeSec - b.timeSec;
    });

  const fragments = sortFragmentsByDocumentOrder(
    captures.filter((capture): capture is VideoFragmentCapture => capture.kind === 'fragment'),
    getFragmentElement
  );

  return { timestamps, fragments };
}

export function sortFragmentsByDocumentOrder(
  captures: VideoFragmentCapture[],
  getFragmentElement: (capture: VideoFragmentCapture) => HTMLElement | null
): VideoFragmentCapture[] {
  return [...captures].sort((a, b) => {
    const aNode = getFragmentElement(a);
    const bNode = getFragmentElement(b);

    if (aNode && bNode) {
      if (aNode === bNode) {
        return 0;
      }
      const position = aNode.compareDocumentPosition(bNode);
      if (position & Node.DOCUMENT_POSITION_DISCONNECTED) {
        const shadowInclusiveOrder = compareShadowInclusiveDocumentOrder(aNode, bNode);
        return shadowInclusiveOrder || compareFragmentCreationOrder(a, b);
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      return 0;
    }

    if (aNode) {
      return -1;
    }
    if (bNode) {
      return 1;
    }

    return compareFragmentCreationOrder(a, b);
  });
}

function compareShadowInclusiveDocumentOrder(a: Node, b: Node): number {
  const aPath = buildShadowInclusivePath(a);
  const bPath = buildShadowInclusivePath(b);
  let index = 0;
  while (aPath[index] && aPath[index] === bPath[index]) index += 1;
  if (index === 0) return 0;
  if (index === aPath.length) return -1;
  if (index === bPath.length) return 1;

  const parent = aPath[index - 1];
  const aBranch = aPath[index];
  const bBranch = bPath[index];
  if (!parent || !aBranch || !bBranch) return 0;
  const children = Array.from(parent.childNodes);
  const aIndex = children.findIndex((child) => child === aBranch);
  const bIndex = children.findIndex((child) => child === bBranch);
  return aIndex >= 0 && bIndex >= 0 ? aIndex - bIndex : 0;
}

function buildShadowInclusivePath(node: Node): Node[] {
  const path: Node[] = [];
  let current: Node | null = node;
  while (current) {
    path.push(current);
    current = current.parentNode ?? (current instanceof ShadowRoot ? current.host : null);
  }
  return path.reverse();
}

function compareFragmentCreationOrder(a: VideoFragmentCapture, b: VideoFragmentCapture): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
