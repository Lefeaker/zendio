import type { IMessagingRepository } from '@shared/repositories';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { VaultRouterConfig } from '@shared/types/vault';
import {
  emitConnectionTestCompleted,
  requestVaultConnectionTest
} from '@options/services/connectionTester';
import { isAppError } from '@shared/errors';

export async function runVaultListConnectionTest(
  router: VaultRouterConfig,
  messagingRepository: Pick<IMessagingRepository, 'send'>
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
        return await requestVaultConnectionTest(vault, messagingRepository as IMessagingRepository);
      } catch (error) {
        const message = formatConnectionError(error);
        return {
          success: false,
          message: `[${vault.name || vault.vault || vault.id}] ${message}`,
          error: message
        } satisfies ConnectionTestResult;
      }
    })
  );

  const failures = results.filter((result) => !result.success);
  const result = {
    success: failures.length === 0,
    message: results.map((result) => result.message || result.error || '').join('\n\n'),
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
