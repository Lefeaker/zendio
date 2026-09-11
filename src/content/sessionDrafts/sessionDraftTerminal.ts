import {
  createSessionDraftStorageKey,
  type SessionDraftClientEnvelope,
  type SessionDraftEnvelope as PersistedSessionDraftEnvelope
} from '../../shared/sessionDrafts';
import type { SessionDraftMessageRepository } from './sessionDraftRepository';

import {
  createSessionDraftTerminalState,
  type SessionDraftTerminalState
} from './sessionDraftTerminalState';
export {
  createSessionDraftTerminalState,
  type SessionDraftTerminalState
} from './sessionDraftTerminalState';

type MaybePromise<T> = T | Promise<T>;

export interface FinalizeTerminalSessionDraftOptions<
  TEnvelope extends SessionDraftClientEnvelope = SessionDraftClientEnvelope
> {
  repository: Pick<SessionDraftMessageRepository, 'readExact' | 'finalizeExact' | 'removeExact'>;
  state?: SessionDraftTerminalState | undefined;
  buildTerminalEnvelopes(): MaybePromise<Iterable<TEnvelope>>;
  cleanupTerminalDrafts?(): Promise<void>;
  flushPendingDraft?(): Promise<void>;
  onFlushError?(error: Error): void;
  onSaveError(error: Error): void;
  onCleanupError(error: Error): void;
}

export type SessionDraftTerminalFailurePhase = 'flush' | 'build' | 'read' | 'finalize' | 'remove';

export type FinalizeTerminalSessionDraftResult =
  | {
      outcome: 'completed';
      finalizedEnvelopes: readonly PersistedSessionDraftEnvelope[];
    }
  | {
      outcome: 'failed';
      phase: SessionDraftTerminalFailurePhase;
      error: Error;
      finalizedEnvelopes: readonly PersistedSessionDraftEnvelope[];
      latestCommittedEnvelope: PersistedSessionDraftEnvelope | null;
    };

export function finalizeTerminalSessionDraft<
  TEnvelope extends SessionDraftClientEnvelope = SessionDraftClientEnvelope
>(
  options: FinalizeTerminalSessionDraftOptions<TEnvelope>
): Promise<FinalizeTerminalSessionDraftResult> {
  const state = options.state ?? createSessionDraftTerminalState();
  if (state.inFlight) return state.inFlight;
  state.inFlight = runTerminalFinalization(options, state).finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

async function runTerminalFinalization<TEnvelope extends SessionDraftClientEnvelope>(
  options: FinalizeTerminalSessionDraftOptions<TEnvelope>,
  state: SessionDraftTerminalState
): Promise<FinalizeTerminalSessionDraftResult> {
  const completed = (): FinalizeTerminalSessionDraftResult => ({
    outcome: 'completed',
    finalizedEnvelopes: state.finalizedEnvelopes
  });
  if (state.completed) return completed();
  const fail = (
    phase: SessionDraftTerminalFailurePhase,
    error: unknown
  ): FinalizeTerminalSessionDraftResult => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    if (phase === 'flush') options.onFlushError?.(normalized);
    else options.onSaveError(normalized);
    return {
      outcome: 'failed',
      phase,
      error: normalized,
      finalizedEnvelopes: state.finalizedEnvelopes,
      latestCommittedEnvelope: state.finalizedEnvelopes.at(-1) ?? null
    };
  };

  if (state.targets === null) {
    try {
      await options.flushPendingDraft?.();
    } catch (error) {
      return fail('flush', error);
    }
    try {
      state.targets = Array.from(await options.buildTerminalEnvelopes(), (envelope) => ({
        key: createSessionDraftStorageKey(envelope),
        status: envelope.status === 'exported' ? 'exported' : 'discarded',
        removed: false
      }));
    } catch (error) {
      return fail('build', error);
    }
  }

  for (const target of state.targets) {
    if (target.removed) continue;
    if (!target.envelope) {
      try {
        const read = await options.repository.readExact({
          operation: 'readExact',
          key: target.key
        });
        if (read.outcome !== 'found' || read.envelope.schemaVersion !== 2 || !read.envelope.lease) {
          throw new Error(
            read.outcome === 'recovery_failed' ? read.code : 'SESSION_DRAFT_TERMINAL_READ_FAILED'
          );
        }
        target.envelope = read.envelope;
      } catch (error) {
        return fail('read', error);
      }
    }

    if (!target.committed) {
      const envelope = target.envelope;
      if (envelope.status === 'exported' || envelope.status === 'discarded') {
        if (envelope.status !== target.status) {
          return fail('finalize', new Error('SESSION_DRAFT_TERMINAL_STATUS_MISMATCH'));
        }
        target.committed = envelope;
      } else {
        target.finalizeRequest ??= {
          operation: 'finalizeExact',
          requestId: createTerminalRequestId('finalize'),
          key: target.key,
          expectedRevision: envelope.revision,
          leaseId: envelope.lease!.leaseId,
          status: target.status
        };
        try {
          const finalized = await options.repository.finalizeExact(target.finalizeRequest);
          if (finalized.outcome === 'finalized' && finalized.replay?.requiresReadExact) {
            const latest = await options.repository.readExact({
              operation: 'readExact',
              key: target.key
            });
            if (latest.outcome === 'missing' && finalized.replay.commit.key === target.key) {
              target.removed = true;
              continue;
            }
            if (
              latest.outcome === 'found' &&
              latest.envelope.schemaVersion === 2 &&
              latest.envelope.status === target.status &&
              latest.envelope.lease?.leaseId === target.finalizeRequest.leaseId
            ) {
              finalized.envelope = latest.envelope;
            }
          }
          if (finalized.outcome !== 'finalized' || !finalized.envelope?.lease) {
            if (finalized.outcome === 'conflict' && finalized.code === 'REVISION_CONFLICT') {
              delete target.envelope;
              delete target.finalizeRequest;
            }
            throw new Error(
              finalized.outcome === 'conflict' || finalized.outcome === 'recovery_failed'
                ? finalized.code
                : 'SESSION_DRAFT_TERMINAL_FINALIZE_FAILED'
            );
          }
          target.committed = finalized.envelope;
        } catch (error) {
          return fail('finalize', error);
        }
      }
      state.finalizedEnvelopes.push(target.committed);
    }

    target.removeRequest ??= {
      operation: 'removeExact',
      requestId: createTerminalRequestId('remove'),
      key: target.key,
      expectedRevision: target.committed.revision,
      leaseId: target.committed.lease!.leaseId
    };
    try {
      const removed = await options.repository.removeExact(target.removeRequest);
      if (removed.outcome !== 'removed') throw new Error(removed.code);
      target.removed = true;
    } catch (error) {
      return fail('remove', error);
    }
  }

  try {
    await options.cleanupTerminalDrafts?.();
  } catch (error) {
    options.onCleanupError(error instanceof Error ? error : new Error(String(error)));
  }
  state.completed = true;
  return completed();
}

function createTerminalRequestId(operation: string): string {
  const suffix =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${operation}-${suffix}`;
}
