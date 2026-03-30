export * from './BaseComponent';
export type DisposeFn = () => void;

export interface LifecycleRegistry {
  add(dispose: DisposeFn | null | undefined): void;
  flush(): void;
  size(): number;
}

export function createLifecycleRegistry(): LifecycleRegistry {
  const disposers: DisposeFn[] = [];

  return {
    add(dispose) {
      if (typeof dispose === 'function') {
        disposers.push(dispose);
      }
    },
    flush() {
      while (disposers.length > 0) {
        const disposer = disposers.pop();
        disposer?.();
      }
    },
    size() {
      return disposers.length;
    }
  };
}
