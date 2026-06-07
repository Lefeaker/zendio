import type { MessagePayload } from '../../platform/interfaces/messaging';
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
  if (result.channels !== undefined) {
    payload.channels = result.channels.map(toConnectionChannelPayload);
  }
  if (result.vaults !== undefined) {
    payload.vaults = result.vaults.map(toVaultConnectionPayload);
  }

  return payload;
}

function toConnectionChannelPayload(channel: ConnectionChannelResult): MessagePayload {
  return {
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
}

function toVaultConnectionPayload(vault: VaultConnectionTestResult): MessagePayload {
  return {
    vaultId: vault.vaultId,
    vaultName: vault.vaultName,
    success: vault.success,
    message: vault.message,
    ...(vault.error !== undefined ? { error: vault.error } : {}),
    channels: vault.channels.map(toConnectionChannelPayload)
  };
}
