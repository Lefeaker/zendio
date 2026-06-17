import type { MessagePayload } from '../../platform/interfaces/messaging';
import {
  toSerializableUserVisibleMessageDescriptor,
  type UserVisibleMessageDescriptor
} from '../../shared/i18n/userVisibleMessageDescriptor';
import type {
  ConnectionChannelResult,
  ConnectionTestResult,
  VaultConnectionTestResult
} from '../../shared/types/connection';

export function toConnectionTestPayload(result: ConnectionTestResult): MessagePayload {
  const payload: Record<string, MessagePayload> = {
    success: result.success,
    message: result.message
  };

  if (result.status !== undefined) payload.status = result.status;
  if (result.response !== undefined) payload.response = result.response;
  if (result.error !== undefined) payload.error = result.error;

  const messageDescriptor = toDescriptorPayload(result.messageDescriptor);
  if (messageDescriptor !== undefined) payload.messageDescriptor = messageDescriptor;

  const errorDescriptor = toDescriptorPayload(result.errorDescriptor);
  if (errorDescriptor !== undefined) payload.errorDescriptor = errorDescriptor;

  if (result.channels !== undefined) {
    payload.channels = result.channels.map(toConnectionChannelPayload);
  }
  if (result.vaults !== undefined) {
    payload.vaults = result.vaults.map(toVaultConnectionPayload);
  }

  return payload;
}

function toConnectionChannelPayload(channel: ConnectionChannelResult): MessagePayload {
  const payload: Record<string, MessagePayload> = {
    channel: channel.channel,
    label: channel.label,
    configured: channel.configured,
    success: channel.success,
    message: channel.message,
    ...(channel.url !== undefined ? { url: channel.url } : {}),
    ...(channel.status !== undefined ? { status: channel.status } : {}),
    ...(channel.response !== undefined ? { response: channel.response } : {}),
    ...(channel.error !== undefined ? { error: channel.error } : {}),
    ...(channel.certificateUrl !== undefined ? { certificateUrl: channel.certificateUrl } : {})
  };

  const labelDescriptor = toDescriptorPayload(channel.labelDescriptor);
  if (labelDescriptor !== undefined) payload.labelDescriptor = labelDescriptor;

  const messageDescriptor = toDescriptorPayload(channel.messageDescriptor);
  if (messageDescriptor !== undefined) payload.messageDescriptor = messageDescriptor;

  const errorDescriptor = toDescriptorPayload(channel.errorDescriptor);
  if (errorDescriptor !== undefined) payload.errorDescriptor = errorDescriptor;

  return payload;
}

function toVaultConnectionPayload(vault: VaultConnectionTestResult): MessagePayload {
  const payload: Record<string, MessagePayload> = {
    vaultId: vault.vaultId,
    vaultName: vault.vaultName,
    success: vault.success,
    message: vault.message,
    ...(vault.error !== undefined ? { error: vault.error } : {}),
    channels: vault.channels.map(toConnectionChannelPayload)
  };

  const messageDescriptor = toDescriptorPayload(vault.messageDescriptor);
  if (messageDescriptor !== undefined) payload.messageDescriptor = messageDescriptor;

  const errorDescriptor = toDescriptorPayload(vault.errorDescriptor);
  if (errorDescriptor !== undefined) payload.errorDescriptor = errorDescriptor;

  return payload;
}

function toDescriptorPayload(
  descriptor: UserVisibleMessageDescriptor | undefined
): MessagePayload | undefined {
  const serializable = toSerializableUserVisibleMessageDescriptor(descriptor);
  if (!serializable) {
    return undefined;
  }

  const payload: Record<string, MessagePayload> = {
    key: serializable.key
  };

  if (serializable.fallback !== undefined) {
    payload.fallback = serializable.fallback;
  }

  if (serializable.values !== undefined) {
    const values = Object.fromEntries(
      Object.entries(serializable.values).filter(([, value]) => value !== undefined)
    ) as Record<string, MessagePayload>;

    if (Object.keys(values).length > 0) {
      payload.values = values;
    }
  }

  return payload;
}
