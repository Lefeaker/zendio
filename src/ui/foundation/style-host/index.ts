import {
  applyManagedShadowStyle,
  createManagedStyleOwner,
  removeManagedShadowStyle,
  type ManagedStyleEntry,
  type ManagedStyleEntrySource,
  type StyleAttachmentFailureCode,
  type StyleAttachmentHandle,
  type StyleAttachmentResult
} from './shadowStyleBridge';

export {
  applyManagedShadowStyle,
  createManagedStyleElement,
  createManagedStyleSheet,
  removeManagedShadowStyle,
  supportsAdoptedStyleSheets,
  type ManagedStyleEntry,
  type ManagedStyleEntrySource,
  type StyleAttachmentFailureCode,
  type StyleAttachmentHandle,
  type StyleAttachmentResult
} from './shadowStyleBridge';

interface PendingOperation {
  generation: number;
  settled: boolean;
  resolve: (result: StyleAttachmentResult) => void;
}

const failed = (code: StyleAttachmentFailureCode): StyleAttachmentResult => ({
  status: 'failed',
  code
});

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return value !== null && typeof value === 'object' && 'then' in value;
}

class ManagedStyleAttachment implements StyleAttachmentHandle {
  readonly ready: Promise<StyleAttachmentResult>;
  private readonly root: WeakRef<ShadowRoot>;
  private readonly owner = createManagedStyleOwner();
  private readonly appliedKeys = new Set<string>();
  private resolveReady!: (result: StyleAttachmentResult) => void;
  private operation: PendingOperation | null = null;
  private generation = 0;
  private disposed = false;
  private everConnected: boolean;

  constructor(
    root: ShadowRoot,
    private readonly source: ManagedStyleEntrySource,
    private readonly register: () => boolean,
    private readonly unregister: () => void,
    private readonly onPendingChange: (delta: number) => void
  ) {
    this.root = new WeakRef(root);
    this.everConnected = root.host.isConnected;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  start(): void {
    void this.beginRefresh().then((result) => this.resolveReady(result));
  }

  refresh(): Promise<StyleAttachmentResult> {
    return this.beginRefresh();
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.generation += 1;
      this.settleCurrent(failed('STYLE_ATTACHMENT_DISPOSED'));
    }
    if (this.releaseAppliedStyles()) this.unregister();
  }

  private beginRefresh(): Promise<StyleAttachmentResult> {
    if (this.disposed) return Promise.resolve(failed('STYLE_ATTACHMENT_DISPOSED'));
    if (!this.register()) {
      this.disposed = true;
      return Promise.resolve(failed('STYLE_ATTACHMENT_DISPOSED'));
    }
    this.settleCurrent(failed('STYLE_ATTACHMENT_SUPERSEDED'));
    const root = this.root.deref();
    if (root?.host.isConnected) this.everConnected = true;
    const generation = ++this.generation;
    let resolve!: (result: StyleAttachmentResult) => void;
    const promise = new Promise<StyleAttachmentResult>((settle) => {
      resolve = settle;
    });
    const operation = { generation, settled: false, resolve };
    this.operation = operation;
    this.onPendingChange(1);
    this.run(operation);
    return promise;
  }

  private run(operation: PendingOperation): void {
    let loaded: readonly ManagedStyleEntry[] | Promise<readonly ManagedStyleEntry[]>;
    try {
      loaded = typeof this.source === 'function' ? this.source() : this.source;
    } catch {
      this.fail(operation, 'STYLE_ASSET_LOAD_FAILED');
      return;
    }
    if (isPromiseLike(loaded)) {
      void Promise.resolve(loaded).then(
        (entries) => this.applyEntries(operation, entries),
        () => this.fail(operation, 'STYLE_ASSET_LOAD_FAILED')
      );
      return;
    }
    this.applyEntries(operation, loaded);
  }

  private applyEntries(operation: PendingOperation, entries: readonly ManagedStyleEntry[]): void {
    if (!this.isCurrent(operation)) return;
    const root = this.root.deref();
    if (!root) {
      this.fail(operation, 'STYLE_HOST_COLLECTED');
      return;
    }
    if (root.host.isConnected) this.everConnected = true;
    else if (this.everConnected) {
      this.fail(operation, 'STYLE_HOST_DISCONNECTED');
      return;
    }

    const nextKeys = new Set(entries.map(({ key }) => key));
    let failure: StyleAttachmentFailureCode | null = null;
    try {
      entries.forEach(({ key, cssText, sheet = null }) => {
        this.appliedKeys.add(key);
        const result = applyManagedShadowStyle(root, key, cssText, sheet, this.owner);
        if (result === 'superseded') {
          this.appliedKeys.delete(key);
          failure ??= 'STYLE_ATTACHMENT_SUPERSEDED';
        } else if (result === 'failed') failure = 'STYLE_APPLICATION_FAILED';
      });
      Array.from(this.appliedKeys).forEach((key) => {
        if (nextKeys.has(key)) return;
        const result = removeManagedShadowStyle(root, key, this.owner);
        if (result === 'failed') failure = 'STYLE_APPLICATION_FAILED';
        else this.appliedKeys.delete(key);
      });
    } catch {
      failure = 'STYLE_APPLICATION_FAILED';
    }
    if (failure) this.fail(operation, failure);
    else this.settle(operation, { status: 'ready' });
  }

  private fail(operation: PendingOperation, code: StyleAttachmentFailureCode): void {
    if (!this.isCurrent(operation)) return;
    const released = this.releaseAppliedStyles();
    if (released) this.unregister();
    this.settle(operation, failed(released ? code : 'STYLE_APPLICATION_FAILED'));
  }

  private releaseAppliedStyles(): boolean {
    const root = this.root.deref();
    if (!root) {
      this.appliedKeys.clear();
      return true;
    }
    let released = true;
    Array.from(this.appliedKeys).forEach((key) => {
      try {
        const result = removeManagedShadowStyle(root, key, this.owner);
        if (result === 'failed') released = false;
        else this.appliedKeys.delete(key);
      } catch {
        released = false;
      }
    });
    return released;
  }

  private isCurrent(operation: PendingOperation): boolean {
    return !this.disposed && !operation.settled && operation.generation === this.generation;
  }

  private settleCurrent(result: StyleAttachmentResult): void {
    if (this.operation) this.settle(this.operation, result);
  }

  private settle(operation: PendingOperation, result: StyleAttachmentResult): void {
    if (operation.settled) return;
    operation.settled = true;
    if (this.operation === operation) this.operation = null;
    this.onPendingChange(-1);
    operation.resolve(result);
  }
}

export class ManagedShadowStyleHost {
  private readonly attachments = new Set<ManagedStyleAttachment>();
  private pendingCount = 0;
  private generation = 0;

  attach(root: ShadowRoot, source: ManagedStyleEntrySource): StyleAttachmentHandle {
    const generation = this.generation;
    const attachment = new ManagedStyleAttachment(
      root,
      source,
      () => {
        if (generation !== this.generation) return false;
        this.attachments.add(attachment);
        return true;
      },
      () => this.attachments.delete(attachment),
      (delta) => {
        this.pendingCount += delta;
      }
    );
    this.attachments.add(attachment);
    attachment.start();
    return attachment;
  }

  destroy(): void {
    this.generation += 1;
    Array.from(this.attachments).forEach((attachment) => attachment.dispose());
  }

  getRegistrationCount(): number {
    return this.attachments.size;
  }

  getPendingCount(): number {
    return this.pendingCount;
  }
}
