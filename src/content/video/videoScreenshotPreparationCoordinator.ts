import { setTimestampScreenshot } from './screenshotIntent';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from './types';
import {
  VideoScreenshotPreparationQueueOwner,
  type VideoScreenshotPreparationQueueOwnerArgs
} from './videoScreenshotPreparationQueueOwner';

type VideoScreenshotPreparationCoordinatorArgs = Omit<
  VideoScreenshotPreparationQueueOwnerArgs,
  'loadQueueModule'
>;

export class VideoScreenshotPreparationCoordinator {
  private disposed = false;
  private pendingRequestSuspendCount = 0;
  private pendingRequestAfterResume = false;
  private readonly cache = new Map<string, VideoCaptureScreenshot>();
  private readonly queueOwner: VideoScreenshotPreparationQueueOwner;

  constructor(private readonly args: VideoScreenshotPreparationCoordinatorArgs) {
    this.queueOwner = new VideoScreenshotPreparationQueueOwner(args);
  }

  handleVideoElementChange(element: HTMLVideoElement | null): void {
    if (this.disposed) {
      return;
    }
    if (this.hasSuspendedPendingRequests()) {
      this.deferPendingRequestAfterResume();
      this.queueOwner.handleVideoElementChange(element);
      return;
    }
    if (this.queueOwner.handleVideoElementChange(element)) return;
    this.requestPendingScreenshots();
  }

  suspendPendingRequests(): void {
    this.pendingRequestSuspendCount += 1;
  }

  resumePendingRequests(): void {
    this.pendingRequestSuspendCount = Math.max(0, this.pendingRequestSuspendCount - 1);
    if (!this.disposed && !this.hasSuspendedPendingRequests() && this.pendingRequestAfterResume) {
      this.pendingRequestAfterResume = false;
      this.requestPendingScreenshots();
    }
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

    const queue = await this.queueOwner.ensureQueue();
    if (queue && this.findPendingCapture(id)) {
      queue.request(id);
    }
  }

  requestPendingScreenshots(): void {
    if (this.disposed) {
      return;
    }
    if (this.hasSuspendedPendingRequests()) {
      this.deferPendingRequestAfterResume();
      return;
    }
    if (!this.hasPendingCaptures()) {
      return;
    }
    void this.requestAllPendingScreenshots().catch((error) => {
      console.warn('[VideoSession] Failed to request pending screenshots:', error);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.queueOwner.dispose();
    this.pendingRequestAfterResume = false;
    this.pendingRequestSuspendCount = 0;
    this.cache.clear();
  }

  private async requestAllPendingScreenshots(): Promise<void> {
    if (!this.hasPendingCaptures()) {
      return;
    }
    const queue = await this.queueOwner.ensureQueue();
    queue?.requestAll();
  }

  private hasPendingCaptures(): boolean {
    return this.args.getCaptures().some((capture) => this.isPendingCapture(capture));
  }

  private deferPendingRequestAfterResume(): void {
    if (!this.disposed && this.hasPendingCaptures()) {
      this.pendingRequestAfterResume = true;
    }
  }

  private hasSuspendedPendingRequests(): boolean {
    return this.pendingRequestSuspendCount > 0;
  }

  private findPendingCapture(id: string): VideoTimestampCapture | null {
    const capture = this.findCapture(id);
    return capture && this.isPendingCapture(capture) ? capture : null;
  }

  private findCapture(id: string): VideoTimestampCapture | null {
    return this.args.getCaptures().find((capture) => capture.id === id) ?? null;
  }

  private isPendingCapture(capture: VideoTimestampCapture): boolean {
    return !capture.screenshot && capture.screenshotPreparationFailed !== true;
  }
}
