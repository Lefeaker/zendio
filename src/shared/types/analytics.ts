export const TRACK_USAGE_EVENT = 'TRACK_USAGE_EVENT';
const LEGACY_TRACK_USAGE_EVENT = 'track';

export type AnalyticsEventParams = Record<string, string | number | boolean | undefined>;

export interface TrackUsageEventPayload {
  type: typeof TRACK_USAGE_EVENT | typeof LEGACY_TRACK_USAGE_EVENT;
  event: string;
  params?: AnalyticsEventParams;
}

export function isTrackUsageEventMessage(message: unknown): message is TrackUsageEventPayload {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown; event?: unknown; params?: unknown };
  const isSupportedMessageType =
    candidate.type === TRACK_USAGE_EVENT || candidate.type === LEGACY_TRACK_USAGE_EVENT;
  if (
    !isSupportedMessageType ||
    typeof candidate.event !== 'string' ||
    candidate.event.trim().length === 0
  ) {
    return false;
  }

  if (candidate.params === undefined || candidate.params === null) {
    return true;
  }

  if (typeof candidate.params !== 'object') {
    return false;
  }

  return Object.values(candidate.params as Record<string, unknown>).every((value) => {
    const valueType = typeof value;
    return (
      value === undefined ||
      valueType === 'string' ||
      valueType === 'number' ||
      valueType === 'boolean'
    );
  });
}
