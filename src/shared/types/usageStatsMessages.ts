import type { UsageStats } from './usage';

export const USAGE_STATS_MESSAGE_TYPE = 'ZENDIO_USAGE_STATS';
export const USAGE_STATS_RESPONSE_TYPE = 'ZENDIO_USAGE_STATS_RESPONSE';

export type UsageStatsOperation = 'get' | 'reset';
export type UsageStatsErrorCode =
  | 'INVALID_USAGE_STATS_REQUEST'
  | 'USAGE_STATS_STORAGE_FAILURE'
  | 'USAGE_STATS_CANONICAL_INVALID'
  | 'USAGE_STATS_AUTHORITY_UNAVAILABLE';

export interface UsageStatsRequest {
  readonly type: typeof USAGE_STATS_MESSAGE_TYPE;
  readonly requestId: string;
  readonly operation: UsageStatsOperation;
}

export type UsageStatsResponse =
  | {
      readonly type: typeof USAGE_STATS_RESPONSE_TYPE;
      readonly requestId: string;
      readonly success: true;
      readonly stats: UsageStats;
    }
  | {
      readonly type: typeof USAGE_STATS_RESPONSE_TYPE;
      readonly requestId: string;
      readonly success: false;
      readonly errorCode: UsageStatsErrorCode;
    };

export function createUsageStatsRequest(
  requestId: string,
  operation: UsageStatsOperation
): UsageStatsRequest {
  return { type: USAGE_STATS_MESSAGE_TYPE, requestId, operation };
}

export function createUsageStatsSuccessResponse(
  requestId: string,
  stats: UsageStats
): UsageStatsResponse {
  return { type: USAGE_STATS_RESPONSE_TYPE, requestId, success: true, stats };
}

export function createUsageStatsFailureResponse(
  requestId: string,
  errorCode: UsageStatsErrorCode
): UsageStatsResponse {
  return { type: USAGE_STATS_RESPONSE_TYPE, requestId, success: false, errorCode };
}
