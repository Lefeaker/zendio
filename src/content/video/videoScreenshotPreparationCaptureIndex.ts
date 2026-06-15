import type { VideoTimestampCapture } from './types';

interface VideoScreenshotPreparationRequestIndexPort {
  getTrackedIds(): string[];
  hasTracked(captureId: string): boolean;
  pruneTracked(pendingIds: ReadonlySet<string>): void;
}

export class VideoScreenshotPreparationCaptureIndex {
  constructor(
    private readonly getCaptures: () => VideoTimestampCapture[],
    private readonly requestStore: VideoScreenshotPreparationRequestIndexPort
  ) {}

  findPending(id: string): VideoTimestampCapture | null {
    return this.listPending().find((capture) => capture.id === id) ?? null;
  }

  hasTrackedPending(captureId: string): boolean {
    return this.requestStore.hasTracked(captureId) && Boolean(this.findPending(captureId));
  }

  listPending(): VideoTimestampCapture[] {
    return this.getCaptures().filter(
      (capture) => !capture.screenshot && capture.screenshotPreparationFailed !== true
    );
  }

  listTrackedPending(): VideoTimestampCapture[] {
    const pendingById = new Map(this.listPending().map((capture) => [capture.id, capture]));
    return this.requestStore
      .getTrackedIds()
      .map((id) => pendingById.get(id) ?? null)
      .filter((capture): capture is VideoTimestampCapture => capture !== null);
  }

  pruneTracked(): void {
    this.requestStore.pruneTracked(new Set(this.listPending().map((capture) => capture.id)));
  }
}
