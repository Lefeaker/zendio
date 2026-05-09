import { formatDateTime } from '../clipper/utils/datetime';
import { buildReaderHighlightsMarkdown } from '../reader/utils/markdownBuilder';
import { generateYamlFrontMatter } from '../../shared/utils/yamlGenerator';
import type { VideoCapture, VideoFragmentCapture, VideoTimestampCapture } from './types';
import type { VideoSessionMessages } from './sessionMessages';
import type { VideoPlatform } from './utils';
import type { IVideoRepository, VideoClipData } from '../../shared/repositories/IVideoRepository';
import type { ClipResult } from '../../shared/repositories/IClipRepository';
import type { ExportDestinationMetadata } from '../../shared/exportDestination';

export interface ExportPayload {
  markdown: string;
  title: string;
  type: string;
  meta: Record<string, unknown>;
}

export interface BuildPayloadContext {
  captures: VideoCapture[];
  videoTitle: string;
  canonicalUrl: string;
  videoUrl: string;
  platform: VideoPlatform;
  messages: VideoSessionMessages;
  storageKey: string | null;
  exportDestination?: ExportDestinationMetadata;
}

export class VideoSessionExporter {
  constructor(private readonly videoRepository: IVideoRepository) {}

  buildPayload(ctx: BuildPayloadContext): ExportPayload {
    const sorted = [...ctx.captures].sort((a, b) => {
      const aTime = typeof a.timeSec === 'number' ? a.timeSec : Number.MAX_SAFE_INTEGER;
      const bTime = typeof b.timeSec === 'number' ? b.timeSec : Number.MAX_SAFE_INTEGER;
      if (aTime === bTime) {
        return a.createdAt - b.createdAt;
      }
      return aTime - bTime;
    });

    const timestampCaptures = sorted.filter(
      (capture): capture is VideoTimestampCapture => capture.kind === 'timestamp'
    );
    const fragmentCaptures = sorted.filter(
      (capture): capture is VideoFragmentCapture => capture.kind === 'fragment'
    );
    const attachments = timestampCaptures
      .map((capture) => capture.screenshot)
      .filter((screenshot): screenshot is NonNullable<VideoTimestampCapture['screenshot']> =>
        Boolean(screenshot)
      )
      .map(({ id, fileName, mimeType, dataUrl }) => ({ id, fileName, mimeType, dataUrl }));

    const defaultTitle =
      ctx.platform === 'youtube'
        ? 'YouTube Video'
        : ctx.platform === 'bilibili'
          ? 'Bilibili Video'
          : 'Video Capture';
    const title = ctx.videoTitle || defaultTitle;
    const pageUrl = ctx.canonicalUrl || ctx.videoUrl || '';
    const clippedAt = formatDateTime(new Date());
    const domain = pageUrl ? this.deriveDomain(pageUrl) : '';
    const platformLabel = ctx.platform === 'unknown' ? 'video' : ctx.platform;

    const normalizedDomain = domain || undefined;
    const frontMatter = generateYamlFrontMatter(
      'video',
      {
        type: 'video',
        title,
        ...(pageUrl ? { url: pageUrl } : {}),
        clipped_at: clippedAt,
        platform: platformLabel,
        capture_count: sorted.length,
        timestamp_count: timestampCaptures.length,
        fragment_count: fragmentCaptures.length,
        tags: ['clipping', 'video'],
        ...(normalizedDomain !== undefined && { domain: normalizedDomain })
      },
      {
        ...(normalizedDomain !== undefined && { domain: normalizedDomain })
      }
    );

    const bodyLines: string[] = [];

    if (timestampCaptures.length) {
      bodyLines.push(`## ${ctx.messages.timestampSectionTitle ?? 'Video timestamps'}`, '');
      timestampCaptures.forEach((capture, index) => {
        const label = this.formatTime(capture.timeSec);
        const comment = capture.comment ? ` ${capture.comment}` : '';
        bodyLines.push(`${index + 1}. [${label}](${capture.url})${comment}`);
        if (capture.screenshot) {
          bodyLines.push(`   ![Screenshot](aiob-attachment:${capture.screenshot.id})`);
        }
      });
    }

    if (fragmentCaptures.length) {
      const fragmentMarkdown = this.buildFragmentsMarkdown(fragmentCaptures, pageUrl, title);
      if (fragmentMarkdown) {
        if (bodyLines.length) {
          bodyLines.push('');
        }
        bodyLines.push(
          `## ${ctx.messages.fragmentSectionTitle ?? 'Captured fragments'}`,
          '',
          fragmentMarkdown.trim()
        );
      }
    }

    const body = bodyLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const markdown = body ? `${frontMatter}\n\n${body}\n` : `${frontMatter}\n\n`;

    return {
      markdown,
      title,
      type: 'video',
      meta: {
        url: pageUrl,
        domain,
        platform: ctx.platform,
        captureCount: sorted.length,
        timestampCount: timestampCaptures.length,
        fragmentCount: fragmentCaptures.length,
        storageKey: ctx.storageKey ?? undefined,
        ...(attachments.length ? { attachments } : {}),
        ...(ctx.exportDestination ? { exportDestination: ctx.exportDestination } : {})
      }
    };
  }

  async export(ctx: BuildPayloadContext): Promise<ClipResult> {
    const payload = this.buildPayload(ctx);
    const attachments = Array.isArray(payload.meta.attachments)
      ? (payload.meta.attachments as NonNullable<VideoClipData['attachments']>)
      : null;
    const clipData: VideoClipData = {
      content: payload.markdown,
      title: payload.title,
      url: (payload.meta.url as string | undefined) ?? ctx.canonicalUrl ?? ctx.videoUrl ?? '',
      videoUrl: ctx.videoUrl ?? '',
      timestamp: Date.now(),
      platform: this.mapPlatform(ctx.platform),
      ...(attachments ? { attachments } : {}),
      ...(ctx.exportDestination ? { exportDestination: ctx.exportDestination } : {})
    };
    return this.videoRepository.sendVideoClip(clipData);
  }

  private buildFragmentsMarkdown(
    captures: VideoFragmentCapture[],
    pageUrl: string,
    pageTitle: string
  ): string {
    try {
      const { markdown } = buildReaderHighlightsMarkdown({
        pageTitle,
        pageUrl,
        highlights: captures.map((capture, index) => ({
          selectedHtml: capture.selectedHtml,
          selectedText: capture.selectedText,
          comment: capture.comment,
          fragmentUrl: capture.fragmentUrl,
          footnoteIndex: index + 1
        }))
      });
      const marker = '\n---\n\n';
      const markerIndex = markdown.indexOf(marker);
      if (markerIndex !== -1) {
        return markdown.slice(markerIndex + marker.length).trim();
      }
      const doubleNewline = markdown.indexOf('\n\n');
      if (doubleNewline !== -1) {
        return markdown.slice(doubleNewline + 2).trim();
      }
      return markdown.trim();
    } catch {
      return captures
        .map((capture) => {
          const label = this.buildFragmentLabel(capture.selectedText);
          const commentPart = capture.comment ? `\n  - ${capture.comment}` : '';
          return `- ${label}${commentPart}`;
        })
        .join('\n');
    }
  }

  private buildFragmentLabel(text: string, limit = 80): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '[empty]';
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit - 3)}...`;
  }

  private mapPlatform(platform: VideoPlatform): 'youtube' | 'bilibili' | 'other' {
    if (platform === 'youtube') {
      return 'youtube';
    }
    if (platform === 'bilibili') {
      return 'bilibili';
    }
    return 'other';
  }

  private formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const paddedSeconds = seconds.toString().padStart(2, '0');
    return `${minutes}:${paddedSeconds}`;
  }

  private deriveDomain(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    } catch {
      return '';
    }
  }
}
