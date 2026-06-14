import { createFeatureTimer } from '../../shared/analytics';
import type { AnalyticsPlatform } from '../../shared/analytics';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type { IMessagingRepository } from '../../shared/repositories';
import {
  createTrackUsageEventMessage,
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
  if (hintState) {
    context.applyHint(hintState);
  }
  return hintState;
}

export function requestRequestedScreenshotPreparation(
  context: VideoSessionOperationContext,
  captureId: string
): void {
  void Promise.resolve(context.screenshots.prepareRequested(captureId)).catch((error) => {
    console.warn('[VideoSession] Failed to prepare requested screenshot:', error);
  });
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

function restoreTimestampScreenshotRequestedProperty(
  capture: VideoTimestampCapture,
  snapshot: TimestampScreenshotStateSnapshot
): void {
  if (!snapshot.hasScreenshotRequested) {
    delete capture.screenshotRequested;
    return;
  }
  if (snapshot.screenshotRequested !== undefined) {
    capture.screenshotRequested = snapshot.screenshotRequested;
    return;
  }
  // Preserve legacy own-property presence without assigning undefined to an exact-optional field.
  Object.defineProperty(capture, 'screenshotRequested', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: undefined
  });
}

function restoreTimestampScreenshotProperty(
  capture: VideoTimestampCapture,
  snapshot: TimestampScreenshotStateSnapshot
): void {
  if (!snapshot.hasScreenshot) {
    delete capture.screenshot;
    return;
  }
  if (snapshot.screenshot !== undefined) {
    capture.screenshot = snapshot.screenshot;
    return;
  }
  // Preserve legacy own-property presence without assigning undefined to an exact-optional field.
  Object.defineProperty(capture, 'screenshot', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: undefined
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
  restoreTimestampScreenshotRequestedProperty(capture, snapshot);
  restoreTimestampScreenshotProperty(capture, snapshot);
}

function debugVideoAnalyticsFailure(error: UntrustedValue): void {
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
  const payload = createTrackUsageEventMessage(event, params);
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

const FAILURE_CATEGORIES: ReadonlySet<string> = new Set(
  'permission connection validation classification extraction write timeout unsupported unknown'.split(
    ' '
  )
);

function isFailureCategory(value: UntrustedValue): value is FailureCategory {
  return typeof value === 'string' && FAILURE_CATEGORIES.has(value);
}

interface VideoExportFailureLike {
  name?: string;
  message?: string;
  code?: string;
  failureCategory?: UntrustedValue;
}

function isVideoExportFailureLike(error: UntrustedValue): error is VideoExportFailureLike {
  return typeof error === 'object' && error !== null;
}

function readErrorText(error: VideoExportFailureLike): string {
  return `${error.name ?? ''} ${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
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
  if (!isVideoExportFailureLike(error)) {
    return 'unknown';
  }

  if (isFailureCategory(error.failureCategory)) {
    return error.failureCategory;
  }

  const errorText = readErrorText(error);
  if (errorText.includes('invalid video export response')) {
    return 'validation';
  }
  if (
    errorText.includes('timeout') ||
    errorText.includes('timed out') ||
    errorText.includes('aborterror') ||
    errorText.includes('aborted')
  ) {
    return 'timeout';
  }
  if (
    errorText.includes('could not establish connection') ||
    errorText.includes('receiving end does not exist') ||
    errorText.includes('extension context invalidated') ||
    errorText.includes('message port closed') ||
    errorText.includes('runtime.lasterror') ||
    errorText.includes('failed to fetch') ||
    errorText.includes('networkerror')
  ) {
    return 'connection';
  }

  return 'unknown';
}

export function resolveVideoSessionDurationBucket(state: VideoSessionState) {
  return state.analyticsTimer?.durationBucket() ?? createFeatureTimer().durationBucket();
}
