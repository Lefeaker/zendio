// Ensure test helpers are discoverable by TypeScript in tests.
declare module 'tests/utils/typeHelpers' {
  export function partialOf<T>(obj: Partial<T>): T;
  export function asType<T>(v: unknown): T;
  export function setGlobal<K extends keyof globalThis>(key: K, value: globalThis[K]): () => void;
  export function setWindowProp<K extends keyof Window>(key: K, value: Window[K]): () => void;
  export function mutationRecord(init: Partial<MutationRecord>): MutationRecord;
  export function selection(init: Partial<Selection>): Selection;
  export function intervalId(id: number): ReturnType<typeof setInterval>;
}

