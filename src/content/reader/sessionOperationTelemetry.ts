import type { ReaderSessionDependencies } from './sessionTypes';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import {
  createAnalyticsEventMessage,
  type AnalyticsRuntimeEventPayload,
  type UsageEventParamMap
} from '@shared/types/analytics';

type ReaderUsageEventName = Extract<
  keyof UsageEventParamMap,
  | 'reader_session_started'
  | 'reader_draft_restored'
  | 'reader_highlight_added'
  | 'reader_exported'
  | 'reader_export_failed'
  | 'reader_session_cancelled'
>;

interface ReaderOperationTelemetryContext {
  dependencies: Pick<ReaderSessionDependencies, 'messaging'>;
}

export async function trackReaderUsageEvent<EventName extends ReaderUsageEventName>(
  context: ReaderOperationTelemetryContext,
  event: EventName,
  params: UsageEventParamMap[EventName]
): Promise<void> {
  try {
    const payload = createAnalyticsEventMessage(event, params);
    await context.dependencies.messaging.send(payload as AnalyticsRuntimeEventPayload);
  } catch (error) {
    console.debug('[ReaderSession] Failed to send analytics event:', error);
  }
}

export function resolveReaderExportDestination(
  metadata: ExportDestinationMetadata | undefined
): UsageEventParamMap['reader_exported']['destination'] {
  if (metadata?.kind === 'downloads') {
    return 'downloads';
  }
  return 'unknown';
}
