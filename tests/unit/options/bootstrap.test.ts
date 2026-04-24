/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../../../src/platform/interfaces/storage';

const showStatusMessageMock = vi.hoisted(() => vi.fn());
const clearTransferMessageMock = vi.hoisted(() => vi.fn());
const getOptionsMessagesMock = vi.hoisted(() =>
  vi.fn<[], Promise<Record<string, string>>>(() =>
    Promise.resolve({
      yamlConfigAutoSaved: 'YAML saved',
      templatesAutoSaved: 'Templates saved'
    })
  )
);
const consumePendingAutoSaveSourceMock = vi.hoisted(() =>
  vi.fn<[], string | null>(() => 'yamlConfig')
);
const registerOptionsControllerMock = vi.hoisted(() => vi.fn());
const configureOptionsActionsMock = vi.hoisted(() => vi.fn());
const mountProductionSchemaShellMock = vi.hoisted(() => vi.fn());
const resolveRepositoryMock = vi.hoisted(() => vi.fn((token: string) => ({ token })));
const controllerDisposeMock = vi.hoisted(() => vi.fn());
const controllerLoadInitialStateMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ some: 'state' }))
);
const controllerApplyToFormMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const controllerReadFormMock = vi.hoisted(() => vi.fn(() => ({ some: 'state' })));
const controllerSaveSnapshotMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const controllerSetSnapshotMock = vi.hoisted(() => vi.fn());
const createOptionsControllerMock = vi.hoisted(() =>
  vi.fn(() => ({
    dispose: controllerDisposeMock,
    loadInitialState: controllerLoadInitialStateMock,
    applyToForm: controllerApplyToFormMock,
    readForm: controllerReadFormMock,
    saveSnapshot: controllerSaveSnapshotMock,
    setSnapshot: controllerSetSnapshotMock
  }))
);
const i18nLoadMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const i18nMountMock = vi.hoisted(() => vi.fn());
const i18nGetBinderMock = vi.hoisted(() => vi.fn(() => ({ bindText: vi.fn() })));
const i18nGetCurrentResourceMock = vi.hoisted(() =>
  vi.fn(() => ({ language: 'en', messages: {} }))
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

vi.mock('../../../src/i18n', () => ({
  createDefaultPageI18nController: createDefaultPageI18nControllerMock,
  configureI18nStorage: configureI18nStorageMock
}));
vi.mock('../../../src/options/components/messages', () => ({
  showTransferMessage: vi.fn(),
  clearTransferMessage: clearTransferMessageMock,
  showStatusMessage: showStatusMessageMock,
  formatOptionsError: vi.fn((error) => String(error))
}));
vi.mock('../../../src/options/components/diagnostics', () => ({
  runDiagnostics: vi.fn(() => Promise.resolve(undefined)),
  fixConfiguration: vi.fn(() => Promise.resolve(undefined))
}));
vi.mock('../../../src/options/services/configTransfer', () => ({
  copyOptionsToClipboard: vi.fn(() => Promise.resolve(undefined)),
  parseConfigInput: vi.fn(),
  readConfigTextFromClipboard: vi.fn(() => Promise.resolve(''))
}));
vi.mock('../../../src/options/state/optionsStore', () => ({
  consumeYamlMigrationNotice: vi.fn(() => null)
}));
vi.mock('../../../src/options/services/persistence', () => ({
  chromeOptionsPersistence: {}
}));
vi.mock('../../../src/options/components/optionsFormAdapter', () => ({
  createOptionsFormAdapter: vi.fn(() => ({}))
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
vi.mock('../../../src/options/services/analyticsTransfer', () => ({
  exportAnalyticsTransferPayload: vi.fn(() => Promise.resolve(null)),
  applyAnalyticsTransferPayload: vi.fn(() => Promise.resolve(undefined))
}));
vi.mock('../../../src/options/app/productionSchemaShell', () => ({
  mountProductionSchemaShell: mountProductionSchemaShellMock
}));
vi.mock('../../../src/options/app/optionsActions', () => ({
  configureOptionsActions: configureOptionsActionsMock
}));
vi.mock('../../../src/shared/di/serviceRegistry', () => ({
  resolveRepository: resolveRepositoryMock
}));
vi.mock('../../../src/shared/di/tokens', () => ({
  DI_TOKENS: {
    IOptionsRepository: 'IOptionsRepository',
    IMessagingRepository: 'IMessagingRepository',
    IYamlRepository: 'IYamlRepository'
  }
}));

import {
  bootstrapOptionsApp,
  configureOptionsAppBootstrapStorage,
  showAutoSaveNotice
} from '@options/app/bootstrap';

describe('options bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('theme-transitioning');
    document.body.innerHTML = '<div id="optionsShellRoot"></div>';
    window.history.replaceState({}, '', '/options.html');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );
    mountProductionSchemaShellMock.mockReturnValue({
      cleanup: vi.fn(),
      collectDraft: vi.fn(() => ({ some: 'state' })),
      refreshOptions: vi.fn(),
      setMessages: vi.fn()
    });
    configureOptionsAppBootstrapStorage(storageMock);
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

  it('defaults to the schema shell mainline', async () => {
    localStorage.setItem('aob-theme', 'dark');

    await bootstrapOptionsApp();

    expect(createDefaultPageI18nControllerMock).toHaveBeenCalledTimes(1);
    expect(createOptionsControllerMock).toHaveBeenCalledTimes(1);
    expect(registerOptionsControllerMock).toHaveBeenCalledTimes(1);
    expect(controllerLoadInitialStateMock).toHaveBeenCalledTimes(1);
    expect(mountProductionSchemaShellMock).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.getElementById('theme-switcher')).toBeNull();
    expect(resolveRepositoryMock).toHaveBeenCalledWith('IOptionsRepository');
    expect(resolveRepositoryMock).toHaveBeenCalledWith('IMessagingRepository');
    expect(resolveRepositoryMock).toHaveBeenCalledWith('IYamlRepository');
    expect(mountProductionSchemaShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        container: document.getElementById('optionsShellRoot'),
        storage: storageMock
      })
    );
  });
});
