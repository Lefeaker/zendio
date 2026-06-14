import { z } from 'zod';
import type { MessagePayload } from '../../platform/interfaces/messaging';

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

export function toRuntimeMessageSender(value: RuntimeMessageSenderInput): RuntimeMessageSender {
  return {
    ...(typeof value.tabId === 'number' ? { tabId: value.tabId } : {}),
    ...(typeof value.frameId === 'number' ? { frameId: value.frameId } : {}),
    ...(typeof value.windowId === 'number' ? { windowId: value.windowId } : {})
  };
}

export function isOpenOptionsPageMessage(message: unknown): message is OpenOptionsPageMessage {
  return OpenOptionsPageMessageSchema.safeParse(message).success;
}

export function isGetTabContextMessage(message: unknown): message is GetTabContextMessage {
  return GetTabContextMessageSchema.safeParse(message).success;
}

export function isTabContextActiveMessage(message: unknown): message is IsTabContextActiveMessage {
  return IsTabContextActiveMessageSchema.safeParse(message).success;
}
