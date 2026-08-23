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
  const generations = new Map<string, number>();
  const pending = new Map<object, Promise<void>>();

  function run<TSnapshot, TResult = void>(
    definition: ProductionStitchActionTask<TSnapshot, TResult>
  ): void {
    if (disposed) return;
    const generation = (generations.get(definition.key) ?? 0) + 1;
    generations.set(definition.key, generation);
    const snapshot = definition.capture();
    const token = {};
    const tracked = (async () => {
      try {
        const result = await definition.task();
        if (!disposed && generations.get(definition.key) === generation) {
          definition.onSuccess?.(result);
        }
      } catch (error) {
        if (!disposed && generations.get(definition.key) === generation) {
          definition.rollback(snapshot, error);
          definition.onFailure?.(error);
        }
      } finally {
        pending.delete(token);
      }
    })();
    pending.set(token, tracked);
  }

  return {
    run,
    async waitForIdle(): Promise<void> {
      await Promise.all([...pending.values()]);
    },
    dispose(): void {
      disposed = true;
      generations.clear();
    }
  };
}
