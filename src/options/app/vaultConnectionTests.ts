import { formatMessage, type Messages } from '@i18n';
import type {
  ConnectionChannelResult,
  ConnectionTestResult,
  VaultConnectionTestResult
} from '@shared/types/connection';
import type { VaultConfig, VaultRouterConfig } from '@shared/types/vault';
import type { RestOptions } from '@shared/types/options';
import type { TrackUsageEventPayload } from '@shared/types/analytics';
import {
  emitConnectionTestCompleted,
  requestVaultConnectionTest
} from '@options/services/connectionTester';
import { isAppError } from '@shared/errors';

interface ConnectionTestMessage {
  type: 'TEST_CONNECTION';
  rest?: Partial<RestOptions>;
}

interface VaultConnectionTestMessage {
  type: 'TEST_VAULT_CONNECTION';
  vaultId: string;
  vault: VaultConfig;
}

type RuntimeConnectionMessage = ConnectionTestMessage | VaultConnectionTestMessage;

interface VaultListMessagingRepository {
  send(
    message: RuntimeConnectionMessage
  ): Promise<Partial<ConnectionTestResult> | null | undefined>;
  send(message: TrackUsageEventPayload): void;
}

function getStorageMessage(
  messages: Messages | null,
  key: keyof Messages,
  fallback: string,
  values: Record<string, string | number | boolean> = {}
): string {
  const value = messages?.[key];
  const template = typeof value === 'string' && value.length > 0 ? value : fallback;
  return Object.keys(values).length > 0 ? formatMessage(template, values) : template;
}

export async function runVaultListConnectionTest(
  router: VaultRouterConfig,
  messagingRepository: VaultListMessagingRepository,
  messages: Messages | null = null
): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  const vaults = router.vaults.filter((vault, index) => {
    return index === 0 || vault.isDefault || vault.enabled !== false;
  });
  if (vaults.length === 0) {
    const message = getStorageMessage(
      messages,
      'schemaStorageNoEnabledVaults',
      'No enabled vaults are available for testing.'
    );
    const result = {
      success: false,
      message,
      error: message
    } satisfies ConnectionTestResult;
    emitConnectionTestCompleted(messagingRepository, {
      storageTarget: 'unknown',
      outcome: 'failed',
      startedAt,
      failureCategory: 'validation'
    });
    return result;
  }

  const results = await Promise.all(
    vaults.map(async (vault) => {
      try {
        const result = await requestVaultConnectionTest(vault, messagingRepository);
        return toVaultConnectionResult(vault, result, messages);
      } catch (error) {
        const message = formatConnectionError(error);
        return {
          success: false,
          message: `[${vault.name || vault.vault || vault.id}] ${message}`,
          error: message,
          vault: toVaultConnectionResult(
            vault,
            {
              success: false,
              message: `[${vault.name || vault.vault || vault.id}] ${message}`,
              error: message,
              channels: buildFallbackChannels(vault, message, messages)
            },
            messages
          )
        };
      }
    })
  );

  const vaultResults = results.map((result) => ('vault' in result ? result.vault : result));
  const failures = vaultResults.filter((result) => !result.success);
  const result = {
    success: failures.length === 0,
    message: vaultResults.map((result) => result.message || result.error || '').join('\n\n'),
    vaults: vaultResults,
    ...(failures.length
      ? {
          error: failures
            .map((result) => result.error || result.message)
            .filter(Boolean)
            .join('\n\n')
        }
      : {})
  } satisfies ConnectionTestResult;
  emitConnectionTestCompleted(messagingRepository, {
    storageTarget: 'unknown',
    outcome: failures.length === 0 ? 'completed' : 'failed',
    startedAt,
    ...(failures.length ? { failureCategory: 'unknown' as const } : {})
  });
  return result;
}

function toVaultConnectionResult(
  vault: VaultConfig,
  result: ConnectionTestResult,
  messages: Messages | null = null
): VaultConnectionTestResult {
  return {
    vaultId: vault.id,
    vaultName: vault.name || vault.vault || vault.id,
    success: result.success,
    message: result.message,
    ...(result.error ? { error: result.error } : {}),
    channels: normalizeChannelResults(vault, result, messages)
  };
}

function normalizeChannelResults(
  vault: VaultConfig,
  result: ConnectionTestResult,
  messages: Messages | null = null
): ConnectionChannelResult[] {
  if (result.channels?.length) {
    return result.channels;
  }
  return buildFallbackChannels(vault, result.error || result.message, messages);
}

function buildFallbackChannels(
  vault: VaultConfig,
  message: string,
  messages: Messages | null = null
): ConnectionChannelResult[] {
  return [
    buildFallbackChannel(
      'localFolder',
      getStorageMessage(messages, 'schemaStorageLocalFolderLabel', 'Local Folder'),
      Boolean(vault.localFolderId),
      message,
      undefined,
      messages
    ),
    buildFallbackChannel(
      'https',
      'HTTPS',
      Boolean(vault.httpsUrl?.trim()),
      message,
      vault.httpsUrl,
      messages
    ),
    buildFallbackChannel(
      'http',
      'HTTP',
      Boolean(vault.httpUrl?.trim()),
      message,
      vault.httpUrl,
      messages
    )
  ];
}

function buildFallbackChannel(
  channel: 'localFolder' | 'https' | 'http',
  label: string,
  configured: boolean,
  message: string,
  url?: string,
  messages: Messages | null = null
): ConnectionChannelResult {
  if (!configured) {
    return {
      channel,
      label,
      configured: false,
      success: false,
      message:
        channel === 'localFolder'
          ? getStorageMessage(
              messages,
              'schemaStorageLocalFolderNotConfigured',
              'Local Folder not configured'
            )
          : getStorageMessage(
              messages,
              'schemaStorageConnectionUrlNotConfigured',
              'No {label} URL configured',
              { label }
            )
    };
  }

  return {
    channel,
    label,
    configured: true,
    success: false,
    message,
    error: message,
    ...(url ? { url } : {})
  };
}

function formatConnectionError(error: unknown): string {
  if (isAppError(error)) {
    const originalError = error.context?.originalError ?? error.cause;
    if (originalError instanceof Error) {
      return originalError.message;
    }
    if (typeof originalError === 'string') {
      return originalError;
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
