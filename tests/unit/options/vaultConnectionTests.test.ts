import { describe, expect, it, vi } from 'vitest';
import { runVaultListConnectionTest } from '@options/app/vaultConnectionTests';
import type { IMessagingRepository } from '@shared/repositories';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { VaultRouterConfig } from '@shared/types/vault';

function createRouter(vaults: VaultRouterConfig['vaults']): VaultRouterConfig {
  return {
    defaultVaultId: vaults[0]?.id,
    vaults,
    rules: []
  };
}

function createVault(
  id: string,
  name: string,
  enabled = true
): VaultRouterConfig['vaults'][number] {
  return {
    id,
    name,
    vault: name,
    httpsUrl: `https://${id}.example`,
    httpUrl: '',
    apiKey: `${id}-token`,
    enabled,
    isDefault: id === 'research'
  };
}

describe('runVaultListConnectionTest', () => {
  it('returns an actionable failure when no vaults are available', async () => {
    const send = vi.fn();

    const result = await runVaultListConnectionTest(createRouter([]), { send } as never);

    expect(result).toEqual({
      success: false,
      message: '没有可测试的启用仓库。',
      error: '没有可测试的启用仓库。'
    });
    expectAnalyticsMessage(
      send.mock.calls,
      'connection_test_completed',
      {
        failure_category: 'validation',
        outcome: 'failed',
        storage_target: 'unknown'
      },
      ['duration_bucket', 'failure_category', 'outcome', 'storage_target']
    );
  });

  it('aggregates successful enabled vault results', async () => {
    const send = vi.fn(
      (message: { vaultId: string }): Promise<ConnectionTestResult> =>
        Promise.resolve({
          success: true,
          message: `${message.vaultId} ok`
        })
    );
    const router = createRouter([
      createVault('research', 'Research'),
      createVault('archive', 'Archive'),
      createVault('disabled', 'Disabled', false)
    ]);

    const result = await runVaultListConnectionTest(router, {
      send
    } as unknown as IMessagingRepository);

    expect(result).toEqual({
      success: true,
      message: 'research ok\n\narchive ok'
    });
    const connectionCalls = send.mock.calls.filter((call) => {
      const message = call[0] as { type?: string; vaultId?: string } | undefined;
      return message?.type === 'TEST_VAULT_CONNECTION';
    });
    expect(connectionCalls).toHaveLength(2);
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ vaultId: 'disabled' }));
  });

  it('reports partial failures without hiding successful vaults', async () => {
    const send = vi.fn((message: { vaultId: string }): Promise<ConnectionTestResult> => {
      if (message.vaultId === 'archive') {
        return Promise.reject(new Error('network denied'));
      }
      return Promise.resolve({
        success: true,
        message: `${message.vaultId} ok`
      });
    });
    const router = createRouter([
      createVault('research', 'Research'),
      createVault('archive', 'Archive')
    ]);

    const result = await runVaultListConnectionTest(router, {
      send
    } as unknown as IMessagingRepository);

    expect(result.success).toBe(false);
    expect(result.message).toContain('research ok');
    expect(result.message).toContain('[Archive] network denied');
    expect(result.error).toBe('network denied');
    expectAnalyticsMessage(
      send.mock.calls,
      'connection_test_completed',
      {
        failure_category: 'unknown',
        outcome: 'failed',
        storage_target: 'unknown'
      },
      ['duration_bucket', 'failure_category', 'outcome', 'storage_target']
    );
  });
});

const FORBIDDEN_ANALYTICS_KEYS = new Set([
  'apiKey',
  'baseUrl',
  'duration_ms',
  'endpoint',
  'fallback_reason',
  'failure_count_bucket',
  'filePath',
  'folderId',
  'folderName',
  'localFolderName',
  'noteName',
  'permission_state',
  'response',
  'responseBody',
  'success_count_bucket',
  'test_scope',
  'vault',
  'vaultName',
  'vault_count_bucket'
]);

function expectAnalyticsMessage(
  calls: unknown[][],
  expectedEvent: string,
  expectedParams: Record<string, unknown>,
  allowedKeys: string[]
): void {
  const analyticsCall = calls.find((call) => {
    const message = call[0] as { type?: string; event?: string } | undefined;
    return message?.type === 'TRACK_USAGE_EVENT' && message.event === expectedEvent;
  });
  expect(analyticsCall).toBeDefined();
  const message = analyticsCall?.[0] as {
    event: string;
    params?: Record<string, unknown>;
    type: 'TRACK_USAGE_EVENT';
  };
  expect(message.params).toEqual(expect.objectContaining(expectedParams));
  const params = message.params ?? {};
  expect(Object.keys(params).sort()).toEqual([...allowedKeys].sort());
  Object.keys(params).forEach((key) => {
    expect(FORBIDDEN_ANALYTICS_KEYS.has(key)).toBe(false);
  });
}
