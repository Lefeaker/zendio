import { markTimestampScreenshotPreparationFailed } from './screenshotIntent';
import type { VideoTimestampCapture } from './types';

export type HiddenDuplicateCaptureOutcome = 'succeeded' | 'failed' | 'aborted';

interface HiddenRetryRequestStorePort {
  clearTracked(captureId: string): void;
  getNextHiddenRetryAt(now: number): number | null;
  recordHiddenAttemptFailure(
    captureId: string,
    options: { maxAttempts: number; retryAvailableAt: number }
  ): 'ignored' | 'retry' | 'terminal';
}

interface VideoScreenshotHiddenRetryControllerOptions {
  doc: Document;
  requestStore: HiddenRetryRequestStorePort;
  findPendingCapture: (captureId: string) => VideoTimestampCapture | null;
  syncPanel: () => void;
  processRequests: () => void;
  maxHiddenDuplicateAttempts?: number | undefined;
  hiddenRetryBackoffMs?: number | undefined;
}

const DEFAULT_HIDDEN_DUPLICATE_MAX_ATTEMPTS = 2;
const DEFAULT_HIDDEN_DUPLICATE_RETRY_BACKOFF_MS = 250;

export class VideoScreenshotHiddenRetryController {
  private hiddenRetryTimer: ReturnType<Window['setTimeout']> | null = null;

  constructor(private readonly options: VideoScreenshotHiddenRetryControllerOptions) {}

  dispose(): void {
    this.clear();
  }

  clear(): void {
    if (this.hiddenRetryTimer === null) {
      return;
    }
    const view = this.options.doc.defaultView ?? window;
    view.clearTimeout(this.hiddenRetryTimer);
    this.hiddenRetryTimer = null;
  }

  handleOutcome(captureId: string, outcome: HiddenDuplicateCaptureOutcome): void {
    if (outcome !== 'failed') {
      return;
    }
    const capture = this.options.findPendingCapture(captureId);
    if (!capture) {
      this.options.requestStore.clearTracked(captureId);
      return;
    }

    const failureResult = this.options.requestStore.recordHiddenAttemptFailure(captureId, {
      maxAttempts: this.getMaxHiddenDuplicateAttempts(),
      retryAvailableAt: Date.now() + this.getHiddenRetryBackoffMs()
    });

    if (failureResult === 'terminal') {
      markTimestampScreenshotPreparationFailed(capture);
      this.options.requestStore.clearTracked(captureId);
      this.options.syncPanel();
      return;
    }

    if (failureResult === 'retry') {
      this.schedule();
    }
  }

  schedule(now = Date.now()): void {
    this.clear();
    const retryAt = this.options.requestStore.getNextHiddenRetryAt(now);
    if (retryAt === null) {
      return;
    }
    const view = this.options.doc.defaultView ?? window;
    this.hiddenRetryTimer = view.setTimeout(
      () => {
        this.hiddenRetryTimer = null;
        this.options.processRequests();
      },
      Math.max(0, retryAt - now)
    );
  }

  private getMaxHiddenDuplicateAttempts(): number {
    const value = this.options.maxHiddenDuplicateAttempts;
    return Number.isInteger(value) && typeof value === 'number' && value > 0
      ? value
      : DEFAULT_HIDDEN_DUPLICATE_MAX_ATTEMPTS;
  }

  private getHiddenRetryBackoffMs(): number {
    const value = this.options.hiddenRetryBackoffMs;
    return Number.isInteger(value) && typeof value === 'number' && value >= 0
      ? value
      : DEFAULT_HIDDEN_DUPLICATE_RETRY_BACKOFF_MS;
  }
}
