import type { IVideoRepository } from '../../shared/repositories/IVideoRepository';
import { VideoCommentEditorPlaybackPolicy } from './videoCommentEditorPlaybackPolicy';
import { VideoPlaybackEditLease } from './videoPlaybackEditLease';

interface VideoCommentEditorPlaybackControllerOptions {
  doc: Document;
  videoRepository: IVideoRepository;
  findVideoElement: () => HTMLVideoElement | null;
}

interface VideoCommentEditorPlaybackResetOptions {
  preserveTransactions?: boolean;
}

export class VideoCommentEditorPlaybackController {
  private readonly playbackEditLease = new VideoPlaybackEditLease();
  private readonly policy = new VideoCommentEditorPlaybackPolicy();
  private stopConfigWatcher: (() => void) | null = null;

  constructor(private readonly options: VideoCommentEditorPlaybackControllerOptions) {}

  async start(): Promise<void> {
    this.stopConfigWatcher?.();
    this.stopConfigWatcher = null;
    try {
      this.policy.applyConfig(await this.options.videoRepository.getVideoConfig());
    } catch (error) {
      console.warn('[VideoSession] Failed to load video editor playback config:', error);
      this.policy.applyConfig(null);
    }
    this.stopConfigWatcher = this.options.videoRepository.onConfigChange((config) =>
      this.policy.applyConfig(config)
    );
  }

  beginPlaybackEditLease(captureId: string): void {
    const video = this.options.findVideoElement() ?? this.options.doc.querySelector('video');
    if (video) {
      this.playbackEditLease.acquire(captureId, video);
    }
  }

  beginCommentEditorLease(captureId: string): void {
    if (this.policy.shouldAcquireLeaseOnFocus(captureId)) {
      this.beginPlaybackEditLease(captureId);
    }
  }

  releaseCommentEditorLease(captureId: string): void {
    if (this.policy.shouldReleaseLeaseOnBlur(captureId)) {
      this.releaseForCapture(captureId, true);
    }
  }

  releaseForCapture(captureId: string, restorePlayback: boolean): void {
    this.playbackEditLease.releaseForCapture(captureId, { restorePlayback });
    this.policy.clearCapture(captureId);
  }

  releaseAll(restorePlayback: boolean): void {
    this.playbackEditLease.release({ restorePlayback });
    this.policy.reset();
  }

  markAddNoteTransaction(captureId: string): void {
    this.policy.markAddNoteTransaction(captureId);
    if (this.playbackEditLease.hasTransaction(captureId)) {
      this.beginPlaybackEditLease(captureId);
    }
  }

  reset(options: VideoCommentEditorPlaybackResetOptions = {}): void {
    this.playbackEditLease.reset(options);
    if (!options.preserveTransactions) {
      this.policy.reset();
    }
  }

  dispose(): void {
    this.stopConfigWatcher?.();
    this.stopConfigWatcher = null;
    this.reset();
  }
}
