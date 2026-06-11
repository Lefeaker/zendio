import type { AppError } from '../types';

type SafeAnalyticsContextValue = boolean | number | string;
type SafeAnalyticsContext = Record<string, SafeAnalyticsContextValue>;
type BrowserInfo = { name?: string; version?: string };
type ErrorContextValue = NonNullable<AppError['context']>[string];

const SAFE_CONTEXT_KEYS = [
  'extractor',
  'type',
  'method',
  'statusCode',
  'feature',
  'step',
  'component',
  'action',
  'retryCount',
  'timeout',
  'batchSize',
  'itemCount',
  'duration',
  'memoryUsage',
  'cacheHit',
  'apiVersion',
  'userAgent',
  'platform',
  'locale',
  'theme',
  'screenResolution',
  'viewportSize',
  'connectionType',
  'isOnline',
  'tabCount',
  'extensionContext'
] as const;

function isSafeAnalyticsContextValue(value: ErrorContextValue): value is SafeAnalyticsContextValue {
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';
}

function sanitizeStackTrace(stack: string): string {
  return stack
    .split('\n')
    .slice(0, 5)
    .map((line) => {
      const match = line.match(/at\s+([^(]+)\s*\(.*:(\d+):\d+\)/);
      if (match) {
        return `at ${match[1].trim()}:${match[2]}`;
      }
      return line.replace(/https?:\/\/[^\s]+/g, '[URL]');
    })
    .join('\n');
}

export function extractSafeAnalyticsContext(context?: AppError['context']): SafeAnalyticsContext {
  if (!context) {
    return {};
  }

  const safeContext: SafeAnalyticsContext = {};
  for (const key of SAFE_CONTEXT_KEYS) {
    const value = context[key];
    if (isSafeAnalyticsContextValue(value)) {
      safeContext[key] = value;
    }
  }

  if (typeof context.url === 'string') {
    try {
      const parsedUrl = new URL(context.url);
      safeContext.domain = parsedUrl.hostname;
      safeContext.protocol = parsedUrl.protocol;
    } catch {
      // Ignore invalid URLs in error context.
    }
  }

  if (typeof context.stack === 'string') {
    safeContext.stackTrace = sanitizeStackTrace(context.stack);
  }

  return safeContext;
}

export function resolveBrowserInfo(userAgent: string | undefined): BrowserInfo {
  if (!userAgent) {
    return { name: 'unknown', version: 'unknown' };
  }

  let name = 'unknown';
  if (userAgent.includes('Chrome')) {
    name = 'chrome';
  } else if (userAgent.includes('Firefox')) {
    name = 'firefox';
  } else if (userAgent.includes('Safari')) {
    name = 'safari';
  } else if (userAgent.includes('Edge')) {
    name = 'edge';
  }

  const versionMatch = userAgent.match(/(?:Chrome|Firefox|Safari|Edge)\/(\d+)/);
  return {
    name,
    ...(versionMatch?.[1] ? { version: versionMatch[1] } : {})
  };
}
