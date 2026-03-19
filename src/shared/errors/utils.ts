import { AppError, ErrorSeverity, ErrorDomain, isAppError } from './types';

interface UnknownErrorOptions {
  code?: string;
  domain?: ErrorDomain;
  defaultMessage?: string;
  recoverable?: boolean;
  context?: Record<string, unknown>;
}

export function normalizeToAppError(error: unknown, options: UnknownErrorOptions = {}): AppError {
  if (isAppError(error)) {
    return error;
  }

  const isNativeError = error instanceof Error;
  const message = options.defaultMessage ?? (isNativeError ? error.message : 'Unknown error');

  return {
    code: options.code ?? 'UNKNOWN_ERROR',
    domain: options.domain ?? 'unknown',
    message,
    severity: ErrorSeverity.ERROR,
    recoverable: options.recoverable ?? false,
    userMessage: message,
    context: {
      ...options.context,
      cause: isNativeError
        ? {
            name: error.name,
            message: error.message,
            ...(error.stack ? { stack: error.stack } : {})
          }
        : { raw: String(error) }
    },
    cause: error
  };
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeValue(entry);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    return result;
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }
  return value;
}

export function toSerializableAppError(error: AppError): AppError {
  let context: Record<string, unknown> | undefined;
  if (error.context) {
    const sanitized = sanitizeValue(error.context);
    if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
      context = sanitized as Record<string, unknown>;
    }
  }

  const cause = sanitizeValue(error.cause);

  const serializable: AppError = {
    code: error.code,
    domain: error.domain,
    message: error.message,
    severity: error.severity,
    recoverable: error.recoverable
  };

  if (error.userMessage !== undefined) {
    serializable.userMessage = error.userMessage;
  }
  if (error.timestamp !== undefined) {
    serializable.timestamp = error.timestamp;
  }
  if (context !== undefined) {
    serializable.context = context;
  }
  if (cause !== undefined) {
    serializable.cause = cause;
  }

  try {
    JSON.stringify(serializable);
    return serializable;
  } catch {
    const fallback: AppError = {
      code: error.code,
      domain: error.domain,
      message: error.message,
      severity: error.severity,
      recoverable: error.recoverable
    };

    if (error.userMessage !== undefined) {
      fallback.userMessage = error.userMessage;
    }
    if (error.timestamp !== undefined) {
      fallback.timestamp = error.timestamp;
    }

    return fallback;
  }
}
