/**
 * Test-only typed helpers to centralize unavoidable assertions and keep call sites clean.
 * Side-effect free and tree-shakeable.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function partialOf<T>(obj: Partial<T>): T {
  return obj as T;
}

export function asType<T>(v: unknown): T {
  return v as T;
}

/**
 * Set a globalThis property with proper typing and return a restore function.
 */
export function setGlobal<K extends keyof typeof globalThis>(key: K, value: (typeof globalThis)[K]): () => void {
  const prev = (globalThis as any)[key] as (typeof globalThis)[K];
  (globalThis as any)[key] = value;
  return () => {
    (globalThis as any)[key] = prev;
  };
}

/**
 * Set a window property with proper typing and return a restore function.
 */
export function setWindowProp<K extends keyof (Window & typeof globalThis)>(
  key: K,
  value: (Window & typeof globalThis)[K]
): () => void {
  const w = window as any;
  const prev = w[key] as (Window & typeof globalThis)[K];
  w[key] = value;
  return () => {
    w[key] = prev;
  };
}

/**
 * Create a MutationRecord-like object for tests.
 */
export function mutationRecord(init: Partial<MutationRecord>): MutationRecord {
  const fallback: MutationRecord = {
    type: 'attributes',
    target: document.createElement('div'),
    addedNodes: [] as any,
    removedNodes: [] as any,
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
  };
  return { ...fallback, ...init } as MutationRecord;
}

/**
 * Create a Selection-like object for tests.
 */
export function selection(init: Partial<Selection>): Selection {
  const fallbackRange = document.createRange();
  const fallback: Selection = {
    anchorNode: null,
    anchorOffset: 0,
    focusNode: null,
    focusOffset: 0,
    isCollapsed: true,
    rangeCount: 0,
    type: 'None',
    addRange: () => undefined as any,
    collapse: () => undefined as any,
    collapseToEnd: () => undefined as any,
    collapseToStart: () => undefined as any,
    containsNode: () => false,
    deleteFromDocument: () => undefined as any,
    empty: () => undefined as any,
    extend: () => undefined as any,
    getRangeAt: () => fallbackRange,
    removeAllRanges: () => undefined as any,
    removeRange: () => undefined as any,
    selectAllChildren: () => undefined as any,
    setBaseAndExtent: () => undefined as any,
    setPosition: () => undefined as any,
    toString: () => '',
  } as unknown as Selection;
  return { ...fallback, ...init } as Selection;
}

/**
 * Produce a minimal typed interval id for environments that require it.
 */
export function intervalId(id: number): ReturnType<typeof setInterval> {
  return id as unknown as ReturnType<typeof setInterval>;
}
