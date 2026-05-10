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
import type { UsageStats } from '@shared/types/usage';
import type { Messages } from '@i18n';
import { persistPrivacyConsentAction, resetUsageStatsAction } from '@options/app/actions';
import { applyAnalyticsTransferPayload } from '@options/services/analyticsTransfer';
import {
  parseConfigInput,
  readConfigTextFromClipboard,
  writeToClipboard
} from '@options/services/configTransfer';
import { normalizeOptionsForTransfer } from '@options/utils/optionsTransfer';
import {
  getAnalyticsConfigManager,
  setAnalyticsConsent
} from '@shared/errors/analytics/analyticsConfig';
import { applyOptionsToState, LEGACY_USAGE_STATS_STORAGE_KEY } from './productionStitchStateMapper';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { OptionsController } from './optionsController';

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
}

function getMessage(messages: Messages | null, key: keyof Messages, fallback: string): string {
  const value = messages?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function setButtonBusy(button: HTMLButtonElement | null, busy: boolean): void {
  if (!button) {
    return;
  }
  button.disabled = busy;
  if (busy) {
    button.setAttribute('aria-busy', 'true');
  } else {
    button.removeAttribute('aria-busy');
  }
}

export function createProductionStitchPersistence(
  options: ProductionStitchPersistenceOptions
): ProductionStitchPersistence {
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

  async function persistPrivacyPreference(
    field: 'analytics' | 'errorReporting' | 'debugMode',
    value: boolean
  ): Promise<void> {
    const draft = options.getDraft();
    const state = options.getState();
    const nextSnapshot = {
      ...getPrivacySnapshot(),
      [field]: value
    };
    if ((!nextSnapshot.analytics || !nextSnapshot.errorReporting) && nextSnapshot.debugMode) {
      nextSnapshot.debugMode = false;
    }
    (draft as Record<string, unknown>).privacyPreferences = nextSnapshot;
    state.privacyAnalytics = nextSnapshot.analytics;
    state.privacyErrorReporting = nextSnapshot.errorReporting;
    state.privacyDebugMode = nextSnapshot.debugMode;
    if (field === 'debugMode') {
      await getAnalyticsConfigManager().updateConfig({ debugMode: nextSnapshot.debugMode });
    } else {
      await setAnalyticsConsent(nextSnapshot.analytics, nextSnapshot.errorReporting);
      if (!nextSnapshot.debugMode) {
        await getAnalyticsConfigManager().updateConfig({ debugMode: false });
      }
    }
    await persistPrivacyConsentAction(nextSnapshot, {
      optionsRepository: options.optionsRepository
    });
    options.controller.scheduleAutoSave(() => options.collectDraftWithWidgets());
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
      const draft = options.getDraft();
      const state = options.getState();
      const nextSnapshot = {
        analytics: false,
        errorReporting: false,
        debugMode: false
      };
      await getAnalyticsConfigManager().clearAllData();
      (draft as Record<string, unknown>).privacyPreferences = nextSnapshot;
      state.privacyAnalytics = false;
      state.privacyErrorReporting = false;
      state.privacyDebugMode = false;
      state.privacyStatus = getMessage(
        options.getCurrentMessages(),
        'allDataCleared',
        '所有分析数据已清除。'
      );
      await persistPrivacyConsentAction(nextSnapshot, {
        optionsRepository: options.optionsRepository
      });
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

  async function importConfigurationFromClipboard(): Promise<void> {
    const parsed = parseConfigInput(await readConfigTextFromClipboard());
    await applyAnalyticsTransferPayload(parsed.analytics);
    const imported = mergeOptions(parsed.options) as CompleteOptions;
    await options.controller.applyImportedConfig(imported);
    options.setDraft(imported);
    options.setMaintenanceLog(JSON.stringify({ imported: true, version: parsed.version }, null, 2));
    options.refreshAppData();
    options.setState(applyOptionsToState(options.getState(), imported, options.getAppData()));
    options.render();
  }

  async function copyConfigurationToClipboard(button: HTMLButtonElement | null): Promise<void> {
    setButtonBusy(button, true);
    try {
      await writeToClipboard(
        JSON.stringify(normalizeOptionsForTransfer(options.collectDraftWithWidgets()), null, 2)
      );
      options.setMaintenanceLog(
        getMessage(options.getCurrentMessages(), 'copyConfigSuccess', '配置已复制到剪贴板！')
      );
    } catch (error) {
      options.setMaintenanceLog(`Copy failed: ${String(error)}`);
    } finally {
      setButtonBusy(button, false);
      options.refreshAppData();
      options.render();
    }
  }

  async function importConfigurationWithStatus(button: HTMLButtonElement | null): Promise<void> {
    setButtonBusy(button, true);
    try {
      await importConfigurationFromClipboard();
      options.setMaintenanceLog(
        getMessage(options.getCurrentMessages(), 'importSuccess', '配置已成功导入！')
      );
    } catch (error) {
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
    resetUsageData
  };
}
