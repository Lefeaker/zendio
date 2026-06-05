import { mergeOptions } from '@shared/config/optionsMerger';
import { configProvider } from '@shared/config/provider';
import {
  DEFAULT_USAGE_STATS,
  normalizeUsageStats,
  USAGE_STATS_STORAGE_KEY
} from '@shared/constants';
import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import { createTrackUsageEventMessage, type TrackUsageEventPayload } from '@shared/types/analytics';
import type { UsageStats } from '@shared/types/usage';
import type { Messages } from '@i18n';
import { persistPrivacyConsentAction, resetUsageStatsAction } from '@options/app/actions';
import { applyAnalyticsTransferPayload } from '@options/services/analyticsTransfer';
import {
  parseConfigInput,
  readConfigTextFromClipboard,
  writeToClipboard
} from '@options/services/configTransfer';
import {
  getAnalyticsConfigManager,
  setAnalyticsConsent
} from '@shared/errors/analytics/analyticsConfig';
import { updateErrorAnalyticsConfig } from '@shared/errors/analytics';
import { serializeOptionsFullBackup } from './productionStitchConfigExport';
import { prepareAnalyticsDataClearedEvent } from './productionStitchFinalAnalyticsEvent';
import { applyOptionsToState, LEGACY_USAGE_STATS_STORAGE_KEY } from './productionStitchStateMapper';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import { getMessage, setButtonBusy } from './productionStitchPersistenceUi';

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
  persistPrivacyPreference(
    field: 'analytics' | 'errorReporting' | 'debugMode',
    value: boolean
  ): Promise<void>;
  repairConfiguration(): Promise<void>;
  resetUsageData(): Promise<void>;
  trackUsageEvent(message: TrackUsageEventPayload): Promise<void>;
}

export function createProductionStitchPersistence(
  options: ProductionStitchPersistenceOptions
): ProductionStitchPersistence {
  async function trackUsageEvent(
    message: ReturnType<typeof createTrackUsageEventMessage>
  ): Promise<void> {
    try {
      await options.messagingRepository.send(message);
    } catch {
      // Telemetry is best-effort and must not block options actions.
    }
  }

  function getPrivacySnapshot(): {
    analytics: boolean;
    errorReporting: boolean;
    debugMode: boolean;
  } {
    const current = (
      options.getDraft() as {
        privacyPreferences?: { analytics?: boolean; errorReporting?: boolean; debugMode?: boolean };
      }
    ).privacyPreferences;
    return {
      analytics: Boolean(current?.analytics),
      errorReporting: Boolean(current?.errorReporting),
      debugMode: Boolean(current?.debugMode)
    };
  }

  function syncPrivacySnapshotToState(nextSnapshot: {
    analytics: boolean;
    errorReporting: boolean;
    debugMode: boolean;
  }): void {
    const draft = options.getDraft();
    const state = options.getState();
    (draft as Record<string, unknown>).privacyPreferences = nextSnapshot;
    state.privacyAnalytics = nextSnapshot.analytics;
    state.privacyErrorReporting = nextSnapshot.errorReporting;
    state.privacyDebugMode = nextSnapshot.debugMode;
  }

  async function applyRuntimePrivacySnapshot(
    nextSnapshot: {
      analytics: boolean;
      errorReporting: boolean;
      debugMode: boolean;
    },
    field: 'analytics' | 'errorReporting' | 'debugMode'
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
    field: 'analytics' | 'errorReporting' | 'debugMode',
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
      createTrackUsageEventMessage('privacy_consent_changed', {
        field,
        enabled: nextSnapshot[field]
      })
    );
  }

  async function clearAnalyticsPrivacyData(): Promise<void> {
    const shouldClear =
      typeof window.confirm === 'function'
        ? window.confirm(
            getMessage(options.getCurrentMessages(), 'confirmClearAllData', '清空全部分析数据？')
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
        '所有分析数据已清除。'
      );
      options.controller.scheduleAutoSave(() => options.collectDraftWithWidgets());
    } catch (error) {
      void error;
      options.getState().privacyStatus = getMessage(
        options.getCurrentMessages(),
        'clearDataError',
        '清除数据失败，请稍后重试。'
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

  async function readImportedConfigurationFromClipboard(): Promise<{
    analytics: Awaited<ReturnType<typeof parseConfigInput>>['analytics'];
    analyticsPayloadPresent: boolean;
    imported: CompleteOptions;
    version: Awaited<ReturnType<typeof parseConfigInput>>['version'];
  }> {
    const parsed = parseConfigInput(await readConfigTextFromClipboard());
    return {
      analytics: parsed.analytics,
      analyticsPayloadPresent: parsed.analytics !== undefined,
      imported: mergeOptions(parsed.options) as CompleteOptions,
      version: parsed.version
    };
  }

  async function importConfigurationFromClipboard(configuration: {
    analytics: Awaited<ReturnType<typeof parseConfigInput>>['analytics'];
    imported: CompleteOptions;
    version: Awaited<ReturnType<typeof parseConfigInput>>['version'];
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
        createTrackUsageEventMessage('config_export_completed', {
          outcome: 'completed'
        })
      );
      options.setMaintenanceLog(
        getMessage(options.getCurrentMessages(), 'copyConfigSuccess', '配置已复制到剪贴板！')
      );
    } catch (error) {
      await trackUsageEvent(
        createTrackUsageEventMessage('config_export_completed', {
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
        createTrackUsageEventMessage('config_import_completed', {
          outcome: 'completed',
          analytics_payload_present: analyticsPayloadPresent
        })
      );
      options.setMaintenanceLog(
        getMessage(options.getCurrentMessages(), 'importSuccess', '配置已成功导入！')
      );
    } catch (error) {
      await trackUsageEvent(
        createTrackUsageEventMessage('config_import_completed', {
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
    const log: string[] = ['修复配置'];

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
