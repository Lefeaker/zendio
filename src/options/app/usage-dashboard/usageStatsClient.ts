import type { MessagePayload, MessagingService } from '@platform/interfaces/messaging';
import { normalizeUsageStats } from '@shared/constants/usage';
import { isObjectRecord, type RuntimePropertyValue } from '@shared/guards/object';
import type { UsageStats } from '@shared/types/usage';
import {
  createUsageStatsRequest,
  USAGE_STATS_RESPONSE_TYPE,
  type UsageStatsErrorCode,
  type UsageStatsOperation
} from '@shared/types/usageStatsMessages';

export interface UsageStatsClientLike {
  get(): Promise<UsageStats>;
  reset(): Promise<UsageStats>;
}

export class UsageStatsClientError extends Error {
  constructor(readonly code: UsageStatsErrorCode) {
    super(code);
    this.name = 'UsageStatsClientError';
  }
}

let requestSequence = 0;

function requestId(): string {
  requestSequence += 1;
  return `usage-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

function isErrorCode(value: RuntimePropertyValue): value is UsageStatsErrorCode {
  return (
    value === 'INVALID_USAGE_STATS_REQUEST' ||
    value === 'USAGE_STATS_STORAGE_FAILURE' ||
    value === 'USAGE_STATS_CANONICAL_INVALID' ||
    value === 'USAGE_STATS_AUTHORITY_UNAVAILABLE'
  );
}

export class UsageStatsClient implements UsageStatsClientLike {
  constructor(private readonly messaging: Pick<MessagingService, 'send'>) {}

  get(): Promise<UsageStats> {
    return this.send('get');
  }

  reset(): Promise<UsageStats> {
    return this.send('reset');
  }

  private async send(operation: UsageStatsOperation): Promise<UsageStats> {
    const currentRequestId = requestId();
    let response: MessagePayload;
    try {
      response = await this.messaging.send<MessagePayload>(
        createUsageStatsRequest(currentRequestId, operation)
      );
    } catch {
      throw new UsageStatsClientError('USAGE_STATS_AUTHORITY_UNAVAILABLE');
    }
    if (
      !isObjectRecord(response) ||
      response.type !== USAGE_STATS_RESPONSE_TYPE ||
      response.requestId !== currentRequestId
    ) {
      throw new UsageStatsClientError('INVALID_USAGE_STATS_REQUEST');
    }
    if (response.success === false && isErrorCode(response.errorCode)) {
      throw new UsageStatsClientError(response.errorCode);
    }
    if (response.success !== true || !isObjectRecord(response.stats)) {
      throw new UsageStatsClientError('INVALID_USAGE_STATS_REQUEST');
    }
    return normalizeUsageStats(response.stats);
  }
}

export function createUnavailableUsageStatsClient(): UsageStatsClientLike {
  const reject = (): Promise<never> =>
    Promise.reject(new UsageStatsClientError('USAGE_STATS_AUTHORITY_UNAVAILABLE'));
  return { get: reject, reset: reject };
}
