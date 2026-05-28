type TrialManagerLogValue = string | number | boolean | Error | null | undefined;

export interface TrialManagerLogger {
  log(message?: TrialManagerLogValue, ...optionalParams: TrialManagerLogValue[]): void;
  warn(message?: TrialManagerLogValue, ...optionalParams: TrialManagerLogValue[]): void;
  error(message?: TrialManagerLogValue, ...optionalParams: TrialManagerLogValue[]): void;
}

export type TrialManagerStorageValue = object | string | number | boolean | null | undefined;
export type TrialManagerNotificationOptions = chrome.notifications.NotificationCreateOptions;

export interface TrialManagerStoragePort {
  get(key: string): Promise<Record<string, TrialManagerStorageValue>>;
  set(items: Record<string, TrialManagerStorageValue>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface TrialManagerPorts {
  storage: TrialManagerStoragePort | null;
  getManifestVersion(): string;
  createNotification?: (
    options: TrialManagerNotificationOptions
  ) => Promise<string | void> | string | void;
  now(): number;
  logger: TrialManagerLogger;
}

export interface TrialManagerPortDependencies {
  storage?: TrialManagerPorts['storage'];
  runtime?: { getManifest?: () => { version?: string } | undefined } | null;
  notifications?: {
    create: (
      notificationId: string,
      options: TrialManagerNotificationOptions
    ) => Promise<string | void> | string | void;
  } | null;
  createNotification?: TrialManagerPorts['createNotification'];
  now?: () => number;
  logger?: TrialManagerLogger;
}

const TRIAL_EXPIRATION_NOTIFICATION_ID = 'trial-expiration-notice';

let defaultPortDependencies: TrialManagerPortDependencies = {};

function createConsoleLogger(): TrialManagerLogger {
  return {
    log: (message?: TrialManagerLogValue, ...optionalParams: TrialManagerLogValue[]) =>
      console.log(message, ...optionalParams),
    warn: (message?: TrialManagerLogValue, ...optionalParams: TrialManagerLogValue[]) =>
      console.warn(message, ...optionalParams),
    error: (message?: TrialManagerLogValue, ...optionalParams: TrialManagerLogValue[]) =>
      console.error(message, ...optionalParams)
  };
}

export function configureDefaultTrialManagerPortDependencies(
  dependencies: TrialManagerPortDependencies
): () => void {
  const previous = defaultPortDependencies;
  defaultPortDependencies = { ...dependencies };
  return () => {
    defaultPortDependencies = previous;
  };
}

function createNotificationPort(
  dependencies: TrialManagerPortDependencies
): TrialManagerPorts['createNotification'] {
  if (Object.prototype.hasOwnProperty.call(dependencies, 'createNotification')) {
    return dependencies.createNotification;
  }

  if (!dependencies.notifications) {
    return undefined;
  }

  return (options: TrialManagerNotificationOptions) =>
    dependencies.notifications?.create(TRIAL_EXPIRATION_NOTIFICATION_ID, options);
}

export function createDefaultTrialManagerPorts(
  dependencies: TrialManagerPortDependencies = defaultPortDependencies
): TrialManagerPorts {
  const createNotification = createNotificationPort(dependencies);

  return {
    storage: dependencies.storage ?? null,
    getManifestVersion: () => dependencies.runtime?.getManifest?.()?.version ?? 'unknown',
    ...(createNotification ? { createNotification } : {}),
    now: dependencies.now ?? (() => Date.now()),
    logger: dependencies.logger ?? createConsoleLogger()
  };
}

export function resolveTrialManagerPorts(
  override: Partial<TrialManagerPorts> = {}
): TrialManagerPorts {
  const defaults = createDefaultTrialManagerPorts();

  return {
    storage: override.storage !== undefined ? override.storage : defaults.storage,
    getManifestVersion: () =>
      override.getManifestVersion ? override.getManifestVersion() : defaults.getManifestVersion(),
    ...(Object.prototype.hasOwnProperty.call(override, 'createNotification')
      ? { createNotification: override.createNotification }
      : defaults.createNotification
        ? { createNotification: defaults.createNotification }
        : {}),
    now: () => (override.now ? override.now() : defaults.now()),
    logger: override.logger ?? defaults.logger
  };
}
