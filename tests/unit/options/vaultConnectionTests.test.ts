import { describe, expect, it, vi } from 'vitest';
import { runVaultListConnectionTest } from '@options/app/vaultConnectionTests';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { VaultRouterConfig } from '@shared/types/vault';
import { getTestRestUrls } from '../../fixtures/configTestHelpers';

const LOCAL_REST_URLS = getTestRestUrls('localhost');
const LOCAL_HTTPS_URL = LOCAL_REST_URLS.httpsUrl.replace(/\/+$/, '');
const LOCAL_HTTP_URL = LOCAL_REST_URLS.httpUrl.replace(/\/+$/, '');
const LOCAL_CERTIFICATE_URL = new URL(
  '/obsidian-local-rest-api.crt',
  LOCAL_REST_URLS.httpsUrl
).toString();

type AnalyticsParams = Record<string, string | number | boolean>;
type TestMessage = {
  type?: string;
  vaultId?: string;
  event?: string;
  params?: AnalyticsParams;
};
type AnalyticsCall = [TestMessage];

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

function createChannelResult(args: {
  channel: 'localFolder' | 'https' | 'http';
  label: string;
  configured: boolean;
  success: boolean;
  message: string;
  url?: string;
  error?: string;
  certificateUrl?: string;
}) {
  return args;
}

describe('runVaultListConnectionTest', () => {
  it('returns an actionable failure when no vaults are available', async () => {
    const send = vi.fn((message: TestMessage): Promise<ConnectionTestResult> => {
      return Promise.resolve({
        success: true,
        message: message.event ?? 'event recorded'
      });
    });

    const result = await runVaultListConnectionTest(createRouter([]), { send });

    expect(result).toEqual({
      success: false,
      message: 'No enabled vaults are available for testing.',
      error: 'No enabled vaults are available for testing.'
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
      (message: TestMessage): Promise<ConnectionTestResult> =>
        Promise.resolve({
          success: true,
          message: `${message.vaultId} ok`,
          channels: [
            createChannelResult({
              channel: 'localFolder',
              label: '本地目录',
              configured: false,
              success: false,
              message: '未配置本地目录'
            }),
            createChannelResult({
              channel: 'https',
              label: 'HTTPS',
              configured: true,
              success: true,
              message: 'HTTPS 连接成功',
              url: `https://${message.vaultId}.example`
            }),
            createChannelResult({
              channel: 'http',
              label: 'HTTP',
              configured: false,
              success: false,
              message: '未配置 HTTP URL'
            })
          ]
        })
    );
    const router = createRouter([
      createVault('research', 'Research'),
      createVault('archive', 'Archive'),
      createVault('disabled', 'Disabled', false)
    ]);

    const result = await runVaultListConnectionTest(router, { send });

    expect(result.success).toBe(true);
    expect(result.message).toBe('research ok\n\narchive ok');
    expect(
      result.vaults?.map((vault) => ({
        vaultId: vault.vaultId,
        vaultName: vault.vaultName,
        success: vault.success
      }))
    ).toEqual([
      {
        vaultId: 'research',
        vaultName: 'Research',
        success: true
      },
      {
        vaultId: 'archive',
        vaultName: 'Archive',
        success: true
      }
    ]);
    expect(
      result.vaults?.every((vault) =>
        vault.channels.some((channel) => channel.channel === 'https' && channel.success)
      )
    ).toBe(true);
    const connectionCalls = send.mock.calls.filter(([message]) => {
      return message.type === 'TEST_VAULT_CONNECTION';
    });
    expect(connectionCalls).toHaveLength(2);
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ vaultId: 'disabled' }));
  });

  it('reports partial failures without hiding successful vaults', async () => {
    const send = vi.fn((message: TestMessage): Promise<ConnectionTestResult> => {
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

    const result = await runVaultListConnectionTest(router, { send });

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

  it('preserves per-channel results including the HTTPS certificate action', async () => {
    const send = vi.fn(
      (message: TestMessage): Promise<ConnectionTestResult> =>
        Promise.resolve({
          success: false,
          message: `${message.vaultId} partial`,
          error: 'HTTPS: network error: request failed',
          channels: [
            createChannelResult({
              channel: 'localFolder',
              label: '本地目录',
              configured: true,
              success: true,
              message: '本地目录可用：Research Folder'
            }),
            createChannelResult({
              channel: 'https',
              label: 'HTTPS',
              configured: true,
              success: false,
              message: 'network error: request failed',
              url: LOCAL_HTTPS_URL,
              error: 'network error: request failed',
              certificateUrl: LOCAL_CERTIFICATE_URL
            }),
            createChannelResult({
              channel: 'http',
              label: 'HTTP',
              configured: true,
              success: true,
              message: 'HTTP 连接成功',
              url: LOCAL_HTTP_URL
            })
          ]
        })
    );
    const research = createVault('research', 'Research');
    research.localFolderId = 'folder-research';
    research.localFolderName = 'Research Folder';
    research.httpsUrl = LOCAL_HTTPS_URL;
    research.httpUrl = LOCAL_HTTP_URL;

    const result = await runVaultListConnectionTest(createRouter([research]), { send });

    expect(result.success).toBe(false);
    expect(result.vaults).toEqual([
      expect.objectContaining({
        vaultId: 'research',
        vaultName: 'Research',
        channels: [
          expect.objectContaining({ channel: 'localFolder', success: true }),
          expect.objectContaining({
            channel: 'https',
            success: false,
            certificateUrl: LOCAL_CERTIFICATE_URL
          }),
          expect.objectContaining({ channel: 'http', success: true })
        ]
      })
    ]);
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
  calls: AnalyticsCall[],
  expectedEvent: string,
  expectedParams: AnalyticsParams,
  allowedKeys: string[]
): void {
  const analyticsCall = calls.find(([message]) => {
    return message.type === 'ANALYTICS_EVENT' && message.event === expectedEvent;
  });
  expect(analyticsCall).toBeDefined();
  const message = analyticsCall?.[0];
  expect(message?.params).toEqual(expect.objectContaining(expectedParams));
  const params = message?.params ?? {};
  expect(Object.keys(params).sort()).toEqual([...allowedKeys].sort());
  Object.keys(params).forEach((key) => {
    expect(FORBIDDEN_ANALYTICS_KEYS.has(key)).toBe(false);
  });
}
