/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../../../src/platform/interfaces/storage';

const showStatusMessageMock = vi.hoisted(() => vi.fn());
const showTransferMessageMock = vi.hoisted(() => vi.fn());
const clearTransferMessageMock = vi.hoisted(() => vi.fn());
const formatOptionsErrorMock = vi.hoisted(() => vi.fn((error) => String(error)));
const getOptionsMessagesMock = vi.hoisted(() =>
  vi.fn<[], Promise<Record<string, string>>>(() =>
    Promise.resolve({
      yamlConfigAutoSaved: 'YAML saved',
      templatesAutoSaved: 'Templates saved',
      yamlConfigMigrated: 'Migrated',
      copyConfigSuccess: 'Copied',
      importSuccess: 'Imported',
      saveSuccess: 'Saved',
      saveFailed: 'Save failed'
    })
  )
);
const consumePendingAutoSaveSourceMock = vi.hoisted(() =>
  vi.fn<[], string | null>(() => 'yamlConfig')
);
const consumeYamlMigrationNoticeMock = vi.hoisted(() => vi.fn<[], string | null>(() => null));
const registerOptionsControllerMock = vi.hoisted(() => vi.fn());
const configureOptionsActionsMock = vi.hoisted(() => vi.fn());
const refreshPrivacySettingsMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const savePrivacySettingsMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const highlightFragmentShortcutsMock = vi.hoisted(() => vi.fn(() => true));
const shellGetMountedSectionMock = vi.hoisted(() =>
  vi.fn((sectionId: string) => {
    if (sectionId === 'privacy') {
      return { refreshSettings: refreshPrivacySettingsMock, saveSettings: savePrivacySettingsMock };
    }
    if (sectionId === 'fragment') {
      return { highlightKeyboardShortcuts: highlightFragmentShortcutsMock };
    }
    return null;
  })
);
const runDiagnosticsMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const fixConfigurationMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const themeInitMock = vi.hoisted(() => vi.fn());
const themeDestroyMock = vi.hoisted(() => vi.fn());
const shellCleanupMock = vi.hoisted(() => vi.fn());
const shellPreloadMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const shellMountSectionMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const shellNavigateToMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const shellMountAllMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const shellConfigureUIMock = vi.hoisted(() => vi.fn());
const mountOptionsShellMock = vi.hoisted(() => vi.fn());
const controllerDisposeMock = vi.hoisted(() => vi.fn());
const controllerLoadInitialStateMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ some: 'state' }))
);
const controllerApplyToFormMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const controllerReadFormMock = vi.hoisted(() => vi.fn(() => ({ some: 'state' })));
const controllerSaveSnapshotMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const createOptionsControllerMock = vi.hoisted(() =>
  vi.fn((_config) => ({
    dispose: controllerDisposeMock,
    loadInitialState: controllerLoadInitialStateMock,
    applyToForm: controllerApplyToFormMock,
    readForm: controllerReadFormMock,
    saveSnapshot: controllerSaveSnapshotMock
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
const copyOptionsToClipboardMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const parseConfigInputMock = vi.hoisted(() => vi.fn());
const readConfigTextFromClipboardMock = vi.hoisted(() => vi.fn(() => Promise.resolve('')));
const exportAnalyticsTransferPayloadMock = vi.hoisted(() =>
  vi.fn<[], Promise<{ provider: string } | null>>(() => Promise.resolve(null))
);
const applyAnalyticsTransferPayloadMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const storageMock = {
  sync: { kind: 'sync' },
  local: { kind: 'local' }
} as unknown as StorageService;

const createShell = (
  overrides: Partial<{ activeSection: string; initialSection: string }> = {}
) => ({
  stateManager: { getState: () => ({ activeSection: overrides.activeSection ?? 'rest' }) },
  initialSection: overrides.initialSection ?? 'rest',
  preloadSections: shellPreloadMock,
  mountSection: shellMountSectionMock,
  navigateTo: shellNavigateToMock,
  mountAllSections: shellMountAllMock,
  configureUI: shellConfigureUIMock,
  cleanup: shellCleanupMock,
  getMountedSection: shellGetMountedSectionMock
});

vi.mock('../../../src/i18n', () => ({
  createDefaultPageI18nController: createDefaultPageI18nControllerMock,
  configureI18nStorage: configureI18nStorageMock
}));
vi.mock('../../../src/options/components/messages', () => ({
  showTransferMessage: showTransferMessageMock,
  clearTransferMessage: clearTransferMessageMock,
  showStatusMessage: showStatusMessageMock,
  formatOptionsError: formatOptionsErrorMock
}));
vi.mock('../../../src/options/components/diagnostics', () => ({
  runDiagnostics: runDiagnosticsMock,
  fixConfiguration: fixConfigurationMock
}));
vi.mock('../../../src/options/services/configTransfer', () => ({
  copyOptionsToClipboard: copyOptionsToClipboardMock,
  parseConfigInput: parseConfigInputMock,
  readConfigTextFromClipboard: readConfigTextFromClipboardMock
}));
vi.mock('../../../src/options/state/optionsStore', () => ({
  consumeYamlMigrationNotice: consumeYamlMigrationNoticeMock
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
  exportAnalyticsTransferPayload: exportAnalyticsTransferPayloadMock,
  applyAnalyticsTransferPayload: applyAnalyticsTransferPayloadMock
}));
vi.mock('../../../src/options/app/optionsShell', () => ({
  mountOptionsShell: mountOptionsShellMock
}));
vi.mock('../../../src/options/app/optionsActions', () => ({
  configureOptionsActions: configureOptionsActionsMock
}));
vi.mock('../../../src/options/components/formSections/formSectionManager', () => ({
  FormSectionRegistry: vi.fn().mockImplementation(() => ({ clear: vi.fn() }))
}));
vi.mock('../../../src/ui/domains/theme/ThemeSwitcher', () => ({
  ThemeSwitcher: vi.fn().mockImplementation(() => ({
    init: themeInitMock,
    destroy: themeDestroyMock
  }))
}));

import {
  bootstrapOptionsApp,
  configureOptionsAppBootstrapStorage,
  showAutoSaveNotice
} from '@options/app/bootstrap';

function getModalBindings() {
  const configureCalls = shellConfigureUIMock.mock.calls as Array<
    [{ modalBindings: Array<{ modalId: string; onOpen?: () => Promise<void> | void; onClose?: () => void }> }]
  >;
  return configureCalls[0]?.[0]?.modalBindings ?? [];
}

describe('options bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="theme-switcher"></div>
      <div id="supportLink"></div>
      <div id="suggestionsLink"></div>
      <div id="contactLink"></div>
      <div id="versionLink"></div>
      <div id="suggestionsModal"><button id="suggestionsXhsTrigger"></button><div id="suggestionsXhsQr" hidden></div></div>
      <div id="supportModal"></div>
      <div id="contactModal"></div>
      <div id="changelogModal"></div>
      <div id="changelogContent"></div>
    `;
    window.location.hash = '';
    mountOptionsShellMock.mockResolvedValue(createShell());
    i18nGetCurrentResourceMock.mockReturnValue({ language: 'en', messages: {} });
    controllerLoadInitialStateMock.mockResolvedValue({ some: 'state' });
    controllerApplyToFormMock.mockResolvedValue(undefined);
    controllerSaveSnapshotMock.mockResolvedValue(undefined);
    controllerReadFormMock.mockReturnValue({ some: 'state' });
    consumeYamlMigrationNoticeMock.mockReturnValue(null);
    consumePendingAutoSaveSourceMock.mockReturnValue('yamlConfig');
    highlightFragmentShortcutsMock.mockReturnValue(true);
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

  it('bootstraps shell, controller, theme switcher, and modal bindings', async () => {
    await bootstrapOptionsApp();

    expect(createDefaultPageI18nControllerMock).toHaveBeenCalledTimes(1);
    expect(themeInitMock).toHaveBeenCalledTimes(1);
    expect(createOptionsControllerMock).toHaveBeenCalledTimes(1);
    expect(registerOptionsControllerMock).toHaveBeenCalledTimes(1);
    expect(mountOptionsShellMock).toHaveBeenCalledTimes(1);
    expect(shellPreloadMock).toHaveBeenCalledWith(['rest', 'routing', 'templates', 'yaml']);
    expect(controllerLoadInitialStateMock).toHaveBeenCalledTimes(1);
    expect(controllerApplyToFormMock).toHaveBeenCalledWith({ some: 'state' });
    expect(shellMountSectionMock).toHaveBeenCalledWith('rest', { activate: true });
    expect(shellMountAllMock).toHaveBeenCalledTimes(1);
    expect(shellConfigureUIMock).toHaveBeenCalledTimes(1);
    expect(clearTransferMessageMock).toHaveBeenCalledTimes(1);

    const suggestionsBinding = getModalBindings().find((binding) => binding.modalId === 'suggestionsModal');
    const qrContainer = document.querySelector<HTMLElement>('#suggestionsXhsQr');
    const trigger = document.querySelector<HTMLButtonElement>('#suggestionsXhsTrigger');

    suggestionsBinding?.onOpen?.();
    trigger?.click();
    expect(qrContainer?.hasAttribute('hidden')).toBe(false);
    suggestionsBinding?.onClose?.();
    expect(qrContainer?.hasAttribute('hidden')).toBe(true);
  });

  it('shows migration notice and navigates when active section mismatches', async () => {
    consumeYamlMigrationNoticeMock.mockReturnValue('yamlConfigMigrated');
    mountOptionsShellMock.mockResolvedValue(createShell({ activeSection: 'yaml', initialSection: 'rest' }));

    await bootstrapOptionsApp();

    expect(showStatusMessageMock).toHaveBeenCalledWith('success', {
      key: 'yamlConfigMigrated',
      text: 'Migrated'
    });
    expect(shellNavigateToMock).toHaveBeenCalledWith('rest');
  });

  it('handles section and shortcut hashes after bootstrap', async () => {
    vi.useFakeTimers();
    window.location.hash = '#section-yaml';

    await bootstrapOptionsApp();
    await vi.advanceTimersByTimeAsync(250);
    expect(shellNavigateToMock).toHaveBeenCalledWith('yaml');

    shellNavigateToMock.mockClear();
    shellMountSectionMock.mockClear();
    window.location.hash = '#shortcuts';
    highlightFragmentShortcutsMock.mockReturnValue(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await bootstrapOptionsApp();
    await vi.advanceTimersByTimeAsync(250);

    expect(shellMountSectionMock).toHaveBeenCalledWith('fragment', { activate: true });
    expect(shellGetMountedSectionMock).toHaveBeenCalledWith('fragment');
    expect(warnSpy).toHaveBeenCalledWith(
      '[Options] Target element for hash "shortcuts" not found via registry'
    );

    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('loads changelog content when version modal opens and skips missing host', async () => {
    i18nGetCurrentResourceMock.mockReturnValue({ language: 'en', messages: {} });
    await bootstrapOptionsApp();

    const versionBinding = getModalBindings().find((binding) => binding.modalId === 'changelogModal');
    await versionBinding?.onOpen?.();
    expect(document.getElementById('changelogContent')?.innerHTML ?? '').toContain(
      'Dual URL Configuration'
    );

    document.getElementById('changelogContent')?.remove();
    await expect(versionBinding?.onOpen?.()).resolves.toBeUndefined();
  });

  it('warns and skips theme initialization when switcher container is missing', async () => {
    document.getElementById('theme-switcher')?.remove();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await bootstrapOptionsApp();

    expect(warnSpy).toHaveBeenCalledWith('[Options] Theme switcher container not found');
    expect(themeInitMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('cleans up runtime on beforeunload and repeated bootstrap', async () => {
    await bootstrapOptionsApp();

    const shellCallsBeforeUnload = shellCleanupMock.mock.calls.length;
    const controllerCallsBeforeUnload = controllerDisposeMock.mock.calls.length;
    const themeCallsBeforeUnload = themeDestroyMock.mock.calls.length;

    window.dispatchEvent(new Event('beforeunload'));

    expect(shellCleanupMock).toHaveBeenCalledTimes(shellCallsBeforeUnload + 1);
    expect(controllerDisposeMock).toHaveBeenCalledTimes(controllerCallsBeforeUnload + 1);
    expect(themeDestroyMock).toHaveBeenCalledTimes(themeCallsBeforeUnload + 1);

    await bootstrapOptionsApp();
    await bootstrapOptionsApp();
    expect(createOptionsControllerMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(shellCleanupMock.mock.calls.length).toBeGreaterThan(shellCallsBeforeUnload + 1);
  });

  it('wires configured actions for language, save, copy, import, reload and fix', async () => {
    parseConfigInputMock.mockReturnValue({
      options: { imported: true },
      analytics: { enabled: true }
    });
    readConfigTextFromClipboardMock.mockResolvedValue('{"options":{}}');
    exportAnalyticsTransferPayloadMock.mockResolvedValue({ provider: 'ga' });

    await bootstrapOptionsApp();

    const [actions] = configureOptionsActionsMock.mock.calls[0] ?? [];
    const changedLanguage = await actions.changeLanguage('zh-CN');
    await actions.copyConfig();
    await actions.importConfig();
    await actions.saveOptions();
    await actions.reloadDiagnostics();
    await actions.fixConfiguration();
    await actions.runDiagnostics();

    expect(changedLanguage).toBe('en');
    expect(i18nChangeLanguageMock).toHaveBeenCalledWith('zh-CN');
    expect(refreshPrivacySettingsMock).toHaveBeenCalled();
    expect(copyOptionsToClipboardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        analytics: { provider: 'ga' },
        options: expect.objectContaining({ some: 'state' })
      })
    );
    expect(applyAnalyticsTransferPayloadMock).toHaveBeenCalledWith({ enabled: true });
    expect(controllerSaveSnapshotMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reason: 'import',
        draft: expect.objectContaining({ imported: true })
      })
    );
    expect(controllerSaveSnapshotMock).toHaveBeenNthCalledWith(2, { reason: 'manual' });
    expect(savePrivacySettingsMock).toHaveBeenCalledWith({ showInlineStatus: false });
    expect(runDiagnosticsMock).toHaveBeenCalledTimes(2);
    expect(fixConfigurationMock).toHaveBeenCalledTimes(1);
  });

  it('shows save and transfer errors through configured actions', async () => {
    await bootstrapOptionsApp();
    const [actions] = configureOptionsActionsMock.mock.calls[0] ?? [];

    copyOptionsToClipboardMock.mockRejectedValueOnce(new Error('clipboard blocked'));
    await actions.copyConfig();
    expect(showTransferMessageMock).toHaveBeenCalledWith('error', 'Error: clipboard blocked');

    controllerSaveSnapshotMock.mockRejectedValueOnce(new Error('manual save failed'));
    await actions.saveOptions();
    expect(showStatusMessageMock).toHaveBeenCalledWith(
      'error',
      'Save failed: Error: manual save failed'
    );
  });

  it('logs auto-save failures, warns on preload failure, and falls back auto-save copy', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    shellPreloadMock.mockRejectedValueOnce(new Error('preload exploded'));
    shellCleanupMock.mockImplementationOnce(() => {
      throw new Error('cleanup exploded');
    });

    await bootstrapOptionsApp();
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Options] Section preload failed:',
      expect.any(Error)
    );

    const config = createOptionsControllerMock.mock.calls[0]?.[0] as {
      onSaveError: (reason: string, error: Error) => void;
    };
    config.onSaveError('auto', new Error('auto failed'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('[options] Auto-save failed:', expect.any(Error));

    getOptionsMessagesMock.mockResolvedValueOnce({});
    await showAutoSaveNotice('yamlConfig');
    getOptionsMessagesMock.mockResolvedValueOnce({});
    await showAutoSaveNotice('templates');

    expect(showStatusMessageMock).toHaveBeenCalledWith('success', {
      key: 'yamlConfigAutoSaved',
      text: 'YAML field configuration changes saved.'
    });
    expect(showStatusMessageMock).toHaveBeenCalledWith('success', {
      key: 'templatesAutoSaved',
      text: 'Template settings saved automatically.'
    });

    await bootstrapOptionsApp();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Options] 卸载 shell 时出错:', expect.any(Error));

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
