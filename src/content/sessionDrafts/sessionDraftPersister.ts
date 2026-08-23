import type {
  SessionDraftClientEnvelope,
  SessionDraftEnvelope as PersistedSessionDraftEnvelope
} from '../../shared/sessionDrafts';

type MaybePromise<T> = T | Promise<T>;
export interface SessionDraftPersisterOptions<
  TEnvelope extends SessionDraftClientEnvelope = SessionDraftClientEnvelope,
  TPersistedEnvelope = PersistedSessionDraftEnvelope
> {
  repository: {
    save(envelope: TEnvelope, options?: { requestId?: string }): Promise<TPersistedEnvelope>;
  };
  buildEnvelope: () => MaybePromise<TEnvelope | null>;
  delayMs?: number;
  createRequestId?: () => string;
  onPersistedEnvelope?: (envelope: TPersistedEnvelope) => void;
}
export interface SessionDraftPersister {
  hasPending(): boolean;
  scheduleSave(): Promise<void>;
  flushNow(): Promise<void>;
  dispose(options?: { flush?: boolean }): Promise<void>;
}

export async function settleSessionDraftPersister<Result>(
  persister: Pick<SessionDraftPersister, 'hasPending' | 'flushNow'>,
  after: () => Promise<Result>
): Promise<void> {
  if (persister.hasPending()) await persister.flushNow();
  await after();
}

interface Deferred {
  promise: Promise<void>;
  reject(error: unknown): void;
  resolve(): void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  void promise.catch(() => undefined);
  return { promise, reject, resolve };
}

export function createSessionDraftPersister<
  TEnvelope extends SessionDraftClientEnvelope,
  TPersistedEnvelope = PersistedSessionDraftEnvelope
>({
  repository,
  buildEnvelope,
  delayMs = 150,
  createRequestId = () =>
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `save-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  onPersistedEnvelope
}: SessionDraftPersisterOptions<TEnvelope, TPersistedEnvelope>): SessionDraftPersister {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Deferred | null = null;
  let writeChain = Promise.resolve();
  let retryRequestId: string | null = null;
  let retryEnvelope: TEnvelope | null = null;
  let retryGeneration = 0;
  let scheduledGeneration = 0;
  let activeRun = false;

  function ensurePending(): Deferred {
    pending ??= createDeferred();
    return pending;
  }

  async function flushPending(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const deferred = pending ?? (retryEnvelope && !activeRun ? createDeferred() : null);
    if (!deferred) {
      try {
        await writeChain;
      } catch (error) {
        if (retryEnvelope && !activeRun) return flushPending();
        throw error;
      }
      return;
    }

    pending = null;
    const run = async (): Promise<void> => {
      activeRun = true;
      try {
        const targetGeneration = scheduledGeneration;
        const replayEnvelope = retryEnvelope;
        const replayGeneration = retryGeneration;
        const envelope = replayEnvelope ?? (await buildEnvelope());
        if (envelope) {
          retryRequestId ??= createRequestId();
          retryEnvelope ??= envelope;
          retryGeneration ||= targetGeneration;
          const persisted = await repository.save(envelope, { requestId: retryRequestId });
          retryRequestId = null;
          retryEnvelope = null;
          retryGeneration = 0;
          onPersistedEnvelope?.(persisted);
        }
        if (replayEnvelope && targetGeneration > replayGeneration) {
          const latestEnvelope = await buildEnvelope();
          if (latestEnvelope) {
            retryRequestId = createRequestId();
            retryEnvelope = latestEnvelope;
            retryGeneration = targetGeneration;
            const persisted = await repository.save(latestEnvelope, {
              requestId: retryRequestId
            });
            retryRequestId = null;
            retryEnvelope = null;
            retryGeneration = 0;
            onPersistedEnvelope?.(persisted);
          }
        }
      } finally {
        activeRun = false;
      }
    };

    const completion = (writeChain = writeChain.then(run, run));
    try {
      await completion;
      deferred.resolve();
    } catch (error) {
      deferred.reject(error);
      throw error;
    }
  }

  return {
    hasPending: () => Boolean(timer || pending || retryEnvelope || activeRun),
    scheduleSave(): Promise<void> {
      if (disposed) {
        return Promise.reject(new Error('Session draft persister has been disposed.'));
      }
      scheduledGeneration += 1;
      const deferred = ensurePending();
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        void flushPending().catch(() => undefined);
      }, delayMs);
      return deferred.promise;
    },

    flushNow(): Promise<void> {
      return flushPending();
    },

    async dispose(options = {}): Promise<void> {
      disposed = true;
      if (options.flush && (timer || pending || retryEnvelope)) {
        await flushPending();
        return;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending?.resolve();
      pending = null;
      await writeChain;
    }
  };
}
