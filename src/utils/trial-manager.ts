import {
  DEFAULT_LANGUAGE,
  DEFAULT_RUNTIME_MESSAGES,
  formatMessage,
  getCurrentLanguage,
  getMessages,
  type Messages
} from '@i18n';
import {
  resolveTrialManagerPorts,
  type TrialManagerNotificationOptions,
  type TrialManagerPorts
} from './trial-manager-ports';

export interface TrialConfig {
  isTrial: boolean;
  expirationTime: number;
  trialDays: number;
  version: string;
}

export interface TrialStatus {
  isTrial: boolean;
  isExpired: boolean;
  remainingDays: number;
  remainingHours: number;
  expirationDate: Date | null;
  isExpiringSoon: boolean;
}

type TrialMessageKey =
  | 'trialNotificationExpiredMessage'
  | 'trialNotificationExpiredTitle'
  | 'trialNotificationExpiringSoonMessage'
  | 'trialNotificationExpiringSoonTitle'
  | 'trialSummaryExpired'
  | 'trialSummaryRemaining';

type TrialMessages = Pick<Messages, TrialMessageKey>;

const TRIAL_CONFIG_KEY = 'trial_config';
const TRIAL_STATUS_KEY = 'trial_status';
const DEFAULT_TRIAL_DAYS = 7;

const DEFAULT_TRIAL_MESSAGES: TrialMessages = {
  trialNotificationExpiredMessage: DEFAULT_RUNTIME_MESSAGES.trialNotificationExpiredMessage,
  trialNotificationExpiredTitle: DEFAULT_RUNTIME_MESSAGES.trialNotificationExpiredTitle,
  trialNotificationExpiringSoonMessage:
    DEFAULT_RUNTIME_MESSAGES.trialNotificationExpiringSoonMessage,
  trialNotificationExpiringSoonTitle: DEFAULT_RUNTIME_MESSAGES.trialNotificationExpiringSoonTitle,
  trialSummaryExpired: DEFAULT_RUNTIME_MESSAGES.trialSummaryExpired,
  trialSummaryRemaining: DEFAULT_RUNTIME_MESSAGES.trialSummaryRemaining
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTrialConfig = (value: unknown): value is TrialConfig =>
  isRecord(value) &&
  typeof value.isTrial === 'boolean' &&
  typeof value.expirationTime === 'number' &&
  typeof value.trialDays === 'number' &&
  typeof value.version === 'string';

const missingStorageError = (): Error => new Error('chrome.storage.local is unavailable');

function selectTrialMessages(messages: Messages): TrialMessages {
  return {
    trialNotificationExpiredMessage:
      messages.trialNotificationExpiredMessage ??
      DEFAULT_TRIAL_MESSAGES.trialNotificationExpiredMessage,
    trialNotificationExpiredTitle:
      messages.trialNotificationExpiredTitle ??
      DEFAULT_TRIAL_MESSAGES.trialNotificationExpiredTitle,
    trialNotificationExpiringSoonMessage:
      messages.trialNotificationExpiringSoonMessage ??
      DEFAULT_TRIAL_MESSAGES.trialNotificationExpiringSoonMessage,
    trialNotificationExpiringSoonTitle:
      messages.trialNotificationExpiringSoonTitle ??
      DEFAULT_TRIAL_MESSAGES.trialNotificationExpiringSoonTitle,
    trialSummaryExpired: messages.trialSummaryExpired ?? DEFAULT_TRIAL_MESSAGES.trialSummaryExpired,
    trialSummaryRemaining:
      messages.trialSummaryRemaining ?? DEFAULT_TRIAL_MESSAGES.trialSummaryRemaining
  };
}

function formatDuration(value: number, unit: 'day' | 'hour', language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit,
    unitDisplay: 'long'
  }).format(Math.max(0, value));
}

async function getTrialLocalizationContext(): Promise<{
  language: string;
  messages: TrialMessages;
}> {
  try {
    const [language, messages] = await Promise.all([getCurrentLanguage(), getMessages()]);
    return {
      language,
      messages: selectTrialMessages(messages)
    };
  } catch {
    return {
      language: DEFAULT_LANGUAGE,
      messages: DEFAULT_TRIAL_MESSAGES
    };
  }
}

async function getTrialConfigWithPorts(ports: TrialManagerPorts): Promise<TrialConfig | null> {
  if (!ports.storage) {
    ports.logger.warn(
      '[trial-manager] Failed to read trial config: chrome.storage.local is unavailable'
    );
    return null;
  }

  try {
    const rawResult = await ports.storage.get(TRIAL_CONFIG_KEY);
    const record = isRecord(rawResult) ? rawResult : undefined;
    const storedConfig = record?.[TRIAL_CONFIG_KEY];
    return isTrialConfig(storedConfig) ? storedConfig : null;
  } catch (error) {
    ports.logger.warn(
      '[trial-manager] Failed to read trial config:',
      error instanceof Error ? error : String(error)
    );
    return null;
  }
}

async function setTrialConfigWithPorts(
  config: TrialConfig,
  ports: TrialManagerPorts
): Promise<void> {
  if (!ports.storage) {
    const error = missingStorageError();
    ports.logger.error('[trial-manager] Failed to persist trial config:', error);
    throw error;
  }

  try {
    await ports.storage.set({ [TRIAL_CONFIG_KEY]: config });
  } catch (error) {
    ports.logger.error(
      '[trial-manager] Failed to persist trial config:',
      error instanceof Error ? error : String(error)
    );
    throw error;
  }
}

async function checkTrialStatusWithPorts(ports: TrialManagerPorts): Promise<TrialStatus> {
  const config = await getTrialConfigWithPorts(ports);

  if (!config || !config.isTrial) {
    return {
      isTrial: false,
      isExpired: false,
      remainingDays: Infinity,
      remainingHours: Infinity,
      expirationDate: null,
      isExpiringSoon: false
    };
  }

  const now = ports.now();
  const timeRemaining = config.expirationTime - now;
  const isExpired = timeRemaining <= 0;
  const remainingDays = Math.max(0, Math.ceil(timeRemaining / (24 * 60 * 60 * 1000)));
  const remainingHours = Math.max(0, Math.ceil(timeRemaining / (60 * 60 * 1000)));
  const isExpiringSoon = timeRemaining > 0 && timeRemaining <= 24 * 60 * 60 * 1000;

  return {
    isTrial: true,
    isExpired,
    remainingDays,
    remainingHours,
    expirationDate: new Date(config.expirationTime),
    isExpiringSoon
  };
}

async function maybeCreateNotification(
  ports: TrialManagerPorts,
  options: TrialManagerNotificationOptions
): Promise<void> {
  if (!ports.createNotification) {
    return;
  }

  try {
    await ports.createNotification(options);
  } catch (error) {
    ports.logger.warn(
      '[trial-manager] Failed to create trial notification:',
      error instanceof Error ? error : String(error)
    );
  }
}

export async function getTrialConfig(): Promise<TrialConfig | null> {
  return getTrialConfigWithPorts(resolveTrialManagerPorts());
}

export async function setTrialConfig(config: TrialConfig): Promise<void> {
  await setTrialConfigWithPorts(config, resolveTrialManagerPorts());
}

export async function initializeTrial(
  trialDays: number = DEFAULT_TRIAL_DAYS
): Promise<TrialConfig> {
  const ports = resolveTrialManagerPorts();
  const now = ports.now();
  const expirationTime = now + trialDays * 24 * 60 * 60 * 1000;

  const config: TrialConfig = {
    isTrial: true,
    expirationTime,
    trialDays,
    version: ports.getManifestVersion()
  };

  await setTrialConfigWithPorts(config, ports);
  ports.logger.log(
    `[trial-manager] Trial initialized, expires in ${trialDays} ${trialDays === 1 ? 'day' : 'days'}`
  );

  return config;
}

export async function checkTrialStatus(): Promise<TrialStatus> {
  return checkTrialStatusWithPorts(resolveTrialManagerPorts());
}

export function formatRemainingTime(
  status: TrialStatus,
  language: string = DEFAULT_LANGUAGE
): string {
  if (!status.isTrial || status.isExpired) {
    return '';
  }

  if (status.remainingDays > 1) {
    return formatDuration(status.remainingDays, 'day', language);
  }

  if (status.remainingHours > 1) {
    return formatDuration(status.remainingHours, 'hour', language);
  }

  return formatDuration(1, 'hour', language);
}

export function formatTrialDate(date: Date, language: string = DEFAULT_LANGUAGE): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(date);
}

export function formatTrialDateTime(date: Date, language: string = DEFAULT_LANGUAGE): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(date);
}

export function formatTrialSummaryMessage(
  status: TrialStatus,
  messages: TrialMessages,
  language: string = DEFAULT_LANGUAGE
): string {
  if (!status.isTrial) {
    return '';
  }

  const date = status.expirationDate ? formatTrialDate(status.expirationDate, language) : '';
  if (status.isExpired) {
    return formatMessage(messages.trialSummaryExpired, { date }, language);
  }

  return formatMessage(
    messages.trialSummaryRemaining,
    {
      remaining: formatRemainingTime(status, language),
      date
    },
    language
  );
}

export async function isFeatureAvailable(): Promise<boolean> {
  const status = await checkTrialStatus();
  return !status.isExpired;
}

export async function showExpirationNotice(): Promise<void> {
  const ports = resolveTrialManagerPorts();
  const status = await checkTrialStatusWithPorts(ports);

  if (!status.isTrial) {
    return;
  }

  const { language, messages } = await getTrialLocalizationContext();

  if (status.isExpired) {
    await maybeCreateNotification(ports, {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: messages.trialNotificationExpiredTitle,
      message: messages.trialNotificationExpiredMessage
    });
    return;
  }

  if (status.isExpiringSoon) {
    await maybeCreateNotification(ports, {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: messages.trialNotificationExpiringSoonTitle,
      message: formatMessage(
        messages.trialNotificationExpiringSoonMessage,
        {
          remaining: formatRemainingTime(status, language)
        },
        language
      )
    });
  }
}

export async function clearTrialConfig(): Promise<void> {
  const ports = resolveTrialManagerPorts();
  if (!ports.storage) {
    ports.logger.warn(
      '[trial-manager] Failed to clear trial config: chrome.storage.local is unavailable'
    );
    return;
  }

  try {
    await ports.storage.remove([TRIAL_CONFIG_KEY, TRIAL_STATUS_KEY]);
    ports.logger.log('[trial-manager] Trial configuration cleared');
  } catch (error) {
    ports.logger.warn(
      '[trial-manager] Failed to clear trial config:',
      error instanceof Error ? error : String(error)
    );
  }
}

export async function getTrialSummary(): Promise<string> {
  const status = await checkTrialStatus();
  if (!status.isTrial) {
    return '';
  }

  const { language, messages } = await getTrialLocalizationContext();
  return formatTrialSummaryMessage(status, messages, language);
}
