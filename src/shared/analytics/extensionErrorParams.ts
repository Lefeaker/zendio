import {
  booleanParam,
  hasUnsafeTelemetryStringContent,
  nonNegativeNumberParam,
  sanitizeTelemetryParams,
  type AnalyticsPrimitive,
  type TelemetryParamDefinition
} from './analyticsSanitizers';
import { TELEMETRY_EVENT_CATALOG, type ExtensionErrorEventParams } from './eventCatalog';

type ExtensionErrorParamName = Extract<keyof ExtensionErrorEventParams, string>;
type ExtensionErrorParamDefinitions = Record<ExtensionErrorParamName, TelemetryParamDefinition>;
type ExtensionErrorValidationReason = 'invalid-params' | 'missing-required-params';
type ExtensionErrorValidationOptions = {
  allowServiceProvidedParams?: boolean;
};
type UntrustedTelemetryRecord = Record<string, unknown>;

const SAFE_CONTEXT_STRING_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;
const SAFE_DESCRIPTION_PATTERN = /^[A-Za-z0-9 .,;:()_'<-]{1,160}$/;
const SAFE_DOMAIN_PATTERN = /^(?=.{1,253}$)[A-Za-z0-9.-]+$/;
const SAFE_HTTP_METHOD_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;
const SAFE_PROTOCOL_PATTERN = /^(?:https?|file|chrome-extension|moz-extension):$/;
const SAFE_RESOLUTION_PATTERN = /^\d{2,5}x\d{2,5}$/;
const SAFE_STACK_LABEL_PATTERN = /^[A-Za-z0-9_$.:<-]{1,40}$/;
const SAFE_STACK_LINE_PATTERN = /^at\s+([A-Za-z0-9_$.:<-]{1,40}):(\d{1,8})$/;
const SAFE_BROWSER_NAMES = new Set(['chrome', 'firefox', 'safari', 'edge', 'unknown']);
const SERVICE_PROVIDED_EXTENSION_ERROR_PARAM_NAMES = new Set<ExtensionErrorParamName>([
  'extension_version',
  'session_id'
]);
const REQUIRED_EXTENSION_ERROR_PARAM_NAMES =
  TELEMETRY_EVENT_CATALOG.extension_error.requiredParams.filter(
    (key) => !SERVICE_PROVIDED_EXTENSION_ERROR_PARAM_NAMES.has(key)
  );

const STRING_CONTEXT_PARAM_NAMES = [
  'action',
  'apiVersion',
  'component',
  'connectionType',
  'extensionContext',
  'extractor',
  'feature',
  'platform',
  'step',
  'theme',
  'type'
] as const satisfies ReadonlyArray<ExtensionErrorParamName>;

const NUMBER_CONTEXT_PARAM_NAMES = [
  'batchSize',
  'duration',
  'itemCount',
  'memoryUsage',
  'retryCount',
  'statusCode',
  'tabCount',
  'timeout'
] as const satisfies ReadonlyArray<ExtensionErrorParamName>;

const BOOLEAN_CONTEXT_PARAM_NAMES = [
  'cacheHit',
  'isOnline'
] as const satisfies ReadonlyArray<ExtensionErrorParamName>;

const EXTENSION_ERROR_PARAM_DEFINITIONS = {
  error_code: contextStringParam({ required: true }),
  error_domain: contextStringParam({ required: true }),
  error_category: contextStringParam({ required: true }),
  error_severity: contextStringParam({ required: true }),
  error_severity_level: nonNegativeNumberParam({
    required: true,
    max: 10,
    privacyNote: 'Allow only bounded severity levels.'
  }),
  error_recoverable: booleanParam({
    required: true,
    privacyNote: 'Allow only boolean recoverability.'
  }),
  error_description: descriptionParam({ required: true }),
  extension_version: contextStringParam({ required: true }),
  timestamp: nonNegativeNumberParam({
    required: true,
    max: 10_000_000_000_000,
    privacyNote: 'Allow only bounded client timestamps.'
  }),
  browser_name: {
    privacyNote: 'Allow only coarse browser family names.',
    sanitize: sanitizeExtensionErrorBrowserName
  },
  browser_version: {
    privacyNote: 'Allow only coarse browser major versions.',
    sanitize: sanitizeExtensionErrorBrowserVersion
  },
  session_id: contextStringParam(),
  extractor: contextStringParam(),
  type: contextStringParam(),
  method: {
    privacyNote: 'Allow only HTTP method enums.',
    sanitize: sanitizeHttpMethod
  },
  statusCode: contextNumberParam('statusCode'),
  feature: contextStringParam(),
  step: contextStringParam(),
  component: contextStringParam(),
  action: contextStringParam(),
  retryCount: contextNumberParam('retryCount'),
  timeout: contextNumberParam('timeout'),
  batchSize: contextNumberParam('batchSize'),
  itemCount: contextNumberParam('itemCount'),
  duration: contextNumberParam('duration'),
  memoryUsage: contextNumberParam('memoryUsage'),
  cacheHit: booleanParam({
    privacyNote: 'Allow only boolean cache-hit state.'
  }),
  apiVersion: contextStringParam(),
  userAgent: contextStringParam(),
  platform: contextStringParam(),
  locale: {
    privacyNote: 'Allow only coarse locale tags.',
    sanitize: sanitizeLocale
  },
  theme: contextStringParam(),
  screenResolution: {
    privacyNote: 'Allow only coarse screen dimensions.',
    sanitize: sanitizeResolution
  },
  viewportSize: {
    privacyNote: 'Allow only coarse viewport dimensions.',
    sanitize: sanitizeResolution
  },
  connectionType: contextStringParam(),
  isOnline: booleanParam({
    privacyNote: 'Allow only boolean online state.'
  }),
  tabCount: contextNumberParam('tabCount'),
  extensionContext: contextStringParam(),
  domain: {
    privacyNote: 'Allow only hostnames without paths or query strings.',
    sanitize: sanitizeDomain
  },
  protocol: {
    privacyNote: 'Allow only coarse URL protocols.',
    sanitize: sanitizeProtocol
  },
  stackTrace: {
    privacyNote: 'Allow only reporter-sanitized stack frame labels and line numbers.',
    sanitize: sanitizeSanitizedStackTrace
  }
} satisfies ExtensionErrorParamDefinitions;

const RUNTIME_EXTENSION_ERROR_PARAM_DEFINITIONS = Object.fromEntries(
  Object.entries(EXTENSION_ERROR_PARAM_DEFINITIONS).filter(
    ([key]) => !SERVICE_PROVIDED_EXTENSION_ERROR_PARAM_NAMES.has(key as ExtensionErrorParamName)
  )
) as Record<string, TelemetryParamDefinition>;

export function validateExtensionErrorEventParams(
  params: unknown,
  options: ExtensionErrorValidationOptions = {}
):
  | { ok: true; params: Record<string, AnalyticsPrimitive> }
  | { ok: false; reason: ExtensionErrorValidationReason } {
  if (!isPlainRecord(params)) {
    return { ok: false, reason: 'invalid-params' };
  }

  const sanitizedParams = sanitizeExtensionErrorEventParams(params, options);
  const originalEntries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (originalEntries.length !== Object.keys(sanitizedParams).length) {
    return { ok: false, reason: 'invalid-params' };
  }

  if (!hasRequiredExtensionErrorEventParams(sanitizedParams)) {
    return { ok: false, reason: 'missing-required-params' };
  }

  return {
    ok: true,
    params: sanitizedParams
  };
}

export function sanitizeExtensionErrorEventParams(
  params: unknown,
  options: ExtensionErrorValidationOptions = {}
): Record<string, AnalyticsPrimitive> {
  const definitions =
    options.allowServiceProvidedParams === false
      ? RUNTIME_EXTENSION_ERROR_PARAM_DEFINITIONS
      : EXTENSION_ERROR_PARAM_DEFINITIONS;

  return sanitizeTelemetryParams(definitions, params);
}

export function hasRequiredExtensionErrorEventParams(
  params: Record<string, AnalyticsPrimitive>
): boolean {
  return REQUIRED_EXTENSION_ERROR_PARAM_NAMES.every((key) => params[key] !== undefined);
}

export function sanitizeExtensionErrorContext(
  context?: Record<string, unknown>
): Partial<ExtensionErrorEventParams> {
  if (!context) {
    return {};
  }

  const safeContext: Partial<ExtensionErrorEventParams> = {};

  for (const key of STRING_CONTEXT_PARAM_NAMES) {
    const sanitizedValue = sanitizeContextString(context[key]);
    if (sanitizedValue !== undefined) {
      safeContext[key] = sanitizedValue;
    }
  }

  const method = sanitizeHttpMethod(context.method);
  if (method !== undefined) {
    safeContext.method = method;
  }

  const locale = sanitizeLocale(context.locale);
  if (locale !== undefined) {
    safeContext.locale = locale;
  }

  const screenResolution = sanitizeResolution(context.screenResolution);
  if (screenResolution !== undefined) {
    safeContext.screenResolution = screenResolution;
  }

  const viewportSize = sanitizeResolution(context.viewportSize);
  if (viewportSize !== undefined) {
    safeContext.viewportSize = viewportSize;
  }

  for (const key of NUMBER_CONTEXT_PARAM_NAMES) {
    const sanitizedValue = sanitizeContextNumber(context[key], key);
    if (sanitizedValue !== undefined) {
      safeContext[key] = sanitizedValue;
    }
  }

  for (const key of BOOLEAN_CONTEXT_PARAM_NAMES) {
    if (typeof context[key] === 'boolean') {
      safeContext[key] = context[key];
    }
  }

  if (typeof context.url === 'string') {
    const urlContext = sanitizeUrlContext(context.url);
    if (urlContext.domain !== undefined) {
      safeContext.domain = urlContext.domain;
    }
    if (urlContext.protocol !== undefined) {
      safeContext.protocol = urlContext.protocol;
    }
  }

  if (typeof context.stack === 'string') {
    const stackTrace = sanitizeRawStackTrace(context.stack);
    if (stackTrace !== undefined) {
      safeContext.stackTrace = stackTrace;
    }
  }

  return safeContext;
}

export function sanitizeExtensionErrorBrowserName(value: unknown): string | undefined {
  const normalized = sanitizeContextString(value)?.toLowerCase();
  return normalized !== undefined && SAFE_BROWSER_NAMES.has(normalized) ? normalized : undefined;
}

export function sanitizeExtensionErrorBrowserVersion(value: unknown): string | undefined {
  return sanitizeContextString(value);
}

function contextStringParam(options: { required?: boolean } = {}): TelemetryParamDefinition {
  return {
    ...options,
    privacyNote: 'Allow only bounded low-cardinality context identifiers.',
    sanitize: sanitizeContextString
  };
}

function descriptionParam(options: { required?: boolean }): TelemetryParamDefinition {
  return {
    ...options,
    privacyNote: 'Allow only bounded static error descriptions.',
    sanitize: sanitizeDescription
  };
}

function contextNumberParam(key: (typeof NUMBER_CONTEXT_PARAM_NAMES)[number]) {
  return nonNegativeNumberParam({
    max: key === 'statusCode' ? 999 : 1_000_000_000,
    privacyNote: 'Allow only bounded non-negative context metrics.'
  });
}

function sanitizeContextString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (
    !SAFE_CONTEXT_STRING_PATTERN.test(normalized) ||
    hasUnsafeTelemetryStringContent(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function sanitizeDescription(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!SAFE_DESCRIPTION_PATTERN.test(normalized) || hasUnsafeTelemetryStringContent(normalized)) {
    return undefined;
  }

  return normalized;
}

function sanitizeHttpMethod(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return SAFE_HTTP_METHOD_PATTERN.test(normalized) ? normalized : undefined;
}

function sanitizeLocale(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(normalized) ? normalized : undefined;
}

function sanitizeResolution(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return SAFE_RESOLUTION_PATTERN.test(normalized) ? normalized : undefined;
}

function sanitizeContextNumber(
  value: unknown,
  key: (typeof NUMBER_CONTEXT_PARAM_NAMES)[number]
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  const max = key === 'statusCode' ? 999 : 1_000_000_000;
  return value <= max ? value : undefined;
}

function sanitizeDomain(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    !SAFE_DOMAIN_PATTERN.test(normalized) ||
    hasUnsafeTelemetryStringContent(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function sanitizeProtocol(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return SAFE_PROTOCOL_PATTERN.test(normalized) ? normalized : undefined;
}

function sanitizeUrlContext(value: string): Pick<ExtensionErrorEventParams, 'domain' | 'protocol'> {
  try {
    const url = new URL(value);
    const domain = sanitizeDomain(url.hostname);
    const protocol = sanitizeProtocol(url.protocol);
    const result: Pick<ExtensionErrorEventParams, 'domain' | 'protocol'> = {};

    if (domain !== undefined) {
      result.domain = domain;
    }

    if (protocol !== undefined) {
      result.protocol = protocol;
    }

    return result;
  } catch {
    return {};
  }
}

function sanitizeRawStackTrace(stack: string): string | undefined {
  const sanitizedFrames = stack
    .split('\n')
    .slice(0, 5)
    .map((line, index) => sanitizeRawStackFrame(line, index))
    .filter((line): line is string => line !== undefined);

  return sanitizedFrames.length > 0 ? sanitizedFrames.join('\n') : undefined;
}

function sanitizeRawStackFrame(line: string, index: number): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!trimmed.startsWith('at ')) {
    return index === 0 ? 'Error' : '[stack-frame-redacted]';
  }

  const namedFrame = trimmed.match(/^at\s+([^(]+?)\s*\((?:.*):(\d+):\d+\)$/);
  if (namedFrame) {
    const label = sanitizeStackLabel(namedFrame[1]);
    return `at ${label}:${namedFrame[2]}`;
  }

  const anonymousFrame = trimmed.match(/^at\s+(?:.*[\\/])?([^/\\()]+):(\d+):\d+$/);
  if (anonymousFrame) {
    return `at anonymous:${anonymousFrame[2]}`;
  }

  return '[stack-frame-redacted]';
}

function sanitizeStackLabel(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '_');
  return SAFE_STACK_LABEL_PATTERN.test(normalized) ? normalized : 'anonymous';
}

function sanitizeSanitizedStackTrace(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedLines = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (normalizedLines.length === 0 || normalizedLines.length > 5) {
    return undefined;
  }

  const normalized = normalizedLines.join('\n');
  if (normalized.length > 400 || hasUnsafeTelemetryStringContent(normalized)) {
    return undefined;
  }

  const allLinesAreSafe = normalizedLines.every((line) => {
    if (line === 'Error' || line === '[stack-frame-redacted]') {
      return true;
    }

    return SAFE_STACK_LINE_PATTERN.test(line);
  });

  return allLinesAreSafe ? normalized : undefined;
}

function isPlainRecord(value: unknown): value is UntrustedTelemetryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
