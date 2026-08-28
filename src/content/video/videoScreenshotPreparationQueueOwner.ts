import type { VideoVisibleFrameScreenshotCapture } from './videoVisibleTabScreenshot';
import type { VideoScreenshotPreparedCallback } from './videoScreenshotPreparationCallbacks';
import type {
  CreateVideoScreenshotPreparationQueueArgs,
  VideoScreenshotFrameCapture
} from './videoScreenshotPreparationQueueTypes';
import type { VideoTimestampCapture } from './types';

export interface VideoScreenshotPreparationQueuePort {
  request(captureId: string): void;
  requestAll(): void;
  handleVideoElementChange(video: HTMLVideoElement | null): void;
  dispose(): void;
}

interface VideoScreenshotPreparationQueueModule {
  createVideoScreenshotPreparationQueue(
    args: CreateVideoScreenshotPreparationQueueArgs
  ): VideoScreenshotPreparationQueuePort;
}

export interface VideoScreenshotPreparationQueueOwnerArgs {
  doc: Document;
  getCaptures: () => VideoTimestampCapture[];
  getVisibleVideo: () => HTMLVideoElement | null;
  syncPanel: () => void;
  onScreenshotPrepared?: VideoScreenshotPreparedCallback;
  captureFrame?: VideoScreenshotFrameCapture | undefined;
  captureVisibleFrame?: VideoVisibleFrameScreenshotCapture | undefined;
  loadQueueModule?: () => Promise<VideoScreenshotPreparationQueueModule>;
}

const loadQueueModule = () => import('./videoScreenshotPreparationQueue');

export class VideoScreenshotPreparationQueueOwner {
  private queue: VideoScreenshotPreparationQueuePort | null = null;
  private queuePromise: Promise<VideoScreenshotPreparationQueuePort | null> | null = null;
  private generation = 0;
  private disposed = false;

  constructor(private readonly args: VideoScreenshotPreparationQueueOwnerArgs) {}

  handleVideoElementChange(element: HTMLVideoElement | null): boolean {
    if (!this.queue) return false;
    this.queue.handleVideoElementChange(element);
    return true;
  }

  ensureQueue(): Promise<VideoScreenshotPreparationQueuePort | null> {
    if (this.disposed) return Promise.resolve(null);
    if (this.queue) return Promise.resolve(this.queue);
    if (this.queuePromise) return this.queuePromise;

    const generation = this.generation;
    this.queuePromise = (this.args.loadQueueModule ?? loadQueueModule)()
      .then(({ createVideoScreenshotPreparationQueue }) => {
        if (this.disposed || generation !== this.generation) return null;
        const queue = createVideoScreenshotPreparationQueue(this.createQueueArgs());
        if (this.disposed || generation !== this.generation) {
          queue.dispose();
          return null;
        }

        this.queue = queue;
        queue.handleVideoElementChange(this.args.getVisibleVideo());
        return this.disposed || generation !== this.generation || this.queue !== queue
          ? null
          : queue;
      })
      .finally(() => {
        this.queuePromise = null;
      });
    return this.queuePromise;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    const queue = this.queue;
    this.queue = null;
    this.queuePromise = null;
    queue?.dispose();
  }

  private createQueueArgs(): CreateVideoScreenshotPreparationQueueArgs {
    return {
      doc: this.args.doc,
      getCaptures: this.args.getCaptures,
      getVisibleVideo: this.args.getVisibleVideo,
      onScreenshotPrepared: (capture, screenshot, source) =>
        this.args.onScreenshotPrepared?.(capture, screenshot, source),
      syncPanel: this.args.syncPanel,
      ...(this.args.captureFrame ? { captureFrame: this.args.captureFrame } : {}),
      ...(this.args.captureVisibleFrame
        ? { captureVisibleFrame: this.args.captureVisibleFrame }
        : {})
    };
  }
}
