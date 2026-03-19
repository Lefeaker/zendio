export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export type ErrorDomain =
  | 'i18n'
  | 'extraction'
  | 'classifier'
  | 'rest'
  | 'chrome-api'
  | 'notifications'
  | 'options'
  | 'background'
  | 'content'
  | 'unknown';

export interface AppError {
  code: string;
  domain: ErrorDomain;
  message: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  userMessage?: string;
  context?: Record<string, unknown>;
  cause?: unknown;
  timestamp?: number;
}

export interface ErrorReporter {
  report(error: AppError): Promise<void> | void;
}

export interface HandleErrorOptions {
  rethrow?: boolean;
  suppressConsole?: boolean;
  suppressReporters?: boolean;
  suppressNotifications?: boolean;
  metadata?: Record<string, unknown>;
}

export function isAppError(candidate: unknown): candidate is AppError {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const value = candidate as Record<string, unknown>;
  return typeof value.code === 'string'
    && typeof value.domain === 'string'
    && typeof value.severity === 'string'
    && typeof value.recoverable === 'boolean';
}
