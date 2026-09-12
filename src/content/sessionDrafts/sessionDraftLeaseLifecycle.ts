import {
  SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS,
  createSessionDraftStorageKey,
  type SessionDraftEnvelope as PersistedSessionDraftEnvelope,
  type SessionDraftEnvelopeMutationResult,
  type SessionDraftMode,
  type SessionDraftReleaseLeaseRequest,
  type SessionDraftRenewLeaseRequest
} from '../../shared/sessionDrafts';
import { isExtensionContextInvalidated } from '../../platform/shared/extensionContext';
import type { SessionDraftLeaseOwnerRegistry } from './sessionDraftLeaseOwnerRegistry';

interface SessionDraftLeaseRepository {
  renewLease(request: SessionDraftRenewLeaseRequest): Promise<SessionDraftEnvelopeMutationResult>;
  releaseLease(
    request: SessionDraftReleaseLeaseRequest
  ): Promise<SessionDraftEnvelopeMutationResult>;
}
export type MountedSessionDraftEnvelope = Pick<
  PersistedSessionDraftEnvelope,
  'draftId' | 'mode' | 'pageKey' | 'pageUrl' | 'revision' | 'lease' | 'status'
>;
export function createSessionDraftLeaseLifecycle(options: {
  mode: SessionDraftMode;
  repository: SessionDraftLeaseRepository;
  registry?: SessionDraftLeaseOwnerRegistry;
  onAccepted: (envelope: MountedSessionDraftEnvelope, key: string) => void;
  warningPrefix: string;
}) {
  let current: MountedSessionDraftEnvelope | null = null;
  let key: string | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingRenewal: Promise<void> | null = null;
  const requestId = (operation: string) => {
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    return `${operation}-${suffix}`;
  };
  const stop = (unregister: boolean) => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (unregister && current?.lease && key) options.registry?.remove(key, generation);
    generation += 1;
  };
  const schedule = (expectedGeneration: number) => {
    timer = setTimeout(() => {
      pendingRenewal = renew(expectedGeneration).finally(() => {
        pendingRenewal = null;
      });
    }, SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS);
  };
  const accept = (envelope: MountedSessionDraftEnvelope) => {
    stop(true);
    current = envelope;
    key = createSessionDraftStorageKey(envelope);
    options.onAccepted(envelope, key);
    if (!envelope.lease || envelope.status !== 'active') return key;
    const nextGeneration = ++generation;
    options.registry?.replace({
      key,
      leaseId: envelope.lease.leaseId,
      mode: options.mode,
      generation: nextGeneration
    });
    schedule(nextGeneration);
    return key;
  };
  const renew = async (expectedGeneration: number) => {
    const mounted = current;
    if (expectedGeneration !== generation || !mounted?.lease || !key) return;
    try {
      const result = await options.repository.renewLease({
        operation: 'renewLease',
        requestId: requestId('renew'),
        key,
        expectedRevision: mounted.revision,
        leaseId: mounted.lease.leaseId
      });
      if (result.outcome !== 'renewed' || !result.envelope)
        throw new Error('code' in result ? result.code : 'SESSION_DRAFT_LEASE_RENEW_FAILED');
      if (expectedGeneration !== generation) return;
      accept(result.envelope);
    } catch (error) {
      if (expectedGeneration !== generation) return;
      console.warn(`${options.warningPrefix} Failed to renew session draft lease:`, error);
      if (
        isExtensionContextInvalidated(error) ||
        (error instanceof Error &&
          ['TERMINAL_DRAFT', 'DRAFT_NOT_FOUND', 'LEASE_CONFLICT', 'OWNER_CONFLICT'].includes(
            error.message
          ))
      ) {
        stop(true);
      } else {
        schedule(expectedGeneration);
      }
    }
  };
  const release = async () => {
    if (pendingRenewal) await pendingRenewal;
    const mounted = current;
    const mountedKey = key;
    stop(true);
    if (!mounted?.lease || !mountedKey || mounted.status !== 'active') return mounted;
    const releaseGeneration = generation;
    current = { ...mounted };
    delete current.lease;
    let result: SessionDraftEnvelopeMutationResult;
    try {
      result = await options.repository.releaseLease({
        operation: 'releaseLease',
        requestId: requestId('release'),
        key: mountedKey,
        expectedRevision: mounted.revision,
        leaseId: mounted.lease.leaseId
      });
    } catch (error) {
      if (releaseGeneration === generation && !isExtensionContextInvalidated(error))
        accept(mounted);
      throw error;
    }
    if (result.outcome !== 'released' || !result.envelope) {
      if (releaseGeneration === generation) accept(mounted);
      throw new Error('code' in result ? result.code : 'SESSION_DRAFT_LEASE_RELEASE_FAILED');
    }
    if (releaseGeneration === generation) {
      current = result.envelope;
      options.onAccepted(result.envelope, mountedKey);
    }
    return result.envelope;
  };
  return {
    get current() {
      return current;
    },
    accept,
    clear() {
      stop(true);
      current = null;
      key = null;
    },
    release,
    stop
  };
}
