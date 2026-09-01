import { configProvider } from '@shared/config/provider';
import { DEFAULT_USAGE_STATS } from '@shared/constants';
import type { CompleteOptions } from '@shared/types/options';
import { createAnalyticsEventMessage } from '@shared/types/analytics';
import type { UsageStats } from '@shared/types/usage';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
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
import { usageStatsToOverview } from './productionStitchStateMapper';
import { getMessage, setButtonBusy } from './productionStitchPersistenceUi';
import { repairTemplateOptions } from './productionStitchTemplateRepair';
import { deepClone } from '../utils/clone';
import type {
  PrivacyPreferenceField,
  ProductionStitchPersistence,
  ProductionStitchPersistenceOptions
} from './productionStitchStorageTypes';
type PrivacySnapshot = CompleteOptions['privacyPreferences'];
export function createProductionStitchPersistence(
  options: ProductionStitchPersistenceOptions
): ProductionStitchPersistence {
  let usageGeneration = 0;
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
  function refresh(): void {
    options.refreshAppData();
    restoreUsageStatsView();
  }
  async function track(message: ReturnType<typeof createAnalyticsEventMessage>): Promise<void> {
    if (!options.isActive()) return;
    try {
      await options.messagingRepository.send(message);
    } catch {
      // Best-effort only.
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
    if (!options.isActive()) return;
    await getAnalyticsConfigManager().updateConfig({ debugMode: runtimeDebugMode });
    if (!options.isActive()) return;
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
    if (!options.isActive()) return;
    syncPrivacySnapshotToState(nextSnapshot);
    await applyRuntimePrivacySnapshot(nextSnapshot, field);
    if (!options.isActive()) return;
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
      if (!options.isActive()) return;
      const nextSnapshot = {
        analytics: false,
        errorReporting: false,
        debugMode: false
      };
      await persistPrivacyConsentAction(nextSnapshot, {
        optionsRepository: options.optionsRepository
      });
      if (!options.isActive()) return;
      syncPrivacySnapshotToState(nextSnapshot);
      await setAnalyticsConsent(false, false);
      if (!options.isActive()) return;
      await getAnalyticsConfigManager().clearAllData();
      if (!options.isActive()) return;
      await updateErrorAnalyticsConfig(false);
      if (!options.isActive()) return;
      await sendAnalyticsDataClearedEvent();
      if (!options.isActive()) return;
      options.getState().privacyStatus = getMessage(
        options.getCurrentMessages(),
        'allDataCleared',
        DEFAULT_RUNTIME_MESSAGES.allDataCleared
      );
      options.controller.scheduleAutoSave(() => options.collectDraftWithWidgets());
    } catch (error) {
      if (!options.isActive()) return;
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
    const generation = ++usageGeneration;
    const previousStats = usageSnapshot;
    const zeroStats = { ...DEFAULT_USAGE_STATS, history: [...DEFAULT_USAGE_STATS.history] };
    applyUsageStats(zeroStats);
    try {
      const stats = await resetUsageStatsAction({
        usageStatsClient: options.usageStatsClient,
        messagingRepository: options.messagingRepository,
        ...(options.now ? { now: options.now } : {})
      });
      if (!options.isActive() || generation !== usageGeneration) return;
      applyUsageStats(stats);
    } catch (error) {
      if (!options.isActive() || generation !== usageGeneration) return;
      applyUsageStats(previousStats);
      throw error;
    }
  }
  async function loadUsageStatsFromStorage(): Promise<void> {
    const generation = ++usageGeneration;
    try {
      const stats = await options.usageStatsClient.get();
      if (!options.isActive() || generation !== usageGeneration) return;
      applyUsageStats(stats);
      options.render('overview-usage');
    } catch (error) {
      console.debug('[Options] Failed to load usage stats through the background owner:', error);
    }
  }
  async function importConfigurationFromClipboard(
    configuration: {
      analytics: Awaited<ReturnType<typeof readImportedConfigurationFromClipboard>>['analytics'];
      imported: CompleteOptions;
      version: Awaited<ReturnType<typeof readImportedConfigurationFromClipboard>>['version'];
    },
    markInstalled: () => void
  ): Promise<void> {
    await options.controller.applyImportedConfig(configuration.imported);
    if (!options.isActive()) return;
    markInstalled();
    options.installImportedOptions(configuration.imported);
    restoreUsageStatsView();
    await applyAnalyticsTransferPayload(configuration.analytics);
    if (!options.isActive()) return;
    options.setMaintenanceLog(
      JSON.stringify({ imported: true, version: configuration.version }, null, 2)
    );
  }
  async function copyConfigurationToClipboard(button: HTMLButtonElement | null): Promise<void> {
    if (options.isActive() && button?.isConnected !== false) setButtonBusy(button, true);
    try {
      await writeToClipboard(serializeOptionsFullBackup(options.collectDraftWithWidgets()));
      if (!options.isActive()) return;
      await track(
        createAnalyticsEventMessage('config_export_completed', {
          outcome: 'completed'
        })
      );
      if (!options.isActive()) return;
      options.setMaintenanceLog(
        getMessage(
          options.getCurrentMessages(),
          'copyConfigSuccess',
          '✅ Configuration copied to clipboard'
        )
      );
    } catch (error) {
      if (!options.isActive()) return;
      await track(
        createAnalyticsEventMessage('config_export_completed', {
          outcome: 'failed'
        })
      );
      if (!options.isActive()) return;
      options.setMaintenanceLog(`Copy failed: ${String(error)}`);
    } finally {
      if (options.isActive() && button?.isConnected !== false) setButtonBusy(button, false);
      if (options.isActive()) {
        refresh();
        options.render('maintenance');
      }
    }
  }

  async function importConfigurationWithStatus(button: HTMLButtonElement | null): Promise<void> {
    if (options.isActive() && button?.isConnected !== false) setButtonBusy(button, true);
    let analyticsPayloadPresent = false;
    let installed = false;
    try {
      const configuration = await readImportedConfigurationFromClipboard();
      if (!options.isActive()) return;
      analyticsPayloadPresent = configuration.analyticsPayloadPresent;
      await importConfigurationFromClipboard(configuration, () => (installed = true));
      if (!options.isActive()) return;
      await track(
        createAnalyticsEventMessage('config_import_completed', {
          outcome: 'completed',
          analytics_payload_present: analyticsPayloadPresent
        })
      );
      if (!options.isActive()) return;
      options.setMaintenanceLog(
        getMessage(
          options.getCurrentMessages(),
          'importSuccess',
          '✅ Configuration imported and saved'
        )
      );
    } catch (error) {
      if (!options.isActive()) return;
      await track(
        createAnalyticsEventMessage('config_import_completed', {
          outcome: 'failed',
          analytics_payload_present: analyticsPayloadPresent
        })
      );
      if (!options.isActive()) return;
      const failureMessage = `Import failed: ${String(error)}`;
      options.setMaintenanceLog(failureMessage);
      throw new Error(failureMessage);
    } finally {
      if (options.isActive() && button?.isConnected !== false) setButtonBusy(button, false);
      if (options.isActive()) {
        refresh();
        options.render(installed ? 'all-invariant-recovery' : 'maintenance');
      }
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
    refresh();
    try {
      await options.controller.saveSnapshot({
        reason: 'manual',
        draft: options.collectDraftWithWidgets()
      });
    } catch (error) {
      if (!options.isActive()) return;
      Object.assign(options.getDraft(), before);
      options.setMaintenanceLog(oldLog);
      refresh();
      throw error;
    }
    if (!options.isActive()) return;
    options.render(['storage', 'output', 'maintenance']);
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
