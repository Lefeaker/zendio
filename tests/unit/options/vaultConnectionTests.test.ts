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
    expect(send).not.toHaveBeenCalled();
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
    expect(send).toHaveBeenCalledTimes(2);
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
  });
});
