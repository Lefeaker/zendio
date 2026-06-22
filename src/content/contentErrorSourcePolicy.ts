import type { GlobalErrorBoundaryReport } from '../shared/errors/globalErrorBoundary';

const EXTENSION_PROTOCOLS = new Set([
  'chrome-extension:',
  'moz-extension:',
  'safari-web-extension:'
]);
const PAGE_PROTOCOLS = new Set(['http:', 'https:']);
const IGNORED_BROWSER_ERROR_MESSAGES = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded'
]);
const SOURCE_URL_PATTERN =
  /\b(?:chrome-extension|moz-extension|safari-web-extension|https?):\/\/[^\s)]+/giu;

export function shouldReportContentGlobalError(report: GlobalErrorBoundaryReport): boolean {
  if (isIgnoredBrowserError(report)) {
    return false;
  }

  const filename =
    report.event instanceof ErrorEvent && report.event.filename ? report.event.filename : null;
  if (filename) {
    return shouldReportSourceUrl(filename);
  }

  const stackDecision = shouldReportReasonStack(report.reason);
  return stackDecision ?? true;
}

function isIgnoredBrowserError(report: GlobalErrorBoundaryReport): boolean {
  const message = getReasonMessage(report.reason) ?? getEventMessage(report.event);
  return message !== null && IGNORED_BROWSER_ERROR_MESSAGES.has(message.trim());
}

function getReasonMessage(reason: GlobalErrorBoundaryReport['reason']): string | null {
  if (reason instanceof Error) {
    return reason.message;
  }
  if (typeof reason === 'string') {
    return reason;
  }
  if (typeof reason === 'object' && reason !== null && hasStringMessage(reason)) {
    return reason.message;
  }
  return null;
}

function getEventMessage(event: Event): string | null {
  return event instanceof ErrorEvent && typeof event.message === 'string' ? event.message : null;
}

function shouldReportReasonStack(reason: GlobalErrorBoundaryReport['reason']): boolean | null {
  const stack =
    reason instanceof Error && typeof reason.stack === 'string'
      ? reason.stack
      : typeof reason === 'object' && reason !== null && hasStringStack(reason)
        ? reason.stack
        : null;
  if (!stack) {
    return null;
  }

  const sources = stack.match(SOURCE_URL_PATTERN) ?? [];
  if (sources.some(isExtensionSourceUrl)) {
    return true;
  }
  if (sources.some(isPageSourceUrl)) {
    return false;
  }
  return null;
}

function shouldReportSourceUrl(sourceUrl: string): boolean {
  if (isExtensionSourceUrl(sourceUrl)) {
    return true;
  }
  if (isPageSourceUrl(sourceUrl)) {
    return false;
  }
  return true;
}

function isExtensionSourceUrl(sourceUrl: string): boolean {
  return isUrlWithProtocol(sourceUrl, EXTENSION_PROTOCOLS);
}

function isPageSourceUrl(sourceUrl: string): boolean {
  return isUrlWithProtocol(sourceUrl, PAGE_PROTOCOLS);
}

function isUrlWithProtocol(sourceUrl: string, protocols: ReadonlySet<string>): boolean {
  try {
    return protocols.has(new URL(sourceUrl).protocol);
  } catch {
    return false;
  }
}

function hasStringMessage(value: object): value is { message: string } {
  return 'message' in value && typeof value.message === 'string';
}

function hasStringStack(value: object): value is { stack: string } {
  return 'stack' in value && typeof value.stack === 'string';
}
