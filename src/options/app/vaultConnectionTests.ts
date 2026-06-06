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

export async function runVaultListConnectionTest(
  router: VaultRouterConfig,
  messagingRepository: VaultListMessagingRepository
): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  const vaults = router.vaults.filter((vault, index) => {
    return index === 0 || vault.isDefault || vault.enabled !== false;
  });
  if (vaults.length === 0) {
    const result = {
      success: false,
      message: '没有可测试的启用仓库。',
      error: '没有可测试的启用仓库。'
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
        return toVaultConnectionResult(vault, result);
      } catch (error) {
        const message = formatConnectionError(error);
        return {
          success: false,
          message: `[${vault.name || vault.vault || vault.id}] ${message}`,
          error: message,
          vault: toVaultConnectionResult(vault, {
            success: false,
            message: `[${vault.name || vault.vault || vault.id}] ${message}`,
            error: message,
            channels: buildFallbackChannels(vault, message)
          })
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
  result: ConnectionTestResult
): VaultConnectionTestResult {
  return {
    vaultId: vault.id,
    vaultName: vault.name || vault.vault || vault.id,
    success: result.success,
    message: result.message,
    ...(result.error ? { error: result.error } : {}),
    channels: normalizeChannelResults(vault, result)
  };
}

function normalizeChannelResults(
  vault: VaultConfig,
  result: ConnectionTestResult
): ConnectionChannelResult[] {
  if (result.channels?.length) {
    return result.channels;
  }
  return buildFallbackChannels(vault, result.error || result.message);
}

function buildFallbackChannels(vault: VaultConfig, message: string): ConnectionChannelResult[] {
  return [
    buildFallbackChannel('localFolder', '本地目录', Boolean(vault.localFolderId), message),
    buildFallbackChannel(
      'https',
      'HTTPS',
      Boolean(vault.httpsUrl?.trim()),
      message,
      vault.httpsUrl
    ),
    buildFallbackChannel('http', 'HTTP', Boolean(vault.httpUrl?.trim()), message, vault.httpUrl)
  ];
}

function buildFallbackChannel(
  channel: 'localFolder' | 'https' | 'http',
  label: string,
  configured: boolean,
  message: string,
  url?: string
): ConnectionChannelResult {
  if (!configured) {
    return {
      channel,
      label,
      configured: false,
      success: false,
      message: channel === 'localFolder' ? '未配置本地目录' : `未配置 ${label} URL`
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
