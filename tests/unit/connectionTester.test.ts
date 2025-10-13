import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VaultConfig } from '../../src/shared/types';

const sendMessageMock = vi.fn();

describe('options connectionTester service', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMessageMock.mockReset();

    globalThis.chrome = {
      runtime: {
        sendMessage: sendMessageMock as unknown as typeof chrome.runtime.sendMessage
      }
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'chrome');
  });

  it('requests connection test once and validates the response shape', async () => {
    const response = { success: true, message: 'ok', status: 200, response: 'pong' };
    sendMessageMock.mockResolvedValue(response);

    const module = await import('../../src/options/services/connectionTester');
    const result = await module.requestConnectionTest();

    expect(sendMessageMock).toHaveBeenCalledWith({ type: 'TEST_CONNECTION' });
    expect(result).toEqual(response);
    expect(module.isConnectionTestRunning()).toBe(false);
  });

  it('requests vault connection test with provided config', async () => {
    const response = { success: false, message: 'error', status: 500, error: 'failed' };
    sendMessageMock.mockResolvedValue(response);

    const module = await import('../../src/options/services/connectionTester');
    const vault = createVault('vault-1');
    const result = await module.requestVaultConnectionTest(vault);

    expect(sendMessageMock).toHaveBeenCalledWith({ type: 'TEST_VAULT_CONNECTION', vaultId: 'vault-1', vault });
    expect(result).toEqual(response);
    expect(module.isVaultConnectionTestRunning('vault-1')).toBe(false);
  });

  it('prevents concurrent connection tests', async () => {
    let resolver: ((value: unknown) => void) | null = null;
    const pending = new Promise((resolve) => {
      resolver = resolve;
    });
    sendMessageMock.mockReturnValue(pending);

    const module = await import('../../src/options/services/connectionTester');

    const first = module.requestConnectionTest();
    await expect(module.requestConnectionTest()).rejects.toThrow('Connection test is already running');

    resolver?.({ success: true, message: 'done' });
    await expect(first).resolves.toEqual({ success: true, message: 'done' });
    expect(module.isConnectionTestRunning()).toBe(false);
  });

  it('prevents concurrent vault tests per id but allows different ids', async () => {
    let resolveVault1: ((value: unknown) => void) | undefined;
    let resolveVault2: ((value: unknown) => void) | undefined;

    sendMessageMock.mockImplementation((message: { vaultId?: string }) => new Promise((resolve) => {
      if (message.vaultId === 'vault-1') {
        resolveVault1 = resolve;
      } else {
        resolveVault2 = resolve;
      }
    }));

    const module = await import('../../src/options/services/connectionTester');

    const first = module.requestVaultConnectionTest(createVault('vault-1'));
    await expect(module.requestVaultConnectionTest(createVault('vault-1'))).rejects.toThrow('Connection test is already running');

    const second = module.requestVaultConnectionTest(createVault('vault-2'));
    resolveVault2?.({ success: true, message: 'vault-2' });
    await expect(second).resolves.toEqual({ success: true, message: 'vault-2' });

    resolveVault1?.({ success: true, message: 'vault-1' });
    await expect(first).resolves.toEqual({ success: true, message: 'vault-1' });
  });

  it('throws when background response is malformed', async () => {
    sendMessageMock.mockResolvedValue({ success: true });

    const module = await import('../../src/options/services/connectionTester');

    await expect(module.requestConnectionTest()).rejects.toThrow('连接测试返回数据缺失必要字段');
  });
});

function createVault(id: string): VaultConfig {
  return {
    id,
    name: `Vault ${id}`,
    httpsUrl: 'https://127.0.0.1:27124/',
    httpUrl: 'http://127.0.0.1:27123/',
    vault: `Vault-${id}`,
    apiKey: `token-${id}`,
    isDefault: false
  };
}
