/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../../../src/platform/interfaces/storage';

const showStatusMessageMock = vi.hoisted(() => vi.fn());
const showTransferMessageMock = vi.hoisted(() => vi.fn());
const clearTransferMessageMock = vi.hoisted(() => vi.fn());
const formatOptionsErrorMock = vi.hoisted(() => vi.fn((error) => String(error)));
const getOptionsMessagesMock = vi.hoisted(() =>
  vi.fn(() =>
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
const consumePendingAutoSaveSourceMock = vi.hoisted(() => vi.fn(() => 'yamlConfig'));
const consumeYamlMigrationNoticeMock = vi.hoisted(() => vi.fn(() => null));
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
const mountExperimentalShellMock = vi.hoisted(() => vi.fn());
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
const exportAnalyticsTransferPayloadMock = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
const applyAnalyticsTransferPayloadMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const modalDisposeMock = vi.hoisted(() => vi.fn());
const navigationDisposeMock = vi.hoisted(() => vi.fn());
const ModalControllerMock = vi.hoisted(() =>
  vi.fn().mockImplementation(() => ({ dispose: modalDisposeMock }))
);
const NavigationControllerMock = vi.hoisted(() =>
  vi.fn().mockImplementation(() => ({ dispose: navigationDisposeMock }))
);
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
vi.mock('../../../src/options/components/infrastructure/ModalController', () => ({
  ModalController: ModalControllerMock
}));
vi.mock('../../../src/options/components/layout/NavigationController', () => ({
  NavigationController: NavigationControllerMock
}));
vi.mock('../../../src/options/app/experimentalShell', () => ({
  mountExperimentalShell: mountExperimentalShellMock
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

describe('options bootstrap', () => {
  beforeEach(() => {
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
    mountExperimentalShellMock.mockResolvedValue(createShell());
    i18nGetCurrentResourceMock.mockReturnValue({ language: 'en', messages: {} });
    controllerLoadInitialStateMock.mockResolvedValue({ some: 'state' });
    controllerApplyToFormMock.mockResolvedValue(undefined);
    controllerSaveSnapshotMock.mockResolvedValue(undefined);
    controllerReadFormMock.mockReturnValue({ some: 'state' });
    consumeYamlMigrationNoticeMock.mockReturnValue(null);
    consumePendingAutoSaveSourceMock.mockReturnValue('yamlConfig');
    highlightFragmentShortcutsMock.mockReturnValue(true);
    vi.clearAllMocks();
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

  it('bootstraps shell, controller, and theme switcher', async () => {
    await bootstrapOptionsApp();

    expect(createDefaultPageI18nControllerMock).toHaveBeenCalledTimes(1);
    expect(themeInitMock).toHaveBeenCalledTimes(1);
    expect(createOptionsControllerMock).toHaveBeenCalledTimes(1);
    expect(registerOptionsControllerMock).toHaveBeenCalledTimes(1);
    expect(configureOptionsActionsMock).toHaveBeenCalledTimes(1);
    expect(controllerLoadInitialStateMock).toHaveBeenCalledTimes(1);
    expect(controllerApplyToFormMock).toHaveBeenCalledWith({ some: 'state' });
    expect(shellMountSectionMock).toHaveBeenCalledWith('rest', { activate: true });
    expect(shellNavigateToMock).not.toHaveBeenCalled();
    expect(shellMountAllMock).toHaveBeenCalledTimes(1);
    expect(shellConfigureUIMock).toHaveBeenCalledTimes(1);
    expect(clearTransferMessageMock).toHaveBeenCalledTimes(1);
  });

  it('shows migration notice and navigates when active section mismatches', async () => {
    consumeYamlMigrationNoticeMock.mockReturnValue('yamlConfigMigrated');
    mountExperimentalShellMock.mockResolvedValue(
      createShell({ activeSection: 'yaml', initialSection: 'rest' })
    );

    await bootstrapOptionsApp();

    expect(showStatusMessageMock).toHaveBeenCalledWith('success', {
      key: 'yamlConfigMigrated',
      text: 'Migrated'
    });
    expect(shellNavigateToMock).toHaveBeenCalledWith('rest');
  });

  it('falls back to modal and navigation controllers when shell is unavailable', async () => {
    mountExperimentalShellMock.mockResolvedValue(null);

    await bootstrapOptionsApp();

    expect(ModalControllerMock).toHaveBeenCalledTimes(1);
    expect(NavigationControllerMock).toHaveBeenCalledTimes(1);
    expect(shellPreloadMock).not.toHaveBeenCalled();
    expect(shellMountSectionMock).not.toHaveBeenCalled();
    expect(shellMountAllMock).not.toHaveBeenCalled();
    expect(shellNavigateToMock).not.toHaveBeenCalled();
    expect(shellConfigureUIMock).not.toHaveBeenCalled();

    const modalCalls = ModalControllerMock.mock.calls as Array<
      [{ bindings: Array<{ modalId: string; onOpen?: () => void; onClose?: () => void }> }]
    >;
    const [modalConfig] = modalCalls[0] ?? [];
    const suggestionsBinding = modalConfig?.bindings.find(
      (binding) => binding.modalId === 'suggestionsModal'
    );
    const qrContainer = document.querySelector<HTMLElement>('#suggestionsXhsQr');
    const trigger = document.querySelector<HTMLButtonElement>('#suggestionsXhsTrigger');

    expect(suggestionsBinding).toBeTruthy();
    suggestionsBinding?.onOpen?.();
    trigger?.click();
    expect(qrContainer?.hasAttribute('hidden')).toBe(false);
    suggestionsBinding?.onClose?.();
    expect(qrContainer?.hasAttribute('hidden')).toBe(true);
  });

  it('loads changelog content when version modal opens in shell fallback mode', async () => {
    mountExperimentalShellMock.mockResolvedValue(null);
    i18nGetCurrentResourceMock.mockReturnValue({ language: 'en', messages: {} });

    await bootstrapOptionsApp();

    const modalCalls = ModalControllerMock.mock.calls as Array<
      [{ bindings: Array<{ modalId: string; onOpen?: () => Promise<void> | void }> }]
    >;
    const [modalConfig] = modalCalls[0] ?? [];
    const versionBinding = modalConfig?.bindings.find(
      (binding) => binding.modalId === 'changelogModal'
    );
    expect(versionBinding).toBeTruthy();

    await versionBinding?.onOpen?.();

    expect(document.getElementById('changelogContent')?.innerHTML ?? '').toContain(
      'Dual URL Configuration'
    );
  });

  it('warns and skips theme initialization when switcher container is missing', async () => {
    document.getElementById('theme-switcher')?.remove();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await bootstrapOptionsApp();

    expect(warnSpy).toHaveBeenCalledWith('[Options] Theme switcher container not found');
    expect(themeInitMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('handles section and shortcut hashes after bootstrap', async () => {
    vi.useFakeTimers();
    window.location.hash = '#section-yaml';

    await bootstrapOptionsApp();
    await vi.advanceTimersByTimeAsync(250);

    expect(shellNavigateToMock).toHaveBeenCalledWith('yaml');

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

  it('cleans up runtime on beforeunload and on repeated bootstrap', async () => {
    await bootstrapOptionsApp();

    const shellCallsBeforeUnload = shellCleanupMock.mock.calls.length;
    const controllerCallsBeforeUnload = controllerDisposeMock.mock.calls.length;
    const themeCallsBeforeUnload = themeDestroyMock.mock.calls.length;

    window.dispatchEvent(new Event('beforeunload'));

    expect(shellCleanupMock).toHaveBeenCalledTimes(shellCallsBeforeUnload + 1);
    expect(controllerDisposeMock).toHaveBeenCalledTimes(controllerCallsBeforeUnload + 1);
    expect(themeDestroyMock).toHaveBeenCalledTimes(themeCallsBeforeUnload + 1);

    const bootstrapCallsBeforeRepeat = createOptionsControllerMock.mock.calls.length;
    const shellCallsBeforeRepeat = shellCleanupMock.mock.calls.length;
    const controllerCallsBeforeRepeat = controllerDisposeMock.mock.calls.length;

    await bootstrapOptionsApp();
    await bootstrapOptionsApp();

    expect(createOptionsControllerMock).toHaveBeenCalledTimes(bootstrapCallsBeforeRepeat + 2);
    expect(shellCleanupMock.mock.calls.length).toBeGreaterThan(shellCallsBeforeRepeat);
    expect(controllerDisposeMock.mock.calls.length).toBeGreaterThan(controllerCallsBeforeRepeat);
  });

  it('wires configured actions for language, save, copy, import, reload and fix', async () => {
    parseConfigInputMock.mockReturnValue({
      options: { imported: true },
      analytics: { enabled: true }
    });
    readConfigTextFromClipboardMock.mockResolvedValue('{"options":{}}');
    exportAnalyticsTransferPayloadMock.mockResolvedValue({ provider: 'ga' });

    await bootstrapOptionsApp();

    const configureCalls = configureOptionsActionsMock.mock.calls as Array<
      [
        {
          changeLanguage: (language: string) => Promise<string>;
          copyConfig: () => Promise<void>;
          importConfig: () => Promise<void>;
          saveOptions: () => Promise<void>;
          reloadDiagnostics: () => Promise<void>;
          fixConfiguration: () => Promise<void>;
          runDiagnostics: () => Promise<void>;
        }
      ]
    >;
    const [actions] = configureCalls[0] ?? [];

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
    const copyCalls = copyOptionsToClipboardMock.mock.calls as unknown as Array<
      [
        {
          version: number;
          analytics?: { provider: string };
          options: Record<string, unknown>;
        }
      ]
    >;
    const [copyPayload] = copyCalls[0] ?? [];
    expect(copyPayload).toMatchObject({
      version: 1,
      analytics: { provider: 'ga' },
      options: { some: 'state' }
    });
    expect(applyAnalyticsTransferPayloadMock).toHaveBeenCalledWith({ enabled: true });
    const saveCalls = controllerSaveSnapshotMock.mock.calls as unknown as Array<
      [{ reason: string; draft?: Record<string, unknown> }]
    >;
    const [importSaveCall] = saveCalls[0] ?? [];
    const [manualSaveCall] = saveCalls[1] ?? [];
    expect(importSaveCall).toMatchObject({ reason: 'import', draft: { imported: true } });
    expect(manualSaveCall).toEqual({ reason: 'manual' });
    expect(savePrivacySettingsMock).toHaveBeenCalledWith({ showInlineStatus: false });
    expect(runDiagnosticsMock).toHaveBeenCalledTimes(2);
    expect(fixConfigurationMock).toHaveBeenCalledTimes(1);
    expect(showTransferMessageMock).toHaveBeenCalledWith('success', {
      key: 'copyConfigSuccess',
      text: 'Copied'
    });
    expect(showTransferMessageMock).toHaveBeenCalledWith('success', {
      key: 'importSuccess',
      text: 'Imported'
    });
    expect(showStatusMessageMock).toHaveBeenCalledWith('success', {
      key: 'importSuccess',
      text: 'Imported'
    });
    expect(showStatusMessageMock).toHaveBeenCalledWith('success', {
      key: 'saveSuccess',
      text: 'Saved'
    });
  });

  it('shows transfer error when copying config fails', async () => {
    copyOptionsToClipboardMock.mockRejectedValueOnce(new Error('clipboard blocked'));
    exportAnalyticsTransferPayloadMock.mockResolvedValue({ provider: 'ga' });

    await bootstrapOptionsApp();

    const configureCalls = configureOptionsActionsMock.mock.calls as Array<
      [{ copyConfig: () => Promise<void> }]
    >;
    const [actions] = configureCalls[0] ?? [];

    await actions.copyConfig();

    expect(showTransferMessageMock).toHaveBeenCalledWith('error', 'Error: clipboard blocked');
  });

  it('shows transfer error and skips persistence when importing config fails', async () => {
    readConfigTextFromClipboardMock.mockResolvedValueOnce('{bad json');
    parseConfigInputMock.mockImplementationOnce(() => {
      throw new Error('invalid config');
    });

    await bootstrapOptionsApp();

    const configureCalls = configureOptionsActionsMock.mock.calls as Array<
      [{ importConfig: () => Promise<void> }]
    >;
    const [actions] = configureCalls[0] ?? [];

    await actions.importConfig();

    expect(showTransferMessageMock).toHaveBeenCalledWith('error', 'Error: invalid config');
    expect(controllerSaveSnapshotMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'import' })
    );
    expect(applyAnalyticsTransferPayloadMock).not.toHaveBeenCalled();
  });

  it('shows save error status when privacy settings persistence fails after save', async () => {
    await bootstrapOptionsApp();
    savePrivacySettingsMock.mockRejectedValueOnce(new Error('privacy save failed'));

    const configureCalls = configureOptionsActionsMock.mock.calls as Array<
      [{ saveOptions: () => Promise<void> }]
    >;
    const [actions] = configureCalls[0] ?? [];

    await actions.saveOptions();

    expect(showStatusMessageMock).toHaveBeenCalledWith(
      'error',
      'Save failed: Error: privacy save failed'
    );
  });

  it('shows save error status when manual save fails', async () => {
    await bootstrapOptionsApp();
    controllerSaveSnapshotMock.mockRejectedValueOnce(new Error('manual save failed'));

    const configureCalls = configureOptionsActionsMock.mock.calls as Array<
      [{ saveOptions: () => Promise<void> }]
    >;
    const [actions] = configureCalls[0] ?? [];

    await actions.saveOptions();

    expect(showStatusMessageMock).toHaveBeenCalledWith(
      'error',
      'Save failed: Error: manual save failed'
    );
  });

  it('ignores unknown auto-save sources without showing status notice', async () => {
    const { showAutoSaveNotice } = await import('../../../src/options/app/bootstrap');
    await showAutoSaveNotice('rest');
    expect(showStatusMessageMock).not.toHaveBeenCalled();
  });

  it('shows template autosave notices and ignores null pending sources', async () => {
    const { showAutoSaveNotice } = await import('../../../src/options/app/bootstrap');

    consumePendingAutoSaveSourceMock.mockReturnValueOnce('templates');
    await showAutoSaveNotice(consumePendingAutoSaveSourceMock());
    expect(showStatusMessageMock).toHaveBeenCalledWith('success', {
      key: 'templatesAutoSaved',
      text: 'Templates saved'
    });

    showStatusMessageMock.mockClear();
    consumePendingAutoSaveSourceMock.mockReturnValueOnce(null);
    await showAutoSaveNotice(consumePendingAutoSaveSourceMock());
    expect(showStatusMessageMock).not.toHaveBeenCalled();
  });

  it('logs auto-save failures, ignores manual auto-save errors, and skips null autosave sources', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await bootstrapOptionsApp();

    const config = createOptionsControllerMock.mock.calls[0]?.[0] as {
      onSaveError: (reason: string, error: Error) => void;
      onSaveSuccess: (reason: string) => void;
    };

    config.onSaveError('auto', new Error('auto failed'));
    config.onSaveError('manual', new Error('manual failed'));
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[options] Auto-save failed:', expect.any(Error));

    showStatusMessageMock.mockClear();
    consumePendingAutoSaveSourceMock.mockReturnValueOnce(null);
    config.onSaveSuccess('auto');
    config.onSaveSuccess('manual');
    await Promise.resolve();
    expect(showStatusMessageMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('warns when section preload rejects and catches cleanup failures during repeated bootstrap', async () => {
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

    await bootstrapOptionsApp();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Options] 卸载 shell 时出错:', expect.any(Error));
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('falls back to default auto-save copy when i18n messages omit notice labels', async () => {
    getOptionsMessagesMock.mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof getOptionsMessagesMock>>
    );
    await showAutoSaveNotice('yamlConfig');

    getOptionsMessagesMock.mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof getOptionsMessagesMock>>
    );
    await showAutoSaveNotice('templates');

    expect(showStatusMessageMock).toHaveBeenNthCalledWith(1, 'success', {
      key: 'yamlConfigAutoSaved',
      text: 'YAML field configuration changes saved.'
    });
    expect(showStatusMessageMock).toHaveBeenNthCalledWith(2, 'success', {
      key: 'templatesAutoSaved',
      text: 'Template settings saved automatically.'
    });
  });

  it('returns requested language when refreshed resource has no language and falls back changelog to zh-CN', async () => {
    i18nGetCurrentResourceMock
      .mockReturnValueOnce({ language: 'en', messages: {} })
      .mockReturnValueOnce({} as Awaited<ReturnType<typeof i18nGetCurrentResourceMock>>)
      .mockReturnValueOnce({ language: 'fr', messages: {} });
    mountExperimentalShellMock.mockResolvedValue(null);

    await bootstrapOptionsApp();

    const configureCalls = configureOptionsActionsMock.mock.calls as Array<
      [
        {
          changeLanguage: (language: string) => Promise<string>;
        }
      ]
    >;
    const [actions] = configureCalls[0] ?? [];

    await expect(actions.changeLanguage('ja')).resolves.toBe('fr');

    const modalCalls = ModalControllerMock.mock.calls as Array<
      [{ bindings: Array<{ modalId: string; onOpen?: () => Promise<void> | void }> }]
    >;
    const [modalConfig] = modalCalls[0] ?? [];
    const versionBinding = modalConfig?.bindings.find(
      (binding) => binding.modalId === 'changelogModal'
    );
    await versionBinding?.onOpen?.();

    expect(document.getElementById('changelogContent')?.innerHTML ?? '').toContain(
      'Dual URL Configuration'
    );
  });

  it('skips changelog rendering when modal opens without a changelog host', async () => {
    document.getElementById('changelogContent')?.remove();
    mountExperimentalShellMock.mockResolvedValue(null);

    await bootstrapOptionsApp();

    const modalCalls = ModalControllerMock.mock.calls as Array<
      [
        {
          bindings: Array<{ modalId: string; onOpen?: () => Promise<void> | void }>;
        }
      ]
    >;
    const [modalConfig] = modalCalls[0] ?? [];
    const versionBinding = modalConfig?.bindings.find(
      (binding) => binding.modalId === 'changelogModal'
    );
    await expect(versionBinding?.onOpen?.()).resolves.toBeUndefined();
  });

  it('keeps suggestions modal binding safe when modal host is missing in shell fallback mode', async () => {
    document.getElementById('suggestionsModal')?.remove();
    mountExperimentalShellMock.mockResolvedValue(null);

    await bootstrapOptionsApp();

    const modalCalls = ModalControllerMock.mock.calls as Array<
      [{ bindings: Array<{ modalId: string; onOpen?: () => void; onClose?: () => void }> }]
    >;
    const [modalConfig] = modalCalls[0] ?? [];
    const suggestionsBinding = modalConfig?.bindings.find(
      (binding) => binding.modalId === 'suggestionsModal'
    );

    expect(() => suggestionsBinding?.onOpen?.()).not.toThrow();
    expect(() => suggestionsBinding?.onClose?.()).not.toThrow();
  });
});
