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

const TRIAL_CONFIG_KEY = 'trial_config';
const TRIAL_STATUS_KEY = 'trial_status';
const DEFAULT_TRIAL_DAYS = 7;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTrialConfig = (value: unknown): value is TrialConfig =>
  isRecord(value) &&
  typeof value.isTrial === 'boolean' &&
  typeof value.expirationTime === 'number' &&
  typeof value.trialDays === 'number' &&
  typeof value.version === 'string';

const missingStorageError = (): Error => new Error('chrome.storage.local is unavailable');

async function getTrialConfigWithPorts(ports: TrialManagerPorts): Promise<TrialConfig | null> {
  if (!ports.storage) {
    ports.logger.warn('[trial-manager] 获取试用配置失败: chrome.storage.local is unavailable');
    return null;
  }

  try {
    const rawResult = await ports.storage.get(TRIAL_CONFIG_KEY);
    const record = isRecord(rawResult) ? rawResult : undefined;
    const storedConfig = record?.[TRIAL_CONFIG_KEY];
    return isTrialConfig(storedConfig) ? storedConfig : null;
  } catch (error) {
    ports.logger.warn(
      '[trial-manager] 获取试用配置失败:',
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
    ports.logger.error('[trial-manager] 设置试用配置失败:', error);
    throw error;
  }

  try {
    await ports.storage.set({ [TRIAL_CONFIG_KEY]: config });
  } catch (error) {
    ports.logger.error(
      '[trial-manager] 设置试用配置失败:',
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
      '[trial-manager] 试用通知创建失败:',
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
  ports.logger.log(`试用版本已初始化，将在 ${trialDays} 天后过期`);

  return config;
}

export async function checkTrialStatus(): Promise<TrialStatus> {
  return checkTrialStatusWithPorts(resolveTrialManagerPorts());
}

export function formatRemainingTime(status: TrialStatus): string {
  if (!status.isTrial) {
    return '正式版本';
  }

  if (status.isExpired) {
    return '已过期';
  }

  if (status.remainingDays > 1) {
    return `剩余 ${status.remainingDays} 天`;
  } else if (status.remainingHours > 1) {
    return `剩余 ${status.remainingHours} 小时`;
  } else {
    return '即将过期';
  }
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

  if (status.isExpired) {
    await maybeCreateNotification(ports, {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'AiiinOB 试用版已过期',
      message: '感谢您试用 AiiinOB！试用期已结束，请联系开发者获取正式版本。'
    });
  } else if (status.isExpiringSoon) {
    await maybeCreateNotification(ports, {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'AiiinOB 试用版即将过期',
      message: `试用版将在 ${formatRemainingTime(status)} 后过期，请及时联系开发者。`
    });
  }
}

export async function clearTrialConfig(): Promise<void> {
  const ports = resolveTrialManagerPorts();
  if (!ports.storage) {
    ports.logger.warn('[trial-manager] 清除试用配置失败: chrome.storage.local is unavailable');
    return;
  }

  try {
    await ports.storage.remove([TRIAL_CONFIG_KEY, TRIAL_STATUS_KEY]);
    ports.logger.log('试用配置已清除');
  } catch (error) {
    ports.logger.warn(
      '[trial-manager] 清除试用配置失败:',
      error instanceof Error ? error : String(error)
    );
  }
}

export async function getTrialSummary(): Promise<string> {
  const status = await checkTrialStatus();

  if (!status.isTrial) {
    return '正式版本';
  }

  const timeStr = formatRemainingTime(status);
  const expirationStr = status.expirationDate
    ? status.expirationDate.toLocaleDateString('zh-CN')
    : '未知';

  return `试用版本 - ${timeStr} (到期日期: ${expirationStr})`;
}
