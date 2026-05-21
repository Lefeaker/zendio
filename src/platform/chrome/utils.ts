import { chromeUnavailableError, createChromeRuntimeError } from '../errors';
import { handleError } from '../../shared/errors';
import { chromeApiErrors } from '../../shared/errors/chromeApiErrors';

export function ensureChrome(): typeof chrome {
  if (typeof chrome === 'undefined') {
    const error = chromeUnavailableError();
    void handleError(
      chromeApiErrors.unsupportedEnvironment('chrome', {
        api: 'chrome',
        operation: 'ensureChrome'
      }),
      { suppressNotifications: true }
    );
    throw error;
  }
  return chrome;
}

export function getChromeLastError(): Error | null {
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined;
  const lastError = runtime?.lastError ?? null;
  if (!lastError) {
    return null;
  }
  return createChromeRuntimeError(lastError.message);
}

export function normalizePromise<T>(
  executor: (resolve: (value: T) => void, reject: (error: Error) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      executor(
        (value) => resolve(value),
        (error) => reject(error)
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function succeedOrThrow<T>(value: T): T {
  const error = getChromeLastError();
  if (error) {
    throw error;
  }
  return value;
}

export function suppressLastError(): void {
  void getChromeLastError();
}
