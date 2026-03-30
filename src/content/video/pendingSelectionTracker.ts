export class PendingSelectionTracker {
  private range: Range | null = null;
  private timestamp = 0;
  private clearHandle: number | null = null;

  capture(source: Range): void {
    this.range = source.cloneRange();
    this.timestamp = Date.now();
    if (this.clearHandle !== null) {
      window.clearTimeout(this.clearHandle);
      this.clearHandle = null;
    }
  }

  hasActiveRange(): boolean {
    return this.range !== null;
  }

  scheduleClear(delayMs = 480): void {
    if (this.clearHandle !== null) {
      return;
    }
    this.clearHandle = window.setTimeout(() => this.reset(), delayMs);
  }

  consume(maxAgeMs = 1500): Range | null {
    if (!this.range) {
      return null;
    }
    if (Date.now() - this.timestamp > maxAgeMs) {
      this.reset();
      return null;
    }
    const clone = this.range.cloneRange();
    this.reset();
    return clone;
  }

  reset(): void {
    if (this.clearHandle !== null) {
      window.clearTimeout(this.clearHandle);
      this.clearHandle = null;
    }
    this.range = null;
    this.timestamp = 0;
  }
}
