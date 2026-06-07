import type { CountBucket, DurationBucket } from './eventCatalog';

export interface FeatureTimer {
  readonly operationId: string;
  readonly startedAt: number;
  elapsedMs(): number;
  durationBucket(): DurationBucket;
}

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

export function createAnalyticsOperationId(now: () => number = Date.now): string {
  const timePart = Math.max(0, Math.floor(now())).toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `op_${timePart}${randomPart}`.slice(0, 27);
}

export function createFeatureTimer(
  now: () => number = Date.now,
  operationId: string = createAnalyticsOperationId(now)
): FeatureTimer {
  const startedAt = now();
  return {
    operationId,
    startedAt,
    elapsedMs() {
      return clampDuration(now() - startedAt);
    },
    durationBucket() {
      return bucketDurationMs(now() - startedAt);
    }
  };
}

export function bucketDurationMs(durationMs: number): DurationBucket {
  const clamped = clampDuration(durationMs);
  if (clamped < 100) {
    return 'under_100ms';
  }
  if (clamped < 500) {
    return '100ms_to_499ms';
  }
  if (clamped < 1000) {
    return '500ms_to_999ms';
  }
  if (clamped < 3000) {
    return '1s_to_2s';
  }
  if (clamped < 10000) {
    return '3s_to_9s';
  }
  if (clamped < 30000) {
    return '10s_to_29s';
  }
  if (clamped < 120000) {
    return '30s_to_119s';
  }
  return '2m_plus';
}

export function bucketCount(count: number): CountBucket {
  if (!Number.isFinite(count) || count <= 0) {
    return 'zero';
  }
  if (count === 1) {
    return 'one';
  }
  if (count <= 5) {
    return 'two_to_five';
  }
  if (count <= 10) {
    return 'six_to_ten';
  }
  if (count <= 20) {
    return 'eleven_to_twenty';
  }
  if (count <= 50) {
    return 'twenty_one_to_fifty';
  }
  return 'fifty_one_plus';
}

function clampDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return 0;
  }
  return Math.min(Math.floor(durationMs), MAX_DURATION_MS);
}
