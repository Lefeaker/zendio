import type { RuntimeService, RuntimeInstallDetails } from '../platform/interfaces/runtime';
import type { StorageService } from '../platform/interfaces/storage';
import type { TabsService } from '../platform/interfaces/tabs';
import { cleanupBackgroundDependencies } from './bootstrap';
import { checkTrialStatus, initializeTrial, showExpirationNotice } from '../utils/trial-manager';

export interface TrialConfigPayload {
  trialDays: number;
}

export interface TrialLifecycleDependencies {
  runtime: Pick<RuntimeService, 'getURL' | 'onInstalled'>;
  storage: Pick<StorageService, 'local'>;
  tabs: Pick<TabsService, 'create'>;
  fetch: typeof fetch;
  initializeTrial: (trialDays: number) => Promise<unknown>;
  checkTrialStatus: typeof checkTrialStatus;
  showExpirationNotice: typeof showExpirationNotice;
  cleanupBackgroundDependencies: () => void;
  registerOnSuspend?: (listener: () => void) => void;
  setInterval?: typeof globalThis.setInterval;
}

export function parseTrialConfigPayload(value: unknown): TrialConfigPayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { trialDays } = value as { trialDays?: unknown };
  if (typeof trialDays !== 'number' || Number.isNaN(trialDays) || trialDays <= 0) {
    return null;
  }

  return { trialDays };
}

export async function initializeTrialSystem(
  deps: Pick<
    TrialLifecycleDependencies,
    'checkTrialStatus' | 'showExpirationNotice' | 'setInterval'
  >
): Promise<void> {
  try {
    const status = await deps.checkTrialStatus();

    if (status.isTrial) {
      console.log(
        `[trial] 试用版本状态: ${status.isExpired ? '已过期' : `剩余${status.remainingDays}天`}`
      );

      if (status.isExpiringSoon || status.isExpired) {
        try {
          await deps.showExpirationNotice();
        } catch (error) {
          console.error('[trial] Failed to show expiration notice:', error);
        }
      }

      (deps.setInterval ?? globalThis.setInterval)(
        () => {
          void deps
            .checkTrialStatus()
            .then((currentStatus) => {
              if (currentStatus.isExpiringSoon || currentStatus.isExpired) {
                return deps.showExpirationNotice();
              }
              return undefined;
            })
            .catch((error) => {
              console.error('[trial] Failed to perform scheduled status check:', error);
            });
        },
        60 * 60 * 1000
      );
    }
  } catch (error) {
    console.error('[trial] 初始化试用系统失败:', error);
  }
}

export async function initializeTrialOnInstall(deps: {
  runtime: Pick<RuntimeService, 'getURL'>;
  fetch: typeof fetch;
  initializeTrial: TrialLifecycleDependencies['initializeTrial'];
}): Promise<void> {
  try {
    const trialConfigUrl = deps.runtime.getURL('trial-config.json');
    const response = await deps.fetch(trialConfigUrl);

    if (!response.ok) {
      const status = Number.isFinite(response.status) ? response.status : 'unknown';
      console.warn(
        `[trial] trial-config.json request failed (${status}), skipping trial initialization`
      );
      return;
    }

    const payload: unknown = await response.json();
    const trialConfig = parseTrialConfigPayload(payload);
    if (!trialConfig) {
      console.warn('[trial] trial-config.json is invalid, skipping trial initialization');
      return;
    }
    console.log('[trial] 检测到试用版本配置，正在初始化...');
    await deps.initializeTrial(trialConfig.trialDays);
    console.log(`[trial] 试用版本已激活，试用期 ${trialConfig.trialDays} 天`);
  } catch {
    console.log('[trial] 未检测到试用配置，使用正式版本');
  }
}

export async function handleFirstInstall(
  details: RuntimeInstallDetails,
  deps: Pick<
    TrialLifecycleDependencies,
    'runtime' | 'storage' | 'tabs' | 'fetch' | 'initializeTrial'
  >
): Promise<void> {
  if (details.reason !== 'install') {
    return;
  }

  console.log('[background] Extension installed for the first time');

  try {
    await initializeTrialOnInstall(deps);

    const onboardingCompleted = await deps.storage.local.get<boolean>('onboardingCompleted');
    if (!onboardingCompleted) {
      const onboardingUrl = deps.runtime.getURL('onboarding/index.html');
      await deps.tabs.create({ url: onboardingUrl });
      console.log('[background] Opened onboarding page for first-time user');
    }
  } catch (error) {
    console.error('[background] Failed to handle first-time installation:', error);
  }
}

export function registerTrialLifecycle(deps: TrialLifecycleDependencies): void {
  void initializeTrialSystem(deps).catch((error) => {
    console.error('[background] Failed to initialize trial system:', error);
  });

  deps.runtime.onInstalled((details) => {
    void handleFirstInstall(details, deps);
  });

  deps.registerOnSuspend?.(() => {
    console.log('[background] Service worker suspending, cleaning up dependencies...');
    deps.cleanupBackgroundDependencies();
  });
}

export function createDefaultTrialLifecycleDependencies(
  runtime: Pick<RuntimeService, 'getURL' | 'onInstalled'>,
  storage: Pick<StorageService, 'local'>,
  tabs: Pick<TabsService, 'create'>
): TrialLifecycleDependencies {
  const registerOnSuspend =
    typeof chrome !== 'undefined' && chrome.runtime?.onSuspend
      ? (listener: () => void) => {
          chrome.runtime.onSuspend.addListener(listener);
        }
      : undefined;

  return {
    runtime,
    storage,
    tabs,
    fetch,
    initializeTrial,
    checkTrialStatus,
    showExpirationNotice,
    cleanupBackgroundDependencies,
    setInterval: globalThis.setInterval,
    ...(registerOnSuspend !== undefined && { registerOnSuspend })
  };
}
