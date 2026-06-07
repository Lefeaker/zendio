import { DI_TOKENS } from '../../shared/di/tokens';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import type { IMessagingRepository } from '../../shared/repositories';
import { createTrackUsageEventMessage } from '../../shared/types/analytics';

export async function trackInitialOptionsTelemetry(): Promise<void> {
  try {
    const messagingRepository = resolveRepository<IMessagingRepository>(
      DI_TOKENS.IMessagingRepository
    );
    await messagingRepository.send(
      createTrackUsageEventMessage('options_opened', { source: 'unknown' })
    );
    await messagingRepository.send(
      createTrackUsageEventMessage('options_section_viewed', { section: 'overview' })
    );
  } catch {
    // Telemetry is best-effort and must not block options bootstrap.
  }
}
