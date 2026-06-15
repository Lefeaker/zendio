import type { RuntimeService, RuntimeInstallDetails } from '../platform/interfaces/runtime';
import type {
  NotificationOptions,
  NotificationsService
} from '../platform/interfaces/notifications';
import type { StorageAreaService } from '../platform/interfaces/storage';
import type { StorageService } from '../platform/interfaces/storage';
import type { TabsService } from '../platform/interfaces/tabs';
import { cleanupBackgroundDependencies } from './bootstrap';
import { checkTrialStatus, initializeTrial, showExpirationNotice } from '../utils/trial-manager';
import {
  configureDefaultTrialManagerPortDependencies,
  type TrialManagerNotificationOptions,
  type TrialManagerPortDependencies,
  type TrialManagerPorts,
  type TrialManagerStorageValue
} from '../utils/trial-manager-ports';

export interface TrialConfigPayload {
  trialDays: number;
}

type RuntimeOnSuspendPort =
  | ((listener: () => void) => void)
  | { addListener: (listener: () => void) => void };

type TrialLifecycleRuntime = Pick<RuntimeService, 'getURL' | 'onInstalled'> & {
  registerOnSuspend?: (listener: () => void) => void;
  onSuspend?: RuntimeOnSuspendPort;
  getManifest?: RuntimeService['getManifest'];
};

export interface TrialLifecycleDependencies {
  runtime: TrialLifecycleRuntime;
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

function createTrialManagerStoragePort(
  storage: Pick<StorageAreaService, 'get' | 'set' | 'remove'>
): NonNullable<TrialManagerPorts['storage']> {
  return {
    async get(key: string) {
      return { [key]: await storage.get(key) };
    },
    async set(items: Record<string, TrialManagerStorageValue>) {
      await Promise.all(Object.entries(items).map(([key, value]) => storage.set(key, value)));
    },
    async remove(keys: string | string[]) {
      await storage.remove(keys);
    }
  };
}

function createTrialManagerNotificationPort(
  notifications: Pick<NotificationsService, 'create'>
): NonNullable<TrialManagerPortDependencies['notifications']> {
  return {
    create: (notificationId, options) =>
      notifications.create(notificationId, toNotificationOptions(options))
  };
}

function toNotificationOptions(options: TrialManagerNotificationOptions): NotificationOptions {
  const result: NotificationOptions = {
    type: 'basic',
    iconUrl: options.iconUrl ?? '',
    title: options.title ?? '',
    message: options.message ?? ''
  };

  if (options.contextMessage !== undefined) {
    result.contextMessage = options.contextMessage;
  }

  if (options.requireInteraction !== undefined) {
    result.requireInteraction = options.requireInteraction;
  }

  return result;
}

function resolveRegisterOnSuspend(
  runtime: TrialLifecycleRuntime
): ((listener: () => void) => void) | undefined {
  if (runtime.registerOnSuspend) {
    return (listener) => {
      void runtime.registerOnSuspend?.(listener);
    };
  }

  if (typeof runtime.onSuspend === 'function') {
    const onSuspend = runtime.onSuspend;
    return (listener) => {
      void onSuspend(listener);
    };
  }

  const onSuspend = runtime.onSuspend;
  if (typeof onSuspend === 'object' && onSuspend !== null) {
    return (listener) => {
      onSuspend.addListener(listener);
    };
  }

  return undefined;
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
        `[trial] Trial status: ${status.isExpired ? 'expired' : `${status.remainingDays} days remaining`}`
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
    console.error('[trial] Failed to initialize trial system:', error);
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
    console.log('[trial] Trial config detected, initializing...');
    await deps.initializeTrial(trialConfig.trialDays);
    console.log(
      `[trial] Trial activated for ${trialConfig.trialDays} ${trialConfig.trialDays === 1 ? 'day' : 'days'}`
    );
  } catch {
    console.log('[trial] Trial config not found, using the full version');
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
  runtime: TrialLifecycleRuntime,
  storage: Pick<StorageService, 'local'>,
  tabs: Pick<TabsService, 'create'>,
  notifications?: Pick<NotificationsService, 'create'>
): TrialLifecycleDependencies {
  configureDefaultTrialManagerPortDependencies({
    storage: createTrialManagerStoragePort(storage.local),
    ...(runtime.getManifest ? { runtime: { getManifest: runtime.getManifest } } : {}),
    ...(notifications ? { notifications: createTrialManagerNotificationPort(notifications) } : {})
  });
  const registerOnSuspend = resolveRegisterOnSuspend(runtime);

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
