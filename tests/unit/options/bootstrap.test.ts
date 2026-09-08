/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositoryContainer } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import type { StorageService } from '../../../src/platform/interfaces/storage';
import type { OptionsControllerDeps } from '../../../src/options/app/optionsControllerTypes';
import type { AutoSaveFailurePresentation } from '../../../src/options/components/messages';

const showStatusMessageMock = vi.hoisted(() => vi.fn());
const showAutoSaveFailureMock = vi.hoisted(() =>
  vi.fn<(presentation: AutoSaveFailurePresentation) => void>()
);
const clearAutoSaveFailureMock = vi.hoisted(() => vi.fn());
const getOptionsMessagesMock = vi.hoisted(() =>
  vi.fn<(...args: []) => Promise<Record<string, string>>>(() =>
    Promise.resolve({
      yamlConfigAutoSaved: 'YAML saved',
      templatesAutoSaved: 'Templates saved',
      yamlConfigMigrated: 'Migrated',
      autosaveQuotaGuidance: 'Shorten the value',
      saveFailed: 'Save failed',
      saveButton: 'Save'
    })
  )
);
const consumePendingAutoSaveSourceMock = vi.hoisted(() =>
  vi.fn<(...args: []) => string | null>(() => 'yamlConfig')
);
const consumeYamlMigrationNoticeMock = vi.hoisted(() =>
  vi.fn<(...args: []) => string | null>(() => null)
);
const registerOptionsControllerMock = vi.hoisted(() => vi.fn());
const mountProductionStitchShellMock = vi.hoisted(() => vi.fn());
const shellCleanupMock = vi.hoisted(() => vi.fn());
const shellRefreshOptionsMock = vi.hoisted(() => vi.fn());
const shellCollectDraftMock = vi.hoisted(() => vi.fn(() => ({ rest: {} })));
const shellSetMessagesMock = vi.hoisted(() => vi.fn());
const controllerDisposeMock = vi.hoisted(() => vi.fn());
const messagingSendMock = vi.hoisted(() =>
  vi.fn<(...args: [unknown]) => Promise<void>>(() => Promise.resolve(undefined))
);
const controllerLoadInitialStateMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ rest: { vault: 'Demo' } }))
);
const controllerScheduleAutoSaveMock = vi.hoisted(() => vi.fn());
const controllerFlushPendingAutoSaveMock = vi.hoisted(() =>
  vi.fn<(...args: []) => Promise<void>>(() => Promise.resolve())
);
const createOptionsControllerMock = vi.hoisted(() =>
  vi.fn<
    (config: OptionsControllerDeps) => {
      dispose: typeof controllerDisposeMock;
      flushPendingAutoSave: typeof controllerFlushPendingAutoSaveMock;
      loadInitialState: typeof controllerLoadInitialStateMock;
      scheduleAutoSave: typeof controllerScheduleAutoSaveMock;
      __config: OptionsControllerDeps;
    }
  >((config) => ({
    dispose: controllerDisposeMock,
    flushPendingAutoSave: controllerFlushPendingAutoSaveMock,
    loadInitialState: controllerLoadInitialStateMock,
    scheduleAutoSave: controllerScheduleAutoSaveMock,
    __config: config
  }))
);
const i18nLoadMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const i18nMountMock = vi.hoisted(() => vi.fn());
const i18nGetBinderMock = vi.hoisted(() => vi.fn(() => ({ bindText: vi.fn() })));
const i18nGetCurrentResourceMock = vi.hoisted(() =>
  vi.fn(() => ({ language: 'en', messages: { extensionSubtitle: 'Production' } }))
);
const i18nChangeLanguageMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const configureI18nStorageMock = vi.hoisted(() => vi.fn());
const createDefaultPageI18nControllerMock = vi.hoisted(() =>
  vi.fn(() => ({
    load: i18nLoadMock,
    mount: i18nMountMock,
    getBinder: i18nGetBinderMock,
    getCurrentResource: i18nGetCurrentResourceMock,
    changeLanguage: i18nChangeLanguageMock
  }))
);

const storageMock = {
  sync: { kind: 'sync' },
  local: { kind: 'local' }
} as unknown as StorageService;

vi.mock('../../../src/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/i18n')>();
  return {
    ...actual,
    createDefaultPageI18nController: createDefaultPageI18nControllerMock,
    configureI18nStorage: configureI18nStorageMock
  };
});
vi.mock('../../../src/options/components/messages', () => ({
  showStatusMessage: showStatusMessageMock,
  showAutoSaveFailure: showAutoSaveFailureMock,
  clearAutoSaveFailure: clearAutoSaveFailureMock
}));
vi.mock('../../../src/options/state/optionsStore', () => ({
  consumeYamlMigrationNotice: consumeYamlMigrationNoticeMock
}));
vi.mock('../../../src/options/services/persistence', () => ({
  chromeOptionsPersistence: {}
}));
vi.mock('../../../src/options/components/optionsFormAdapter', () => ({
  createOptionsFormAdapter: vi.fn(() => ({ read: vi.fn(), apply: vi.fn() }))
}));
vi.mock('../../../src/options/app/optionsController', () => ({
  createOptionsController: createOptionsControllerMock
}));
vi.mock('../../../src/options/app/optionsControllerContext', () => ({
  registerOptionsController: registerOptionsControllerMock,
  consumePendingAutoSaveSource: consumePendingAutoSaveSourceMock
}));
vi.mock('../../../src/options/app/i18nContext', () => ({
  setOptionsI18nContext: vi.fn(),
  getOptionsMessages: getOptionsMessagesMock
}));
vi.mock('../../../src/options/app/productionStitchShell', () => ({
  mountProductionStitchShell: mountProductionStitchShellMock
}));
vi.mock('../../../src/shared/errors/analytics/analyticsConfig', () => ({
  configureAnalyticsConfigManager: vi.fn()
}));
vi.mock('../../../src/shared/state/globalStateManager', () => ({
  configureGlobalStateManagerStorage: vi.fn()
}));

import {
  bootstrapOptionsApp,
  configureOptionsAppBootstrapStorage,
  showAutoSaveNotice
} from '@options/app/bootstrap';

describe('options bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="optionsShellRoot"></div>';
    mountProductionStitchShellMock.mockReturnValue({
      cleanup: shellCleanupMock,
      collectDraft: shellCollectDraftMock,
      refreshOptions: shellRefreshOptionsMock,
      setMessages: shellSetMessagesMock
    });
    controllerLoadInitialStateMock.mockResolvedValue({ rest: { vault: 'Demo' } });
    consumeYamlMigrationNoticeMock.mockReturnValue(null);
    configureOptionsAppBootstrapStorage(storageMock);
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => ({
      get: vi.fn(),
      patch: vi.fn(),
      replace: vi.fn(),
      onChange: vi.fn(() => () => undefined)
    }));
    repositoryContainer.registerSingleton(DI_TOKENS.IMessagingRepository, () => ({
      send: messagingSendMock,
      onMessage: vi.fn(() => () => undefined)
    }));
  });

  it('shows auto-save notices for yamlConfig and templates only', async () => {
    await showAutoSaveNotice('yamlConfig');
    await showAutoSaveNotice('templates');
    await showAutoSaveNotice('other-source');

    expect(showStatusMessageMock).toHaveBeenNthCalledWith(1, 'success', {
      key: 'yamlConfigAutoSaved',
      text: 'YAML saved'
    });
    expect(showStatusMessageMock).toHaveBeenNthCalledWith(2, 'success', {
      key: 'templatesAutoSaved',
      text: 'Templates saved'
    });
    expect(showStatusMessageMock).toHaveBeenCalledTimes(2);
  });

  it('boots the production Stitch shell without the legacy options shell or ThemeSwitcher', async () => {
    await bootstrapOptionsApp();

    expect(createDefaultPageI18nControllerMock).toHaveBeenCalledTimes(1);
    expect(createOptionsControllerMock).toHaveBeenCalledTimes(1);
    expect(registerOptionsControllerMock).toHaveBeenCalledTimes(1);
    expect(mountProductionStitchShellMock).toHaveBeenCalledTimes(1);
    expect(mountProductionStitchShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        controller: expect.any(Object),
        initialOptions: { rest: { vault: 'Demo' } },
        language: 'en',
        messages: { extensionSubtitle: 'Production' }
      })
    );
    expect(shellRefreshOptionsMock).toHaveBeenCalledWith({ rest: { vault: 'Demo' } });

    const source = readFileSync(resolve(process.cwd(), 'src/options/app/bootstrap.ts'), 'utf8');
    expect(source).not.toContain('mountOptionsShell');
    expect(source).not.toContain('ThemeSwitcher');
  });

  it('cleans up the previous Stitch shell before a second bootstrap', async () => {
    await bootstrapOptionsApp();
    const cleanupCallsAfterFirstBootstrap = shellCleanupMock.mock.calls.length;
    await bootstrapOptionsApp();

    expect(shellCleanupMock).toHaveBeenCalledTimes(cleanupCallsAfterFirstBootstrap + 1);
    expect(mountProductionStitchShellMock).toHaveBeenCalledTimes(2);
  });

  it('awaits pending durability before tearing down the mounted shell', async () => {
    await bootstrapOptionsApp();
    const flushCallsBeforeSecondBootstrap = controllerFlushPendingAutoSaveMock.mock.calls.length;
    const cleanupCallsBeforeSecondBootstrap = shellCleanupMock.mock.calls.length;
    let releaseFlush: (() => void) | undefined;
    controllerFlushPendingAutoSaveMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFlush = resolve;
        })
    );

    const secondBootstrap = bootstrapOptionsApp();
    await Promise.resolve();

    expect(controllerFlushPendingAutoSaveMock).toHaveBeenCalledTimes(
      flushCallsBeforeSecondBootstrap + 1
    );
    expect(shellCleanupMock).toHaveBeenCalledTimes(cleanupCallsBeforeSecondBootstrap);

    releaseFlush?.();
    await secondBootstrap;

    expect(shellCleanupMock).toHaveBeenCalledTimes(cleanupCallsBeforeSecondBootstrap + 1);
  });

  it('keeps the live shell mounted when a rebootstrap durability flush fails', async () => {
    await bootstrapOptionsApp();
    const cleanupCallsBeforeSecondBootstrap = shellCleanupMock.mock.calls.length;
    const mountCallsBeforeSecondBootstrap = mountProductionStitchShellMock.mock.calls.length;
    const failure = new Error('OPTIONS_STORAGE_FAILURE');
    controllerFlushPendingAutoSaveMock.mockRejectedValueOnce(failure);

    await expect(bootstrapOptionsApp()).rejects.toBe(failure);

    expect(shellCleanupMock).toHaveBeenCalledTimes(cleanupCallsBeforeSecondBootstrap);
    expect(mountProductionStitchShellMock).toHaveBeenCalledTimes(mountCallsBeforeSecondBootstrap);
  });

  it.each(['pagehide', 'beforeunload'])('hands off pending durability on %s', async (eventName) => {
    await bootstrapOptionsApp();
    const callsBeforeExit = controllerFlushPendingAutoSaveMock.mock.calls.length;

    window.dispatchEvent(new Event(eventName));
    await Promise.resolve();

    expect(controllerFlushPendingAutoSaveMock).toHaveBeenCalledTimes(callsBeforeExit + 1);
  });

  it('shows yaml migration notice after initial options refresh', async () => {
    consumeYamlMigrationNoticeMock.mockReturnValue('yamlConfigMigrated');

    await bootstrapOptionsApp();

    expect(showStatusMessageMock).toHaveBeenCalledWith('success', {
      key: 'yamlConfigMigrated',
      text: 'Migrated'
    });
  });

  it('shows a quota-specific autosave alert and clears it only on correlated recovery', async () => {
    const { OptionsMutationError } =
      await import('../../../src/shared/types/optionsMutationMessages');
    await bootstrapOptionsApp();
    const config = createOptionsControllerMock.mock.calls.at(-1)?.[0];
    if (!config) throw new Error('EXPECTED_OPTIONS_CONTROLLER_CONFIG');
    const identity = { intentId: 7, admissionGeneration: 11 };

    config.onSaveError?.('auto', new OptionsMutationError('OPTIONS_QUOTA_EXCEEDED'), identity);
    await vi.waitFor(() => expect(showAutoSaveFailureMock).toHaveBeenCalledOnce());
    expect(showAutoSaveFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { key: 'saveFailed', text: 'Save failed' },
        guidance: { key: 'autosaveQuotaGuidance', text: 'Shorten the value' },
        retryLabel: { key: 'saveButton', text: 'Save' }
      })
    );
    const presentation = showAutoSaveFailureMock.mock.calls[0]?.[0];
    expect(typeof presentation?.retry).toBe('function');

    config.onSaveSuccess?.('auto', {}, { intentId: 6, admissionGeneration: 10 });
    expect(clearAutoSaveFailureMock).not.toHaveBeenCalled();
    config.onAutoSaveRecovered?.({ intentId: 6, admissionGeneration: 10 });
    expect(clearAutoSaveFailureMock).not.toHaveBeenCalled();
    config.onAutoSaveRecovered?.(identity);
    expect(clearAutoSaveFailureMock).toHaveBeenCalledOnce();
  });

  it('clears a reconciled failure while disposing the old controller before rebootstrap', async () => {
    const { OptionsMutationError } =
      await import('../../../src/shared/types/optionsMutationMessages');
    await bootstrapOptionsApp();
    const firstConfig = createOptionsControllerMock.mock.calls.at(-1)?.[0];
    if (!firstConfig) throw new Error('EXPECTED_OPTIONS_CONTROLLER_CONFIG');
    const identity = { intentId: 8, admissionGeneration: 12 };
    firstConfig.onSaveError?.(
      'auto',
      new OptionsMutationError('OPTIONS_STORAGE_FAILURE'),
      identity
    );
    await vi.waitFor(() => expect(showAutoSaveFailureMock).toHaveBeenCalledOnce());
    controllerFlushPendingAutoSaveMock.mockImplementationOnce(() => {
      firstConfig.onAutoSaveRecovered?.(identity);
      return Promise.resolve();
    });

    await bootstrapOptionsApp();

    expect(clearAutoSaveFailureMock).toHaveBeenCalledOnce();
    expect(createOptionsControllerMock).toHaveBeenCalledTimes(2);
    expect(createOptionsControllerMock.mock.calls.at(-1)?.[0]).not.toBe(firstConfig);
    expect(showAutoSaveFailureMock).toHaveBeenCalledOnce();
  });

  it('emits canonical options open telemetry after the Stitch shell mounts', async () => {
    await bootstrapOptionsApp();

    expect(messagingSendMock).toHaveBeenNthCalledWith(1, {
      type: 'ANALYTICS_EVENT',
      event: 'options_opened',
      params: {
        source: 'unknown'
      }
    });
    expect(messagingSendMock).toHaveBeenNthCalledWith(2, {
      type: 'ANALYTICS_EVENT',
      event: 'options_section_viewed',
      params: {
        section: 'overview'
      }
    });

    const emittedEvents = (messagingSendMock.mock.calls as Array<[unknown]>).map(
      ([message]) => (message as { event?: string } | undefined)?.event
    );
    expect(emittedEvents).not.toEqual(
      expect.arrayContaining(['theme_changed', 'language_changed', 'options_resource_viewed'])
    );
  });
});
