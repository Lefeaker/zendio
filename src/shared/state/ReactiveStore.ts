export type StateListener<T> = (value: T | undefined) => void;

export interface StateStore<T> {
  readonly key: string | undefined;
  get(): T | undefined;
  set(value: T | undefined): void;
  subscribe(listener: StateListener<T>): () => void;
  clear(): void;
}

export class ReactiveStore<T> implements StateStore<T> {
  private value: T | undefined;
  private listeners: Set<StateListener<T>> = new Set();
  readonly key: string | undefined;

  constructor(key?: string) {
    this.key = key;
  }

  get(): T | undefined {
    return this.value;
  }

  set(nextValue: T | undefined): void {
    this.value = nextValue;
    this.listeners.forEach((listener) => {
      try {
        listener(nextValue);
      } catch (error) {
        // 监听器内部抛错不影响其他订阅者
        console.error('[ReactiveStore] listener failed', error);
      }
    });
  }

  /**
   * 静默更新值,不触发订阅通知
   * 用于读操作(如 load)刷新缓存,避免触发副作用循环
   */
  setSilent(nextValue: T | undefined): void {
    this.value = nextValue;
  }

  subscribe(listener: StateListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.value = undefined;
    this.listeners.clear();
  }
}
