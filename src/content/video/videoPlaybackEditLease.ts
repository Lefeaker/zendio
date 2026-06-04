export interface VideoPlaybackEditLeaseState {
  captureId: string;
  video: HTMLVideoElement;
  wasPlayingBeforeLease: boolean;
}

interface VideoPlaybackEditLeaseResetOptions {
  preserveTransactions?: boolean;
}

export class VideoPlaybackEditLease {
  private active: VideoPlaybackEditLeaseState | null = null;
  private readonly transactions = new Map<string, VideoPlaybackEditLeaseState>();

  private readonly handlePlay = (): void => {
    const video = this.active?.video;
    if (!video) {
      return;
    }
    try {
      video.pause();
    } catch {
      // Host player wrappers may throw; explicit release still clears the lease.
    }
  };

  acquire(captureId: string, video: HTMLVideoElement): void {
    if (this.active?.captureId === captureId && this.active.video === video) {
      return;
    }

    for (const key of this.transactions.keys()) {
      if (key !== captureId) {
        this.transactions.delete(key);
      }
    }
    this.deactivateActiveLease();
    const existingTransaction = this.transactions.get(captureId);
    const wasPlayingBeforeLease = existingTransaction?.wasPlayingBeforeLease ?? !video.paused;
    this.active = { captureId, video, wasPlayingBeforeLease };
    this.transactions.set(captureId, this.active);
    video.addEventListener('play', this.handlePlay, true);
    if (wasPlayingBeforeLease && !video.paused) {
      try {
        video.pause();
      } catch {
        // Keep the lease active so subsequent play events are still guarded.
      }
    }
  }

  release(options: { restorePlayback: boolean }): void {
    const current = this.active;
    if (!current) {
      const transactions = Array.from(this.transactions.values());
      this.transactions.clear();
      transactions.forEach((transaction) =>
        this.restorePlaybackIfNeeded(transaction, options.restorePlayback)
      );
      return;
    }

    this.deactivateActiveLease();
    this.transactions.clear();
    this.restorePlaybackIfNeeded(current, options.restorePlayback);
  }

  releaseForCapture(captureId: string, options: { restorePlayback: boolean }): void {
    const transaction = this.transactions.get(captureId);
    if (!transaction) {
      return;
    }
    if (this.active?.captureId === captureId) {
      this.deactivateActiveLease();
    }
    this.transactions.delete(captureId);
    this.restorePlaybackIfNeeded(transaction, options.restorePlayback);
  }

  reset(options: VideoPlaybackEditLeaseResetOptions = {}): void {
    this.deactivateActiveLease();
    if (!options.preserveTransactions) {
      this.transactions.clear();
    }
  }

  private deactivateActiveLease(): void {
    const current = this.active;
    if (!current) {
      return;
    }
    current.video.removeEventListener('play', this.handlePlay, true);
    this.active = null;
  }

  private restorePlaybackIfNeeded(
    transaction: VideoPlaybackEditLeaseState,
    restorePlayback: boolean
  ): void {
    if (!restorePlayback || !transaction.wasPlayingBeforeLease) {
      return;
    }
    try {
      void transaction.video.play().catch(() => undefined);
    } catch {
      // Browser autoplay policy or host wrappers may reject scripted playback.
    }
  }
}
