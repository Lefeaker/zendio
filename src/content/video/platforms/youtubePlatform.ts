import {
  BaseVideoPlatform,
  type TimestampBuildContext,
  type VideoPlatformContext
} from './baseVideoPlatform';

export class YoutubeVideoPlatform extends BaseVideoPlatform {
  constructor(context: VideoPlatformContext) {
    super('youtube', context);
  }

  shouldActivate(doc: Document): boolean {
    const hostname = doc.location?.hostname ?? '';
    return hostname.includes('youtube.com') || hostname === 'youtu.be';
  }

  buildTimestampUrl(timeSec: number, ctx: TimestampBuildContext): string | null {
    if (!ctx.videoId) {
      return null;
    }
    try {
      const baseUrl = ctx.canonicalUrl
        ? new URL(ctx.canonicalUrl)
        : new URL(`https://www.youtube.com/watch?v=${ctx.videoId}`);
      baseUrl.searchParams.set('t', String(timeSec));
      return baseUrl.toString();
    } catch {
      try {
        const fallback = new URL(`https://www.youtube.com/watch?v=${ctx.videoId}`);
        fallback.searchParams.set('t', String(timeSec));
        return fallback.toString();
      } catch {
        return null;
      }
    }
  }
}
