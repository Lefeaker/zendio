export interface AnalyticsIdentity {
  clientId: string;
  sessionId?: string;
}

function createAnalyticsRandomSegment(random: number, length: number): string {
  return Math.abs(random)
    .toString(36)
    .slice(2, 2 + length)
    .padEnd(length, '0');
}

export function createAnalyticsClientId(
  now: () => number = Date.now,
  random: () => number = Math.random
): string {
  return `ext-${now().toString(36)}-${createAnalyticsRandomSegment(random(), 9)}`;
}

export function createAnalyticsSessionId(
  now: () => number = Date.now,
  random: () => number = Math.random
): string {
  return `${now().toString(36)}-${createAnalyticsRandomSegment(random(), 5)}`;
}

export function redactAnalyticsIdentity(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return `${value.slice(0, 10)}...`;
}
