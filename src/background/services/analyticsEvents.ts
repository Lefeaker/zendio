import { trackTelemetryEvent } from './telemetryService';
import type {
  TelemetryEventParamMap,
  UsageEventName,
  UsageEventParamMap
} from '../../shared/types/analytics';

export async function trackUsageEvent<EventName extends UsageEventName>(
  eventName: EventName,
  params?: UsageEventParamMap[EventName]
): Promise<void> {
  await trackTelemetryEvent(eventName, params as TelemetryEventParamMap[EventName]);
}
