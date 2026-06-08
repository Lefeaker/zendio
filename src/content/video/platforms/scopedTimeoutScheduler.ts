export class ScopedTimeoutScheduler {
  private readonly handles = new Set<number>();

  constructor(private readonly getView: () => Window) {}

  schedule(callback: () => void, delayMs: number): number {
    const view = this.getView();
    let handle = 0;
    handle = view.setTimeout(() => {
      this.handles.delete(handle);
      callback();
    }, delayMs);
    this.handles.add(handle);
    return handle;
  }

  clear(handle: number | null): void {
    if (handle === null) {
      return;
    }
    this.getView().clearTimeout(handle);
    this.handles.delete(handle);
  }

  clearAll(): void {
    for (const handle of Array.from(this.handles)) {
      this.clear(handle);
    }
  }
}
