import type {
  SessionDraftClientEnvelope as SessionDraftEnvelope,
  SessionDraftOwnerContext
} from '../../shared/sessionDrafts';
import {
  SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS,
  createSessionDraftStorageKey,
  type SessionDraftEnvelope as PersistedSessionDraftEnvelope,
  type SessionDraftEnvelopeMutationResult,
  type SessionDraftMode,
  type SessionDraftReleaseLeaseRequest,
  type SessionDraftRenewLeaseRequest
} from '../../shared/sessionDrafts';
import type { RuntimeMessageSender } from '@platform/interfaces/runtime';
import type { SessionDraftLeaseOwnerRegistry } from './sessionDraftLeaseOwnerRegistry';
interface SessionDraftLeaseRepository {
  renewLease(request: SessionDraftRenewLeaseRequest): Promise<SessionDraftEnvelopeMutationResult>;
  releaseLease(
    request: SessionDraftReleaseLeaseRequest
  ): Promise<SessionDraftEnvelopeMutationResult>;
}
export const SESSION_DRAFT_TAB_CONTEXT_MESSAGE_TYPE = 'AIIOB_GET_TAB_CONTEXT';
export const SESSION_DRAFT_OWNER_CONTEXT_ACTIVE_MESSAGE_TYPE = 'AIIOB_IS_TAB_CONTEXT_ACTIVE';
export interface SessionDraftTabContextRequest {
  type: typeof SESSION_DRAFT_TAB_CONTEXT_MESSAGE_TYPE;
}
export interface SessionDraftOwnerContextActiveRequest {
  type: typeof SESSION_DRAFT_OWNER_CONTEXT_ACTIVE_MESSAGE_TYPE;
  ownerContext: SessionDraftOwnerContext;
}
export interface SessionDraftTabContextResponse extends SessionDraftOwnerContext {
  success: true;
}
export interface SessionDraftOwnerContextActiveResponse {
  success: true;
  active: boolean;
}
let runtimeMessageSender: RuntimeMessageSender | null = null;
export function configureSessionDraftRuntimeMessenger(sender: RuntimeMessageSender | null): void {
  runtimeMessageSender = sender;
}
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
function getRuntimeSendMessage(): RuntimeMessageSender | null {
  if (runtimeMessageSender) return runtimeMessageSender;
  if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function')
    return null;
  return <Result = unknown>(message: unknown) =>
    chrome.runtime.sendMessage(message) as Promise<Result>;
}
export function getSessionDraftRuntimeMessenger(): RuntimeMessageSender | null {
  return getRuntimeSendMessage();
}
export function normalizeSessionDraftOwnerContext(value: unknown): SessionDraftOwnerContext | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const ownerContext: SessionDraftOwnerContext = {};
  if (isNonNegativeInteger(value.tabId)) {
    ownerContext.tabId = value.tabId;
  }
  if (isNonNegativeInteger(value.windowId)) {
    ownerContext.windowId = value.windowId;
  }
  if (isNonNegativeInteger(value.frameId)) {
    ownerContext.frameId = value.frameId;
  }
  return Object.keys(ownerContext).length > 0 ? ownerContext : null;
}
export function getSessionDraftEnvelopeOwnerContext(
  envelope: Pick<SessionDraftEnvelope, 'payload'>
): SessionDraftOwnerContext | null {
  return normalizeSessionDraftOwnerContext(envelope.payload.ownerContext);
}
export function isSameSessionDraftOwnerContext(
  left: SessionDraftOwnerContext | null | undefined,
  right: SessionDraftOwnerContext | null | undefined
): boolean {
  const normalizedLeft = normalizeSessionDraftOwnerContext(left);
  const normalizedRight = normalizeSessionDraftOwnerContext(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  let comparedField = false;
  for (const key of ['tabId', 'windowId', 'frameId'] as const) {
    const leftValue = normalizedLeft[key];
    const rightValue = normalizedRight[key];
    if (leftValue === undefined && rightValue === undefined) {
      continue;
    }
    comparedField = true;
    if (leftValue !== rightValue) {
      return false;
    }
  }
  return comparedField;
}

export function getCurrentSessionDraftOwnerContext():
  | SessionDraftOwnerContext
  | Promise<SessionDraftOwnerContext | null>
  | null {
  const sendMessage = getRuntimeSendMessage();
  if (!sendMessage) {
    return null;
  }
  return sendMessage({
    type: SESSION_DRAFT_TAB_CONTEXT_MESSAGE_TYPE
  } satisfies SessionDraftTabContextRequest)
    .then((response) => {
      if (!isObjectRecord(response) || response.success !== true) {
        return null;
      }
      return normalizeSessionDraftOwnerContext(response);
    })
    .catch(() => null);
}

export function isSessionDraftOwnerContextActive(
  ownerContext: SessionDraftOwnerContext
): Promise<boolean> {
  const normalizedOwnerContext = normalizeSessionDraftOwnerContext(ownerContext);
  if (!normalizedOwnerContext) {
    return Promise.resolve(false);
  }
  const sendMessage = getRuntimeSendMessage();
  if (!sendMessage) {
    return Promise.resolve(false);
  }

  return sendMessage({
    type: SESSION_DRAFT_OWNER_CONTEXT_ACTIVE_MESSAGE_TYPE,
    ownerContext: normalizedOwnerContext
  } satisfies SessionDraftOwnerContextActiveRequest)
    .then((response) => {
      if (!isObjectRecord(response) || response.success !== true) {
        return false;
      }
      return response.active === true;
    })
    .catch(() => false);
}
export type MountedSessionDraftEnvelope = Pick<
  PersistedSessionDraftEnvelope,
  'draftId' | 'mode' | 'pageKey' | 'pageUrl' | 'revision' | 'lease'
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
    timer = setTimeout(
      () => void renew(expectedGeneration),
      SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS
    );
  };
  const accept = (envelope: MountedSessionDraftEnvelope) => {
    stop(true);
    current = envelope;
    key = createSessionDraftStorageKey(envelope);
    options.onAccepted(envelope, key);
    if (!envelope.lease) return key;
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
      accept(result.envelope);
    } catch (error) {
      console.warn(`${options.warningPrefix} Failed to renew session draft lease:`, error);
      if (expectedGeneration === generation) schedule(expectedGeneration);
    }
  };
  const release = async () => {
    const mounted = current;
    const mountedKey = key;
    stop(true);
    if (!mounted?.lease || !mountedKey) return mounted;
    current = { ...mounted };
    delete current.lease;
    const result = await options.repository.releaseLease({
      operation: 'releaseLease',
      requestId: requestId('release'),
      key: mountedKey,
      expectedRevision: mounted.revision,
      leaseId: mounted.lease.leaseId
    });
    if (result.outcome !== 'released' || !result.envelope) {
      accept(mounted);
      throw new Error('code' in result ? result.code : 'SESSION_DRAFT_LEASE_RELEASE_FAILED');
    }
    current = result.envelope;
    options.onAccepted(result.envelope, mountedKey);
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
