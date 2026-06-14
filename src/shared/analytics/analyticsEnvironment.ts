export type AnalyticsTransportMode = 'disabled' | 'proxy' | 'directDebug';

export interface AnalyticsPublicBuildConfig {
  measurementId?: string;
  transportMode?: AnalyticsTransportMode;
  proxyEndpoint?: string;
}

export const DEFAULT_ANALYTICS_MEASUREMENT_ID = 'G-XXXXXXXXXX';
export const ANALYTICS_TRANSPORT_MODES = ['disabled', 'proxy', 'directDebug'] as const;

const FORBIDDEN_PUBLIC_CONFIG_PATTERN =
  /(api[_-]?key|api[_-]?secret|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+|secret|token|password)/i;
const GOOGLE_ANALYTICS_HOST_PARTS = ['google-analytics', 'com'];
const GOOGLE_MEASUREMENT_PROTOCOL_PATH_PARTS = [
  ['mp', 'collect'],
  ['debug', 'mp', 'collect']
] as const;

export function readAnalyticsPublicBuildConfig(): AnalyticsPublicBuildConfig {
  const measurementId = normalizeMeasurementId(
    readBuildString('__ZENDIO_GA_MEASUREMENT_ID__') ??
      readBuildString('__AIIINOB_GA_MEASUREMENT_ID__')
  );
  const transportMode = normalizeAnalyticsTransportMode(
    readBuildString('__ZENDIO_GA_TRANSPORT_MODE__') ??
      readBuildString('__AIIINOB_GA_TRANSPORT_MODE__'),
    undefined
  );
  const proxyEndpoint = normalizeProxyEndpoint(
    readBuildString('__ZENDIO_GA_PROXY_ENDPOINT__') ??
      readBuildString('__AIIINOB_GA_PROXY_ENDPOINT__')
  );

  return {
    ...(measurementId ? { measurementId } : {}),
    ...(transportMode ? { transportMode } : {}),
    ...(proxyEndpoint ? { proxyEndpoint } : {})
  };
}

export function normalizeAnalyticsTransportMode(
  value: unknown,
  fallback: AnalyticsTransportMode | undefined = 'disabled'
): AnalyticsTransportMode | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  const normalized = value.trim();
  return ANALYTICS_TRANSPORT_MODES.includes(normalized as AnalyticsTransportMode)
    ? (normalized as AnalyticsTransportMode)
    : 'disabled';
}

export function normalizeMeasurementId(
  value: unknown,
  fallback: string | undefined = DEFAULT_ANALYTICS_MEASUREMENT_ID
): string | undefined {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 64 ||
    normalized.includes('://') ||
    normalized.includes('?') ||
    normalized.includes('#') ||
    FORBIDDEN_PUBLIC_CONFIG_PATTERN.test(normalized)
  ) {
    return fallback;
  }

  return normalized;
}

export function isValidMeasurementId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  return /^G-[A-Z0-9-]{4,48}$/i.test(normalized) && !/X{4,}/i.test(normalized);
}

export function normalizeProxyEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 512 ||
    FORBIDDEN_PUBLIC_CONFIG_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    const isHttps = url.protocol === 'https:';
    const isLocalHttp =
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
    if (!isHttps && !isLocalHttp) {
      return undefined;
    }
    if (isGoogleMeasurementProtocolEndpoint(url)) {
      return undefined;
    }
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function isGoogleMeasurementProtocolEndpoint(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  const pathParts = url.pathname
    .toLowerCase()
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  return (
    isGoogleAnalyticsHost(hostname) &&
    GOOGLE_MEASUREMENT_PROTOCOL_PATH_PARTS.some((parts) => pathParts.join('/') === parts.join('/'))
  );
}

function isGoogleAnalyticsHost(hostname: string): boolean {
  const googleAnalyticsHost = GOOGLE_ANALYTICS_HOST_PARTS.join('.');
  return hostname === googleAnalyticsHost || hostname.endsWith(`.${googleAnalyticsHost}`);
}

function readBuildString(name: string): string | undefined {
  if (name === '__ZENDIO_GA_MEASUREMENT_ID__') {
    return readString(
      typeof __ZENDIO_GA_MEASUREMENT_ID__ === 'undefined'
        ? readGlobalValue(name)
        : __ZENDIO_GA_MEASUREMENT_ID__
    );
  }
  if (name === '__ZENDIO_GA_TRANSPORT_MODE__') {
    return readString(
      typeof __ZENDIO_GA_TRANSPORT_MODE__ === 'undefined'
        ? readGlobalValue(name)
        : __ZENDIO_GA_TRANSPORT_MODE__
    );
  }
  if (name === '__ZENDIO_GA_PROXY_ENDPOINT__') {
    return readString(
      typeof __ZENDIO_GA_PROXY_ENDPOINT__ === 'undefined'
        ? readGlobalValue(name)
        : __ZENDIO_GA_PROXY_ENDPOINT__
    );
  }
  if (name === '__AIIINOB_GA_MEASUREMENT_ID__') {
    return readString(
      typeof __AIIINOB_GA_MEASUREMENT_ID__ === 'undefined'
        ? readGlobalValue(name)
        : __AIIINOB_GA_MEASUREMENT_ID__
    );
  }
  if (name === '__AIIINOB_GA_TRANSPORT_MODE__') {
    return readString(
      typeof __AIIINOB_GA_TRANSPORT_MODE__ === 'undefined'
        ? readGlobalValue(name)
        : __AIIINOB_GA_TRANSPORT_MODE__
    );
  }
  if (name === '__AIIINOB_GA_PROXY_ENDPOINT__') {
    return readString(
      typeof __AIIINOB_GA_PROXY_ENDPOINT__ === 'undefined'
        ? readGlobalValue(name)
        : __AIIINOB_GA_PROXY_ENDPOINT__
    );
  }
  const value = readGlobalValue(name);
  return readString(value);
}

function readGlobalValue(name: string) {
  return (globalThis as Record<string, unknown>)[name];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
