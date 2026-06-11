import type { SessionDraftEnvelope, SessionDraftRepository } from './sessionDraftTypes';

type MaybePromise<T> = T | Promise<T>;

export interface FinalizeTerminalSessionDraftOptions<
  TEnvelope extends SessionDraftEnvelope = SessionDraftEnvelope
> {
  repository: Pick<SessionDraftRepository, 'save'>;
  buildTerminalEnvelopes(): MaybePromise<Iterable<TEnvelope>>;
  cleanupTerminalDrafts?(): Promise<void>;
  flushPendingDraft?(): Promise<void>;
  onFlushError?(error: Error): void;
  onSaveError(error: Error): void;
  onCleanupError(error: Error): void;
}

export async function finalizeTerminalSessionDraft<
  TEnvelope extends SessionDraftEnvelope = SessionDraftEnvelope
>(options: FinalizeTerminalSessionDraftOptions<TEnvelope>): Promise<boolean> {
  if (options.flushPendingDraft) {
    try {
      await options.flushPendingDraft();
    } catch (error) {
      options.onFlushError?.(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  const terminalEnvelopes = Array.from(await options.buildTerminalEnvelopes());
  if (terminalEnvelopes.length === 0) {
    return true;
  }

  try {
    for (const envelope of terminalEnvelopes) {
      await options.repository.save(envelope);
    }
  } catch (error) {
    options.onSaveError(error instanceof Error ? error : new Error(String(error)));
    return false;
  }

  if (options.cleanupTerminalDrafts) {
    try {
      await options.cleanupTerminalDrafts();
    } catch (error) {
      options.onCleanupError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return true;
}
