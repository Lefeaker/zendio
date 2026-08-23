import {
  createSessionDraftStorageKey,
  type SessionDraftClientEnvelope,
  type SessionDraftEnvelope as PersistedSessionDraftEnvelope
} from '../../shared/sessionDrafts';
import type { SessionDraftMessageRepository } from './sessionDraftRepository';

type MaybePromise<T> = T | Promise<T>;

export interface FinalizeTerminalSessionDraftOptions<
  TEnvelope extends SessionDraftClientEnvelope = SessionDraftClientEnvelope
> {
  repository: Pick<SessionDraftMessageRepository, 'readExact' | 'finalizeExact' | 'removeExact'>;
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

export async function finalizeTerminalSessionDraft<
  TEnvelope extends SessionDraftClientEnvelope = SessionDraftClientEnvelope
>(
  options: FinalizeTerminalSessionDraftOptions<TEnvelope>
): Promise<FinalizeTerminalSessionDraftResult> {
  const finalizedEnvelopes: PersistedSessionDraftEnvelope[] = [];

  const fail = (
    phase: SessionDraftTerminalFailurePhase,
    error: unknown,
    latestCommittedEnvelope: PersistedSessionDraftEnvelope | null = finalizedEnvelopes.at(-1) ??
      null
  ): FinalizeTerminalSessionDraftResult => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    if (phase === 'flush') {
      options.onFlushError?.(normalized);
    } else {
      options.onSaveError(normalized);
    }
    return {
      outcome: 'failed',
      phase,
      error: normalized,
      finalizedEnvelopes,
      latestCommittedEnvelope
    };
  };

  if (options.flushPendingDraft) {
    try {
      await options.flushPendingDraft();
    } catch (error) {
      return fail('flush', error);
    }
  }

  let terminalEnvelopes: TEnvelope[];
  try {
    terminalEnvelopes = Array.from(await options.buildTerminalEnvelopes());
  } catch (error) {
    return fail('build', error);
  }
  if (terminalEnvelopes.length === 0) {
    return { outcome: 'completed', finalizedEnvelopes };
  }

  for (const envelope of terminalEnvelopes) {
    const key = createSessionDraftStorageKey({
      mode: envelope.mode,
      pageKey: envelope.pageKey,
      draftId: envelope.draftId
    });
    let readEnvelope: PersistedSessionDraftEnvelope;
    try {
      const read = await options.repository.readExact({ operation: 'readExact', key });
      if (read.outcome !== 'found' || read.envelope.schemaVersion !== 2 || !read.envelope.lease) {
        throw new Error(
          read.outcome === 'recovery_failed' ? read.code : 'SESSION_DRAFT_TERMINAL_READ_FAILED'
        );
      }
      readEnvelope = read.envelope;
    } catch (error) {
      return fail('read', error);
    }

    const terminalStatus = envelope.status === 'exported' ? 'exported' : 'discarded';
    if (!readEnvelope.lease) {
      return fail('read', new Error('SESSION_DRAFT_TERMINAL_READ_FAILED'));
    }
    const readLeaseId = readEnvelope.lease.leaseId;
    let committedEnvelope = readEnvelope;
    if (readEnvelope.status === 'exported' || readEnvelope.status === 'discarded') {
      if (readEnvelope.status !== terminalStatus) {
        return fail('finalize', new Error('SESSION_DRAFT_TERMINAL_STATUS_MISMATCH'));
      }
    } else {
      try {
        const finalized = await options.repository.finalizeExact({
          operation: 'finalizeExact',
          requestId: createTerminalRequestId('finalize'),
          key,
          expectedRevision: readEnvelope.revision,
          leaseId: readLeaseId,
          status: terminalStatus
        });
        if (finalized.outcome !== 'finalized' || !finalized.envelope || !finalized.envelope.lease) {
          throw new Error(
            finalized.outcome === 'conflict' || finalized.outcome === 'recovery_failed'
              ? finalized.code
              : 'SESSION_DRAFT_TERMINAL_FINALIZE_FAILED'
          );
        }
        committedEnvelope = finalized.envelope;
      } catch (error) {
        return fail('finalize', error);
      }
    }
    finalizedEnvelopes.push(committedEnvelope);

    try {
      const removed = await options.repository.removeExact({
        operation: 'removeExact',
        requestId: createTerminalRequestId('remove'),
        key,
        expectedRevision: committedEnvelope.revision,
        leaseId: committedEnvelope.lease!.leaseId
      });
      if (removed.outcome !== 'removed') {
        throw new Error(removed.code);
      }
    } catch (error) {
      return fail('remove', error, committedEnvelope);
    }
  }

  if (options.cleanupTerminalDrafts) {
    try {
      await options.cleanupTerminalDrafts();
    } catch (error) {
      options.onCleanupError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return { outcome: 'completed', finalizedEnvelopes };
}

function createTerminalRequestId(operation: string): string {
  const suffix =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${operation}-${suffix}`;
}
