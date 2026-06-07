import type { ClipPayload } from '../../shared/types';
import type { VideoSessionState } from './sessionState';

export function createVideoSessionDestinationPayload(
  state: Pick<VideoSessionState, 'canonicalUrl' | 'videoUrl' | 'videoTitle' | 'platform'>,
  pageUrl: string,
  documentTitle: string
): ClipPayload {
  const resolvedPageUrl = state.canonicalUrl || state.videoUrl || pageUrl;
  const parsedUrl = parseVideoSessionPayloadUrl(resolvedPageUrl);
  const title = state.videoTitle || documentTitle || parsedUrl?.hostname || 'Video Capture';

  return {
    markdown: title,
    title,
    type: 'video',
    meta: {
      url: resolvedPageUrl,
      sourceUrl: state.videoUrl || resolvedPageUrl,
      videoUrl: state.videoUrl || resolvedPageUrl,
      platform: state.platform,
      ...(parsedUrl?.hostname ? { domain: parsedUrl.hostname } : {})
    }
  };
}

function parseVideoSessionPayloadUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
