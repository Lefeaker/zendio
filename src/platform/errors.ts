export type PlatformErrorCode =
  | 'CHROME_UNAVAILABLE'
  | 'CHROME_ERROR'
  | 'FIREFOX_UNAVAILABLE'
  | 'FIREFOX_ERROR'
  | 'MESSAGE_TIMEOUT'
  | 'UNEXPECTED_RESPONSE';

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;

  constructor(code: PlatformErrorCode, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
  }
}

export function createChromeRuntimeError(message?: string): PlatformError {
  return new PlatformError('CHROME_ERROR', message ?? 'Chrome runtime error');
}

export function chromeUnavailableError(): PlatformError {
  return new PlatformError(
    'CHROME_UNAVAILABLE',
    'Chrome runtime API is not available in this context'
  );
}

export function createFirefoxRuntimeError(message?: string): PlatformError {
  return new PlatformError('FIREFOX_ERROR', message ?? 'Firefox runtime error');
}

export function firefoxUnavailableError(): PlatformError {
  return new PlatformError(
    'FIREFOX_UNAVAILABLE',
    'Firefox browser API is not available in this context'
  );
}
