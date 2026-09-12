export interface InvalidationToken {
  readonly generation: number;
}

export interface InvalidationScope {
  readonly active: boolean;
  capture(): InvalidationToken;
  invalidate(): InvalidationToken;
  isCurrent(token: InvalidationToken): boolean;
  dispose(): void;
}

export function createInvalidationScope(): InvalidationScope {
  let generation = 0;
  let active = true;

  return {
    get active() {
      return active;
    },
    capture() {
      return { generation };
    },
    invalidate() {
      generation += 1;
      return { generation };
    },
    isCurrent(token) {
      return active && token.generation === generation;
    },
    dispose() {
      if (!active) return;
      active = false;
      generation += 1;
    }
  };
}
