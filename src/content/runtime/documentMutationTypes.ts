export type DocumentMutationDisposer = () => void;

export type DocumentMutationErrorPhase = 'filter' | 'callback';

export interface DocumentMutationErrorContext {
  phase: DocumentMutationErrorPhase;
  subscriberId: string;
}

export type DocumentMutationErrorReporter = (
  error: Error,
  context: DocumentMutationErrorContext
) => void;

export interface DocumentMutationSubscriptionOptions {
  subscriberId: string;
  filter(record: MutationRecord): boolean;
  callback(records: readonly MutationRecord[]): void;
  coalescingKey?: string | ((record: MutationRecord) => string);
  delayMs?: number;
}

export interface DocumentMutationHubApi {
  subscribe(options: DocumentMutationSubscriptionOptions): DocumentMutationDisposer;
}

export interface ScopedMutationObserver {
  observe(target: Node, options?: MutationObserverInit): void;
  disconnect(): void;
}

export type ScopedMutationObserverFactory = (
  callback: MutationCallback
) => ScopedMutationObserver | null;
