import {
  findVideoControlObserverRoot,
  findVideoControlTarget,
  observeVideoControlTarget
} from './videoPromptObserver';
import {
  ensureVideoControlBarButton,
  removeVideoControlBarButton,
  type VideoControlBarNotePayload,
  type VideoControlBarPopoverCloseReason,
  type VideoControlBarPreferences
} from './videoControlBarButton';
import {
  acquireControlBarPlaybackLease,
  type VideoControlBarPlaybackLease
} from './videoPromptControlBarAdapter';
import { CONTROL_TARGET_RETRY_DELAYS_MS } from './videoPromptState';

interface VideoPromptControlTargetLifecycleOptions {
  getDocument(): Document;
  getWindow(): Window;
  getUrl(): string;
  getLabel(): string;
  getShortcut(): string;
  getPreferences(): VideoControlBarPreferences;
  setPreferences(preferences: VideoControlBarPreferences): void;
  getIconUrl(): string | null;
  onPrimaryAction(
    preferences: VideoControlBarPreferences,
    payload?: VideoControlBarNotePayload
  ): void | PromiseLike<void>;
  onTargetObserved(): void;
  incrementSyncCount(): void;
}

export function createVideoPromptControlTargetLifecycle(
  options: VideoPromptControlTargetLifecycleOptions
) {
  let stopControlTargetObserver: (() => void) | null = null;
  let controlTargetRetryHandle: number | null = null;
  let controlTargetRetryIndex = 0;
  let popoverPlaybackLease: VideoControlBarPlaybackLease | null = null;

  function releasePopoverPlaybackLease(restorePlayback: boolean): void {
    popoverPlaybackLease?.release({ restorePlayback });
    popoverPlaybackLease = null;
  }

  function isPromiseLike(value: void | PromiseLike<void>): value is PromiseLike<void> {
    return value !== undefined && typeof value.then === 'function';
  }

  function clearObserver(): void {
    stopControlTargetObserver?.();
    stopControlTargetObserver = null;
  }

  function clearRetry(): void {
    if (controlTargetRetryHandle !== null) {
      options.getWindow().clearTimeout(controlTargetRetryHandle);
      controlTargetRetryHandle = null;
    }
    controlTargetRetryIndex = 0;
  }

  function scheduleRetry(): void {
    if (controlTargetRetryHandle !== null) {
      return;
    }

    const delay = CONTROL_TARGET_RETRY_DELAYS_MS[controlTargetRetryIndex];
    if (delay === undefined) {
      return;
    }

    controlTargetRetryIndex += 1;
    controlTargetRetryHandle = options.getWindow().setTimeout(() => {
      controlTargetRetryHandle = null;
      ensureObserver();
    }, delay);
  }

  function syncButton(): void {
    const doc = options.getDocument();
    options.incrementSyncCount();
    ensureVideoControlBarButton({
      doc,
      url: options.getUrl(),
      label: options.getLabel(),
      shortcut: options.getShortcut(),
      getIconUrl: () => options.getIconUrl(),
      preferences: options.getPreferences(),
      onPreferencesChange: (preferences) => options.setPreferences(preferences),
      onPopoverOpen: (preferences) => {
        releasePopoverPlaybackLease(false);
        popoverPlaybackLease = preferences.autoPauseEnabled
          ? acquireControlBarPlaybackLease(doc)
          : null;
      },
      onPopoverDismiss: (preferences) => {
        releasePopoverPlaybackLease(preferences.autoPauseEnabled);
      },
      onPopoverClose: (reason: VideoControlBarPopoverCloseReason) => {
        if (reason === 'owner-removal') {
          releasePopoverPlaybackLease(false);
        }
      },
      onPrimaryAction: (preferences, payload) => {
        let result: void | PromiseLike<void>;
        try {
          result = options.onPrimaryAction(preferences, payload);
        } catch (error) {
          releasePopoverPlaybackLease(preferences.autoPauseEnabled);
          throw error;
        }
        if (isPromiseLike(result)) {
          return result.then(
            () => {
              releasePopoverPlaybackLease(preferences.autoPauseEnabled);
            },
            (error: Error) => {
              releasePopoverPlaybackLease(preferences.autoPauseEnabled);
              throw error;
            }
          );
        }
        releasePopoverPlaybackLease(preferences.autoPauseEnabled);
        return undefined;
      }
    });
  }

  function hasTarget(): boolean {
    return Boolean(findVideoControlTarget(options.getDocument(), options.getUrl()));
  }

  function ensureObserver(): void {
    const doc = options.getDocument();
    const url = options.getUrl();
    if (findVideoControlTarget(doc, url)) {
      clearObserver();
      clearRetry();
      syncButton();
      return;
    }
    if (stopControlTargetObserver) {
      return;
    }

    if (!findVideoControlObserverRoot(doc, url)) {
      scheduleRetry();
      return;
    }

    clearRetry();
    stopControlTargetObserver = observeVideoControlTarget({
      doc,
      url,
      onTarget: (target) => {
        const currentTarget = findVideoControlTarget(options.getDocument(), options.getUrl());
        if (!currentTarget || currentTarget !== target) {
          return;
        }
        stopControlTargetObserver = null;
        clearRetry();
        syncButton();
        options.onTargetObserved();
      }
    });
  }

  function removeButton(): void {
    releasePopoverPlaybackLease(false);
    removeVideoControlBarButton(options.getDocument());
  }

  return {
    clearObserver,
    clearRetry,
    ensureObserver,
    hasTarget,
    removeButton,
    syncButton
  };
}
