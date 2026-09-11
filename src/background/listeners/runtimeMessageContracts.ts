import { z } from 'zod';
import type { MessagePayload } from '../../platform/interfaces/messaging';
import { isTabsBoundaryError } from '../../platform/interfaces/tabs';
import { isObjectRecord } from '../../shared/guards/object';
import * as Draft from '../../shared/sessionDrafts';
import { OPTIONS_MUTATION_MESSAGE_TYPE } from '../../shared/types/optionsMutationMessages';
import { USAGE_STATS_MESSAGE_TYPE } from '../../shared/types/usageStatsMessages';

type UntrustedValue = unknown;

const OpenOptionsPageMessageSchema = z.object({
  type: z.literal('openOptionsPage'),
  section: z.string().optional()
});

const GetTabContextMessageSchema = z.object({
  type: z.literal('AIIOB_GET_TAB_CONTEXT')
});

const RuntimeOwnerContextSchema = z
  .object({
    tabId: z.number().int().nonnegative().optional(),
    windowId: z.number().int().nonnegative().optional(),
    frameId: z.number().int().nonnegative().optional()
  })
  .refine(
    (value) =>
      value.tabId !== undefined || value.windowId !== undefined || value.frameId !== undefined
  );

const IsTabContextActiveMessageSchema = z.object({
  type: z.literal('AIIOB_IS_TAB_CONTEXT_ACTIVE'),
  ownerContext: RuntimeOwnerContextSchema
});

type OpenOptionsPageMessage = z.infer<typeof OpenOptionsPageMessageSchema>;
type GetTabContextMessage = z.infer<typeof GetTabContextMessageSchema>;
type IsTabContextActiveMessage = z.infer<typeof IsTabContextActiveMessageSchema>;

export type RuntimeMessageSender = {
  tabId?: number;
  frameId?: number;
  windowId?: number;
};

type RuntimeMessageSenderInput = {
  tabId?: number | undefined;
  frameId?: number | undefined;
  windowId?: number | undefined;
};

export type RuntimeTabContextPayload = Record<string, MessagePayload>;

export function isRepositoryContentMessage(
  message: UntrustedValue,
  type: 'clip' | 'readingClip' | 'videoClip',
  contentField: 'markdown' | 'content'
): message is { data: Record<string, UntrustedValue>; type: string } {
  return (
    isObjectRecord(message) &&
    message.type === type &&
    isObjectRecord(message.data) &&
    typeof message.data[contentField] === 'string'
  );
}

export function toMessagePayload(value: UntrustedValue): MessagePayload {
  return value as MessagePayload;
}

export function resolveActivationMilestone(
  eventName: string
): 'onboarding_completed' | 'first_reader_exported' | 'first_video_exported' | null {
  if (eventName === 'onboarding_completed') return 'onboarding_completed';
  if (eventName === 'reader_exported') return 'first_reader_exported';
  if (eventName === 'video_exported') return 'first_video_exported';
  return null;
}

export function toRuntimeMessageSender(value: RuntimeMessageSenderInput): RuntimeMessageSender {
  return {
    ...(typeof value.tabId === 'number' ? { tabId: value.tabId } : {}),
    ...(typeof value.frameId === 'number' ? { frameId: value.frameId } : {}),
    ...(typeof value.windowId === 'number' ? { windowId: value.windowId } : {})
  };
}

export function isOpenOptionsPageMessage(
  message: UntrustedValue
): message is OpenOptionsPageMessage {
  return OpenOptionsPageMessageSchema.safeParse(message).success;
}

export function isGetTabContextMessage(message: UntrustedValue): message is GetTabContextMessage {
  return GetTabContextMessageSchema.safeParse(message).success;
}

export function isTabContextActiveMessage(
  message: UntrustedValue
): message is IsTabContextActiveMessage {
  return IsTabContextActiveMessageSchema.safeParse(message).success;
}

export function isOptionsMutationMessageCandidate(message: UntrustedValue): boolean {
  return isObjectRecord(message) && message.type === OPTIONS_MUTATION_MESSAGE_TYPE;
}

export function isUsageStatsMessageCandidate(message: UntrustedValue): boolean {
  return isObjectRecord(message) && message.type === USAGE_STATS_MESSAGE_TYPE;
}

export const SESSION_DRAFT_OWNER_PROBE_TIMEOUT_MS = 1_000;
export interface SessionDraftOwnerLivenessProbeOptions {
  timeoutMs?: number;
  createProbeId?: () => string;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}
interface SessionDraftOwnerProbeTabs {
  get(tabId: number): Promise<chrome.tabs.Tab | undefined>;
  sendMessage(
    tabId: number,
    message: Draft.SessionDraftStoredValue,
    options?: { frameId?: number; documentId?: string }
  ): Promise<Draft.SessionDraftStoredValue>;
}
export function createSessionDraftOwnerLivenessProbe(
  tabs: SessionDraftOwnerProbeTabs,
  options: SessionDraftOwnerLivenessProbeOptions = {}
): Draft.SessionDraftOwnerLivenessProbe {
  const timeoutMs = options.timeoutMs ?? SESSION_DRAFT_OWNER_PROBE_TIMEOUT_MS;
  const createProbeId = options.createProbeId ?? (() => globalThis.crypto.randomUUID());
  const schedule = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const cancel = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  return async (target) => {
    let tab: chrome.tabs.Tab | undefined;
    try {
      tab = await tabs.get(target.owner.tabId);
    } catch (error) {
      if (isTabsBoundaryError(error, 'TAB_NOT_FOUND')) return 'inactive';
      throw error;
    }
    if (!tab) return 'inactive';
    const legacy = target.kind === 'legacy-v1';
    const probeId = createProbeId();
    const request: Draft.SessionDraftOwnerProbeRequest = {
      type: Draft.SESSION_DRAFT_OWNER_PROBE_MESSAGE_TYPE,
      probeId,
      key: target.key,
      leaseId: target.kind === 'legacy-v1' ? 'legacy-owner-probe' : target.leaseId
    };
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    const timeout = new Promise<'active' | 'inactive'>((resolve, reject) => {
      timeoutId = schedule(() => {
        if (legacy) resolve('active');
        else if (target.kind === 'leased-v2' && target.requirePositiveInactiveEvidence) {
          reject(new Error('SESSION_DRAFT_OWNER_PROBE_TIMEOUT'));
        } else resolve('inactive');
      }, timeoutMs);
    });
    const response = Promise.resolve(
      tabs.sendMessage(target.owner.tabId, request, {
        frameId: target.owner.frameId,
        ...(target.kind === 'leased-v2' && target.documentId
          ? { documentId: target.documentId }
          : {})
      })
    )
      .then((raw): 'active' | 'inactive' => {
        const parsed = Draft.SessionDraftOwnerProbeResponseSchema.safeParse(raw);
        if (!parsed.success || parsed.data.probeId !== probeId) {
          if (legacy) return 'active';
          throw new Error('SESSION_DRAFT_OWNER_PROBE_RESPONSE_INVALID');
        }
        if (target.kind === 'leased-v2' && target.requirePositiveInactiveEvidence) return 'active';
        return parsed.data.active ? 'active' : 'inactive';
      })
      .catch((error): 'active' | 'inactive' => {
        if (isTabsBoundaryError(error, 'NO_RECEIVER')) {
          if (
            target.kind === 'leased-v2' &&
            target.requirePositiveInactiveEvidence &&
            !error.definitive
          )
            throw error;
          return legacy ? 'active' : 'inactive';
        }
        throw error;
      });
    try {
      return await Promise.race([response, timeout]);
    } finally {
      if (timeoutId !== undefined) cancel(timeoutId);
    }
  };
}
