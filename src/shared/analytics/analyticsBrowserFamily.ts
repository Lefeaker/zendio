export type AnalyticsBrowserFamily = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other' | 'unknown';

type AnalyticsRuntimeLike = { runtime?: unknown };
type AnalyticsUserAgentDataBrandLike = { brand?: unknown };
type AnalyticsUserAgentDataLike = {
  brands?: ReadonlyArray<AnalyticsUserAgentDataBrandLike>;
};
type AnalyticsNavigatorLike = {
  userAgent?: unknown;
  userAgentData?: AnalyticsUserAgentDataLike;
};

export interface AnalyticsBrowserFamilyEnvironment {
  browser?: AnalyticsRuntimeLike;
  chrome?: AnalyticsRuntimeLike;
  navigator?: AnalyticsNavigatorLike;
  safari?: unknown;
}

const ANALYTICS_BROWSER_FAMILIES = [
  'chrome',
  'edge',
  'firefox',
  'safari',
  'other',
  'unknown'
] as const satisfies readonly AnalyticsBrowserFamily[];

const OTHER_BROWSER_BRAND_MARKERS = [
  'brave',
  'duckduckgo',
  'opera',
  'opera gx',
  'samsung internet',
  'vivaldi',
  'yabrowser'
] as const;

const OTHER_BROWSER_USER_AGENT_MARKERS = [
  'brave/',
  'duckduckgo/',
  'opr/',
  'opera/',
  'samsungbrowser/',
  'vivaldi',
  'yabrowser/'
] as const;

export function isAnalyticsBrowserFamily(value: unknown): value is AnalyticsBrowserFamily {
  return (
    typeof value === 'string' &&
    ANALYTICS_BROWSER_FAMILIES.includes(value as AnalyticsBrowserFamily)
  );
}

export function resolveAnalyticsBrowserFamily(
  environment: AnalyticsBrowserFamilyEnvironment = readAnalyticsBrowserFamilyEnvironment()
): AnalyticsBrowserFamily {
  const brandFamily = resolveAnalyticsBrowserFamilyFromBrands(
    environment.navigator?.userAgentData?.brands
  );
  if (brandFamily) {
    return brandFamily;
  }

  if (hasFirefoxRuntime(environment)) {
    return 'firefox';
  }

  if (hasSafariRuntime(environment)) {
    return 'safari';
  }

  const userAgentFamily = resolveAnalyticsBrowserFamilyFromUserAgent(
    environment.navigator?.userAgent
  );
  if (userAgentFamily) {
    return userAgentFamily;
  }

  return 'unknown';
}

// UA parsing is strictly internal: callers only receive the bounded family.
export function createAnalyticsBrowserContextParams(
  environment: AnalyticsBrowserFamilyEnvironment = readAnalyticsBrowserFamilyEnvironment()
): { browser_family: AnalyticsBrowserFamily } {
  return {
    browser_family: resolveAnalyticsBrowserFamily(environment)
  };
}

function readAnalyticsBrowserFamilyEnvironment(): AnalyticsBrowserFamilyEnvironment {
  const globalScope = globalThis as typeof globalThis & AnalyticsBrowserFamilyEnvironment;
  return {
    browser: globalScope.browser,
    chrome: globalScope.chrome,
    navigator: globalScope.navigator,
    safari: globalScope.safari
  };
}

function resolveAnalyticsBrowserFamilyFromBrands(
  brands: ReadonlyArray<AnalyticsUserAgentDataBrandLike> | undefined
): AnalyticsBrowserFamily | undefined {
  const normalizedBrands = normalizeBrandLabels(brands);
  if (normalizedBrands.length === 0) {
    return undefined;
  }

  if (normalizedBrands.some((brand) => brand.includes('edge'))) {
    return 'edge';
  }

  if (normalizedBrands.some((brand) => brand.includes('firefox'))) {
    return 'firefox';
  }

  if (normalizedBrands.some((brand) => brand.includes('safari'))) {
    return 'safari';
  }

  if (normalizedBrands.some((brand) => brand === 'chrome' || brand.includes('google chrome'))) {
    return 'chrome';
  }

  if (
    normalizedBrands.some((brand) => brand.includes('chromium')) ||
    normalizedBrands.some((brand) =>
      OTHER_BROWSER_BRAND_MARKERS.some((marker) => brand.includes(marker))
    )
  ) {
    return 'other';
  }

  return undefined;
}

function resolveAnalyticsBrowserFamilyFromUserAgent(
  userAgent: unknown
): AnalyticsBrowserFamily | undefined {
  if (typeof userAgent !== 'string' || userAgent.trim().length === 0) {
    return undefined;
  }

  const normalizedUserAgent = userAgent.toLowerCase();
  if (normalizedUserAgent.includes('edg/') || normalizedUserAgent.includes(' edge/')) {
    return 'edge';
  }

  if (normalizedUserAgent.includes('firefox/') || normalizedUserAgent.includes('fxios/')) {
    return 'firefox';
  }

  if (
    OTHER_BROWSER_USER_AGENT_MARKERS.some((marker) => normalizedUserAgent.includes(marker)) ||
    normalizedUserAgent.includes('chromium/')
  ) {
    return 'other';
  }

  if (normalizedUserAgent.includes('chrome/') || normalizedUserAgent.includes('crios/')) {
    return 'chrome';
  }

  if (
    normalizedUserAgent.includes('safari/') &&
    !normalizedUserAgent.includes('chrome/') &&
    !normalizedUserAgent.includes('chromium/') &&
    !normalizedUserAgent.includes('crios/') &&
    !normalizedUserAgent.includes('edg/')
  ) {
    return 'safari';
  }

  return undefined;
}

function normalizeBrandLabels(
  brands: ReadonlyArray<AnalyticsUserAgentDataBrandLike> | undefined
): string[] {
  return (brands ?? [])
    .map((brandEntry) => normalizeBrandLabel(brandEntry.brand))
    .filter((brand): brand is string => brand !== undefined);
}

function normalizeBrandLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function hasFirefoxRuntime(environment: AnalyticsBrowserFamilyEnvironment): boolean {
  return Boolean(environment.browser?.runtime) && !environment.chrome?.runtime;
}

function hasSafariRuntime(environment: AnalyticsBrowserFamilyEnvironment): boolean {
  return environment.safari !== undefined;
}
