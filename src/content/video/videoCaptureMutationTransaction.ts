import { createFeatureTimer } from '../../shared/analytics';
import type { AnalyticsPlatform } from '../../shared/analytics';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import { isAppError } from '../../shared/errors';
import type { IMessagingRepository } from '../../shared/repositories';
import {
  createAnalyticsEventMessage,
  type ExportDestination,
  type FailureCategory,
  type UsageEventName,
  type UsageEventParamMap
} from '../../shared/types/analytics';
import type { ExportDestinationMetadata } from '../../shared/exportDestination';
import { runSessionMutationTransaction } from '@content/sessionDrafts';
import type { VideoHintState } from './videoHintManager';
import type { VideoFragmentCapture, VideoTimestampCapture } from './types';
import type { VideoSessionDependencies } from './sessionTypes';
import type { VideoSessionState } from './sessionState';
import type { VideoPlatform } from './utils';
import type { VideoSessionOperationContext } from './videoSessionOperationContext';
import type { VideoCaptureMutationTransaction } from './videoCaptureMutationTypes';

export {
  restoreTimestampScreenshotState,
  snapshotTimestampScreenshotState
} from './videoTimestampScreenshotStateSnapshot';

type UntrustedValue = unknown;

export type {
  VideoCaptureMutationFailure,
  VideoCaptureMutationTransaction
} from './videoCaptureMutationTypes';

export async function runVideoCaptureMutationTransaction<Result>(
  transaction: VideoCaptureMutationTransaction<Result>
): Promise<boolean> {
  return runSessionMutationTransaction({
    ...transaction,
    isSaveFailure: (saveHint) => saveHint === 'failure'
  });
}

export async function saveVideoSessionCaptures(
  context: VideoSessionOperationContext
): Promise<VideoHintState | null> {
  const hintState = await context.drafts.flushNow('active');
  if (hintState) context.applyHint(hintState);
  return hintState;
}

export function requestRequestedScreenshotPreparation(
  context: VideoSessionOperationContext,
  captureId: string
): void {
  void Promise.resolve(context.screenshots.prepareRequested(captureId)).catch((error) =>
    console.warn('[VideoSession] Failed to prepare requested screenshot:', error)
  );
}

export function rollbackVideoSessionFragmentAdd(
  context: VideoSessionOperationContext,
  capture: VideoFragmentCapture
): void {
  const captureIndex = context.state.captures.findIndex(
    (item: { id: string }) => item.id === capture.id
  );
  if (captureIndex !== -1) {
    context.state.captures.splice(captureIndex, 1);
  }
  if (capture.wrapperId) {
    context.fragmentHighlighter.removeById(capture.wrapperId);
  }
  context.dom.stopEditing(capture.id);
  context.syncPanel();
  context.applyHint('failure');
}

export function restoreRemovedFragmentHighlight(
  context: VideoSessionOperationContext,
  capture: VideoTimestampCapture | VideoFragmentCapture
): void {
  if (capture.kind !== 'fragment') {
    return;
  }
  try {
    context.ensureCaptureHighlight(capture);
  } catch (error) {
    console.warn('[VideoSession] Failed to restore removed fragment highlight:', error);
  }
  context.fragmentHighlightCoordinator.ensureStartedForFragments();
  context.fragmentHighlightCoordinator.scheduleRestore();
}

async function sendVideoUsageEvent<EventName extends UsageEventName>(
  dependencies: VideoSessionDependencies,
  event: EventName,
  params?: UsageEventParamMap[EventName]
): Promise<void> {
  if (dependencies.trackUsageEvent) {
    await dependencies.trackUsageEvent(event, params);
    return;
  }

  const messaging = resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
  const payload = createAnalyticsEventMessage(event, params);
  await messaging.send(payload);
}

export function emitVideoUsageEvent<EventName extends UsageEventName>(
  dependencies: VideoSessionDependencies,
  event: EventName,
  params?: UsageEventParamMap[EventName]
): void {
  void Promise.resolve(sendVideoUsageEvent(dependencies, event, params)).catch((error) =>
    console.debug('[VideoSession] Failed to send analytics event:', error)
  );
}

export function mapVideoAnalyticsPlatform(platform: VideoPlatform): AnalyticsPlatform {
  return platform === 'youtube' || platform === 'bilibili' ? platform : 'unknown';
}

export function resolveVideoExportDestination(
  exportDestination?: ExportDestinationMetadata
): ExportDestination {
  return exportDestination?.kind === 'downloads' ? 'downloads' : 'unknown';
}

const FAILURE_CATEGORIES: ReadonlySet<string> = new Set(
  'permission connection validation classification extraction write timeout unsupported unknown'.split(
    ' '
  )
);

const FAILURE_HINTS = {
  timeout: 'timeout|timed out|message timeout|aborterror|aborted'.split('|'),
  unsupported: 'unsupported|not supported|unavailable in this runtime'.split('|'),
  permission:
    'permission denied|permission-denied|access denied|not granted|forbidden|denied'.split('|'),
  validation:
    'invalid video export response|invalid clip payload received|invalid|missing|malformed|expected|not configured|no image|payload'.split(
      '|'
    ),
  write: 'local_vault_write_failed|write failed|write-preflight-failed|save failed'.split('|'),
  connection:
    'offline|network|connection|failed to send message to background|rest |could not establish connection|receiving end does not exist|extension context invalidated|message port closed|runtime.lasterror|failed to fetch|networkerror'.split(
      '|'
    )
} as const;

function isFailureCategory(value: UntrustedValue): value is FailureCategory {
  return typeof value === 'string' && FAILURE_CATEGORIES.has(value);
}

interface VideoExportFailureLike {
  name?: string;
  message?: string;
  code?: string;
  domain?: string;
  userMessage?: string;
  context?: unknown;
  cause?: unknown;
  failureCategory?: UntrustedValue;
}

function isVideoExportFailureLike(error: UntrustedValue): error is VideoExportFailureLike {
  return typeof error === 'object' && error !== null;
}

function collectFailureHints(error: UntrustedValue, seen = new Set<UntrustedValue>()): string {
  if (error == null || seen.has(error)) return '';
  seen.add(error);

  const hints: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) hints.push(value.trim().toLowerCase());
  };

  if (typeof error === 'string') {
    push(error);
  } else if (error instanceof Error) {
    push(error.name);
    push(error.message);
    push(collectFailureHints((error as Error & { cause?: unknown }).cause, seen));
  } else if (isVideoExportFailureLike(error)) {
    push(error.code);
    push(error.domain);
    push(error.name);
    push(error.message);
    push(error.userMessage);
    if (typeof error.context === 'object' && error.context !== null) {
      const context = error.context as Record<string, unknown>;
      [context.fallbackReason, context.error, context.message].forEach(push);
    }
    push(collectFailureHints(error.cause, seen));
  }

  return hints.join('\n');
}

function hasFailureHint(text: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => text.includes(candidate));
}

export function createVideoExportFailure(message: string, failureCategory?: UntrustedValue): Error {
  const error = new Error(message);
  if (isFailureCategory(failureCategory)) {
    Object.defineProperty(error, 'failureCategory', {
      configurable: true,
      enumerable: false,
      value: failureCategory,
      writable: false
    });
  }
  return error;
}

export function resolveVideoFailureCategory(error: UntrustedValue): FailureCategory {
  if (isVideoExportFailureLike(error) && isFailureCategory(error.failureCategory)) {
    return error.failureCategory;
  }

  const failureHints = collectFailureHints(error);

  if (isAppError(error)) {
    if (error.domain === 'classifier') return 'classification';
    if (error.code === 'LOCAL_VAULT_WRITE_FAILED') return 'write';
    if (error.code.includes('TIMEOUT')) return 'timeout';
    if (error.domain === 'rest')
      return hasFailureHint(failureHints, FAILURE_HINTS.timeout) ? 'timeout' : 'connection';
  }
  if (hasFailureHint(failureHints, FAILURE_HINTS.timeout)) return 'timeout';
  if (hasFailureHint(failureHints, FAILURE_HINTS.unsupported)) return 'unsupported';
  if (hasFailureHint(failureHints, FAILURE_HINTS.permission)) return 'permission';
  if (hasFailureHint(failureHints, FAILURE_HINTS.validation)) return 'validation';
  if (hasFailureHint(failureHints, FAILURE_HINTS.write)) return 'write';
  if (hasFailureHint(failureHints, FAILURE_HINTS.connection)) return 'connection';
  return 'unknown';
}

export function resolveVideoSessionDurationBucket(state: VideoSessionState) {
  return state.analyticsTimer?.durationBucket() ?? createFeatureTimer().durationBucket();
}
