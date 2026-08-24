type TaskFailure = Parameters<typeof Promise.reject>[0];

export interface ProductionStitchActionTask<TSnapshot, TResult = void> {
  readonly key: string;
  capture(): TSnapshot;
  task(): Promise<TResult>;
  rollback(snapshot: TSnapshot, error: TaskFailure): void;
  onSuccess?(result: TResult): void;
  onFailure?(error: TaskFailure): void;
}

export interface ProductionStitchActionTaskOwner {
  run<TSnapshot, TResult = void>(task: ProductionStitchActionTask<TSnapshot, TResult>): void;
  waitForIdle(): Promise<void>;
  dispose(): void;
}

export function createProductionStitchActionTaskOwner(): ProductionStitchActionTaskOwner {
  let disposed = false;
  const tails = new Map<string, Promise<void>>();
  const pending = new Set<Promise<void>>();

  async function execute<TSnapshot, TResult>(
    definition: ProductionStitchActionTask<TSnapshot, TResult>
  ): Promise<void> {
    const snapshot = definition.capture();
    try {
      const result = await definition.task();
      if (!disposed) definition.onSuccess?.(result);
    } catch (error) {
      if (!disposed) {
        definition.rollback(snapshot, error);
        definition.onFailure?.(error);
      }
    }
  }

  function run<TSnapshot, TResult = void>(
    definition: ProductionStitchActionTask<TSnapshot, TResult>
  ): void {
    if (disposed) return;
    const start = (): Promise<void> => (disposed ? Promise.resolve() : execute(definition));
    const previous = tails.get(definition.key);
    const active = previous ? previous.then(start, start) : start();
    let tracked: Promise<void>;
    tracked = active.finally(() => {
      pending.delete(tracked);
      if (tails.get(definition.key) === tracked) tails.delete(definition.key);
    });
    tails.set(definition.key, tracked);
    pending.add(tracked);
  }

  return {
    run,
    async waitForIdle(): Promise<void> {
      while (pending.size > 0) await Promise.all([...pending]);
    },
    dispose(): void {
      disposed = true;
      tails.clear();
    }
  };
}
