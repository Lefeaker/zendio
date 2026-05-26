export interface TrialManagerLogger {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface TrialManagerPorts {
  storage: Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove'> | null;
  getManifestVersion(): string;
  createNotification?: (
    options: chrome.notifications.NotificationCreateOptions
  ) => Promise<string | void> | string | void;
  now(): number;
  logger: TrialManagerLogger;
}

function getChromeApi(): typeof chrome | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome;
}

function createConsoleLogger(): TrialManagerLogger {
  return {
    log: (message?: unknown, ...optionalParams: unknown[]) =>
      console.log(message, ...optionalParams),
    warn: (message?: unknown, ...optionalParams: unknown[]) =>
      console.warn(message, ...optionalParams),
    error: (message?: unknown, ...optionalParams: unknown[]) =>
      console.error(message, ...optionalParams)
  };
}

export function createDefaultTrialManagerPorts(): TrialManagerPorts {
  const chromeApi = getChromeApi();
  const notifications = chromeApi?.notifications;

  return {
    storage: chromeApi?.storage?.local ?? null,
    getManifestVersion: () => chromeApi?.runtime?.getManifest?.().version ?? 'unknown',
    ...(notifications?.create
      ? {
          createNotification: (options: chrome.notifications.NotificationCreateOptions) =>
            notifications.create(options)
        }
      : {}),
    now: () => Date.now(),
    logger: createConsoleLogger()
  };
}

export function resolveTrialManagerPorts(
  override: Partial<TrialManagerPorts> = {}
): TrialManagerPorts {
  const defaults = createDefaultTrialManagerPorts();

  return {
    storage: override.storage !== undefined ? override.storage : defaults.storage,
    getManifestVersion: override.getManifestVersion ?? defaults.getManifestVersion,
    ...(Object.prototype.hasOwnProperty.call(override, 'createNotification')
      ? { createNotification: override.createNotification }
      : defaults.createNotification
        ? { createNotification: defaults.createNotification }
        : {}),
    now: override.now ?? defaults.now,
    logger: override.logger ?? defaults.logger
  };
}
