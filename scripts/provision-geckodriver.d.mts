export const GECKODRIVER_VERSION: '0.37.1';
export const GECKODRIVER_CACHE_SCHEMA: 'zendio-geckodriver-cache-v1';
export const GECKODRIVER_ASSETS: Readonly<
  Record<string, Readonly<{ name: string; sha256: string }>>
>;

export function provisionGeckodriver(
  argv?: string[],
  dependencies?: Record<string, unknown>
): Promise<
  Readonly<{
    executablePath: string;
    manifestPath: string;
    version: '0.37.1';
  }>
>;
