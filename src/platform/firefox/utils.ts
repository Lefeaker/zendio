import { firefoxUnavailableError, createFirefoxRuntimeError } from '../errors';
import { handleError } from '../../shared/errors';
import { chromeApiErrors } from '../../shared/errors/chromeApiErrors';

/**
 * 确保 Firefox browser API 可用
 */
export function ensureFirefox(): typeof browser {
  if (typeof browser === 'undefined') {
    const error = firefoxUnavailableError();
    void handleError(
      chromeApiErrors.unsupportedEnvironment('browser', {
        api: 'browser',
        operation: 'ensureFirefox'
      }),
      { suppressNotifications: true }
    );
    throw error;
  }
  return browser;
}

/**
 * 获取 Firefox runtime 错误
 */
export function getFirefoxLastError(): Error | null {
  const runtime = typeof browser !== 'undefined' ? browser.runtime : undefined;
  const lastError = runtime?.lastError ?? null;
  if (!lastError) {
    return null;
  }
  return createFirefoxRuntimeError(lastError.message);
}

/**
 * 检测是否为 Firefox 环境
 */
export function isFirefoxEnvironment(): boolean {
  return typeof browser !== 'undefined' && 
         typeof chrome === 'undefined';
}

/**
 * 获取 Firefox 版本信息
 */
export async function getFirefoxVersion(): Promise<string> {
  try {
    const browserInfo = await browser.runtime.getBrowserInfo();
    return browserInfo.version;
  } catch {
    return 'unknown';
  }
}
