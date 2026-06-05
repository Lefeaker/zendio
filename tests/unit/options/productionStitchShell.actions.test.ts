/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyAnalyticsTransferPayloadMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const updateErrorAnalyticsConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@options/services/analyticsTransfer', () => ({
  applyAnalyticsTransferPayload: applyAnalyticsTransferPayloadMock
}));
vi.mock('@shared/errors/analytics', () => ({
  updateErrorAnalyticsConfig: updateErrorAnalyticsConfigMock
}));

import {
  applyOptionsToState,
  createInitialStitchState,
  createProductionContent
} from '@options/app/productionStitchStateMapper';
import { createProductionStitchShellActionRuntime } from '@options/app/productionStitchShellActionRuntime';
import {
  analyticsMocks,
  asOptionsController,
  createController,
  createMessaging,
  createRepository,
  createStorage,
  findButton,
  findCheckboxInText,
  findInputByValue,
  flushPromises,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { previewContent } from '@options/stitch/content';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { Language } from '@i18n';
import type { StorageService } from '@platform/interfaces/storage';
import type { CompleteOptions } from './productionStitchShell.helpers';
import { getRestDefaults } from '../../utils/restDefaults';

const REST_DEFAULTS = getRestDefaults();
const LOCAL_HTTPS_URL = `https://localhost:${REST_DEFAULTS.httpsPort}`;
const LOCAL_HTTP_URL = `http://localhost:${REST_DEFAULTS.httpPort}`;
const LOCAL_HTTP_CONFLICT_URL = `http://localhost:${REST_DEFAULTS.httpsPort}`;

function createActionRuntimeHarness() {
  const mountRoot = document.createElement('div');
  document.body.append(mountRoot);

  let draft = mergeOptions(null) as CompleteOptions;
  let appData = createProductionContent(previewContent, draft);
  let state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  const trackUsageEventMock = vi.fn(() => Promise.resolve(undefined));
  const scrollToPanelMock = vi.fn();
  const openResourceMock = vi.fn();

  const runtime = createProductionStitchShellActionRuntime({
    mountRoot,
    buttonPressScrollGuard: {
      cleanup: vi.fn(),
      getSnapshot: vi.fn(() => null)
    },
    controller: {
      loadRaw: vi.fn(() => Promise.resolve(draft)),
      scheduleAutoSave: vi.fn()
    },
    optionsRepository: createRepository(),
    changeLanguage: vi.fn((language: Language) => Promise.resolve({ messages: null, language })),
    getAppData: () => appData,
    getCurrentLanguage: () => state.previewLanguage as Language,
    getCurrentMessages: () => null,
    getDraft: () => draft,
    getState: () => state,
    setConnectionNotice: vi.fn(),
    setDomainMappingRows: vi.fn(),
    setLanguageResource: ({ language }) => {
      state = { ...state, previewLanguage: language };
    },
    setMaintenanceLog: vi.fn(),
    setState: (nextState) => {
      state = nextState;
    },
    createSchemaContext: () => ({
      appData,
      language: state.previewLanguage,
      state
    }),
    mutate: (mutator) => {
      mutator(state);
    },
    currentDomainEntries: () => [],
    refreshAppData: () => {
      appData = createProductionContent(previewContent, draft);
    },
    refreshOptions: (options) => {
      draft = mergeOptions(options) as CompleteOptions;
      appData = createProductionContent(previewContent, draft);
      state = applyOptionsToState(state, draft, appData);
    },
    render: vi.fn(),
    renderActiveResourceModal: vi.fn(),
    scheduleDraftSave: vi.fn(),
    scrollToPanel: scrollToPanelMock,
    syncDomainEntries: vi.fn(),
    syncHighlightThemeControls: vi.fn(),
    syncModifierControls: vi.fn(),
    syncPreviewThemeControls: vi.fn(),
    openResource: openResourceMock,
    persistence: {
      clearAnalyticsPrivacyData: vi.fn(() => Promise.resolve()),
      copyConfigurationToClipboard: vi.fn(() => Promise.resolve()),
      importConfigurationWithStatus: vi.fn(() => Promise.resolve()),
      loadUsageStatsFromStorage: vi.fn(() => Promise.resolve()),
      persistPrivacyPreference: vi.fn(() => Promise.resolve()),
      repairConfiguration: vi.fn(() => Promise.resolve()),
      resetUsageData: vi.fn(() => Promise.resolve()),
      trackUsageEvent: trackUsageEventMock
    } as never,
    storageController: {
      activateVaultLocalFolder: vi.fn(() => Promise.resolve()),
      applyConnectionNotice: vi.fn(),
      chooseVaultLocalFolder: vi.fn(() => Promise.resolve()),
      clearVaultLocalFolder: vi.fn(),
      ensureVaultRouter: vi.fn(() => ({ vaults: [], rules: [], defaultVaultId: '' })),
      runVaultListConnectionTest: vi.fn(() => Promise.resolve({ success: true, message: 'ok' })),
      syncRoutingRulesToDraft: vi.fn(),
      updateVaultField: vi.fn()
    } as never,
    widgetHost: {
      collectDraftWithWidgets: vi.fn(() => draft),
      flushDirtyWidgets: vi.fn(),
      markDirty: vi.fn()
    } as never
  });

  return {
    runtime,
    scrollToPanelMock,
    openResourceMock,
    trackUsageEventMock
  };
}

describe('mountProductionStitchShell actions', () => {
  beforeEach(() => {
    setupProductionStitchShellTest();
    applyAnalyticsTransferPayloadMock.mockClear();
    updateErrorAnalyticsConfigMock.mockClear();
  });

  it('runs real maintenance actions for copy, diagnostics, and reload', async () => {
    const reloaded = mergeOptions({ aiChat: { userName: 'Reloaded' } }) as CompleteOptions;
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
          apiKey: 'REST_SECRET_TOKEN'
        },
        customKey: { hello: 'world' }
      } as never,
      messages: null,
      language: 'en'
    });

    findButton('复制配置').click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"aiChat"'));
    const writtenConfig = JSON.parse(String(writeText.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect((writtenConfig.rest as { apiKey?: string }).apiKey).toBe('REST_SECRET_TOKEN');
    expect(writtenConfig.customKey).toBeUndefined();

    findButton('诊断配置').click();
    expect(document.body.textContent).toContain('domainMappings');

    findButton('重新加载').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadRaw).toHaveBeenCalledTimes(1);
    expect(findInputByValue('Reloaded')).toBeTruthy();
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

    const copyButton = findButton('复制配置');
    copyButton.click();
    expect(copyButton.getAttribute('aria-busy')).toBe('true');
    await flushPromises();
    expect(document.body.textContent).toContain('Copied config');
    expect(copyButton.hasAttribute('aria-busy')).toBe(false);

    const importButton = findButton('导入并保存');
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

    const importButton = findButton('导入并保存');
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
      type: 'TRACK_USAGE_EVENT',
      event: 'options_theme_changed',
      params: {
        theme: 'system'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'options_language_changed',
      params: {
        language: 'ja'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'options_action_completed',
      params: {
        action: 'maintenance_diagnose',
        outcome: 'completed',
        section: 'advanced'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'options_action_completed',
      params: {
        action: 'resource_open',
        outcome: 'completed',
        section: 'privacy'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'options_section_viewed',
      params: {
        section: 'storage'
      }
    });
    expect(trackUsageEventMock).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
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

    const emittedEvents = (trackUsageEventMock.mock.calls as unknown as Array<[unknown]>).map(
      ([message]) => (message as { event?: string } | undefined)?.event
    );
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

    findButton('复制配置').click();
    await flushPromises();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.textContent).toContain('Copied config');

    execCommand.mockReturnValue(false);
    findButton('复制配置').click();
    await flushPromises();

    expect(document.body.textContent).toContain('Copy failed');
    expect(document.body.textContent).not.toContain('Copied config');
  });

  it('runs the full production diagnostics report instead of a simplified JSON dump', () => {
    const controller = createController();
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
      messages: null,
      language: 'en'
    });

    findButton('诊断配置').click();

    expect(document.body.textContent).toContain('未配置 API Key');
    expect(document.body.textContent).toContain('片段剪藏配置');
    expect(document.body.textContent).toContain('上下文长度较短');
    expect(document.body.textContent).toContain('视频模式');
    expect(document.body.textContent).toContain('端口检查');
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

    const analytics = findCheckboxInText('匿名使用统计');
    expect(analytics.disabled).toBe(false);
    analytics.checked = true;
    analytics.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(optionsRepository.set).toHaveBeenCalledWith({
      privacyPreferences: {
        analytics: true,
        errorReporting: false,
        debugMode: false
      }
    });
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: true,
      errorReporting: false,
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
      messagingRepository,
      optionsRepository
    } as never);

    const analytics = findCheckboxInText('匿名使用统计');
    analytics.checked = true;
    analytics.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(analyticsMocks.setAnalyticsConsent).toHaveBeenLastCalledWith(true, false);
    expect(updateErrorAnalyticsConfigMock).toHaveBeenLastCalledWith(false);
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'privacy_consent_changed',
      params: {
        field: 'analytics',
        enabled: true
      }
    });

    const errorReporting = findCheckboxInText('错误报告');
    errorReporting.checked = true;
    errorReporting.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(analyticsMocks.setAnalyticsConsent).toHaveBeenLastCalledWith(true, true);
    expect(updateErrorAnalyticsConfigMock).toHaveBeenLastCalledWith(true);
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'privacy_consent_changed',
      params: {
        field: 'errorReporting',
        enabled: true
      }
    });

    const debugMode = findCheckboxInText('调试模式');
    expect(debugMode.disabled).toBe(false);
    debugMode.checked = true;
    debugMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(analyticsMocks.updateConfig).toHaveBeenCalledWith({ debugMode: true });
    expect(optionsRepository.set).toHaveBeenLastCalledWith({
      privacyPreferences: {
        analytics: true,
        errorReporting: true,
        debugMode: true
      }
    });
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
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

    findButton('清空全部分析数据').click();
    await flushPromises();

    expect(analyticsMocks.clearAllData).toHaveBeenCalledTimes(1);
    expect(optionsRepository.set).toHaveBeenCalledWith({
      privacyPreferences: {
        analytics: false,
        errorReporting: false,
        debugMode: false
      }
    });
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: false,
      errorReporting: false,
      debugMode: false
    });
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'analytics_data_cleared',
      params: {
        outcome: 'completed'
      }
    });
    const clearEventCallOrder = vi.mocked(messagingRepository.send).mock.invocationCallOrder[0];
    expect(clearEventCallOrder).toBeLessThan(
      analyticsMocks.setAnalyticsConsent.mock.invocationCallOrder[0]
    );
    expect(clearEventCallOrder).toBeLessThan(
      analyticsMocks.clearAllData.mock.invocationCallOrder[0]
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

    findButton('清空全部分析数据').click();
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith('Localized clear all?');
    expect(document.body.textContent).toContain('Localized clear success');
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: false,
      errorReporting: false,
      debugMode: false
    });

    analyticsMocks.clearAllData.mockRejectedValueOnce(new Error('clear failed'));
    findButton('清空全部分析数据').click();
    await flushPromises();

    expect(document.body.textContent).toContain('Localized clear error');
    expect(messagingRepository.send).not.toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'analytics_data_cleared',
      params: {
        outcome: 'failed'
      }
    });
  });

  it('clears usage data through the existing reset action dependencies', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const storage = createStorage();
    const messagingRepository = createMessaging();
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
      storage: storage as unknown as StorageService,
      messagingRepository,
      now: () => 1234
    } as never);

    findButton('清除使用数据').click();
    await flushPromises();

    const zeroStats = {
      aiChatSaves: 0,
      fragmentSaves: 0,
      articleSaves: 0,
      lastUpdatedISO: null,
      history: []
    };
    expect(vi.mocked(optionsRepository.set)).toHaveBeenCalledWith({ usageStats: zeroStats });
    expect(vi.mocked(storage.local.set)).toHaveBeenCalledWith('usageStats', zeroStats);
    expect(vi.mocked(storage.local.set)).toHaveBeenCalledWith('usage_stats', zeroStats);
    expect(vi.mocked(messagingRepository.send)).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'clear_stats',
      params: { timestamp: 1234 }
    });
  });

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

    findButton('复制配置').click();
    await flushPromises();

    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'config_export_completed',
      params: {
        outcome: 'completed'
      }
    });
    expect(JSON.stringify(messagingRepository.send.mock.calls)).not.toContain('Sensitive Name');
    expect(JSON.stringify(messagingRepository.send.mock.calls)).not.toContain('REST_SECRET_TOKEN');

    vi.mocked(messagingRepository.send).mockClear();
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    findButton('复制配置').click();
    await flushPromises();

    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'config_export_completed',
      params: {
        outcome: 'failed'
      }
    });
  });

  it('imports configuration before analytics payload application and emits sanitized import telemetry', async () => {
    const controller = createController();
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

    findButton('导入并保存').click();
    await flushPromises();

    expect(vi.mocked(controller.applyImportedConfig)).toHaveBeenCalledWith(
      expect.objectContaining({
        aiChat: expect.objectContaining({ userName: 'Imported' }) as unknown
      })
    );
    expect(controller.applyImportedConfig.mock.invocationCallOrder[0]).toBeLessThan(
      applyAnalyticsTransferPayloadMock.mock.invocationCallOrder[0]
    );
    expect(applyAnalyticsTransferPayloadMock).toHaveBeenCalledWith({
      consent: { analytics: true, errorReporting: false },
      debugMode: false
    });
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
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

    findButton('导入并保存').click();
    await flushPromises();

    expect(applyAnalyticsTransferPayloadMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Import failed: Error: save failed');
    expect(document.body.textContent).not.toContain('Imported config');
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
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
      messages: {
        importSuccess: 'Imported config'
      } as never,
      language: 'en',
      messagingRepository: messagingRepository as never
    });

    findButton('导入并保存').click();
    await flushPromises();

    expect(vi.mocked(controller.applyImportedConfig)).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Import failed: Error: analytics failed');
    expect(document.body.textContent).not.toContain('Imported config');
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'config_import_completed',
      params: {
        outcome: 'failed',
        analytics_payload_present: true
      }
    });
  });

  it('repairs configuration using the existing production repair rules', async () => {
    const controller = createController();
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
          article: 'Clippings/{{title}}.md',
          fragment: '',
          ai: ''
        }
      },
      messages: null,
      language: 'en',
      messagingRepository: messagingRepository as never
    });

    findButton('修复配置').click();
    await flushPromises();

    const repaired = mounted.collectDraft();
    expect(repaired.rest.baseUrl).toBe(LOCAL_HTTPS_URL);
    expect(repaired.rest.httpsUrl).toBeTruthy();
    expect(repaired.templates.article).toContain('Articles/');
    expect(repaired.templates.fragment).toBeTruthy();
    expect(repaired.templates.ai).toBeTruthy();
    expect(vi.mocked(controller.saveSnapshot)).toHaveBeenCalledWith({
      reason: 'manual',
      draft: expect.objectContaining({
        rest: expect.objectContaining({ baseUrl: LOCAL_HTTPS_URL }) as unknown
      }) as unknown
    });
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'options_action_completed',
      params: {
        action: 'maintenance_repair',
        outcome: 'completed',
        section: 'advanced'
      }
    });
  });
});
