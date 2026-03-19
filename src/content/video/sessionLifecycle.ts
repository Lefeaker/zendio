export interface VideoSessionLifecycleHandlers {
  onUrlChange(): void;
  onVideoElementChange(element: HTMLVideoElement | null): void;
}

export interface VideoSessionLifecycleDependencies {
  doc: Document;
  locateVideoElement(): HTMLVideoElement | null;
}

export class VideoSessionLifecycle {
  private urlWatcherId: number | null = null;
  private videoPollerId: number | null = null;

  constructor(
    private readonly deps: VideoSessionLifecycleDependencies,
    private readonly handlers: VideoSessionLifecycleHandlers
  ) {}

  start(): void {
    this.startUrlWatcher();
    this.startVideoPolling();
  }

  stop(): void {
    if (this.urlWatcherId !== null) {
      window.clearInterval(this.urlWatcherId);
      this.urlWatcherId = null;
    }
    if (this.videoPollerId !== null) {
      window.clearInterval(this.videoPollerId);
      this.videoPollerId = null;
    }
  }

  private startUrlWatcher(): void {
    if (this.urlWatcherId !== null) {
      return;
    }
    let lastHref = this.deps.doc.location.href;
    this.urlWatcherId = window.setInterval(() => {
      const currentHref = this.deps.doc.location.href;
      if (currentHref !== lastHref) {
        lastHref = currentHref;
        this.handlers.onUrlChange();
      }
    }, 1000);
  }

  private startVideoPolling(): void {
    if (this.videoPollerId !== null) {
      return;
    }
    this.videoPollerId = window.setInterval(() => {
      const element = this.deps.locateVideoElement();
      this.handlers.onVideoElementChange(element);
    }, 800);
  }
}
