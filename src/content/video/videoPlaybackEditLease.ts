export interface VideoPlaybackEditLeaseState {
  captureId: string;
  video: HTMLVideoElement;
  wasPlayingBeforeLease: boolean;
}

export class VideoPlaybackEditLease {
  private active: VideoPlaybackEditLeaseState | null = null;

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

    this.release({ restorePlayback: false });
    const wasPlayingBeforeLease = !video.paused;
    this.active = { captureId, video, wasPlayingBeforeLease };
    video.addEventListener('play', this.handlePlay, true);
    if (wasPlayingBeforeLease) {
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
      return;
    }

    current.video.removeEventListener('play', this.handlePlay, true);
    this.active = null;
    if (options.restorePlayback && current.wasPlayingBeforeLease) {
      try {
        void current.video.play().catch(() => undefined);
      } catch {
        // Browser autoplay policy or host wrappers may reject scripted playback.
      }
    }
  }

  releaseForCapture(captureId: string, options: { restorePlayback: boolean }): void {
    if (this.active?.captureId !== captureId) {
      return;
    }
    this.release(options);
  }

  reset(): void {
    this.release({ restorePlayback: false });
  }
}
