/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessagesForLanguage, type Messages } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { runVaultListConnectionTest } from '@options/app/vaultConnectionTests';
import type { VaultRouterConfig } from '@shared/types/vault';
import { getTestRestUrls } from '../../fixtures/configTestHelpers';
import {
  asOptionsController,
  createController,
  createEnglishPageMessages,
  createMessaging,
  findButton,
  findCardByTitle,
  flushPromises,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const i18nMockState = vi.hoisted(() => ({
  actualGetMessagesForLanguage: null as null | typeof getMessagesForLanguage
}));

vi.mock('@i18n', async () => {
  const actual = await vi.importActual<typeof import('@i18n')>('@i18n');
  i18nMockState.actualGetMessagesForLanguage = actual.getMessagesForLanguage;
  return {
    ...actual,
    getMessagesForLanguage: vi.fn((language: string) => actual.getMessagesForLanguage(language))
  };
});

const LOCAL_REST_URLS = getTestRestUrls('localhost');
const LOCAL_HTTPS_URL = LOCAL_REST_URLS.httpsUrl.replace(/\/$/, '');
const LOCAL_CERTIFICATE_URL = `${LOCAL_HTTPS_URL}/obsidian-local-rest-api.crt`;

const STORAGE_SENTINEL_MESSAGE_OVERRIDES = {
  routingRulesTitle: 'Routing Rules Sentinel',
  schemaStorageConnectionNoticeTitle: 'Connection Notice Title Sentinel',
  schemaStorageCertificateDownloadTrustLink: 'Certificate Link Sentinel',
  schemaStorageConnectionNotRun: 'Connection Not Run Sentinel',
  schemaStorageConnectionUrlNotConfigured: 'Missing {label} URL Sentinel',
  schemaStorageRoutingActionsColumnLabel: 'Routing Actions Column Sentinel',
  schemaStorageRoutingEnabledColumnLabel: 'Routing Enabled Column Sentinel',
  schemaStorageRoutingPatternColumnLabel: 'Routing Pattern Column Sentinel',
  schemaStorageRoutingPriorityColumnLabel: 'Routing Priority Column Sentinel',
  schemaStorageRoutingTargetVaultColumnLabel: 'Routing Target Column Sentinel',
  schemaStorageLocalFolderChooseAction: 'Choose Folder Sentinel',
  schemaStorageLocalFolderLabel: 'Local Folder Label Sentinel',
  schemaStorageLocalFolderNotConfigured: 'Local Folder Missing Sentinel',
  schemaStorageNoEnabledVaults: 'No Enabled Vaults Sentinel',
  schemaStorageRoutingTipBody: 'Routing Tip Body Sentinel',
  schemaStorageRoutingTipTitle: 'Routing Tip Title Sentinel',
  schemaStorageRoutingTypeColumnLabel: 'Routing Type Column Sentinel',
  schemaStorageTestConnectionButton: 'Test Connection Sentinel',
  schemaStorageVaultActionsColumnLabel: 'Vault Actions Column Sentinel',
  schemaStorageVaultApiKeyColumnLabel: 'Vault API Key Column Sentinel',
  schemaStorageVaultEnabledColumnLabel: 'Vault Enabled Column Sentinel',
  schemaStorageVaultHttpsUrlColumnLabel: 'Vault HTTPS Column Sentinel',
  schemaStorageVaultHttpUrlColumnLabel: 'Vault HTTP Column Sentinel',
  schemaStorageVaultListTitle: 'Vault List Sentinel',
  schemaStorageVaultLocalFolderColumnLabel: 'Vault Local Folder Column Sentinel',
  schemaStorageVaultNameColumnLabel: 'Vault Name Column Sentinel',
  schemaStorageVaultsGroupTitle: 'Vault Group Sentinel'
} satisfies Partial<Messages>;

async function createStorageSentinelMessages(): Promise<Messages> {
  return createEnglishPageMessages(STORAGE_SENTINEL_MESSAGE_OVERRIDES);
}

function restoreGetMessagesForLanguageMock(): void {
  const actualGetMessagesForLanguage = i18nMockState.actualGetMessagesForLanguage;
  if (!actualGetMessagesForLanguage) {
    throw new Error('Missing actual getMessagesForLanguage implementation.');
  }
  vi.mocked(getMessagesForLanguage).mockImplementation((language: string) =>
    actualGetMessagesForLanguage(language)
  );
}

describe('mountProductionStitchShell storage i18n', () => {
  beforeEach(() => {
    setupProductionStitchShellTest();
    vi.mocked(getMessagesForLanguage).mockClear();
    restoreGetMessagesForLanguageMock();
  });

  it('mounts storage schema copy from messages', async () => {
    const controller = createController();
    const storageSentinelMessages = await createStorageSentinelMessages();

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: storageSentinelMessages,
      language: 'en'
    } as never);

    expect(document.body.textContent).toContain('Vault Group Sentinel');
    const vaultList = findCardByTitle('Vault List Sentinel');
    expect(findButton('Test Connection Sentinel')).toBeTruthy();
    expect(findButton('Choose Folder Sentinel')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Routing Tip Title Sentinel');
    expect(
      Array.from(vaultList.querySelectorAll('th')).map((cell) => cell.textContent?.trim())
    ).toEqual([
      'Vault Enabled Column Sentinel',
      'Vault Name Column Sentinel',
      'Vault Local Folder Column Sentinel',
      'Vault HTTPS Column Sentinel',
      'Vault HTTP Column Sentinel',
      'Vault API Key Column Sentinel',
      'Vault Actions Column Sentinel'
    ]);

    const routingCard = findCardByTitle('Routing Rules Sentinel');
    expect(routingCard.textContent).toContain('Routing Tip Body Sentinel');
    expect(
      Array.from(routingCard.querySelectorAll('th')).map((cell) => cell.textContent?.trim())
    ).toEqual([
      'Routing Enabled Column Sentinel',
      'Routing Type Column Sentinel',
      'Routing Pattern Column Sentinel',
      'Routing Target Column Sentinel',
      'Routing Priority Column Sentinel',
      'Routing Actions Column Sentinel'
    ]);
    expect((routingCard.textContent ?? '').indexOf('Routing Actions Column Sentinel')).toBeLessThan(
      (routingCard.textContent ?? '').indexOf('Routing Tip Body Sentinel')
    );
  });

  it('resolves localized storage fallback messages without Chinese defaults', async () => {
    const storageSentinelMessages = await createStorageSentinelMessages();
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
      storageSentinelMessages
    );

    expect(result.vaults?.[0]?.channels).toEqual([
      expect.objectContaining({
        channel: 'localFolder',
        label: 'Local Folder Label Sentinel',
        labelDescriptor: { key: 'connectionChannelLocalFolderLabel' },
        message: 'Local Folder not configured',
        messageDescriptor: { key: 'connectionLocalFolderNotConfigured' }
      }),
      expect.objectContaining({
        channel: 'https',
        label: 'HTTPS',
        labelDescriptor: { key: 'connectionChannelRestLabel' },
        message: 'No HTTPS URL configured',
        messageDescriptor: { key: 'connectionRestUrlMissing', values: { label: 'HTTPS' } }
      }),
      expect.objectContaining({
        channel: 'http',
        label: 'HTTP',
        labelDescriptor: { key: 'connectionChannelRestLabel' },
        message: 'No HTTP URL configured',
        messageDescriptor: { key: 'connectionRestUrlMissing', values: { label: 'HTTP' } }
      })
    ]);
    expect(JSON.stringify(result)).not.toContain('本地目录');
    expect(JSON.stringify(result)).not.toContain('未配置');
  });

  it('uses the localized no-enabled-vaults fallback', async () => {
    const storageSentinelMessages = await createStorageSentinelMessages();
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
      storageSentinelMessages
    );

    expect(result).toEqual({
      success: false,
      message: 'No Enabled Vaults Sentinel',
      messageDescriptor: { key: 'schemaStorageNoEnabledVaults' },
      error: 'No Enabled Vaults Sentinel',
      errorDescriptor: { key: 'schemaStorageNoEnabledVaults' }
    });
  });

  it('renders the localized certificate link copy from messages', async () => {
    const controller = createController();
    const storageSentinelMessages = await createStorageSentinelMessages();
    const messagingRepository = createMessaging({
      success: false,
      status: 401,
      message: 'Research Vault partial',
      error: 'HTTPS: network error: request failed',
      channels: [
        {
          channel: 'localFolder',
          label: 'Local Folder Label Sentinel',
          configured: true,
          success: true,
          message: 'Local Folder ready'
        },
        {
          channel: 'https',
          label: 'HTTPS',
          configured: true,
          success: false,
          message: 'network error: request failed',
          error: 'network error: request failed',
          url: LOCAL_HTTPS_URL,
          certificateUrl: LOCAL_CERTIFICATE_URL
        }
      ]
    });
    vi.mocked(getMessagesForLanguage).mockResolvedValue(storageSentinelMessages);

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        rest: {
          vault: 'Research Vault',
          httpsUrl: LOCAL_HTTPS_URL,
          apiKey: 'bad-token'
        }
      },
      messages: storageSentinelMessages,
      language: 'en',
      messagingRepository
    } as never);

    findButton('Test Connection Sentinel').click();
    await flushPromises();
    await vi.waitFor(() => {
      const certificateLink = document.querySelector<HTMLAnchorElement>(
        `a[href="${LOCAL_CERTIFICATE_URL}"]`
      );
      expect(certificateLink?.textContent).toBe('Certificate Link Sentinel');
    });
    expect(vi.mocked(getMessagesForLanguage)).toHaveBeenCalledWith('en');
  });
});
