import { configProvider } from '@shared/config/provider';
import {
  DEFAULT_USAGE_STATS,
  normalizeUsageStats,
  USAGE_STATS_STORAGE_KEY
} from '@shared/constants';
import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import {
  createAnalyticsEventMessage,
  type AnalyticsRuntimeEventPayload
} from '@shared/types/analytics';
import type { UsageStats } from '@shared/types/usage';
import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import { persistPrivacyConsentAction, resetUsageStatsAction } from '@options/app/actions';
import { applyAnalyticsTransferPayload } from '@options/services/analyticsTransfer';
import { writeToClipboard } from '@options/services/configTransfer';
import {
  getAnalyticsConfigManager,
  setAnalyticsConsent
} from '@shared/errors/analytics/analyticsConfig';
import { updateErrorAnalyticsConfig } from '@shared/errors/analytics';
import { serializeOptionsFullBackup } from './productionStitchConfigExport';
import { readImportedConfigurationFromClipboard } from './productionStitchConfigImport';
import { prepareAnalyticsDataClearedEvent } from './productionStitchFinalAnalyticsEvent';
import { applyOptionsToState, LEGACY_USAGE_STATS_STORAGE_KEY } from './productionStitchStateMapper';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import { getMessage, setButtonBusy } from './productionStitchPersistenceUi';

type PrivacyPreferenceField = 'analytics' | 'errorReporting' | 'debugMode';

interface PrivacySnapshot {
  analytics: boolean;
  errorReporting: boolean;
  debugMode: boolean;
}

interface ProductionStitchPersistenceOptions {
  controller: OptionsController;
  optionsRepository: Pick<IOptionsRepository, 'get' | 'set' | 'onChange'>;
  messagingRepository: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  storage?: StorageService;
  now?: () => number;
  getAppData(): PreviewContent;
  getCurrentMessages(): Messages | null;
  getDraft(): CompleteOptions;
  getState(): PreviewStoreState;
  setAppData(appData: PreviewContent): void;
  setDraft(draft: CompleteOptions): void;
  setMaintenanceLog(log: string): void;
  setState(state: PreviewStoreState): void;
  collectDraftWithWidgets(): CompleteOptions;
  refreshAppData(): void;
  render(): void;
  syncDefaultVaultFromRest(): void;
}

export interface ProductionStitchPersistence {
  clearAnalyticsPrivacyData(): Promise<void>;
  copyConfigurationToClipboard(button: HTMLButtonElement | null): Promise<void>;
  importConfigurationWithStatus(button: HTMLButtonElement | null): Promise<void>;
  loadUsageStatsFromStorage(): Promise<void>;
  persistPrivacyPreference(field: PrivacyPreferenceField, value: boolean): Promise<void>;
  repairConfiguration(): Promise<void>;
  resetUsageData(): Promise<void>;
  trackUsageEvent(message: AnalyticsRuntimeEventPayload): Promise<void>;
}

export function createProductionStitchPersistence(
  options: ProductionStitchPersistenceOptions
): ProductionStitchPersistence {
  async function trackUsageEvent(
    message: ReturnType<typeof createAnalyticsEventMessage>
  ): Promise<void> {
    try {
      await options.messagingRepository.send(message);
    } catch {
      // Telemetry is best-effort and must not block options actions.
    }
  }

  function getPrivacySnapshot(): PrivacySnapshot {
    const current = (
      options.getDraft() as {
        privacyPreferences?: Partial<Record<PrivacyPreferenceField, boolean>>;
      }
    ).privacyPreferences;
    return {
      analytics: Boolean(current?.analytics),
      errorReporting: Boolean(current?.errorReporting),
      debugMode: Boolean(current?.debugMode)
    };
  }

  function syncPrivacySnapshotToState(nextSnapshot: PrivacySnapshot): void {
    const draft = options.getDraft();
    const state = options.getState();
    (draft as Record<string, unknown>).privacyPreferences = nextSnapshot;
    state.privacyAnalytics = nextSnapshot.analytics;
    state.privacyErrorReporting = nextSnapshot.errorReporting;
    state.privacyDebugMode = nextSnapshot.debugMode;
  }

  async function applyRuntimePrivacySnapshot(
    nextSnapshot: PrivacySnapshot,
    field: PrivacyPreferenceField
  ): Promise<void> {
    const runtimeDebugMode =
      nextSnapshot.analytics || nextSnapshot.errorReporting ? nextSnapshot.debugMode : false;

    if (field === 'debugMode') {
      await getAnalyticsConfigManager().updateConfig({ debugMode: runtimeDebugMode });
      return;
    }

    await setAnalyticsConsent(nextSnapshot.analytics, nextSnapshot.errorReporting);
    await getAnalyticsConfigManager().updateConfig({ debugMode: runtimeDebugMode });
    await updateErrorAnalyticsConfig(nextSnapshot.errorReporting);
  }

  async function persistPrivacyPreference(
    field: PrivacyPreferenceField,
    value: boolean
  ): Promise<void> {
    const nextSnapshot = {
      ...getPrivacySnapshot(),
      [field]: value
    };
    if ((!nextSnapshot.analytics || !nextSnapshot.errorReporting) && nextSnapshot.debugMode) {
      nextSnapshot.debugMode = false;
    }
    await persistPrivacyConsentAction(nextSnapshot, {
      optionsRepository: options.optionsRepository
    });
    syncPrivacySnapshotToState(nextSnapshot);
    await applyRuntimePrivacySnapshot(nextSnapshot, field);
    options.controller.scheduleAutoSave(() => options.collectDraftWithWidgets());
    await trackUsageEvent(
      createAnalyticsEventMessage('privacy_consent_changed', {
        field,
        enabled: nextSnapshot[field]
      })
    );
  }

  async function clearAnalyticsPrivacyData(): Promise<void> {
    const shouldClear =
      typeof window.confirm === 'function'
        ? window.confirm(
            getMessage(
              options.getCurrentMessages(),
              'confirmClearAllData',
              DEFAULT_RUNTIME_MESSAGES.confirmClearAllData
            )
          )
        : true;
    if (!shouldClear) {
      return;
    }
    try {
      const sendAnalyticsDataClearedEvent = await prepareAnalyticsDataClearedEvent();
      const nextSnapshot = {
        analytics: false,
        errorReporting: false,
        debugMode: false
      };
      await persistPrivacyConsentAction(nextSnapshot, {
        optionsRepository: options.optionsRepository
      });
      syncPrivacySnapshotToState(nextSnapshot);
      await setAnalyticsConsent(false, false);
      await getAnalyticsConfigManager().clearAllData();
      await updateErrorAnalyticsConfig(false);
      await sendAnalyticsDataClearedEvent();
      options.getState().privacyStatus = getMessage(
        options.getCurrentMessages(),
        'allDataCleared',
        DEFAULT_RUNTIME_MESSAGES.allDataCleared
      );
      options.controller.scheduleAutoSave(() => options.collectDraftWithWidgets());
    } catch (error) {
      void error;
      options.getState().privacyStatus = getMessage(
        options.getCurrentMessages(),
        'clearDataError',
        DEFAULT_RUNTIME_MESSAGES.clearDataError
      );
    }
  }

  async function resetUsageData(): Promise<void> {
    const zeroStats = { ...DEFAULT_USAGE_STATS, history: [...DEFAULT_USAGE_STATS.history] };
    (options.getDraft() as Record<string, unknown>).usageStats = zeroStats;
    const appData = options.getAppData();
    options.setAppData({
      ...appData,
      overview: {
        ...appData.overview,
        stats: appData.overview.stats.map((item) => ({ ...item, value: 0 })),
        history: appData.overview.history.map((item) => ({ ...item, value: 0 }))
      }
    });
    if (options.storage) {
      await resetUsageStatsAction(zeroStats, {
        optionsRepository: options.optionsRepository,
        storage: options.storage,
        messagingRepository: options.messagingRepository,
        storageKeys: ['usageStats', 'usage_stats'],
        ...(options.now ? { now: options.now } : {})
      });
    } else {
      await options.optionsRepository.set({ usageStats: zeroStats } as Partial<CompleteOptions>);
    }
    options.controller.scheduleAutoSave(() => options.collectDraftWithWidgets());
  }

  async function loadUsageStatsFromStorage(): Promise<void> {
    if (!options.storage) {
      return;
    }
    try {
      const stored =
        (await options.storage.local.get<UsageStats>(USAGE_STATS_STORAGE_KEY)) ??
        (await options.storage.local.get<UsageStats>(LEGACY_USAGE_STATS_STORAGE_KEY));
      if (!stored) {
        return;
      }
      (options.getDraft() as CompleteOptions & { usageStats?: UsageStats }).usageStats =
        normalizeUsageStats(stored);
      options.refreshAppData();
      options.render();
    } catch (error) {
      console.debug('[Options] Failed to read usage stats for Stitch dashboard:', error);
    }
  }

  async function importConfigurationFromClipboard(configuration: {
    analytics: Awaited<ReturnType<typeof readImportedConfigurationFromClipboard>>['analytics'];
    imported: CompleteOptions;
    version: Awaited<ReturnType<typeof readImportedConfigurationFromClipboard>>['version'];
  }): Promise<void> {
    await options.controller.applyImportedConfig(configuration.imported);
    options.setDraft(configuration.imported);
    options.refreshAppData();
    options.setState(
      applyOptionsToState(options.getState(), configuration.imported, options.getAppData())
    );
    options.render();
    await applyAnalyticsTransferPayload(configuration.analytics);
    options.setMaintenanceLog(
      JSON.stringify({ imported: true, version: configuration.version }, null, 2)
    );
  }

  async function copyConfigurationToClipboard(button: HTMLButtonElement | null): Promise<void> {
    setButtonBusy(button, true);
    try {
      await writeToClipboard(serializeOptionsFullBackup(options.collectDraftWithWidgets()));
      await trackUsageEvent(
        createAnalyticsEventMessage('config_export_completed', {
          outcome: 'completed'
        })
      );
      options.setMaintenanceLog(
        getMessage(
          options.getCurrentMessages(),
          'copyConfigSuccess',
          '✅ Configuration copied to clipboard'
        )
      );
    } catch (error) {
      await trackUsageEvent(
        createAnalyticsEventMessage('config_export_completed', {
          outcome: 'failed'
        })
      );
      options.setMaintenanceLog(`Copy failed: ${String(error)}`);
    } finally {
      setButtonBusy(button, false);
      options.refreshAppData();
      options.render();
    }
  }

  async function importConfigurationWithStatus(button: HTMLButtonElement | null): Promise<void> {
    setButtonBusy(button, true);
    let analyticsPayloadPresent = false;
    try {
      const configuration = await readImportedConfigurationFromClipboard();
      analyticsPayloadPresent = configuration.analyticsPayloadPresent;
      await importConfigurationFromClipboard(configuration);
      await trackUsageEvent(
        createAnalyticsEventMessage('config_import_completed', {
          outcome: 'completed',
          analytics_payload_present: analyticsPayloadPresent
        })
      );
      options.setMaintenanceLog(
        getMessage(
          options.getCurrentMessages(),
          'importSuccess',
          '✅ Configuration imported and saved'
        )
      );
    } catch (error) {
      await trackUsageEvent(
        createAnalyticsEventMessage('config_import_completed', {
          outcome: 'failed',
          analytics_payload_present: analyticsPayloadPresent
        })
      );
      options.setMaintenanceLog(`Import failed: ${String(error)}`);
    } finally {
      setButtonBusy(button, false);
      options.refreshAppData();
      options.render();
    }
  }

  async function repairConfiguration(): Promise<void> {
    const draft = options.getDraft();
    const restDefaults = configProvider.getRestDefaults();
    const templateDefaults = configProvider.getTemplates();
    let baseUrl = draft.rest.baseUrl || draft.rest.httpsUrl || restDefaults.baseUrl;
    const log: string[] = [
      getMessage(options.getCurrentMessages(), 'configFixed', '✅ Configuration fixed and saved'),
      getMessage(
        options.getCurrentMessages(),
        'reloadPrompt',
        'Please reload the page to see the fixed configuration'
      )
    ];

    if (baseUrl.startsWith('http://') && baseUrl.includes(`:${restDefaults.httpsPort}`)) {
      baseUrl = baseUrl.replace('http://', 'https://');
      log.push(`REST URL: ${baseUrl}`);
    } else if (baseUrl.startsWith('https://') && baseUrl.includes(`:${restDefaults.httpPort}`)) {
      baseUrl = baseUrl.replace('https://', 'http://');
      log.push(`REST URL: ${baseUrl}`);
    }

    draft.rest = {
      ...draft.rest,
      httpsUrl: draft.rest.httpsUrl || restDefaults.httpsUrl,
      httpUrl: draft.rest.httpUrl || restDefaults.httpUrl,
      baseUrl
    };
    draft.templates = {
      ...draft.templates,
      article: (draft.templates.article || templateDefaults.article).replace(
        'Clippings/',
        'Articles/'
      ),
      fragment: draft.templates.fragment || templateDefaults.fragment,
      reading: draft.templates.reading || templateDefaults.reading,
      ai: draft.templates.ai || templateDefaults.ai
    };
    options.syncDefaultVaultFromRest();
    options.setMaintenanceLog(log.join('\n'));
    options.refreshAppData();
    await options.controller.saveSnapshot({
      reason: 'manual',
      draft: options.collectDraftWithWidgets()
    });
    options.render();
  }

  return {
    clearAnalyticsPrivacyData,
    copyConfigurationToClipboard,
    importConfigurationWithStatus,
    loadUsageStatsFromStorage,
    persistPrivacyPreference,
    repairConfiguration,
    resetUsageData,
    trackUsageEvent
  };
}
