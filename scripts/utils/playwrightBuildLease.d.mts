export function resolvePlaywrightBuildLeaseDir(rootDir?: string): string;

export function acquirePlaywrightBuildLease(
  options?: Readonly<{
    rootDir?: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
    now?: () => number;
    delay?: (durationMs: number) => Promise<void>;
  }>
): Promise<() => Promise<void>>;
