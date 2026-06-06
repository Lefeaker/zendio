/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Messages } from '@i18n';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { runVaultListConnectionTest } from '@options/app/vaultConnectionTests';
import type { VaultRouterConfig } from '@shared/types/vault';
import {
  asOptionsController,
  createController,
  findButton,
  findCardByTitle,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const STORAGE_SENTINEL_MESSAGES = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaStorageConnectionNoticeTitle: 'Connection Notice Title Sentinel',
  schemaStorageConnectionNotRun: 'Connection Not Run Sentinel',
  schemaStorageConnectionUrlNotConfigured: 'Missing {label} URL Sentinel',
  schemaStorageLocalFolderChooseAction: 'Choose Folder Sentinel',
  schemaStorageLocalFolderLabel: 'Local Folder Label Sentinel',
  schemaStorageLocalFolderNotConfigured: 'Local Folder Missing Sentinel',
  schemaStorageNoEnabledVaults: 'No Enabled Vaults Sentinel',
  schemaStorageRoutingTipBody: 'Routing Tip Body Sentinel',
  schemaStorageRoutingTipTitle: 'Routing Tip Title Sentinel',
  schemaStorageTestConnectionButton: 'Test Connection Sentinel',
  schemaStorageVaultListTitle: 'Vault List Sentinel',
  schemaStorageVaultsGroupTitle: 'Vault Group Sentinel'
} satisfies Messages;

describe('mountProductionStitchShell storage i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('mounts storage schema copy from messages', () => {
    const controller = createController();

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: STORAGE_SENTINEL_MESSAGES,
      language: 'en'
    } as never);

    expect(document.body.textContent).toContain('Vault Group Sentinel');
    expect(findCardByTitle('Vault List Sentinel')).toBeTruthy();
    expect(findButton('Test Connection Sentinel')).toBeTruthy();
    expect(findButton('Choose Folder Sentinel')).toBeTruthy();
    expect(document.body.textContent).toContain('Routing Tip Title Sentinel');
    expect(document.body.textContent).toContain('Routing Tip Body Sentinel');
  });

  it('resolves localized storage fallback messages without Chinese defaults', async () => {
    const connectionSend = vi.fn(() => Promise.reject(new Error('network denied')));
    const router: VaultRouterConfig = {
      defaultVaultId: 'main',
      vaults: [
        {
          id: 'main',
          name: 'Main Vault',
          vault: 'Main Vault',
          httpsUrl: '',
          httpUrl: '',
          apiKey: '',
          enabled: true,
          isDefault: true
        }
      ],
      rules: []
    };

    const result = await runVaultListConnectionTest(
      router,
      { send: connectionSend },
      STORAGE_SENTINEL_MESSAGES
    );

    expect(result.vaults?.[0]?.channels).toEqual([
      expect.objectContaining({
        channel: 'localFolder',
        label: 'Local Folder Label Sentinel',
        message: 'Local Folder Missing Sentinel'
      }),
      expect.objectContaining({
        channel: 'https',
        label: 'HTTPS',
        message: 'Missing HTTPS URL Sentinel'
      }),
      expect.objectContaining({
        channel: 'http',
        label: 'HTTP',
        message: 'Missing HTTP URL Sentinel'
      })
    ]);
    expect(JSON.stringify(result)).not.toContain('本地目录');
    expect(JSON.stringify(result)).not.toContain('未配置');
  });

  it('uses the localized no-enabled-vaults fallback', async () => {
    const send = vi.fn((message: unknown) =>
      Promise.resolve({
        success: true,
        message:
          typeof message === 'object' &&
          message !== null &&
          'event' in message &&
          typeof (message as { event?: unknown }).event === 'string'
            ? (message as { event: string }).event
            : 'event recorded'
      })
    );

    const result = await runVaultListConnectionTest(
      { defaultVaultId: 'main', vaults: [], rules: [] },
      { send },
      STORAGE_SENTINEL_MESSAGES
    );

    expect(result).toEqual({
      success: false,
      message: 'No Enabled Vaults Sentinel',
      error: 'No Enabled Vaults Sentinel'
    });
  });
});
