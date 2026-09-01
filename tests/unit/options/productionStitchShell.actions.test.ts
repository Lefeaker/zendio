/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyAnalyticsTransferPayloadMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const updateErrorAnalyticsConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const sendAnalyticsDataClearedEventMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const prepareAnalyticsDataClearedEventMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(sendAnalyticsDataClearedEventMock))
);

vi.mock('@options/services/analyticsTransfer', () => ({
  applyAnalyticsTransferPayload: applyAnalyticsTransferPayloadMock
}));
vi.mock('@shared/errors/analytics', () => ({
  updateErrorAnalyticsConfig: updateErrorAnalyticsConfigMock
}));
vi.mock('@options/app/productionStitchFinalAnalyticsEvent', () => ({
  prepareAnalyticsDataClearedEvent: prepareAnalyticsDataClearedEventMock
}));

import {
  analyticsMocks,
  asOptionsController,
  createController,
  createEnglishPageMessages,
  createActionRuntimeHarness,
  createCompleteOptions,
  createMessaging,
  createRepository,
  findCardByTitle,
  findButton,
  findCheckboxInText,
  findInputByValue,
  flushPromises,
  queryRequired,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import * as storageControllerModule from '@options/app/productionStitchStorageController';
import { DEFAULT_RUNTIME_MESSAGES, type Language, type Messages } from '@i18n';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from './productionStitchShell.helpers';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { UsageStats } from '@shared/types/usage';
import type { Message } from '@shared/repositories/IMessagingRepository';
import type { AnalyticsRuntimeEventPayload } from '@shared/types/analytics';
import { getRestDefaults } from '../../utils/restDefaults';

const REST_DEFAULTS = getRestDefaults();
const LOCAL_HTTPS_URL = `https://localhost:${REST_DEFAULTS.httpsPort}`;
const LOCAL_HTTP_URL = `http://localhost:${REST_DEFAULTS.httpPort}`;
const LOCAL_HTTP_CONFLICT_URL = `http://localhost:${REST_DEFAULTS.httpsPort}`;

type CopiedConfiguration = {
  rest?: { apiKey?: string };
  customKey?: object;
};

function deferred<T>() {
  let resolve = (_value: T): void => undefined;
  let reject = (_error: Error): void => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function renderedUsageValues() {
  return Array.from(document.querySelectorAll<HTMLElement>('.stats-grid .stat-value')).map((node) =>
    node.textContent?.trim()
  );
}

function mockStorageConnectionFailure(message: string) {
  const actualFactory = storageControllerModule.createProductionStitchStorageController;
  const factorySpy = vi.spyOn(storageControllerModule, 'createProductionStitchStorageController');
  factorySpy.mockImplementation((options) => ({
    ...actualFactory(options),
    runVaultListConnectionTest: vi.fn(() => Promise.reject(new Error(message)))
  }));
  return factorySpy;
}

describe('mountProductionStitchShell actions', () => {
  beforeEach(() => {
    setupProductionStitchShellTest();
    applyAnalyticsTransferPayloadMock.mockClear();
    updateErrorAnalyticsConfigMock.mockClear();
    prepareAnalyticsDataClearedEventMock.mockClear();
    sendAnalyticsDataClearedEventMock.mockClear();
  });

  it('runs real maintenance actions for copy, diagnostics, and reload', async () => {
    const reloaded = mergeOptions({ rest: { vault: 'Reloaded' } }) as CompleteOptions;
    const loadRaw = vi.fn(() => Promise.resolve(reloaded));
    const controller = {
      ...createController(),
      loadRaw
    };
    const writeText = vi.fn<(...args: [string]) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        aiChat: { userName: 'Before' },
        rest: {
          vault: 'Before Vault',
          apiKey: 'REST_SECRET_TOKEN'
        },
        customKey: { hello: 'world' }
      } as never,
      messages: null,
      language: 'en'
    });

    findButton('Copy Configuration').click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"aiChat"'));
    const writtenConfig = JSON.parse(String(writeText.mock.calls[0]?.[0])) as CopiedConfiguration;
    expect(writtenConfig.rest?.apiKey).toBe('REST_SECRET_TOKEN');
    expect(writtenConfig.customKey).toBeUndefined();

    findButton('Diagnose Configuration').click();
    expect(document.body.textContent).toContain('domainMappings');

    findButton('Reload').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadRaw).toHaveBeenCalledTimes(1);
    expect(findInputByValue('Reloaded')).toBeTruthy();
  });

  it('suppresses late reload DOM and telemetry callbacks after cleanup', async () => {
    const pendingReload = deferred<CompleteOptions>();
    const loadRaw = vi.fn(() => pendingReload.promise);
    const messaging = createMessaging();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController({ ...createController(), loadRaw }),
      initialOptions: null,
      messages: null,
      language: 'en',
      messagingRepository: messaging as never
    });

    findButton('Reload').click();
    expect(loadRaw).toHaveBeenCalledTimes(1);
    mounted.cleanup();
    pendingReload.reject(new Error('late reload failure'));
    await flushPromises();

    expect(document.getElementById('optionsShellRoot')?.innerHTML).toBe('');
    const sendMock = vi.mocked(messaging.send as <Result>(message: Message) => Promise<Result>);
    expect(
      sendMock.mock.calls.some(
        ([message]) =>
          message.type === 'ANALYTICS_EVENT' &&
          message.event === 'options_action_completed' &&
          message.params?.action === 'maintenance_reload'
      )
    ).toBe(false);
  });

  it('does not mutate detached copy/import controls or callbacks after cleanup', async () => {
    const pendingCopy = deferred<void>();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => pendingCopy.promise) }
    });
    const copyMount = mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: null,
      language: 'en'
    });
    const copyButton = findButton('Copy Configuration');

    copyButton.click();
    expect(copyButton.getAttribute('aria-busy')).toBe('true');
    copyMount.cleanup();
    pendingCopy.resolve();
    await flushPromises();

    expect(copyButton.isConnected).toBe(false);
    expect(copyButton.getAttribute('aria-busy')).toBe('true');
    expect(document.getElementById('optionsShellRoot')?.innerHTML).toBe('');

    const pendingImport = deferred<string>();
    const importController = createController();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn(() => pendingImport.promise) }
    });
    const importMount = mountProductionStitchShell({
      controller: asOptionsController(importController),
      initialOptions: null,
      messages: null,
      language: 'en'
    });
    const importButton = findButton('Import and Save');

    importButton.click();
    expect(importButton.getAttribute('aria-busy')).toBe('true');
    importMount.cleanup();
    pendingImport.resolve(JSON.stringify({ options: { aiChat: { userName: 'Late' } } }));
    await flushPromises();

    expect(importButton.isConnected).toBe(false);
    expect(importButton.getAttribute('aria-busy')).toBe('true');
    expect(importController.applyImportedConfig).not.toHaveBeenCalled();
  });

  it('uses localized storage connection error titles when the storage test action throws', async () => {
    const controller = createController();
    const factorySpy = mockStorageConnectionFailure('storage connection failed');

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: {
        schemaStorageConnectionNoticeTitle: 'Connection Result Sentinel'
      } as never,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' }) as never
    });

    findButton('Test Connection').click();
    await flushPromises();

    const vaultList = findCardByTitle('Vault List');
    expect(vaultList.querySelector('.notice strong')?.textContent?.trim()).toBe(
      'Connection Result Sentinel'
    );
    expect(vaultList.textContent).toContain('storage connection failed');

    factorySpy.mockRestore();
  });

  it('falls back to the English storage connection error title when messages are missing', async () => {
    const controller = createController();
    const factorySpy = mockStorageConnectionFailure('storage connection failed');

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' }) as never
    });

    findButton('Test Connection').click();
    await flushPromises();

    const vaultList = findCardByTitle('Vault List');
    expect(vaultList.querySelector('.notice strong')?.textContent?.trim()).toBe(
      'Connection Test Result'
    );
    expect(vaultList.textContent).toContain('storage connection failed');

    factorySpy.mockRestore();
  });

  it('keeps only the latest connection completion and suppresses completion after cleanup', async () => {
    const first = deferred<ConnectionTestResult>();
    const second = deferred<ConnectionTestResult>();
    const late = deferred<ConnectionTestResult>();
    const runConnection = vi
      .fn<() => Promise<ConnectionTestResult>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => late.promise);
    const actualFactory = storageControllerModule.createProductionStitchStorageController;
    const factorySpy = vi
      .spyOn(storageControllerModule, 'createProductionStitchStorageController')
      .mockImplementation((options) => ({
        ...actualFactory(options),
        runVaultListConnectionTest: () => runConnection()
      }));
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: null,
      language: 'en'
    });
    const testButton = findButton('Test Connection');

    testButton.click();
    testButton.click();
    expect(runConnection).toHaveBeenCalledTimes(2);
    second.resolve({ success: true, message: '', error: 'latest connection result' });
    await flushPromises();
    expect(findCardByTitle('Vault List').textContent).toContain('latest connection result');

    first.resolve({ success: false, message: '', error: 'stale connection result' });
    await flushPromises();
    expect(findCardByTitle('Vault List').textContent).not.toContain('stale connection result');

    findButton('Test Connection').click();
    expect(runConnection).toHaveBeenCalledTimes(3);
    mounted.cleanup();
    late.resolve({ success: false, message: '', error: 'disposed connection result' });
    await flushPromises();
    expect(document.getElementById('optionsShellRoot')?.innerHTML).toBe('');
    factorySpy.mockRestore();
  });

  it('reports maintenance copy and import success or failure in the Stitch log', async () => {
    const controller = {
      ...createController(),
      applyImportedConfig: vi.fn(() => Promise.resolve())
    };
    const writeText = vi.fn(() => Promise.resolve());
    const readText = vi.fn(() =>
      Promise.resolve(
        JSON.stringify({ options: { aiChat: { userName: 'Imported' } }, analytics: null })
      )
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText, readText }
    });

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: {
        copyConfigSuccess: 'Copied config',
        importSuccess: 'Imported config'
      } as never,
      language: 'en'
    });

    const copyButton = findButton('Copy Configuration');
    copyButton.click();
    expect(copyButton.getAttribute('aria-busy')).toBe('true');
    await flushPromises();
    expect(document.body.textContent).toContain('Copied config');
    expect(copyButton.hasAttribute('aria-busy')).toBe(false);

    const importButton = findButton('Import and Save');
    importButton.click();
    expect(importButton.getAttribute('aria-busy')).toBe('true');
    await flushPromises();
    expect(controller.applyImportedConfig).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Imported config');
    expect(importButton.hasAttribute('aria-busy')).toBe(false);

    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    copyButton.click();
    await flushPromises();
    expect(document.body.textContent).toContain('Copy failed: Error: clipboard denied');
  });

  it('reports import failure without opening a file picker when clipboard import is unavailable', async () => {
    const controller = {
      ...createController(),
      applyImportedConfig: vi.fn(() => Promise.resolve())
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: {
        importSuccess: 'Imported config'
      } as never,
      language: 'en'
    });

    const importButton = findButton('Import and Save');
    importButton.click();
    expect(importButton.getAttribute('aria-busy')).toBe('true');
    await flushPromises();
    const fileInput = document.querySelector<HTMLInputElement>(
      'input[type="file"][data-stitch-file-import="config"]'
    );
    expect(fileInput).toBeFalsy();
    expect(controller.applyImportedConfig).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      'Import failed: ConfigTransferError: CLIPBOARD_READ_UNAVAILABLE'
    );
    expect(document.body.textContent).not.toContain('Imported config');
    expect(importButton.hasAttribute('aria-busy')).toBe(false);
  });

  it('tracks only the allowlisted runtime actions and never emits raw option values', async () => {
    const { runtime, scrollToPanelMock, openResourceMock, trackUsageEventMock } =
      createActionRuntimeHarness();

    runtime.dispatch('preview:setTheme', [], 'system');
    runtime.dispatch('preview:setLanguage', [], 'ja');
    runtime.dispatch('maintenance:diagnose');
    runtime.dispatch('resource:open', ['privacy-policy']);
    runtime.dispatch('navigation:scrollToPanel', ['storage']);
    runtime.dispatch('experimental:setPageSummaryEnabled');
    runtime.dispatch('options:updateField', ['aiChat.userName'], 'Sensitive Name');
    runtime.dispatch('template:updateValue', ['articleVideo'], 'Articles/secret.md');
    runtime.dispatch('experimental:updateAiConfigField', ['apiKey'], 'SECRET_TOKEN');
    runtime.dispatch('unknown:action');
    await flushPromises();

    expect(scrollToPanelMock).toHaveBeenCalledWith('storage');
    expect(openResourceMock).toHaveBeenCalledWith('privacy-policy');
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'options_theme_changed',
      params: {
        theme: 'system'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'options_language_changed',
      params: {
        language: 'ja'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'options_action_completed',
      params: {
        action: 'maintenance_diagnose',
        outcome: 'completed',
        section: 'advanced'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'options_action_completed',
      params: {
        action: 'resource_open',
        outcome: 'completed',
        section: 'privacy'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'options_section_viewed',
      params: {
        section: 'storage'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'experimental_feature_toggled',
      params: {
        feature_key: 'page_summary_enabled',
        enabled: false
      }
    });

    const trackedPayloads = JSON.stringify(trackUsageEventMock.mock.calls);
    expect(trackedPayloads).not.toContain('Sensitive Name');
    expect(trackedPayloads).not.toContain('Articles/secret.md');
    expect(trackedPayloads).not.toContain('SECRET_TOKEN');

    const trackedEventMock = vi.mocked(
      trackUsageEventMock as (message: AnalyticsRuntimeEventPayload) => Promise<void>
    );
    const emittedEvents = trackedEventMock.mock.calls.map(([message]) => message.event);
    expect(emittedEvents).not.toEqual(
      expect.arrayContaining([
        'theme_changed',
        'language_changed',
        'config_exported',
        'config_imported',
        'config_repair_completed',
        'options_resource_viewed'
      ])
    );
  });

  it('keeps the local-folder clear action owned until its durable acknowledgement settles', async () => {
    const pendingClear = deferred<void>();
    const { runtime, clearVaultLocalFolderMock } = createActionRuntimeHarness({
      clearVaultLocalFolder: () => pendingClear.promise
    });

    runtime.dispatch('storage:deleteLocalFolder', [0]);
    expect(clearVaultLocalFolderMock).toHaveBeenCalledTimes(1);
    expect(clearVaultLocalFolderMock).toHaveBeenCalledWith(0);

    let idleSettled = false;
    const idle = runtime.waitForIdle().then(() => {
      idleSettled = true;
    });
    await Promise.resolve();
    expect(idleSettled).toBe(false);

    pendingClear.resolve();
    await idle;
    expect(idleSettled).toBe(true);
    expect(clearVaultLocalFolderMock).toHaveBeenCalledTimes(1);
  });

  it('restores the active language and control when language persistence fails', async () => {
    const englishMessages = await createEnglishPageMessages({
      schemaOverviewInterfaceGroupTitle: 'English interface sentinel'
    });
    const pendingLanguage = deferred<{ messages: Messages | null; language: Language }>();
    let activeLanguage: Language = 'en';
    let durableLanguage: Language = 'en';
    const changeLanguage = vi.fn(async (language: Language) => {
      const resource = await pendingLanguage.promise;
      activeLanguage = resource.language;
      durableLanguage = language;
      return resource;
    });
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: englishMessages,
      language: 'en',
      changeLanguage
    });
    const languageSelect = queryRequired<HTMLSelectElement>('select');

    languageSelect.value = 'ja';
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(languageSelect.value).toBe('ja');
    expect(activeLanguage).toBe('en');
    expect(durableLanguage).toBe('en');

    pendingLanguage.reject(new Error('language persistence failed'));
    await flushPromises();

    expect(changeLanguage).toHaveBeenCalledWith('ja');
    expect(activeLanguage).toBe('en');
    expect(durableLanguage).toBe('en');
    expect(queryRequired<HTMLSelectElement>('select').value).toBe('en');
    expect(document.body.textContent).toContain('English interface sentinel');
    expect(document.body.textContent).not.toContain('Japanese interface sentinel');
    expect(document.getElementById('msg')?.textContent).toContain('language persistence failed');

    mounted.refreshOptions(mounted.collectDraft());
    expect(queryRequired<HTMLSelectElement>('select').value).toBe('en');
    expect(document.body.textContent).toContain('English interface sentinel');
  });

  it('keeps the active, shell, and durable language after persistence succeeds', async () => {
    const englishMessages = await createEnglishPageMessages({
      schemaOverviewInterfaceGroupTitle: 'English interface sentinel'
    });
    const japaneseMessages = await createEnglishPageMessages({
      schemaOverviewInterfaceGroupTitle: 'Japanese interface sentinel'
    });
    let activeLanguage: Language = 'en';
    let durableLanguage: Language = 'en';
    const changeLanguage = vi.fn((language: Language) => {
      activeLanguage = language;
      durableLanguage = language;
      return Promise.resolve({ messages: japaneseMessages, language });
    });
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: englishMessages,
      language: 'en',
      changeLanguage
    });
    const languageSelect = queryRequired<HTMLSelectElement>('select');

    languageSelect.value = 'ja';
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(changeLanguage).toHaveBeenCalledWith('ja');
    expect(activeLanguage).toBe('ja');
    expect(durableLanguage).toBe('ja');
    expect(queryRequired<HTMLSelectElement>('select').value).toBe('ja');
    expect(document.body.textContent).toContain('Japanese interface sentinel');
    expect(document.body.textContent).not.toContain('English interface sentinel');

    mounted.refreshOptions(mounted.collectDraft());
    expect(queryRequired<HTMLSelectElement>('select').value).toBe('ja');
    expect(document.body.textContent).toContain('Japanese interface sentinel');
  });

  it('surfaces synchronous taxonomy validation failures in an accessible status message', () => {
    const { runtime } = createActionRuntimeHarness();
    expect(document.getElementById('msg')).toBeNull();

    runtime.dispatch(
      'classifier:updateField',
      ['taxonomy'],
      JSON.stringify({
        version: '1',
        categories: [],
        tags: [],
        rules: [
          {
            id: 'invalid-rule',
            name: 'Invalid rule',
            conditions: [{ type: 'unsupported', operator: 'contains', value: 'private' }],
            actions: []
          }
        ]
      })
    );

    const message = document.getElementById('msg');
    expect(message?.textContent).toContain(DEFAULT_RUNTIME_MESSAGES.invalidTaxonomy);
    expect(message?.classList.contains('is-error')).toBe(true);
    expect(message?.getAttribute('role')).toBe('status');
    expect(message?.getAttribute('aria-live')).toBe('polite');
  });

  it('uses the transfer clipboard fallback and does not report copy success when fallback fails', async () => {
    const controller = createController();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: {
        copyConfigSuccess: 'Copied config'
      } as never,
      language: 'en'
    });

    findButton('Copy Configuration').click();
    await flushPromises();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.textContent).toContain('Copied config');

    execCommand.mockReturnValue(false);
    findButton('Copy Configuration').click();
    await flushPromises();

    expect(document.body.textContent).toContain('Copy failed');
    expect(document.body.textContent).not.toContain('Copied config');
  });

  it('runs the full production diagnostics report instead of a simplified JSON dump', async () => {
    const controller = createController();
    const englishMessages = await createEnglishPageMessages({
      diagnosticsRestApiKeyMissing: 'Missing API key sentinel',
      diagnosticsSectionFragmentClipperTitle: 'Fragment clipping sentinel',
      diagnosticsFragmentContextLengthShort: 'Context length sentinel {value}',
      diagnosticsSectionVideoModeTitle: 'Video diagnostics sentinel',
      diagnosticsSectionPortChecksTitle: 'Port checks sentinel'
    });
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        rest: {
          vault: 'Research Vault',
          httpsUrl: '',
          httpUrl: '',
          apiKey: ''
        },
        templates: {
          article: '',
          fragment: '',
          ai: ''
        },
        fragmentClipper: {
          contextLength: 10
        },
        video: {
          floatingPromptEnabled: false
        }
      },
      messages: englishMessages,
      language: 'en'
    });

    findButton('Diagnose Configuration').click();
    await flushPromises();

    expect(document.body.textContent).toContain('Missing API key sentinel');
    expect(document.body.textContent).toContain('Fragment clipping sentinel');
    expect(document.body.textContent).toContain('Context length sentinel 10');
    expect(document.body.textContent).toContain('Video diagnostics sentinel');
    expect(document.body.textContent).toContain('Port checks sentinel');
  });

  it('persists privacy consent switches through the production options repository', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        privacyPreferences: {
          analytics: false,
          errorReporting: false,
          debugMode: false
        }
      },
      messages: null,
      language: 'en',
      optionsRepository
    } as never);

    const analytics = findCheckboxInText('Usage analytics');
    expect(analytics.disabled).toBe(false);
    analytics.checked = true;
    analytics.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(optionsRepository.patch).toHaveBeenCalledWith([
      { path: ['privacyPreferences', 'analytics'], value: true },
      { path: ['privacyPreferences', 'errorReporting'], value: false },
      { path: ['privacyPreferences', 'debugMode'], value: false }
    ]);
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: true,
      errorReporting: false,
      debugMode: false
    });
  });

  it('serializes cross-field privacy updates against the latest committed snapshot', async () => {
    const firstPatch = deferred<CompleteOptions>();
    const optionsRepository = createRepository();
    optionsRepository.patch
      .mockImplementationOnce(() => firstPatch.promise)
      .mockImplementation(() => Promise.resolve(createCompleteOptions(null)));
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: {
        privacyPreferences: { analytics: false, errorReporting: false, debugMode: false }
      },
      messages: null,
      language: 'en',
      optionsRepository
    });

    const analytics = findCheckboxInText('Usage analytics');
    const errorReporting = findCheckboxInText('Error reporting');
    analytics.checked = true;
    analytics.dispatchEvent(new Event('change', { bubbles: true }));
    errorReporting.checked = true;
    errorReporting.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(optionsRepository.patch).toHaveBeenCalledTimes(1);
    firstPatch.resolve(createCompleteOptions(null));
    await flushPromises();
    await flushPromises();

    expect(optionsRepository.patch).toHaveBeenCalledTimes(2);
    expect(optionsRepository.patch).toHaveBeenLastCalledWith([
      { path: ['privacyPreferences', 'analytics'], value: true },
      { path: ['privacyPreferences', 'errorReporting'], value: true },
      { path: ['privacyPreferences', 'debugMode'], value: false }
    ]);
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: true,
      errorReporting: true,
      debugMode: false
    });
  });

  it('syncs privacy switches with the analytics runtime consent and debug config', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const messagingRepository = createMessaging();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        privacyPreferences: {
          analytics: false,
          errorReporting: false,
          debugMode: false
        }
      },
      messages: null,
      language: 'en',
      messagingRepository: messagingRepository as never,
      optionsRepository
    });
    const analytics = findCheckboxInText('Usage analytics');
    analytics.checked = true;
    analytics.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(analyticsMocks.setAnalyticsConsent).toHaveBeenLastCalledWith(true, false);
    expect(updateErrorAnalyticsConfigMock).toHaveBeenLastCalledWith(false);
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'privacy_consent_changed',
      params: {
        field: 'analytics',
        enabled: true
      }
    });

    const errorReporting = findCheckboxInText('Error reporting');
    errorReporting.checked = true;
    errorReporting.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(analyticsMocks.setAnalyticsConsent).toHaveBeenLastCalledWith(true, true);
    expect(updateErrorAnalyticsConfigMock).toHaveBeenLastCalledWith(true);
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'privacy_consent_changed',
      params: {
        field: 'errorReporting',
        enabled: true
      }
    });

    const debugMode = findCheckboxInText('Debug mode');
    expect(debugMode.disabled).toBe(false);
    debugMode.checked = true;
    debugMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(analyticsMocks.updateConfig).toHaveBeenCalledWith({ debugMode: true });
    expect(optionsRepository.patch).toHaveBeenLastCalledWith([
      { path: ['privacyPreferences', 'analytics'], value: true },
      { path: ['privacyPreferences', 'errorReporting'], value: true },
      { path: ['privacyPreferences', 'debugMode'], value: true }
    ]);
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'privacy_consent_changed',
      params: {
        field: 'debugMode',
        enabled: true
      }
    });

    errorReporting.checked = false;
    errorReporting.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(analyticsMocks.setAnalyticsConsent).toHaveBeenLastCalledWith(true, false);
    expect(updateErrorAnalyticsConfigMock).toHaveBeenLastCalledWith(false);
  });

  it('clears all analytics privacy data through the production analytics manager', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const messagingRepository = createMessaging();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        privacyPreferences: {
          analytics: true,
          errorReporting: true,
          debugMode: true
        },
        usageStats: {
          aiChatSaves: 3,
          fragmentSaves: 2,
          articleSaves: 1,
          lastUpdatedISO: '2026-04-25T00:00:00.000Z',
          history: [{ date: '2026-04-25', aiChat: 3, fragment: 2, article: 1 }]
        }
      },
      messages: null,
      language: 'en',
      messagingRepository,
      optionsRepository
    } as never);

    findButton('Clear all data').click();
    await flushPromises();

    expect(analyticsMocks.clearAllData).toHaveBeenCalledTimes(1);
    expect(optionsRepository.patch).toHaveBeenCalledWith([
      { path: ['privacyPreferences', 'analytics'], value: false },
      { path: ['privacyPreferences', 'errorReporting'], value: false },
      { path: ['privacyPreferences', 'debugMode'], value: false }
    ]);
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: false,
      errorReporting: false,
      debugMode: false
    });
    expect(prepareAnalyticsDataClearedEventMock).toHaveBeenCalledTimes(1);
    expect(sendAnalyticsDataClearedEventMock).toHaveBeenCalledTimes(1);
    const clearEventCallOrder = sendAnalyticsDataClearedEventMock.mock.invocationCallOrder[0];
    expect(clearEventCallOrder).toBeGreaterThan(
      analyticsMocks.setAnalyticsConsent.mock.invocationCallOrder[0]
    );
    expect(clearEventCallOrder).toBeGreaterThan(
      analyticsMocks.clearAllData.mock.invocationCallOrder[0]
    );
    expect(clearEventCallOrder).toBeGreaterThan(
      updateErrorAnalyticsConfigMock.mock.invocationCallOrder[0]
    );
  });

  it('uses localized privacy clear-all confirmation and visible status messages', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const messagingRepository = createMessaging();
    const confirmSpy = vi.mocked(window.confirm);
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        privacyPreferences: {
          analytics: true,
          errorReporting: true,
          debugMode: true
        }
      },
      messages: {
        confirmClearAllData: 'Localized clear all?',
        allDataCleared: 'Localized clear success',
        clearDataError: 'Localized clear error'
      } as never,
      language: 'en',
      messagingRepository,
      optionsRepository
    } as never);

    findButton('Clear all data').click();
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith('Localized clear all?');
    expect(document.body.textContent).toContain('Localized clear success');
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: false,
      errorReporting: false,
      debugMode: false
    });

    analyticsMocks.clearAllData.mockRejectedValueOnce(new Error('clear failed'));
    findButton('Clear all data').click();
    await flushPromises();

    expect(document.body.textContent).toContain('Localized clear error');
    expect(sendAnalyticsDataClearedEventMock).toHaveBeenCalledTimes(1);
    expect(messagingRepository.send).not.toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'analytics_data_cleared',
      params: {
        outcome: 'failed'
      }
    });
  });

  it('falls back to English privacy clear-all copy when messages are missing', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const messagingRepository = createMessaging();
    const confirmSpy = vi.mocked(window.confirm);

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        privacyPreferences: {
          analytics: true,
          errorReporting: true,
          debugMode: true
        }
      },
      messages: null,
      language: 'en',
      messagingRepository,
      optionsRepository
    } as never);

    findButton('Clear all data').click();
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith(
      'Clear all analytics data? This action cannot be undone.'
    );
    expect(document.body.textContent).toContain('All analytics data has been cleared.');
  });

  it('does not report analytics data cleared when error analytics cleanup fails', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const messagingRepository = createMessaging();
    updateErrorAnalyticsConfigMock.mockRejectedValueOnce(
      new Error('error analytics cleanup failed')
    );

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        privacyPreferences: {
          analytics: true,
          errorReporting: true,
          debugMode: true
        }
      },
      messages: {
        clearDataError: 'Localized clear error'
      } as never,
      language: 'en',
      messagingRepository,
      optionsRepository
    } as never);

    findButton('Clear all data').click();
    await flushPromises();

    expect(analyticsMocks.clearAllData).toHaveBeenCalledTimes(1);
    expect(updateErrorAnalyticsConfigMock).toHaveBeenCalledWith(false);
    expect(document.body.textContent).toContain('Localized clear error');
    expect(sendAnalyticsDataClearedEventMock).not.toHaveBeenCalled();
  });

  it('clears usage data through the existing reset action dependencies', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const messagingRepository = createMessaging();
    const previousStats = {
      aiChatSaves: 3,
      fragmentSaves: 2,
      articleSaves: 1,
      lastUpdatedISO: '2026-04-25T00:00:00.000Z',
      history: [{ date: '2026-04-25', aiChat: 3, fragment: 2, article: 1 }]
    };
    const zeroStats = {
      aiChatSaves: 0,
      fragmentSaves: 0,
      articleSaves: 0,
      lastUpdatedISO: null,
      history: []
    };
    const usageStatsClient = {
      get: vi.fn(() => Promise.resolve(previousStats)),
      reset: vi.fn(() => Promise.resolve(zeroStats))
    };
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        usageStats: {
          aiChatSaves: 3,
          fragmentSaves: 2,
          articleSaves: 1,
          lastUpdatedISO: '2026-04-25T00:00:00.000Z',
          history: [{ date: '2026-04-25', aiChat: 3, fragment: 2, article: 1 }]
        }
      },
      messages: null,
      language: 'en',
      optionsRepository,
      usageStatsClient,
      messagingRepository,
      now: () => 1234
    } as never);

    await flushPromises();
    expect(renderedUsageValues()).toEqual(['6', '3', '2', '1']);

    findButton('Clear Usage Data').click();
    await flushPromises();

    expect(usageStatsClient.reset).toHaveBeenCalledTimes(1);
    expect(renderedUsageValues()).toEqual(['0', '0', '0', '0']);
    expect(vi.mocked(messagingRepository.send)).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'clear_stats',
      params: { timestamp: 1234 }
    });

    findButton('Diagnose Configuration').click();
    expect(renderedUsageValues()).toEqual(['0', '0', '0', '0']);
  });

  it('restores the durable usage view and failure status when reset rejects', async () => {
    const controller = createController();
    const previousStats = {
      aiChatSaves: 11,
      fragmentSaves: 7,
      articleSaves: 5,
      lastUpdatedISO: '2026-08-24T00:00:00.000Z',
      history: [{ date: '2026-08-24', aiChat: 11, fragment: 7, article: 5 }]
    };
    const usageStatsClient = {
      get: vi.fn(() => Promise.resolve(previousStats)),
      reset: vi.fn(() => Promise.reject(new Error('usage reset failed')))
    };
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { interfaceTheme: 'dark' },
      messages: null,
      language: 'en',
      usageStatsClient
    });

    await flushPromises();
    expect(renderedUsageValues()).toEqual(['23', '11', '7', '5']);

    findButton('Clear Usage Data').click();
    await flushPromises();

    expect(usageStatsClient.reset).toHaveBeenCalledTimes(1);
    expect(renderedUsageValues()).toEqual(['23', '11', '7', '5']);
    expect(document.getElementById('msg')?.textContent).toContain('usage reset failed');
    expect(mounted.collectDraft().interfaceTheme).toBe('dark');

    findButton('Diagnose Configuration').click();
    expect(renderedUsageValues()).toEqual(['23', '11', '7', '5']);
  });

  it('keeps a committed usage reset when an earlier theme task fails', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const pendingTheme = deferred<CompleteOptions>();
    optionsRepository.patch.mockImplementationOnce(() => pendingTheme.promise);
    const previousUsage: UsageStats = {
      aiChatSaves: 11,
      fragmentSaves: 7,
      articleSaves: 5,
      lastUpdatedISO: '2026-08-23T00:00:00.000Z',
      history: [{ date: '2026-08-23', aiChat: 11, fragment: 7, article: 5 }]
    };
    const resetUsage: UsageStats = {
      aiChatSaves: 0,
      fragmentSaves: 0,
      articleSaves: 0,
      lastUpdatedISO: null,
      history: []
    };
    let durableUsage = previousUsage;
    const usageStatsClient = {
      get: vi.fn(() => Promise.resolve(durableUsage)),
      reset: vi.fn(() => {
        durableUsage = resetUsage;
        return Promise.resolve(durableUsage);
      })
    };
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { interfaceTheme: 'dark' },
      messages: null,
      language: 'en',
      optionsRepository,
      usageStatsClient
    });
    await flushPromises();
    expect(renderedUsageValues()).toEqual(['23', '11', '7', '5']);

    findButton('Light').click();
    expect(mounted.collectDraft().interfaceTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    findButton('Clear Usage Data').click();
    await flushPromises();
    expect(usageStatsClient.reset).toHaveBeenCalledTimes(1);
    expect(durableUsage).toEqual(resetUsage);
    expect(renderedUsageValues()).toEqual(['0', '0', '0', '0']);

    pendingTheme.reject(new Error('theme persistence failed'));
    await flushPromises();

    expect(durableUsage).toEqual(resetUsage);
    expect(renderedUsageValues()).toEqual(['0', '0', '0', '0']);
    expect(mounted.collectDraft().interfaceTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('aob-theme')).toBe('dark');
  });

  it.each<{
    first: 'success' | 'failure';
    second: 'success' | 'failure';
    expected: 'dark' | 'light' | 'system';
  }>([
    { first: 'failure', second: 'failure', expected: 'dark' },
    { first: 'success', second: 'failure', expected: 'light' },
    { first: 'failure', second: 'success', expected: 'system' },
    { first: 'success', second: 'success', expected: 'system' }
  ])(
    'serializes theme persistence: Light $first + System $second => $expected',
    async ({ first, second, expected }) => {
      const controller = createController();
      const optionsRepository = createRepository();
      const predecessor = deferred<CompleteOptions>();
      const successor = deferred<CompleteOptions>();
      const successorStarted = deferred<void>();
      const starts: string[] = [];
      let durableTheme = 'dark';
      optionsRepository.patch
        .mockImplementationOnce(() => {
          starts.push('light');
          return predecessor.promise.then((stored) => {
            durableTheme = 'light';
            return stored;
          });
        })
        .mockImplementationOnce(() => {
          starts.push('system');
          successorStarted.resolve();
          return successor.promise.then((stored) => {
            durableTheme = 'system';
            return stored;
          });
        });
      const mounted = mountProductionStitchShell({
        controller: asOptionsController(controller),
        initialOptions: { interfaceTheme: 'dark' },
        messages: null,
        language: 'en',
        optionsRepository
      });

      findButton('Light').click();
      findButton('System').click();

      expect(starts).toEqual(['light']);
      expect(mounted.collectDraft().interfaceTheme).toBe('light');
      expect(window.localStorage.getItem('aob-theme')).toBe('light');

      if (first === 'success') {
        predecessor.resolve(createCompleteOptions({ interfaceTheme: 'light' }));
      } else {
        predecessor.reject(new Error('light failed'));
      }
      await successorStarted.promise;

      expect(starts).toEqual(['light', 'system']);
      expect(mounted.collectDraft().interfaceTheme).toBe('system');
      expect(window.localStorage.getItem('aob-theme')).toBe('system');

      if (second === 'success') {
        successor.resolve(createCompleteOptions({ interfaceTheme: 'system' }));
      } else {
        successor.reject(new Error('system failed'));
      }
      await flushPromises();

      const resolvedTheme = expected === 'system' ? 'light' : expected;
      expect(durableTheme).toBe(expected);
      expect(mounted.collectDraft().interfaceTheme).toBe(expected);
      expect(document.documentElement.dataset.theme).toBe(resolvedTheme);
      expect(window.localStorage.getItem('aob-theme')).toBe(expected);
      expect(
        findButton(expected[0]?.toUpperCase() + expected.slice(1)).getAttribute('aria-pressed')
      ).toBe('true');

      predecessor.reject(new Error('late predecessor completion'));
      await flushPromises();
      expect(durableTheme).toBe(expected);
      expect(mounted.collectDraft().interfaceTheme).toBe(expected);
    }
  );

  it('emits canonical export telemetry without leaking exported option content', async () => {
    const controller = createController();
    const messagingRepository = createMessaging();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        aiChat: { userName: 'Sensitive Name' },
        rest: {
          apiKey: 'REST_SECRET_TOKEN'
        }
      },
      messages: null,
      language: 'en',
      messagingRepository: messagingRepository as never
    });
    findButton('Copy Configuration').click();
    await flushPromises();

    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'config_export_completed',
      params: {
        outcome: 'completed'
      }
    });
    expect(JSON.stringify(messagingRepository.send.mock.calls)).not.toContain('Sensitive Name');
    expect(JSON.stringify(messagingRepository.send.mock.calls)).not.toContain('REST_SECRET_TOKEN');

    vi.mocked(messagingRepository.send).mockClear();
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    findButton('Copy Configuration').click();
    await flushPromises();

    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'config_export_completed',
      params: {
        outcome: 'failed'
      }
    });
  });

  it('imports configuration before analytics payload application and emits sanitized import telemetry', async () => {
    const applyImportedConfig = vi.fn<(options: CompleteOptions) => Promise<void>>(() =>
      Promise.resolve()
    );
    const controller = { ...createController(), applyImportedConfig };
    const messagingRepository = createMessaging();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn(() =>
          Promise.resolve(
            JSON.stringify({
              options: { aiChat: { userName: 'Imported' } },
              analytics: {
                consent: { analytics: true, errorReporting: false },
                debugMode: false
              }
            })
          )
        )
      }
    });

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: null,
      language: 'en',
      messagingRepository: messagingRepository as never
    });

    findButton('Import and Save').click();
    await flushPromises();

    const importCall = applyImportedConfig.mock.calls[0];
    if (!importCall) throw new Error('Expected imported configuration application');
    expect(importCall[0].aiChat.userName).toBe('Imported');
    expect(applyImportedConfig.mock.invocationCallOrder[0]).toBeLessThan(
      applyAnalyticsTransferPayloadMock.mock.invocationCallOrder[0]
    );
    expect(applyAnalyticsTransferPayloadMock).toHaveBeenCalledWith({
      consent: { analytics: true, errorReporting: false },
      debugMode: false
    });
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'config_import_completed',
      params: {
        outcome: 'completed',
        analytics_payload_present: true
      }
    });
  });

  it('does not apply analytics when imported options fail to save', async () => {
    const controller = {
      ...createController(),
      applyImportedConfig: vi.fn(() => Promise.reject(new Error('save failed')))
    };
    const messagingRepository = createMessaging();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn(() =>
          Promise.resolve(
            JSON.stringify({
              options: { aiChat: { userName: 'Imported' } },
              analytics: {
                consent: { analytics: true, errorReporting: true },
                debugMode: true
              }
            })
          )
        )
      }
    });

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: {
        importSuccess: 'Imported config'
      } as never,
      language: 'en',
      messagingRepository: messagingRepository as never
    });

    findButton('Import and Save').click();
    await flushPromises();

    expect(applyAnalyticsTransferPayloadMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Import failed: Error: save failed');
    expect(document.body.textContent).not.toContain('Imported config');
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'config_import_completed',
      params: {
        outcome: 'failed',
        analytics_payload_present: true
      }
    });
  });

  it('surfaces analytics import failure without emitting a success event', async () => {
    const controller = createController();
    const messagingRepository = createMessaging();
    applyAnalyticsTransferPayloadMock.mockRejectedValueOnce(new Error('analytics failed'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn(() =>
          Promise.resolve(
            JSON.stringify({
              options: {
                aiChat: { userName: 'Imported' },
                interfaceTheme: 'light',
                rest: { vault: 'Imported Vault' }
              },
              analytics: {
                consent: { analytics: true, errorReporting: false },
                debugMode: false
              }
            })
          )
        )
      }
    });

    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: {
        importSuccess: 'Imported config'
      } as never,
      language: 'en',
      messagingRepository: messagingRepository as never
    });
    const panelRoots = Array.from(document.querySelectorAll<HTMLElement>('[data-panel-id]'));

    findButton('Import and Save').click();
    await flushPromises();

    expect(vi.mocked(controller.applyImportedConfig)).toHaveBeenCalledTimes(1);
    expect(mounted.collectDraft().aiChat.userName).toBe('Imported');
    expect(mounted.collectDraft().interfaceTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(findButton('Light').getAttribute('aria-pressed')).toBe('true');
    expect(
      panelRoots.every(
        (root) => document.querySelector(`[data-panel-id="${root.dataset.panelId}"]`) !== root
      )
    ).toBe(true);
    expect(document.body.textContent).toContain('Import failed: Error: analytics failed');
    expect(document.body.textContent).not.toContain('Imported config');
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'config_import_completed',
      params: {
        outcome: 'failed',
        analytics_payload_present: true
      }
    });
  });

  it('repairs configuration using the existing production repair rules', async () => {
    let durableTemplate = 'Clippings/Before.md';
    const saveSnapshot = vi.fn((snapshot: { reason: 'manual'; draft: CompleteOptions }) => {
      durableTemplate = snapshot.draft.templates.article;
      return Promise.resolve();
    });
    const controller = { ...createController(), saveSnapshot };
    const messagingRepository = createMessaging();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        rest: {
          vault: 'Research Vault',
          baseUrl: LOCAL_HTTP_CONFLICT_URL,
          httpsUrl: '',
          httpUrl: LOCAL_HTTP_URL
        },
        templates: {
          article: durableTemplate,
          fragment: '',
          ai: ''
        }
      },
      messages: null,
      language: 'en',
      messagingRepository: messagingRepository as never
    });

    findButton('Fix Configuration').click();
    await flushPromises();

    const repaired = mounted.collectDraft();
    expect(repaired.rest.baseUrl).toBe(LOCAL_HTTPS_URL);
    expect(repaired.rest.httpsUrl).toBeTruthy();
    expect(repaired.templates.article).toBe('Articles/Before.md');
    expect(durableTemplate).toBe('Articles/Before.md');
    expect(repaired.templates.fragment).toBeTruthy();
    expect(repaired.templates.ai).toBeTruthy();
    const repairSaveCall = saveSnapshot.mock.calls[0];
    if (!repairSaveCall) throw new Error('Expected repaired configuration save');
    const [repairSnapshot] = repairSaveCall;
    expect(repairSnapshot.reason).toBe('manual');
    expect(repairSnapshot.draft.rest.baseUrl).toBe(LOCAL_HTTPS_URL);
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'options_action_completed',
      params: {
        action: 'maintenance_repair',
        outcome: 'completed',
        section: 'advanced'
      }
    });

    findButton('Diagnose Configuration').click();
    expect(mounted.collectDraft().templates.article).toBe('Articles/Before.md');
    expect(document.body.textContent).toContain('Articles/Before.md');
    expect(document.body.textContent).not.toContain('Clippings/Before.md');
  });

  it('restores repair-owned state when saving the repaired snapshot fails', async () => {
    const pendingSave = deferred<void>();
    let durableTemplate = 'Clippings/Before.md';
    const saveSnapshot = vi.fn(async (snapshot: { reason: 'manual'; draft: CompleteOptions }) => {
      await pendingSave.promise;
      durableTemplate = snapshot.draft.templates.article;
    });
    const controller = { ...createController(), saveSnapshot };
    const optionsRepository = createRepository();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        interfaceTheme: 'dark',
        templates: { article: durableTemplate }
      },
      messages: null,
      language: 'en',
      optionsRepository
    });
    const stableOverview = queryRequired<HTMLElement>('[data-panel-id="overview"]');
    const stableCaptureSources = queryRequired<HTMLElement>('[data-panel-id="capture-sources"]');
    const repairedOwners = new Map(
      ['storage', 'output', 'maintenance'].map((id) => [
        id,
        queryRequired<HTMLElement>(`[data-panel-id="${id}"]`)
      ])
    );

    findButton('Fix Configuration').click();
    expect(mounted.collectDraft().templates.article).toBe('Articles/Before.md');
    const saveCall = saveSnapshot.mock.calls[0];
    if (!saveCall) throw new Error('Expected the repaired snapshot save call');
    const [savedSnapshot] = saveCall;
    expect(savedSnapshot.reason).toBe('manual');
    expect(savedSnapshot.draft.templates.article).toBe('Articles/Before.md');

    findButton('Light').click();
    await flushPromises();
    expect(mounted.collectDraft().interfaceTheme).toBe('light');

    pendingSave.reject(new Error('repair save failed'));
    await flushPromises();

    expect(mounted.collectDraft().templates.article).toBe('Clippings/Before.md');
    expect(durableTemplate).toBe('Clippings/Before.md');
    expect(mounted.collectDraft().interfaceTheme).toBe('light');
    expect(window.localStorage.getItem('aob-theme')).toBe('light');
    expect(document.getElementById('msg')?.textContent).toContain('repair save failed');
    expect(document.querySelector('[data-panel-id="overview"]')).toBe(stableOverview);
    expect(document.querySelector('[data-panel-id="capture-sources"]')).toBe(stableCaptureSources);
    repairedOwners.forEach((root, id) => {
      expect(document.querySelector(`[data-panel-id="${id}"]`)).not.toBe(root);
    });

    findButton('Diagnose Configuration').click();
    expect(mounted.collectDraft().templates.article).toBe('Clippings/Before.md');
    expect(document.body.textContent).toContain('Clippings/Before.md');
    expect(document.body.textContent).not.toContain('Articles/Before.md');
  });
});
