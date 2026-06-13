import { setTimestampScreenshot } from './screenshotIntent';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from './types';
import type { VideoVisibleFrameScreenshotCapture } from './videoVisibleTabScreenshot';

interface VideoScreenshotPreparationCoordinatorArgs {
  doc: Document;
  getCaptures: () => VideoTimestampCapture[];
  getVisibleVideo: () => HTMLVideoElement | null;
  syncPanel: () => void;
  captureVisibleFrame?: VideoVisibleFrameScreenshotCapture | undefined;
}

interface VideoScreenshotPreparationQueue {
  request(captureId: string): void;
  requestAll(): void;
  handleVideoElementChange(video: HTMLVideoElement | null): void;
  dispose(): void;
}

export class VideoScreenshotPreparationCoordinator {
  private queue: VideoScreenshotPreparationQueue | null = null;
  private queuePromise: Promise<VideoScreenshotPreparationQueue | null> | null = null;
  private generation = 0;
  private disposed = false;
  private readonly cache = new Map<string, VideoCaptureScreenshot>();

  constructor(private readonly args: VideoScreenshotPreparationCoordinatorArgs) {}

  handleVideoElementChange(element: HTMLVideoElement | null): void {
    if (this.queue) {
      this.queue.handleVideoElementChange(element);
      return;
    }
    this.requestPendingScreenshots();
  }

  cacheRequestedScreenshot(id: string): void {
    const capture = this.findCapture(id);
    if (capture?.screenshot) {
      this.cache.set(id, capture.screenshot);
    }
  }

  async prepareRequestedScreenshot(id: string): Promise<void> {
    const capture = this.findPendingCapture(id);
    if (!capture) {
      return;
    }

    const cachedScreenshot = this.cache.get(id);
    if (cachedScreenshot) {
      setTimestampScreenshot(capture, cachedScreenshot);
      this.args.syncPanel();
      return;
    }

    const queue = await this.ensureQueue();
    if (queue && this.findPendingCapture(id)) {
      queue.request(id);
    }
  }

  requestPendingScreenshots(): void {
    if (!this.hasPendingCaptures()) {
      return;
    }
    void this.requestAllPendingScreenshots().catch((error) => {
      console.warn('[VideoSession] Failed to request pending screenshots:', error);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.queue?.dispose();
    this.queue = null;
    this.queuePromise = null;
    this.cache.clear();
  }

  private async requestAllPendingScreenshots(): Promise<void> {
    if (!this.hasPendingCaptures()) {
      return;
    }
    const queue = await this.ensureQueue();
    queue?.requestAll();
  }

  private async ensureQueue(): Promise<VideoScreenshotPreparationQueue | null> {
    if (this.disposed) {
      return null;
    }
    if (this.queue) {
      return this.queue;
    }
    if (this.queuePromise) {
      return this.queuePromise;
    }

    const generation = this.generation;
    this.queuePromise = import('./videoScreenshotPreparationQueue')
      .then(({ createVideoScreenshotPreparationQueue }) => {
        if (this.disposed || generation !== this.generation) {
          return null;
        }

        const queue = createVideoScreenshotPreparationQueue({
          doc: this.args.doc,
          getCaptures: this.args.getCaptures,
          getVisibleVideo: this.args.getVisibleVideo,
          captureVisibleFrame: this.args.captureVisibleFrame,
          syncPanel: this.args.syncPanel
        });

        if (this.disposed || generation !== this.generation) {
          queue.dispose();
          return null;
        }

        this.queue = queue;
        queue.handleVideoElementChange(this.args.getVisibleVideo());
        return queue;
      })
      .finally(() => {
        this.queuePromise = null;
      });

    return this.queuePromise;
  }

  private hasPendingCaptures(): boolean {
    return this.args.getCaptures().some((capture) => this.isPendingCapture(capture));
  }

  private findPendingCapture(id: string): VideoTimestampCapture | null {
    const capture = this.findCapture(id);
    return capture && this.isPendingCapture(capture) ? capture : null;
  }

  private findCapture(id: string): VideoTimestampCapture | null {
    return this.args.getCaptures().find((capture) => capture.id === id) ?? null;
  }

  private isPendingCapture(capture: VideoTimestampCapture): boolean {
    return !capture.screenshot;
  }
}
