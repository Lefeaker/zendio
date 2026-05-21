/**
 * 试用版本管理器
 * 负责检查扩展的试用期限制和相关功能
 */

export interface TrialConfig {
  /** 试用版本标识 */
  isTrial: boolean;
  /** 过期时间戳 (毫秒) */
  expirationTime: number;
  /** 试用天数 */
  trialDays: number;
  /** 版本标识 */
  version: string;
}

export interface TrialStatus {
  /** 是否为试用版 */
  isTrial: boolean;
  /** 是否已过期 */
  isExpired: boolean;
  /** 剩余天数 */
  remainingDays: number;
  /** 剩余小时数 */
  remainingHours: number;
  /** 过期时间 */
  expirationDate: Date | null;
  /** 是否即将过期（剩余时间少于24小时） */
  isExpiringSoon: boolean;
}

// 试用配置常量
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

/**
 * 获取试用配置
 */
export async function getTrialConfig(): Promise<TrialConfig | null> {
  try {
    const rawResult: unknown = await chrome.storage.local.get(TRIAL_CONFIG_KEY);
    const record = isRecord(rawResult) ? rawResult : undefined;
    const storedConfig = record?.[TRIAL_CONFIG_KEY];
    return isTrialConfig(storedConfig) ? storedConfig : null;
  } catch (error) {
    console.error('获取试用配置失败:', error);
    return null;
  }
}

/**
 * 设置试用配置
 */
export async function setTrialConfig(config: TrialConfig): Promise<void> {
  try {
    await chrome.storage.local.set({ [TRIAL_CONFIG_KEY]: config });
  } catch (error) {
    console.error('设置试用配置失败:', error);
    throw error;
  }
}

/**
 * 初始化试用版本
 * 在扩展首次安装时调用
 */
export async function initializeTrial(
  trialDays: number = DEFAULT_TRIAL_DAYS
): Promise<TrialConfig> {
  const now = Date.now();
  const expirationTime = now + trialDays * 24 * 60 * 60 * 1000;

  const config: TrialConfig = {
    isTrial: true,
    expirationTime,
    trialDays,
    version: chrome.runtime.getManifest().version
  };

  await setTrialConfig(config);
  console.log(`试用版本已初始化，将在 ${trialDays} 天后过期`);

  return config;
}

/**
 * 检查试用状态
 */
export async function checkTrialStatus(): Promise<TrialStatus> {
  const config = await getTrialConfig();

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

  const now = Date.now();
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

/**
 * 格式化剩余时间显示
 */
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

/**
 * 检查功能是否可用
 * 如果试用版已过期，返回 false
 */
export async function isFeatureAvailable(): Promise<boolean> {
  const status = await checkTrialStatus();
  return !status.isExpired;
}

/**
 * 显示过期提醒
 */
export async function showExpirationNotice(): Promise<void> {
  const status = await checkTrialStatus();

  if (!status.isTrial) {
    return;
  }

  if (status.isExpired) {
    // 显示过期通知
    if (chrome.notifications) {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'AiiinOB 试用版已过期',
        message: '感谢您试用 AiiinOB！试用期已结束，请联系开发者获取正式版本。'
      });
    }
  } else if (status.isExpiringSoon) {
    // 显示即将过期通知
    if (chrome.notifications) {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'AiiinOB 试用版即将过期',
        message: `试用版将在 ${formatRemainingTime(status)} 后过期，请及时联系开发者。`
      });
    }
  }
}

/**
 * 清除试用配置（用于测试）
 */
export async function clearTrialConfig(): Promise<void> {
  try {
    await chrome.storage.local.remove([TRIAL_CONFIG_KEY, TRIAL_STATUS_KEY]);
    console.log('试用配置已清除');
  } catch (error) {
    console.error('清除试用配置失败:', error);
  }
}

/**
 * 获取试用信息摘要
 */
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
