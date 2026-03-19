import type { VideoPanelCapture, VideoPanelTexts } from './application/videoPanelModel';
import type { VideoSessionView } from './application/videoSessionView';
import type { VideoFragmentCapture, VideoTimestampCapture } from './types';
import { BasePanelPresenter } from '../shared/panels/basePanelPresenter';

interface RenderOptions {
  timestamps: VideoTimestampCapture[];
  fragments: VideoFragmentCapture[];
}

export class VideoPanelPresenter extends BasePanelPresenter<VideoSessionView> {
  constructor(view: VideoSessionView) {
    super(view);
  }

  updateTexts(texts: VideoPanelTexts): void {
    this.view.updateTexts(texts);
  }

  render({ timestamps, fragments }: RenderOptions): number {
    const items: VideoPanelCapture[] = [];

    for (const capture of timestamps) {
      items.push({
        id: capture.id,
        index: items.length + 1,
        kind: 'timestamp',
        timeLabel: this.formatTime(capture.timeSec),
        timeSeconds: capture.timeSec,
        shareUrl: capture.url,
        comment: capture.comment,
        commentPreview: this.buildCommentPreview(capture.comment)
      });
    }

    for (const capture of fragments) {
      items.push({
        id: capture.id,
        index: items.length + 1,
        kind: 'fragment',
        fragmentLabel: this.buildFragmentLabel(capture.selectedText),
        fragmentUrl: capture.fragmentUrl,
        comment: capture.comment,
        commentPreview: this.buildCommentPreview(capture.comment),
        selectionPreview: capture.selectedText
      });
    }

    this.view.updateCount(items.length);
    this.view.setCaptures(items);
    return items.length;
  }

  private formatTime(seconds: number): string {
    const clamped = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const secs = clamped % 60;

    if (hours > 0) {
      return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(secs)}`;
    }

    return `${this.pad(minutes)}:${this.pad(secs)}`;
  }

  private buildFragmentLabel(text: string, limit = 80): string {
    const normalized = this.normalizeText(text);
    if (!normalized) {
      return '[empty]';
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit - 3)}...`;
  }

  private pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
  }
}
