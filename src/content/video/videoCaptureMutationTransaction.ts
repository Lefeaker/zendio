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

interface TimestampScreenshotStateSnapshot {
  hasScreenshotRequested: boolean;
  screenshotRequested: VideoTimestampCapture['screenshotRequested'];
  hasScreenshot: boolean;
  screenshot: VideoTimestampCapture['screenshot'];
}

function restoreOptionalTimestampScreenshotProperty(
  capture: VideoTimestampCapture,
  key: 'screenshotRequested' | 'screenshot',
  hasValue: boolean,
  value: VideoTimestampCapture['screenshotRequested'] | VideoTimestampCapture['screenshot']
): void {
  if (!hasValue) {
    delete capture[key];
    return;
  }
  Object.defineProperty(capture, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value
  });
}

export function snapshotTimestampScreenshotState(
  capture: VideoTimestampCapture
): TimestampScreenshotStateSnapshot {
  return {
    hasScreenshotRequested: Object.prototype.hasOwnProperty.call(capture, 'screenshotRequested'),
    screenshotRequested: capture.screenshotRequested,
    hasScreenshot: Object.prototype.hasOwnProperty.call(capture, 'screenshot'),
    screenshot: capture.screenshot
  };
}

export function restoreTimestampScreenshotState(
  capture: VideoTimestampCapture,
  snapshot: ReturnType<typeof snapshotTimestampScreenshotState>
): void {
  restoreOptionalTimestampScreenshotProperty(
    capture,
    'screenshotRequested',
    snapshot.hasScreenshotRequested,
    snapshot.screenshotRequested
  );
  restoreOptionalTimestampScreenshotProperty(
    capture,
    'screenshot',
    snapshot.hasScreenshot,
    snapshot.screenshot
  );
}

function debugVideoAnalyticsFailure(error: unknown): void {
  console.debug('[VideoSession] Failed to send analytics event:', error);
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
  void Promise.resolve(sendVideoUsageEvent(dependencies, event, params)).catch(
    debugVideoAnalyticsFailure
  );
}

export function mapVideoAnalyticsPlatform(platform: VideoPlatform): AnalyticsPlatform {
  if (platform === 'youtube' || platform === 'bilibili') {
    return platform;
  }
  return 'unknown';
}

export function resolveVideoExportDestination(
  exportDestination?: ExportDestinationMetadata
): ExportDestination {
  if (exportDestination?.kind === 'downloads') {
    return 'downloads';
  }
  return 'unknown';
}

const FAILURE_HINTS = {
  timeout: ['timeout', 'timed out', 'message timeout', 'aborterror', 'aborted'],
  unsupported: ['unsupported', 'not supported', 'unavailable in this runtime'],
  permission: [
    'permission denied',
    'permission-denied',
    'access denied',
    'not granted',
    'forbidden',
    'denied'
  ],
  validation: [
    'invalid',
    'missing',
    'malformed',
    'expected',
    'not configured',
    'no image',
    'payload'
  ],
  write: ['local_vault_write_failed', 'write failed', 'write-preflight-failed', 'save failed'],
  connection: ['offline', 'network', 'connection', 'failed to send message to background', 'rest ']
} as const;

function collectFailureHints(error: unknown, seen = new Set<unknown>()): string {
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
  } else if (typeof error === 'object') {
    const candidate = error as {
      code?: unknown;
      domain?: unknown;
      message?: unknown;
      name?: unknown;
      userMessage?: unknown;
      cause?: unknown;
      context?: unknown;
    };
    [
      candidate.code,
      candidate.domain,
      candidate.name,
      candidate.message,
      candidate.userMessage
    ].forEach(push);
    if (typeof candidate.context === 'object' && candidate.context !== null) {
      const context = candidate.context as Record<string, unknown>;
      [context.fallbackReason, context.error, context.message].forEach(push);
    }
    push(collectFailureHints(candidate.cause, seen));
  }
  return hints.join('\n');
}

function hasFailureHint(text: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => text.includes(candidate));
}

export function resolveVideoFailureCategory(error: unknown): FailureCategory {
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
