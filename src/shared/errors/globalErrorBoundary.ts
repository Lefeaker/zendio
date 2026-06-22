import { getErrorHandler } from './errorHandler';
import type { AppError, ErrorDomain } from './types';
import { ErrorSeverity } from './types';

type ErrorHandlerLike = Pick<ReturnType<typeof getErrorHandler>, 'handle'>;

type ErrorBoundaryTarget = {
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
};

export interface GlobalErrorBoundaryOptions {
  domain: ErrorDomain;
  errorHandler?: ErrorHandlerLike;
  metadata?: Record<string, unknown>;
  target?: ErrorBoundaryTarget;
  shouldReport?: (report: GlobalErrorBoundaryReport) => boolean;
}

export interface GlobalErrorBoundaryReport {
  event: Event;
  eventType: 'error' | 'unhandledrejection';
  reason: AppError['cause'];
  metadata: NonNullable<AppError['context']>;
}

function normalizeThrownError(
  reason: unknown,
  fallbackMessage: string
): Pick<AppError, 'message' | 'cause'> {
  if (reason instanceof Error) {
    return {
      message: reason.message,
      cause: reason
    };
  }

  if (typeof reason === 'string') {
    return {
      message: reason,
      cause: reason
    };
  }

  return {
    message: fallbackMessage,
    cause: reason
  };
}

function buildUnhandledError(
  code: string,
  domain: ErrorDomain,
  reason: unknown,
  metadata?: Record<string, unknown>
): AppError {
  const normalized = normalizeThrownError(reason, code);

  return {
    code,
    domain,
    message: normalized.message,
    severity: ErrorSeverity.ERROR,
    recoverable: false,
    timestamp: Date.now(),
    ...(normalized.cause !== undefined && { cause: normalized.cause }),
    ...(metadata ? { context: { ...metadata } } : {})
  };
}

export function registerGlobalErrorBoundary(options: GlobalErrorBoundaryOptions): () => void {
  const target = options.target ?? (globalThis as ErrorBoundaryTarget);
  const errorHandler = options.errorHandler ?? getErrorHandler();

  if (!target.addEventListener || !target.removeEventListener) {
    return () => undefined;
  }

  const handleErrorEvent: EventListener = (event) => {
    const errorEvent = event as ErrorEvent;
    const metadata = {
      ...options.metadata,
      eventType: 'error' as const,
      ...(errorEvent.filename ? { filename: errorEvent.filename } : {}),
      ...(errorEvent.lineno ? { lineno: errorEvent.lineno } : {}),
      ...(errorEvent.colno ? { colno: errorEvent.colno } : {})
    };
    const reason: AppError['cause'] = errorEvent.error ?? errorEvent.message;
    if (
      options.shouldReport?.({
        event,
        eventType: 'error',
        reason,
        metadata
      }) === false
    ) {
      return;
    }
    const reportedError = buildUnhandledError('UNHANDLED_ERROR', options.domain, reason, metadata);

    void errorHandler.handle(reportedError, { suppressNotifications: true });
  };

  const handleUnhandledRejection: EventListener = (event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    const reason: AppError['cause'] = rejectionEvent.reason;
    const metadata = {
      ...options.metadata,
      eventType: 'unhandledrejection' as const
    };
    if (
      options.shouldReport?.({
        event,
        eventType: 'unhandledrejection',
        reason,
        metadata
      }) === false
    ) {
      return;
    }
    const reportedError = buildUnhandledError(
      'UNHANDLED_REJECTION',
      options.domain,
      reason,
      metadata
    );

    void errorHandler.handle(reportedError, { suppressNotifications: true });
  };

  target.addEventListener('error', handleErrorEvent);
  target.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    target.removeEventListener?.('error', handleErrorEvent);
    target.removeEventListener?.('unhandledrejection', handleUnhandledRejection);
  };
}
