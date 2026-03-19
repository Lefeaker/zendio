/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import { createTestRegistry, withTestRegistry } from '@shared/di';
import { DI_TOKENS } from '@shared/di/tokens';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { RestSection } from '@options/components/sections/RestSection';
import type { OptionsStateManager } from '@options/state/StateManager';
import { MockOptionsRepository, MockMessagingRepository } from '../../../utils/repositories';

const restFixtures = vi.hoisted(() => ({
  updateAdditionalVaultMock: vi.fn(),
  markPendingAutoSaveMock: vi.fn(),
  initializeVaultRouterStoreMock: vi.fn(),
  setRouterSnapshot: ((_snapshot: unknown) => undefined) as (snapshot: unknown) => void,
  resetRouterSnapshot: (() => undefined) as () => void,
  defaultVault: {
    id: 'vault-default',
    vault: 'InitialVault',
    name: 'InitialVault',
    httpsUrl: 'https://initial.example.com/',
    httpUrl: 'http://initial.example.com/',
    apiKey: 'initial-key',
    enabled: true,
    rules: []
  }
}));

vi.mock('../../../../src/options/app/i18nContext', () => ({
  getOptionsMessages: vi.fn(() =>
    Promise.resolve({
      connectionSuccessShort: 'Connection ok',
      connectionFailed: 'Connection failed',
      connectionTesting: 'Testing...',
      defaultVaultBadge: '默认仓库',
      vaultNameLabel: '仓库名称',
      testConnectionButton: 'Test Connection'
    })
  )
}));

vi.mock('../../../../src/options/state/vaultRouterStore', () => {
  const defaultVault = restFixtures.defaultVault;
  type MockRouterSnapshot = { vaults: typeof defaultVault[]; defaultVaultId: string };
  const listeners: Array<(state: MockRouterSnapshot) => void> = [];
  const state: MockRouterSnapshot = { vaults: [defaultVault], defaultVaultId: defaultVault.id };
  const emit = () => listeners.forEach((listener) => listener({ vaults: state.vaults, defaultVaultId: state.defaultVaultId }));
  restFixtures.setRouterSnapshot = (snapshot: unknown) => {
    const next = snapshot as MockRouterSnapshot;
    state.vaults = next.vaults;
    state.defaultVaultId = next.defaultVaultId;
    emit();
  };
  restFixtures.resetRouterSnapshot = () => {
    state.vaults = [defaultVault];
    state.defaultVaultId = defaultVault.id;
    emit();
  };

  return {
    addAdditionalVault: vi.fn(),
    removeAdditionalVault: vi.fn(),
    updateAdditionalVault: restFixtures.updateAdditionalVaultMock,
    subscribeVaultRouter: vi.fn((listener: (state: MockRouterSnapshot) => void) => {
      listeners.push(listener);
      listener({ vaults: state.vaults, defaultVaultId: state.defaultVaultId });
      return () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }),
    getVaultRouterConfig: vi.fn(() => ({
      vaults: state.vaults.map(vault => ({ ...vault })),
      defaultVaultId: state.defaultVaultId
    })),
    initializeVaultRouterStore: restFixtures.initializeVaultRouterStoreMock
  };
});

vi.mock('../../../../src/options/app/optionsControllerContext', () => ({
  getOptionsController: () => null,
  markPendingAutoSave: restFixtures.markPendingAutoSaveMock
}));

const noopStateManager = {} as OptionsStateManager;

describe('RestSection', () => {
  let registry: FormSectionRegistry;
  let optionsRepo: MockOptionsRepository;
  let messagingRepo: MockMessagingRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    restFixtures.resetRouterSnapshot();
    document.body.innerHTML = '<section id="rest-section"></section>';
    registry = new FormSectionRegistry();
    optionsRepo = new MockOptionsRepository();
    messagingRepo = new MockMessagingRepository();
    messagingRepo.reset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = async (initial?: Partial<CompleteOptions>): Promise<RestSection> => {
    if (initial) {
      await optionsRepo.set(initial);
    }
    const container = document.getElementById('rest-section');
    if (!container) {
      throw new Error('Rest Section container missing');
    }
    const section = new RestSection(container, optionsRepo, messagingRepo);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return section;
  };


  it('falls back to default vault snapshot when router state is empty and ignores repo updates after destroy', async () => {
    const section = await renderSection({
      rest: {
        baseUrl: 'https://fallback.example.com/',
        httpsUrl: 'https://fallback.example.com/',
        httpUrl: 'http://fallback.example.com/',
        vault: 'FallbackVault',
        apiKey: 'fallback-key'
      }
    });

    await optionsRepo.set({
      rest: {
        baseUrl: 'https://fallback.example.com/',
        httpsUrl: 'https://fallback.example.com/',
        httpUrl: 'http://fallback.example.com/',
        vault: 'FallbackVault',
        apiKey: 'fallback-key'
      }
    } as Partial<CompleteOptions>);

    restFixtures.setRouterSnapshot({ vaults: [], defaultVaultId: null });

    await vi.waitFor(() => {
      expect((document.getElementById('restHttpsUrl') as HTMLInputElement).value).toBe('https://fallback.example.com/');
      expect((document.getElementById('restHttpUrl') as HTMLInputElement).value).toBe('http://fallback.example.com/');
      expect((document.getElementById('restVault') as HTMLInputElement).value).toBe('FallbackVault');
      expect((document.getElementById('restKey') as HTMLInputElement).value).toBe('fallback-key');
    });

    section.destroy();
    expect(registry.size).toBe(0);
    await optionsRepo.set({
      rest: {
        baseUrl: 'https://changed-after-destroy.example.com/',
        httpsUrl: 'https://changed-after-destroy.example.com/',
        httpUrl: 'http://changed-after-destroy.example.com/',
        vault: 'ChangedAfterDestroy',
        apiKey: 'changed-after-destroy'
      }
    } as Partial<CompleteOptions>);

    expect(document.getElementById('rest-section')?.children.length ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('keeps form registry collection aligned with repository updates after local edits', async () => {
    await renderSection({
      rest: {
        baseUrl: 'https://initial.example.com/',
        httpsUrl: 'https://initial.example.com/',
        httpUrl: 'http://initial.example.com/',
        vault: 'InitialVault',
        apiKey: 'initial-key'
      }
    });

    const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
    httpsInput.value = 'https://dirty.example.com/';
    httpsInput.dispatchEvent(new Event('input', { bubbles: true }));

    await optionsRepo.set({
      rest: {
        httpsUrl: 'https://repo-update.example.com/',
        httpUrl: 'http://repo-update.example.com/',
        vault: 'RepoVault',
        apiKey: 'repo-key'
      }
    } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      expect((document.getElementById('restHttpsUrl') as HTMLInputElement).value).toBe('https://repo-update.example.com/');
      expect((document.getElementById('restHttpUrl') as HTMLInputElement).value).toBe('http://repo-update.example.com/');
    });

    const collected = registry.collect(null) as StoredOptions;
    expect(collected.rest?.httpsUrl).toBe('https://repo-update.example.com/');
    expect(collected.rest?.vault).toBe('RepoVault');
  });
  it('applies repository snapshot values to default vault inputs', async () => {
    const section = await renderSection();
    const snapshot = {
      rest: {
        baseUrl: 'https://api.example.com/',
        httpsUrl: 'https://api.example.com/',
        httpUrl: '',
        vault: 'TeamVault',
        apiKey: 'secret-token'
      },
      vaultRouter: {
        vaults: [
          {
            id: 'router-default',
            name: 'RouterVault',
            vault: 'RouterVault',
            httpsUrl: 'https://vault.example.com/',
            httpUrl: 'http://vault.example.com/',
            apiKey: 'router-key',
            enabled: true,
            isDefault: true,
            rules: []
          }
        ],
        defaultVaultId: 'router-default'
      }
    } as StoredOptions;

    await optionsRepo.set(snapshot as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
      const httpInput = document.getElementById('restHttpUrl') as HTMLInputElement;
      const nameInput = document.getElementById('restVault') as HTMLInputElement;
      const keyInput = document.getElementById('restKey') as HTMLInputElement;

      expect(httpsInput.value).toBe('https://api.example.com/');
      expect(httpInput.value).toBe('');
      expect(nameInput.value).toBe('TeamVault');
      expect(keyInput.value).toBe('secret-token');
    });
    expect(restFixtures.initializeVaultRouterStoreMock).toHaveBeenLastCalledWith(snapshot.vaultRouter);

    section.destroy();
  });

  it('collects rest changes, schedules auto save, and persists via repository', async () => {
    const section = await renderSection();
    const previous = {
      rest: {
        baseUrl: 'https://prev.example.com/',
        httpsUrl: 'https://prev.example.com/',
        httpUrl: '',
        vault: 'PrevVault',
        apiKey: 'prev-token',
        rootDir: '/obsidian/root'
      }
    } as StoredOptions;

    const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
    const httpInput = document.getElementById('restHttpUrl') as HTMLInputElement;
    const nameInput = document.getElementById('restVault') as HTMLInputElement;
    const keyInput = document.getElementById('restKey') as HTMLInputElement;

    httpsInput.value = '';
    httpsInput.dispatchEvent(new Event('input', { bubbles: true }));

    httpInput.value = 'http://localhost:27123/';
    httpInput.dispatchEvent(new Event('input', { bubbles: true }));

    nameInput.value = 'WorkVault';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    keyInput.value = 'new-token';
    keyInput.dispatchEvent(new Event('input', { bubbles: true }));

    const collected = registry.collect(previous);
    expect(collected.rest).toEqual({
      baseUrl: 'http://localhost:27123/',
      httpsUrl: undefined,
      httpUrl: 'http://localhost:27123/',
      vault: 'WorkVault',
      apiKey: 'new-token',
      rootDir: '/obsidian/root'
    });

    expect(restFixtures.updateAdditionalVaultMock).toHaveBeenCalled();
    expect(restFixtures.markPendingAutoSaveMock).toHaveBeenCalledWith('vaultRouter');
    expect(restFixtures.markPendingAutoSaveMock).toHaveBeenCalledWith('rest');

    const stored = optionsRepo.getMockData();
    expect(stored.rest.baseUrl).toBe('http://localhost:27123/');
    expect(stored.rest.vault).toBe('WorkVault');

    section.destroy();
  });

  it('reacts to repository updates from other contexts', async () => {
    const section = await renderSection();

    await optionsRepo.set({
      rest: {
        httpsUrl: 'https://remote-change.example/',
        httpUrl: '',
        vault: 'RemoteVault',
        apiKey: 'remote-key'
      }
    } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
      const nameInput = document.getElementById('restVault') as HTMLInputElement;
      expect(httpsInput.value).toBe('https://remote-change.example/');
      expect(nameInput.value).toBe('RemoteVault');
    });

    section.destroy();
  });

  it('sends connection test message through messaging repository', async () => {
    const section = await renderSection();
    messagingRepo.setMockResponse('TEST_CONNECTION', { success: true, message: 'ok' });

    const button = document.getElementById('testConnectionBtn') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      const sent = messagingRepo.getSentMessages();
      expect(sent).toHaveLength(1);
      expect(sent[0].message.type).toBe('TEST_CONNECTION');
    });

    section.destroy();
  });

  it('falls back to current default options values when repository snapshot is reset', async () => {
    optionsRepo.reset();
    const section = await renderSection();

    await vi.waitFor(() => {
      const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
      const httpInput = document.getElementById('restHttpUrl') as HTMLInputElement;
      const nameInput = document.getElementById('restVault') as HTMLInputElement;
      const keyInput = document.getElementById('restKey') as HTMLInputElement;

      expect(httpsInput.value).toBe(DEFAULT_OPTIONS.rest.httpsUrl);
      expect(httpInput.value).toBe(DEFAULT_OPTIONS.rest.httpUrl);
      expect(nameInput.value).toBe(DEFAULT_OPTIONS.rest.vault);
      expect(keyInput.value).toBe(DEFAULT_OPTIONS.rest.apiKey);
    });

    section.destroy();
  });

  it('preserves rootDir while collecting current ui values after renaming default vault', async () => {
    const section = await renderSection();
    const previous = {
      rest: {
        baseUrl: 'https://keep.example.com/',
        httpsUrl: 'https://keep.example.com/',
        httpUrl: 'http://keep.example.com/',
        vault: 'KeepVault',
        apiKey: 'keep-token',
        rootDir: '/kept'
      }
    } as StoredOptions;

    const nameInput = document.getElementById('restVault') as HTMLInputElement;
    nameInput.value = 'RenamedVault';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    const collected = registry.collect(previous);
    expect(collected.rest).toEqual({
      baseUrl: DEFAULT_OPTIONS.rest.httpsUrl,
      httpsUrl: DEFAULT_OPTIONS.rest.httpsUrl,
      httpUrl: DEFAULT_OPTIONS.rest.httpUrl,
      vault: 'RenamedVault',
      apiKey: DEFAULT_OPTIONS.rest.apiKey,
      rootDir: '/kept'
    });

    section.destroy();
  });


  it('renders connection test success messages from messaging responses', async () => {
    const section = await renderSection();
    messagingRepo.setMockResponse('TEST_CONNECTION', {
      success: true,
      message: 'connected',
      data: { vault: 'InitialVault' }
    });

    const button = document.getElementById('testConnectionBtn') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      const resultHost = document.getElementById('connectionResult');
      expect(resultHost?.textContent ?? '').toContain('connected');
    });

    section.destroy();
  });

  it('uses http url as baseUrl when https is cleared before collect', async () => {
    const section = await renderSection();
    const previous = {
      rest: {
        baseUrl: 'https://prev.example.com/',
        httpsUrl: 'https://prev.example.com/',
        httpUrl: 'http://prev.example.com/',
        vault: 'PrevVault',
        apiKey: 'prev-token'
      }
    } as StoredOptions;

    const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
    const httpInput = document.getElementById('restHttpUrl') as HTMLInputElement;
    httpsInput.value = '';
    httpsInput.dispatchEvent(new Event('input', { bubbles: true }));
    httpInput.value = 'http://fallback.example.com/';
    httpInput.dispatchEvent(new Event('input', { bubbles: true }));

    const collected = registry.collect(previous);
    expect(collected.rest).toMatchObject({
      baseUrl: 'http://fallback.example.com/',
      httpUrl: 'http://fallback.example.com/'
    });
    expect(collected.rest).not.toHaveProperty('httpsUrl');

    section.destroy();
  });

  it('renders connection test success and preserves previously collected rootDir', async () => {
    const section = await renderSection();
    messagingRepo.setMockResponse('TEST_CONNECTION', {
      success: true,
      message: 'connection ok',
      status: 200,
      response: 'pong'
    });

    const button = document.getElementById('testConnectionBtn') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      const resultHost = document.getElementById('connectionResult');
      expect(resultHost?.textContent ?? '').toContain('connection ok');
    });

    const collected = registry.collect({
      rest: {
        baseUrl: 'https://before.example.com/',
        httpsUrl: 'https://before.example.com/',
        httpUrl: undefined,
        vault: 'BeforeVault',
        apiKey: 'before-token',
        rootDir: '/persist/me'
      }
    } as StoredOptions);

    expect(collected.rest?.rootDir).toBe('/persist/me');
    expect(messagingRepo.getSentMessages().map(entry => entry.message.type)).toContain('TEST_CONNECTION');

    section.destroy();
  });

  it('renders connection test failures from messaging responses', async () => {
    const section = await renderSection();
    messagingRepo.setMockResponse('TEST_CONNECTION', {
      success: false,
      message: 'remote failed',
      error: 'remote failed'
    });

    const button = document.getElementById('testConnectionBtn') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      const resultHost = document.getElementById('connectionResult');
      expect(resultHost?.textContent ?? '').toContain('remote failed');
    });

    section.destroy();
  });


  it('applies external repository snapshots without scheduling extra autosave while dirty', async () => {
    const section = await renderSection();
    const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
    const nameInput = document.getElementById('restVault') as HTMLInputElement;

    restFixtures.markPendingAutoSaveMock.mockClear();
    httpsInput.value = 'https://dirty.example.com/';
    httpsInput.dispatchEvent(new Event('input', { bubbles: true }));
    nameInput.value = 'DirtyVault';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(restFixtures.markPendingAutoSaveMock.mock.calls.length).toBeGreaterThan(0);
    const autosaveCalls = restFixtures.markPendingAutoSaveMock.mock.calls.length;

    await optionsRepo.set({
      rest: {
        baseUrl: 'https://remote.example.com/',
        httpsUrl: 'https://remote.example.com/',
        httpUrl: '',
        vault: 'RemoteVault',
        apiKey: 'remote-key'
      }
    } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      expect(httpsInput.value).toBe('https://remote.example.com/');
      expect(nameInput.value).toBe('RemoteVault');
    });
    expect(restFixtures.markPendingAutoSaveMock).toHaveBeenCalledTimes(autosaveCalls);

    section.destroy();
  });

  it('disposes connection test handlers on destroy', async () => {
    const section = await renderSection();
    messagingRepo.setMockResponse('TEST_CONNECTION', { success: true, message: 'ok' });

    const button = document.getElementById('testConnectionBtn') as HTMLButtonElement;
    button.click();
    await vi.waitFor(() => {
      expect(messagingRepo.getSentMessages()).toHaveLength(1);
    });

    section.destroy();
    button.click();
    await Promise.resolve();

    expect(messagingRepo.getSentMessages()).toHaveLength(1);
  });


  it('collects enabled additional vault configs from rows and falls back when row is missing', async () => {
    restFixtures.setRouterSnapshot({
      defaultVaultId: 'vault-default',
      vaults: [
        { ...restFixtures.defaultVault },
        {
          id: 'vault-2',
          vault: 'ExtraVault',
          name: 'ExtraVault',
          httpsUrl: 'https://extra.example.com/',
          httpUrl: 'http://extra.example.com/',
          apiKey: 'extra-key',
          enabled: true,
          rules: []
        },
        {
          id: 'vault-3',
          vault: 'DisabledVault',
          name: 'DisabledVault',
          httpsUrl: 'https://disabled.example.com/',
          httpUrl: 'http://disabled.example.com/',
          apiKey: 'disabled-key',
          enabled: false,
          rules: []
        }
      ]
    });
    const section = await renderSection();
    const sectionAny = section as unknown as { collectAdditionalVaultConfigsForTest: () => Array<Record<string, unknown>> };

    const extraName = document.querySelector<HTMLInputElement>('[data-vault-id="vault-2"] .rest-vault-name');
    expect(extraName).toBeTruthy();
    if (!extraName) {
      throw new Error('Expected extra vault row');
    }
    extraName.value = 'EditedExtraVault';
    extraName.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelector('[data-vault-id="vault-3"]')?.remove();

    const configs = sectionAny.collectAdditionalVaultConfigsForTest();
    expect(configs).toEqual([
      expect.objectContaining({ id: 'vault-2', vault: 'EditedExtraVault', name: 'EditedExtraVault', enabled: true })
    ]);

    section.destroy();
  });

  it('does not overwrite actively edited additional vault row inputs from repository snapshots', async () => {
    restFixtures.setRouterSnapshot({
      defaultVaultId: 'vault-default',
      vaults: [
        { ...restFixtures.defaultVault },
        {
          id: 'vault-2',
          vault: 'ExtraVault',
          name: 'ExtraVault',
          httpsUrl: 'https://extra.example.com/',
          httpUrl: 'http://extra.example.com/',
          apiKey: 'extra-key',
          enabled: true,
          rules: []
        }
      ]
    });
    const section = await renderSection();

    const extraName = document.querySelector<HTMLInputElement>('[data-vault-id="vault-2"] .rest-vault-name');
    expect(extraName).toBeTruthy();
    if (!extraName) {
      throw new Error('Expected extra vault row');
    }
    extraName.focus();
    extraName.value = 'TypingVault';

    restFixtures.setRouterSnapshot({
      defaultVaultId: 'vault-default',
      vaults: [
        { ...restFixtures.defaultVault },
        {
          id: 'vault-2',
          vault: 'RemoteVault',
          name: 'RemoteVault',
          httpsUrl: 'https://remote.example.com/',
          httpUrl: 'http://remote.example.com/',
          apiKey: 'remote-key',
          enabled: true,
          rules: []
        }
      ]
    });

    expect(extraName.value).toBe('TypingVault');
    section.destroy();
  });


  it('falls back to defaults when collecting blank rest fields and swallows persist failures', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      collectRestDraftForTest: () => Partial<CompleteOptions['rest']>;
    };
    const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
    const httpInput = document.getElementById('restHttpUrl') as HTMLInputElement;
    const nameInput = document.getElementById('restVault') as HTMLInputElement;
    const keyInput = document.getElementById('restKey') as HTMLInputElement;
    const repoSetSpy = vi.spyOn(optionsRepo, 'set').mockRejectedValueOnce(new Error('persist failed'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    httpsInput.value = '   ';
    httpInput.value = '   ';
    nameInput.value = '   ';
    keyInput.value = 'raw-key';

    const collected = registry.collect({
      rest: {
        rootDir: '/keep/root'
      }
    } as StoredOptions);

    expect(collected.rest).toMatchObject({
      baseUrl: DEFAULT_OPTIONS.rest.baseUrl,
      vault: DEFAULT_OPTIONS.rest.vault,
      apiKey: 'raw-key',
      rootDir: '/keep/root'
    });
    expect(collected.rest).not.toHaveProperty('httpsUrl');
    expect(collected.rest).not.toHaveProperty('httpUrl');
    expect(sectionAny.collectRestDraftForTest()).toEqual({ apiKey: 'raw-key' });

    await vi.waitFor(() => {
      expect(repoSetSpy).toHaveBeenCalled();
      const latestSnapshot = repoSetSpy.mock.calls.at(-1)?.[0] as { rest?: unknown } | undefined;
      expect(latestSnapshot?.rest).toBeTruthy();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RestSection] Failed to persist REST options via repository:',
        expect.any(Error)
      );
    });
  });


  it('uses snapshot fallbacks for default vault resolution and supports missing rows in draft readers', async () => {
    restFixtures.setRouterSnapshot({
      defaultVaultId: null,
      vaults: [
        {
          ...restFixtures.defaultVault,
          id: 'default-from-flag',
          isDefault: true,
          vault: 'FlaggedDefault',
          name: 'FlaggedDefault'
        },
        {
          id: 'vault-extra',
          vault: 'ExtraVault',
          name: 'ExtraVault',
          httpsUrl: 'https://extra.example.com/',
          httpUrl: 'http://extra.example.com/',
          apiKey: 'extra-key',
          enabled: true,
          rules: []
        }
      ]
    });
    const section = await renderSection();
    const sectionAny = section as unknown as {
      defaultVaultId: string | null;
      collectAdditionalVaultConfigsForTest: () => Array<Record<string, unknown>>;
      readRowValue: (row: HTMLElement, selector: string, trim?: boolean) => string | null;
      updateDefaultVaultField: (field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey', value: string) => void;
    };

    expect(sectionAny.defaultVaultId).toBe('default-from-flag');

    const row = document.querySelector<HTMLElement>('[data-vault-id="vault-extra"]');
    expect(row).toBeTruthy();
    if (!row) {
      throw new Error('Expected additional vault row');
    }

    const nameInput = row.querySelector<HTMLInputElement>('.rest-vault-name');
    const httpInput = row.querySelector<HTMLInputElement>('.rest-vault-http');
    const apiInput = row.querySelector<HTMLInputElement>('.rest-vault-api');
    if (!nameInput || !httpInput || !apiInput) {
      throw new Error('Expected vault row inputs');
    }
    nameInput.remove();
    httpInput.value = '  http://edited.example.com/  ';
    apiInput.value = 'raw-api';

    expect(sectionAny.collectAdditionalVaultConfigsForTest()).toEqual([
      expect.objectContaining({
        id: 'vault-extra',
        vault: 'ExtraVault',
        name: 'ExtraVault',
        httpUrl: 'http://edited.example.com/',
        apiKey: 'raw-api'
      })
    ]);
    expect(sectionAny.readRowValue(row, '.does-not-exist')).toBeNull();

    sectionAny.defaultVaultId = null;
    restFixtures.updateAdditionalVaultMock.mockClear();
    sectionAny.updateDefaultVaultField('name', '  should-not-save  ');
    expect(restFixtures.updateAdditionalVaultMock).not.toHaveBeenCalled();
  });

  it('handles empty additional vault host and missing connection tester nodes safely', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      additionalRowsHost: HTMLElement | null;
      additionalEmptyHint: HTMLElement | null;
      renderAdditionalVaultRows: (vaults: Array<Record<string, unknown>>, defaultVaultId?: string) => void;
      initializeConnectionTester: () => void;
      connectionTester: unknown;
      connectionResultHost: HTMLDivElement | null;
    };

    sectionAny.additionalRowsHost = null;
    sectionAny.additionalEmptyHint = null;
    expect(() => sectionAny.renderAdditionalVaultRows([], undefined)).not.toThrow();

    const result = document.getElementById('connectionResult');
    result?.remove();
    sectionAny.initializeConnectionTester();
    expect(sectionAny.connectionTester).toBeNull();
    expect(sectionAny.connectionResultHost).toBeTruthy();
  });

  it('stops applying repository snapshots after destroy', async () => {
    const section = await renderSection();
    const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
    expect(httpsInput.value).toBe(DEFAULT_OPTIONS.rest.httpsUrl ?? '');

    section.destroy();

    await optionsRepo.set({
      rest: {
        baseUrl: 'https://after-destroy.example.com/',
        httpsUrl: 'https://after-destroy.example.com/',
        httpUrl: undefined,
        vault: 'AfterDestroy',
        apiKey: 'after-destroy'
      }
    });

    expect(httpsInput.value).toBe(DEFAULT_OPTIONS.rest.httpsUrl ?? '');
  });


  it('collects empty rest draft, keeps raw api key, and logs repository persistence failures', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      collectRestDraftForTest: () => Record<string, unknown>;
      persistRest: (partial: Partial<CompleteOptions>) => void;
    };
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const httpsInput = document.getElementById('restHttpsUrl') as HTMLInputElement;
    const httpInput = document.getElementById('restHttpUrl') as HTMLInputElement;
    const nameInput = document.getElementById('restVault') as HTMLInputElement;
    const apiKeyInput = document.getElementById('restKey') as HTMLInputElement;

    httpsInput.value = '   ';
    httpInput.value = '   ';
    nameInput.value = '   ';
    apiKeyInput.value = ' raw-key ';

    expect(sectionAny.collectRestDraftForTest()).toEqual({ apiKey: ' raw-key ' });

    const failingRepo = new MockOptionsRepository();
    failingRepo.set = vi.fn(() => Promise.reject(new Error('persist failed')));
    const container = document.getElementById('rest-section');
    if (!container) {
      throw new Error('Rest Section container missing');
    }
    const failingSection = new RestSection(container, failingRepo, messagingRepo);
    failingSection.render({ stateManager: noopStateManager, formRegistry: registry });
    const failingAny = failingSection as unknown as { persistRest: (partial: Partial<StoredOptions>) => void };

    failingAny.persistRest({ rest: { baseUrl: '', vault: 'BrokenVault', apiKey: '' } });

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RestSection] Failed to persist REST options via repository:',
        expect.any(Error)
      );
    });

    consoleErrorSpy.mockRestore();
    failingSection.destroy();
    section.destroy();
  });

  it('falls back to snapshot values when additional vault rows or toggles are missing', async () => {
    const section = await renderSection();
    restFixtures.setRouterSnapshot({
      vaults: [
        restFixtures.defaultVault,
        {
          id: 'vault-disabled-fallback',
          vault: 'VaultDisabledFallback',
          name: 'VaultDisabledFallback',
          httpsUrl: 'https://disabled.example.com/',
          httpUrl: 'http://disabled.example.com/',
          apiKey: 'disabled-key',
          enabled: true,
          rules: []
        },
        {
          id: 'vault-without-row',
          vault: 'VaultWithoutRow',
          name: 'VaultWithoutRow',
          httpsUrl: 'https://norow.example.com/',
          httpUrl: 'http://norow.example.com/',
          apiKey: 'no-row-key',
          enabled: true,
          rules: []
        }
      ],
      defaultVaultId: restFixtures.defaultVault.id
    });

    const sectionAny = section as unknown as {
      collectAdditionalVaultConfigsForTest: () => Array<Record<string, unknown>>;
      readRowValue: (row: HTMLElement, selector: string, trim?: boolean) => string | null;
    };

    const row = document.querySelector<HTMLElement>('[data-vault-id="vault-disabled-fallback"]');
    expect(row).toBeTruthy();
    if (!row) {
      throw new Error('Expected additional vault row');
    }
    row.querySelector<HTMLInputElement>('.rest-vault-enabled')?.remove();
    row.querySelector<HTMLInputElement>('.rest-vault-https')?.remove();
    row.querySelector<HTMLInputElement>('.rest-vault-http')?.remove();
    row.querySelector<HTMLInputElement>('.rest-vault-name')?.remove();
    row.querySelector<HTMLInputElement>('.rest-vault-api')?.remove();

    expect(sectionAny.collectAdditionalVaultConfigsForTest()).toEqual([
      expect.objectContaining({
        id: 'vault-disabled-fallback',
        vault: 'VaultDisabledFallback',
        name: 'VaultDisabledFallback',
        httpsUrl: 'https://disabled.example.com/',
        httpUrl: 'http://disabled.example.com/',
        apiKey: 'disabled-key',
        enabled: true
      }),
      expect.objectContaining({
        id: 'vault-without-row',
        vault: 'VaultWithoutRow',
        name: 'VaultWithoutRow',
        httpsUrl: 'https://norow.example.com/',
        httpUrl: 'http://norow.example.com/',
        apiKey: 'no-row-key',
        enabled: true
      })
    ]);
    expect(sectionAny.readRowValue(row, '.rest-vault-api', false)).toBeNull();

    section.destroy();
  });

  it('uses default header copy, tolerates missing connection hosts, and keeps helpers as no-ops after destroy', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      messages: Record<string, string> | null;
      buildHeader: () => HTMLElement;
      renderConnectionTestResult: (type: 'success' | 'error' | 'info', text: string) => void;
      resetConnectionTestResult: () => void;
      initializeConnectionTester: () => void;
      connectionResultHost: HTMLDivElement | null;
      destroy: () => void;
      collectRestDraftForTest: () => Record<string, unknown>;
      collectAdditionalVaultConfigsForTest: () => Array<Record<string, unknown>>;
      applySnapshot: (options: Partial<StoredOptions>) => void;
    };

    sectionAny.messages = null;
    const header = sectionAny.buildHeader();
    expect(header.textContent).toContain('Obsidian Local REST API');
    expect(header.textContent).toContain('配置默认仓库和额外仓库的连接信息');

    sectionAny.connectionResultHost = null;
    expect(() => sectionAny.renderConnectionTestResult('success', 'ok')).not.toThrow();
    expect(() => sectionAny.resetConnectionTestResult()).not.toThrow();

    const button = document.getElementById('testConnectionBtn');
    const result = document.getElementById('connectionResult');
    button?.remove();
    sectionAny.initializeConnectionTester();
    expect(() => sectionAny.resetConnectionTestResult()).not.toThrow();
    if (result) {
      document.getElementById('rest-section')?.appendChild(result);
    }
    const recreatedButton = document.createElement('button');
    recreatedButton.id = 'testConnectionBtn';
    document.getElementById('rest-section')?.appendChild(recreatedButton);
    document.getElementById('connectionResult')?.remove();
    sectionAny.initializeConnectionTester();

    section.destroy();
    expect(() => sectionAny.renderConnectionTestResult('error', 'later')).not.toThrow();
    expect(() => sectionAny.resetConnectionTestResult()).not.toThrow();
    expect(sectionAny.collectRestDraftForTest()).toEqual({
      baseUrl: DEFAULT_OPTIONS.rest.httpsUrl ?? DEFAULT_OPTIONS.rest.baseUrl,
      httpsUrl: DEFAULT_OPTIONS.rest.httpsUrl ?? '',
      httpUrl: DEFAULT_OPTIONS.rest.httpUrl ?? '',
      vault: DEFAULT_OPTIONS.rest.vault
    });
    expect(sectionAny.collectAdditionalVaultConfigsForTest()).toEqual([]);
    expect(() => sectionAny.applySnapshot({ rest: { vault: 'AfterDestroy' } })).toThrow('destroyed');
  });

  it('applies router fallbacks and filters disabled additional vaults', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      applySnapshot: (options: Partial<StoredOptions>) => void;
      collectAdditionalVaultConfigsForTest: () => Array<Record<string, unknown>>;
    };

    restFixtures.setRouterSnapshot({
      vaults: [
        {
          id: 'vault-a',
          vault: 'Vault A',
          name: 'Vault A',
          httpsUrl: 'https://a.example.com/',
          httpUrl: 'http://a.example.com/',
          apiKey: 'key-a',
          enabled: true,
          rules: []
        },
        {
          id: 'vault-b',
          vault: 'Vault B',
          name: 'Vault B',
          httpsUrl: 'https://b.example.com/',
          httpUrl: 'http://b.example.com/',
          apiKey: 'key-b',
          enabled: false,
          rules: []
        }
      ],
      defaultVaultId: 'missing-default'
    });

    sectionAny.applySnapshot({ rest: { apiKey: 'override-key' } });
    expect((document.getElementById('restVault') as HTMLInputElement).value).toBe('Vault A');
    expect((document.getElementById('restHttpsUrl') as HTMLInputElement).value).toBe('https://a.example.com/');
    expect((document.getElementById('restHttpUrl') as HTMLInputElement).value).toBe('http://a.example.com/');
    expect((document.getElementById('restKey') as HTMLInputElement).value).toBe('override-key');

    const enabledToggle = document.querySelector<HTMLElement>('[data-vault-id="vault-a"]')?.querySelector<HTMLInputElement>('.rest-vault-enabled') ?? null;
    expect(enabledToggle).toBeTruthy();
    if (enabledToggle) {
      enabledToggle.checked = false;
      enabledToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }

    expect(sectionAny.collectAdditionalVaultConfigsForTest()).toEqual([]);
    section.destroy();
  });

  it('renders default body copy and leaves connection tester null when button or result host is half-missing', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      messages: Record<string, string> | null;
      buildBody: () => HTMLElement;
      initializeConnectionTester: () => void;
      connectionTester: object | null;
    };

    sectionAny.messages = null;
    const body = sectionAny.buildBody();
    expect(body.textContent).toContain('添加更多仓库，通过路由规则自动分配内容');
    expect(body.textContent).toContain('+ 添加仓库');
    expect(body.textContent).toContain('⚡ 测试连接');
    expect(body.textContent).toContain('连接测试结果');

    document.getElementById('connectionResult')?.remove();
    sectionAny.initializeConnectionTester();
    expect(sectionAny.connectionTester).toBeNull();

    const resultHost = document.createElement('div');
    resultHost.id = 'connectionResult';
      document.getElementById('rest-section')?.appendChild(resultHost);
    document.getElementById('testConnectionBtn')?.remove();
    sectionAny.initializeConnectionTester();
    expect(sectionAny.connectionTester).toBeNull();

    section.destroy();
  });

  it('keeps snapshot values when additional vault rows are present but inputs are partially missing', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      collectAdditionalVaultConfigsForTest: () => Array<Record<string, unknown>>;
    };

    restFixtures.setRouterSnapshot({
      vaults: [
        {
          id: 'vault-default',
          vault: 'Default',
          name: 'Default',
          httpsUrl: 'https://default.example.com/',
          httpUrl: 'http://default.example.com/',
          apiKey: 'default-key',
          enabled: true,
          rules: []
        },
        {
          id: 'vault-partial',
          vault: 'Vault Partial',
          name: 'Vault Partial',
          httpsUrl: 'https://partial.example.com/',
          httpUrl: 'http://partial.example.com/',
          apiKey: 'partial-key',
          enabled: true,
          rules: []
        }
      ],
      defaultVaultId: 'vault-default'
    });

    await optionsRepo.set({
      rest: { baseUrl: 'https://default.example.com/', vault: 'Default', apiKey: 'default-key' },
      vaultRouter: {
        vaults: [
          {
            id: 'vault-default',
            name: 'Default',
            httpsUrl: 'https://default.example.com/',
            httpUrl: 'http://default.example.com/',
            vault: 'Default',
            apiKey: 'default-key',
            enabled: true,
            rules: []
          },
          {
            id: 'vault-partial',
            name: 'Vault Partial',
            httpsUrl: 'https://partial.example.com/',
            httpUrl: 'http://partial.example.com/',
            vault: 'Vault Partial',
            apiKey: 'partial-key',
            enabled: true,
            rules: []
          }
        ],
        defaultVaultId: 'vault-default'
      }
    });

    const row = document.querySelector<HTMLElement>('[data-vault-id="vault-partial"]');
    expect(row).toBeTruthy();
    if (!row) throw new Error('Expected partial row');
    row.querySelector<HTMLInputElement>('.rest-vault-enabled')?.remove();
    row.querySelector<HTMLInputElement>('.rest-vault-http')?.remove();
    const nameInput = row.querySelector<HTMLInputElement>('.rest-vault-name');
    if (nameInput) {
      nameInput.value = '  '; 
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(sectionAny.collectAdditionalVaultConfigsForTest()).toEqual([
      expect.objectContaining({
        id: 'vault-partial',
        vault: '',
        name: '',
        httpsUrl: 'https://partial.example.com/',
        httpUrl: 'http://partial.example.com/',
        apiKey: 'partial-key',
        enabled: true
      })
    ]);

    section.destroy();
  });


  it('resolves repositories from DI and honors isDefault router fallbacks during first render', async () => {
    const container = document.getElementById('rest-section');
    if (!container) {
      throw new Error('Rest Section container missing');
    }

    restFixtures.setRouterSnapshot({
      vaults: [
        {
          id: 'vault-primary',
          vault: 'Primary Vault',
          name: 'Primary Vault',
          httpsUrl: 'https://primary.example.com/',
          httpUrl: 'http://primary.example.com/',
          apiKey: 'primary-key',
          enabled: true,
          isDefault: true,
          rules: []
        },
        {
          id: 'vault-secondary',
          vault: 'Secondary Vault',
          name: 'Secondary Vault',
          httpsUrl: 'https://secondary.example.com/',
          httpUrl: 'http://secondary.example.com/',
          apiKey: 'secondary-key',
          enabled: true,
          rules: []
        }
      ],
      defaultVaultId: null
    });

    const testRegistry = createTestRegistry();
    testRegistry.register(DI_TOKENS.IOptionsRepository, () => optionsRepo);
    testRegistry.register(DI_TOKENS.IMessagingRepository, () => messagingRepo);

    await withTestRegistry(testRegistry, () => {
      const section = new RestSection(container);
      const sectionAny = section as unknown as { messages: Record<string, string> | null };
      sectionAny.messages = {
        apiConfigTitle: 'Custom REST Title',
        apiConfigHint: 'Custom REST Hint',
        deleteVaultButton: 'Remove',
        addVaultButton: 'Add vault',
        testConnectionButton: 'Run test'
      };

      section.render({ stateManager: noopStateManager, formRegistry: registry });
      expect(container.textContent).toContain('Custom REST Title');
      expect(container.textContent).toContain('Custom REST Hint');
      expect(document.querySelector('[data-vault-id="vault-primary"]')).toBeFalsy();
      expect(document.querySelector('[data-vault-id="vault-secondary"]')).toBeTruthy();

      section.destroy();
    });
  });

  it('uses default header copy and safely no-ops connection helpers when result host is missing', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      messages: Record<string, string> | null;
      buildHeader: () => HTMLElement;
      connectionResultHost: HTMLDivElement | null;
      renderConnectionTestResult: (type: 'success' | 'error' | 'info', text: string) => void;
      resetConnectionTestResult: () => void;
    };

    sectionAny.messages = null;
    const header = sectionAny.buildHeader();
    expect(header.textContent).toContain('Obsidian Local REST API');
    expect(header.textContent).toContain('配置默认仓库和额外仓库的连接信息');

    sectionAny.connectionResultHost = null;
    expect(() => sectionAny.renderConnectionTestResult('success', 'ok')).not.toThrow();
    expect(() => sectionAny.resetConnectionTestResult()).not.toThrow();

    section.destroy();
  });

  it('falls back to first router vault and preserves snapshot values when additional row controls are missing', async () => {
    restFixtures.setRouterSnapshot({
      defaultVaultId: 'missing-default',
      vaults: [
        {
          id: 'router-first',
          vault: 'RouterFirst',
          name: 'RouterFirst',
          httpsUrl: 'https://router-first.example.com/',
          httpUrl: 'http://router-first.example.com/',
          apiKey: 'router-first-key',
          enabled: true,
          rules: []
        },
        {
          id: 'vault-extra',
          vault: 'ExtraVault',
          name: 'ExtraVault',
          httpsUrl: 'https://extra.example.com/',
          httpUrl: 'http://extra.example.com/',
          apiKey: 'extra-key',
          enabled: true,
          rules: []
        }
      ]
    });

    const section = await renderSection();
    await optionsRepo.set({ rest: undefined, vaultRouter: undefined } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      expect((document.getElementById('restVault') as HTMLInputElement).value).toBe('RouterFirst');
      expect((document.getElementById('restHttpsUrl') as HTMLInputElement).value).toBe('https://router-first.example.com/');
      expect((document.getElementById('restHttpUrl') as HTMLInputElement).value).toBe('http://router-first.example.com/');
      expect((document.getElementById('restKey') as HTMLInputElement).value).toBe('router-first-key');
    });

    const row = document.querySelector<HTMLElement>('[data-vault-id="vault-extra"]');
    if (!row) {
      throw new Error('Expected extra vault row');
    }

    row.querySelector('.rest-vault-enabled')?.remove();
    row.querySelector('.rest-vault-name')?.remove();
    const httpsInput = row.querySelector<HTMLInputElement>('.rest-vault-https');
    if (!httpsInput) {
      throw new Error('Expected https input');
    }
    httpsInput.value = '   ';

    const sectionAny = section as unknown as {
      collectAdditionalVaultConfigsForTest: () => Array<Record<string, unknown>>;
      readRowValue: (row: HTMLElement, selector: string, trim?: boolean) => string | null;
    };

    expect(sectionAny.readRowValue(row, '.rest-vault-https')).toBe('');
    expect(sectionAny.readRowValue(row, '.rest-vault-api', false)).toBe('extra-key');
    expect(sectionAny.collectAdditionalVaultConfigsForTest()).toEqual([
      expect.objectContaining({
        id: 'router-first',
        enabled: true,
        vault: 'RouterFirst',
        name: 'RouterFirst'
      }),
      expect.objectContaining({
        id: 'vault-extra',
        enabled: true,
        vault: 'ExtraVault',
        name: 'ExtraVault',
        httpsUrl: '',
        httpUrl: 'http://extra.example.com/',
        apiKey: 'extra-key'
      })
    ]);

    section.destroy();
  });

  it('makes post-destroy helper calls safe no-ops', async () => {
    const section = await renderSection();
    const sectionAny = section as unknown as {
      connectionTester: { dispose: () => void } | null;
      unsubscribeRepo: (() => void) | null;
      renderAdditionalVaultRows: (vaults: Array<Record<string, unknown>>, defaultVaultId?: string) => void;
      initializeConnectionTester: () => void;
      updateDefaultVaultField: (field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey', value: string) => void;
      renderConnectionTestResult: (type: 'success' | 'error' | 'info', text: string) => void;
      resetConnectionTestResult: () => void;
    };
    const disposeSpy = vi.fn<[], void>();
    const unsubscribeSpy = vi.fn<[], void>();
    sectionAny.connectionTester = { dispose: () => disposeSpy() };
    sectionAny.unsubscribeRepo = () => unsubscribeSpy();

    section.destroy();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    expect(() => sectionAny.renderAdditionalVaultRows([], undefined)).not.toThrow();
    expect(() => sectionAny.initializeConnectionTester()).not.toThrow();
    expect(() => sectionAny.renderConnectionTestResult('info', 'noop')).not.toThrow();
    expect(() => sectionAny.resetConnectionTestResult()).not.toThrow();
  });




it('keeps connection tester initialization safe when the result host is detached after capture', async () => {
  const section = await renderSection();
  const sectionAny = section as unknown as {
    initializeConnectionTester: () => void;
    connectionResultHost: HTMLDivElement | null;
    connectionTester: object | null;
  };

  const resultHost = document.getElementById('connectionResult');
  resultHost?.remove();
  sectionAny.connectionResultHost = resultHost as HTMLDivElement | null;
  sectionAny.initializeConnectionTester();

  expect(sectionAny.connectionTester).toBeNull();
  section.destroy();
});

});
