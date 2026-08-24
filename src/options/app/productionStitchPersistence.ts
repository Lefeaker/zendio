import { configProvider } from '@shared/config/provider';
import { DEFAULT_USAGE_STATS } from '@shared/constants';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import {
  createAnalyticsEventMessage,
  type AnalyticsRuntimeEventPayload
} from '@shared/types/analytics';
import type { UsageStats } from '@shared/types/usage';
import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import { isAnalyticsDebugModeControlAvailable, resolveAnalyticsDebugMode } from '@shared/analytics';
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
import { applyOptionsToState, usageStatsToOverview } from './productionStitchStateMapper';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import { getMessage, setButtonBusy } from './productionStitchPersistenceUi';
import { repairTemplateOptions } from './productionStitchTemplateRepair';
import type { UsageStatsClientLike } from './usage-dashboard/usageStatsClient';
import { deepClone } from '../utils/clone';
type PrivacyPreferenceField = 'analytics' | 'errorReporting' | 'debugMode';
type PrivacySnapshot = CompleteOptions['privacyPreferences'];
interface ProductionStitchPersistenceOptions {
  controller: OptionsController;
  optionsRepository: Pick<IOptionsRepository, 'get' | 'patch' | 'replace' | 'onChange'>;
  messagingRepository: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  usageStatsClient: UsageStatsClientLike;
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
  restoreUsageStatsView(): void;
  trackUsageEvent(message: AnalyticsRuntimeEventPayload): Promise<void>;
}
export function createProductionStitchPersistence(
  options: ProductionStitchPersistenceOptions
): ProductionStitchPersistence {
  let usageSnapshot: UsageStats = {
    ...DEFAULT_USAGE_STATS,
    history: [...DEFAULT_USAGE_STATS.history]
  };
  function applyUsageStats(stats: UsageStats): void {
    usageSnapshot = { ...stats, history: stats.history.map((entry) => ({ ...entry })) };
    const appData = options.getAppData();
    options.setAppData({
      ...appData,
      overview: usageStatsToOverview(appData.overview, usageSnapshot)
    });
  }
  function restoreUsageStatsView(): void {
    applyUsageStats(usageSnapshot);
  }
  function refreshWithUsage(): void {
    options.refreshAppData();
    restoreUsageStatsView();
  }
  async function track(message: ReturnType<typeof createAnalyticsEventMessage>): Promise<void> {
    try {
      await options.messagingRepository.send(message);
    } catch {
      // Telemetry is best-effort and must not block options actions.
    }
  }
  function getPrivacySnapshot(): PrivacySnapshot {
    const current = options.getDraft().privacyPreferences;
    return {
      analytics: current.analytics,
      errorReporting: current.errorReporting,
      debugMode: current.debugMode
    };
  }
  function syncPrivacySnapshotToState(nextSnapshot: PrivacySnapshot): void {
    const draft = options.getDraft();
    const state = options.getState();
    draft.privacyPreferences = nextSnapshot;
    state.privacyAnalytics = nextSnapshot.analytics;
    state.privacyErrorReporting = nextSnapshot.errorReporting;
    state.privacyDebugMode = nextSnapshot.debugMode;
  }
  function normalizePrivacySnapshot(nextSnapshot: PrivacySnapshot): PrivacySnapshot {
    return {
      ...nextSnapshot,
      debugMode: resolveAnalyticsDebugMode(nextSnapshot)
    };
  }
  async function applyRuntimePrivacySnapshot(
    nextSnapshot: PrivacySnapshot,
    field: PrivacyPreferenceField
  ): Promise<void> {
    const runtimeDebugMode = resolveAnalyticsDebugMode(nextSnapshot);
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
    const requestedValue =
      field === 'debugMode' && !isAnalyticsDebugModeControlAvailable() ? false : value;
    const nextSnapshot = normalizePrivacySnapshot({
      ...getPrivacySnapshot(),
      [field]: requestedValue
    });
    await persistPrivacyConsentAction(nextSnapshot, {
      optionsRepository: options.optionsRepository
    });
    syncPrivacySnapshotToState(nextSnapshot);
    await applyRuntimePrivacySnapshot(nextSnapshot, field);
    options.controller.scheduleAutoSave(() => options.collectDraftWithWidgets());
    await track(
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
      const failureMessage = getMessage(
        options.getCurrentMessages(),
        'clearDataError',
        DEFAULT_RUNTIME_MESSAGES.clearDataError
      );
      options.getState().privacyStatus = failureMessage;
      void error;
      throw new Error(failureMessage);
    }
  }
  async function resetUsageData(): Promise<void> {
    const previousStats = usageSnapshot;
    const zeroStats = { ...DEFAULT_USAGE_STATS, history: [...DEFAULT_USAGE_STATS.history] };
    applyUsageStats(zeroStats);
    try {
      applyUsageStats(
        await resetUsageStatsAction({
          usageStatsClient: options.usageStatsClient,
          messagingRepository: options.messagingRepository,
          ...(options.now ? { now: options.now } : {})
        })
      );
    } catch (error) {
      applyUsageStats(previousStats);
      throw error;
    }
  }
  async function loadUsageStatsFromStorage(): Promise<void> {
    try {
      applyUsageStats(await options.usageStatsClient.get());
      options.render();
    } catch (error) {
      console.debug('[Options] Failed to load usage stats through the background owner:', error);
    }
  }
  async function importConfigurationFromClipboard(configuration: {
    analytics: Awaited<ReturnType<typeof readImportedConfigurationFromClipboard>>['analytics'];
    imported: CompleteOptions;
    version: Awaited<ReturnType<typeof readImportedConfigurationFromClipboard>>['version'];
  }): Promise<void> {
    await options.controller.applyImportedConfig(configuration.imported);
    options.setDraft(configuration.imported);
    refreshWithUsage();
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
      await track(
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
      await track(
        createAnalyticsEventMessage('config_export_completed', {
          outcome: 'failed'
        })
      );
      options.setMaintenanceLog(`Copy failed: ${String(error)}`);
    } finally {
      setButtonBusy(button, false);
      refreshWithUsage();
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
      await track(
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
      await track(
        createAnalyticsEventMessage('config_import_completed', {
          outcome: 'failed',
          analytics_payload_present: analyticsPayloadPresent
        })
      );
      const failureMessage = `Import failed: ${String(error)}`;
      options.setMaintenanceLog(failureMessage);
      throw new Error(failureMessage);
    } finally {
      setButtonBusy(button, false);
      refreshWithUsage();
      options.render();
    }
  }

  async function repairConfiguration(): Promise<void> {
    const draft = options.getDraft();
    const before = deepClone({
      rest: draft.rest,
      templates: draft.templates,
      vaultRouter: draft.vaultRouter
    });
    const oldLog = options.getAppData().maintenanceLog;
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
    draft.templates = repairTemplateOptions(draft.templates, templateDefaults);
    options.syncDefaultVaultFromRest();
    options.setMaintenanceLog(log.join('\n'));
    refreshWithUsage();
    try {
      await options.controller.saveSnapshot({
        reason: 'manual',
        draft: options.collectDraftWithWidgets()
      });
    } catch (error) {
      Object.assign(options.getDraft(), before);
      options.setMaintenanceLog(oldLog);
      refreshWithUsage();
      throw error;
    }
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
    restoreUsageStatsView,
    trackUsageEvent: track
  };
}
