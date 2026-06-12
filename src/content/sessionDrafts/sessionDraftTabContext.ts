import type { SessionDraftEnvelope, SessionDraftOwnerContext } from './sessionDraftTypes';
import type { RuntimeMessageSender } from '@platform/interfaces/runtime';

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
  return runtimeMessageSender;
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
