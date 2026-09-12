import type {
  SessionDraftEnvelope,
  SessionDraftEnvelopeMutationResult
} from '../../shared/sessionDrafts';

/** Per-client observations only; the background store remains the durable writer. */
export function createSessionDraftClientState() {
  const envelopes = new Map<string, SessionDraftEnvelope>();
  const leases = new Map<string, Set<Promise<SessionDraftEnvelopeMutationResult>>>();
  return {
    get: (key: string) => envelopes.get(key),
    set(key: string, envelope: SessionDraftEnvelope) {
      const previous = envelopes.get(key);
      if (!previous || envelope.revision >= previous.revision) envelopes.set(key, envelope);
    },
    delete: (key: string) => envelopes.delete(key),
    trackLease(key: string, operation: Promise<SessionDraftEnvelopeMutationResult>) {
      const pending = leases.get(key) ?? new Set<Promise<SessionDraftEnvelopeMutationResult>>();
      leases.set(key, pending);
      const completion = operation.finally(() => {
        pending.delete(completion);
        if (pending.size === 0) leases.delete(key);
      });
      pending.add(completion);
      return completion;
    },
    async settleLeases(key: string): Promise<boolean> {
      const pending = leases.get(key);
      if (!pending) return false;
      const results = await Promise.allSettled([...pending]);
      return results.some(
        (result) =>
          result.status === 'rejected' ||
          result.value.outcome === 'conflict' ||
          result.value.outcome === 'recovery_failed'
      );
    }
  };
}
