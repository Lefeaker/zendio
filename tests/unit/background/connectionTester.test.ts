import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VaultConfig } from '@shared/types';
import { getRestDefaults } from '../../utils/restDefaults';
import type { IMessagingRepository, Message } from '@shared/repositories';

const sendSpy = vi.fn();
let messageHandler: (message: Message) => Promise<unknown> | undefined;
let messagingRepo: IMessagingRepository;

describe('options connectionTester service', () => {
  beforeEach(() => {
    sendSpy.mockReset();
    messageHandler = () => Promise.resolve(undefined);
    const sendMock = vi.fn(async (message: Message) => {
      sendSpy(message);
      return Promise.resolve(messageHandler(message));
    });
    messagingRepo = {
      send: sendMock as IMessagingRepository['send'],
      onMessage: vi.fn(() => () => undefined)
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    messageHandler = () => Promise.resolve(undefined);
  });

  it('requests connection test once and validates the response shape', async () => {
    const response = { success: true, message: 'ok', status: 200, response: 'pong' };
    messageHandler = () => Promise.resolve(response);

    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);
    const result = await module.requestConnectionTest();

    expect(sendSpy).toHaveBeenCalledWith({ type: 'TEST_CONNECTION' });
    expect(result).toEqual(response);
    expect(module.isConnectionTestRunning()).toBe(false);
  });

  it('includes rest draft when provided', async () => {
    const response = { success: true, message: 'ok' };
    messageHandler = () => Promise.resolve(response);

    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);
    const draft = {
      httpsUrl: ' https://host:1234 ',
      httpUrl: '',
      vault: ' DraftVault ',
      apiKey: ' secret ',
      localFolderId: ' folder-main ',
      localFolderName: ' Main Vault '
    };
    const result = await module.requestConnectionTest(draft);

    expect(sendSpy).toHaveBeenCalledWith({
      type: 'TEST_CONNECTION',
      rest: {
        httpsUrl: 'https://host:1234',
        vault: 'DraftVault',
        apiKey: 'secret',
        localFolderId: 'folder-main',
        localFolderName: 'Main Vault'
      }
    });
    expect(result).toEqual(response);
  });

  it('requests vault connection test with provided config', async () => {
    const response = { success: false, message: 'error', status: 500, error: 'failed' };
    messageHandler = () => Promise.resolve(response);

    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);
    const vault = createVault('vault-1');
    const result = await module.requestVaultConnectionTest(vault);

    expect(sendSpy).toHaveBeenCalledWith({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-1',
      vault
    });
    expect(result).toEqual(response);
    expect(module.isVaultConnectionTestRunning('vault-1')).toBe(false);
  });

  it('preserves top-level and channel descriptors when the response is valid', async () => {
    const response = {
      success: false,
      message: 'Connection failed',
      messageDescriptor: {
        key: 'connectionResultHeaderFailure'
      },
      error: 'API Key is missing',
      errorDescriptor: {
        key: 'connectionRestApiKeyMissing'
      },
      channels: [
        {
          channel: 'localFolder',
          label: 'localFolder',
          labelDescriptor: {
            key: 'connectionChannelLocalFolderLabel'
          },
          configured: false,
          success: false,
          message: '',
          messageDescriptor: {
            key: 'connectionLocalFolderSkipped'
          }
        },
        {
          channel: 'https',
          label: 'rest',
          labelDescriptor: {
            key: 'connectionChannelRestLabel'
          },
          configured: true,
          success: false,
          message: '',
          messageDescriptor: {
            key: 'connectionRestApiKeyMissing'
          },
          error: 'API Key is missing',
          errorDescriptor: {
            key: 'connectionRestApiKeyMissing'
          }
        }
      ]
    };
    messageHandler = () => Promise.resolve(response);

    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);

    const result = await module.requestConnectionTest();

    expect(result).toEqual(response);
  });

  it('prevents concurrent connection tests', async () => {
    let resolver: ((value: unknown) => void) | null = null;
    const pending = new Promise((resolve) => {
      resolver = resolve;
    });
    messageHandler = () => pending;

    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);

    const first = module.requestConnectionTest();
    await expect(module.requestConnectionTest()).rejects.toMatchObject({
      code: 'OPTIONS_CONNECTION_IN_PROGRESS'
    });

    if (!resolver) {
      throw new Error('connection resolver missing');
    }
    (resolver as (value: unknown) => void)({ success: true, message: 'done' });
    await expect(first).resolves.toEqual({ success: true, message: 'done' });
    expect(module.isConnectionTestRunning()).toBe(false);
  });

  it('prevents concurrent vault tests per id but allows different ids', async () => {
    let resolveVault1: ((value: unknown) => void) | undefined;
    let resolveVault2: ((value: unknown) => void) | undefined;

    messageHandler = (message: Message) =>
      new Promise((resolve) => {
        const vaultId = (message as { vaultId?: string }).vaultId;
        if (vaultId === 'vault-1') {
          resolveVault1 = resolve;
        } else {
          resolveVault2 = resolve;
        }
      });

    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);

    const first = module.requestVaultConnectionTest(createVault('vault-1'));
    await expect(module.requestVaultConnectionTest(createVault('vault-1'))).rejects.toMatchObject({
      code: 'OPTIONS_CONNECTION_IN_PROGRESS'
    });

    const second = module.requestVaultConnectionTest(createVault('vault-2'));
    if (!resolveVault2) {
      throw new Error('vault-2 resolver missing');
    }
    (resolveVault2 as (value: unknown) => void)({ success: true, message: 'vault-2' });
    await expect(second).resolves.toEqual({ success: true, message: 'vault-2' });

    if (!resolveVault1) {
      throw new Error('vault-1 resolver missing');
    }
    (resolveVault1 as (value: unknown) => void)({ success: true, message: 'vault-1' });
    await expect(first).resolves.toEqual({ success: true, message: 'vault-1' });
  });

  it('throws when background response is malformed', async () => {
    messageHandler = () => Promise.resolve({ success: true });

    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);

    await expect(module.requestConnectionTest()).rejects.toMatchObject({
      code: 'OPTIONS_CONNECTION_RESPONSE_INVALID'
    });
  });

  it('rejects malformed top-level or channel descriptors as invalid responses', async () => {
    messageHandler = () =>
      Promise.resolve({
        success: false,
        message: 'Connection failed',
        messageDescriptor: {
          key: 'connectionResultHeaderFailure',
          values: ['bad-shape']
        },
        channels: [
          {
            channel: 'https',
            label: 'REST API',
            configured: true,
            success: false,
            message: 'offline',
            errorDescriptor: {
              key: 42
            }
          }
        ]
      });

    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);

    await expect(module.requestConnectionTest()).rejects.toMatchObject({
      code: 'OPTIONS_CONNECTION_RESPONSE_INVALID'
    });
  });

  it('throws structured error when vault config is missing id', async () => {
    const module = await import('../../../src/options/services/connectionTester');
    module.__resetConnectionTesterStateForTests?.();
    module.setConnectionTesterMessagingRepository?.(messagingRepo);

    await expect(module.requestVaultConnectionTest({} as VaultConfig)).rejects.toMatchObject({
      code: 'OPTIONS_VAULT_CONFIG_INVALID'
    });
  });
});

function createVault(id: string): VaultConfig {
  const restDefaults = getRestDefaults();
  return {
    id,
    name: `Vault ${id}`,
    httpsUrl: restDefaults.httpsUrl,
    httpUrl: restDefaults.httpUrl,
    vault: restDefaults.vault,
    apiKey: `token-${id}`,
    isDefault: false
  };
}
