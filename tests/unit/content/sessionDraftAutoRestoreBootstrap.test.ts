/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorageArea } from '@platform/preview/memoryStorage';
import {
  startLazyDraftRestore,
  type SessionDraftAutoRestoreModule
} from '@content/runtime/sessionDraftAutoRestoreBootstrap';
import type { SessionDraftAutoRestoreOptions } from '@content/runtime/sessionDraftAutoRestore';
import { createSessionDraftStoragePolicy } from '@content/sessionDrafts';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createAutoRestoreOptions(): SessionDraftAutoRestoreOptions {
  return {
    document,
    window,
    storage: {
      local: createMemoryStorageArea(),
      sync: createMemoryStorageArea()
    },
    currentUrl: () => window.location.href,
    createReaderSession: () => ({
      start: vi.fn().mockResolvedValue(undefined),
      ingestExternalHighlight: vi.fn()
    }),
    createVideoSession: () => ({
      start: vi.fn().mockResolvedValue(undefined),
      ingestTextCapture: vi.fn()
    }),
    isReaderSessionActive: () => false,
    isVideoSessionActive: () => false,
    isVideoCandidateUrl: () => false
  };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

describe('startLazyDraftRestore', () => {
  it('does not start auto-restore when pagehide stops the runtime before the lazy import resolves', async () => {
    const deferred = createDeferred<SessionDraftAutoRestoreModule>();
    const stopLoadedAutoRestore = vi.fn();
    const startSessionDraftAutoRestore = vi.fn(() => stopLoadedAutoRestore);
    const stop = startLazyDraftRestore(() => deferred.promise, createAutoRestoreOptions(), vi.fn());

    stop();
    deferred.resolve({ startSessionDraftAutoRestore });
    await flushAsyncWork();

    expect(startSessionDraftAutoRestore).not.toHaveBeenCalled();
    expect(stopLoadedAutoRestore).not.toHaveBeenCalled();
  });

  it('disposes the loaded auto-restore runtime once after the lazy import resolves', async () => {
    const options = createAutoRestoreOptions();
    const stopLoadedAutoRestore = vi.fn();
    const startSessionDraftAutoRestore = vi.fn(() => stopLoadedAutoRestore);
    const stop = startLazyDraftRestore(
      () => Promise.resolve({ startSessionDraftAutoRestore }),
      options,
      vi.fn()
    );
    await flushAsyncWork();

    expect(startSessionDraftAutoRestore).toHaveBeenCalledWith(options);

    stop();

    expect(stopLoadedAutoRestore).toHaveBeenCalledTimes(1);
  });

  it('forwards supplied session draft storage policy through the lazy auto-restore bootstrap', async () => {
    const sessionDraftStoragePolicy = createSessionDraftStoragePolicy({
      retentionPolicy: {
        retentionMs: 96 * 60 * 60 * 1000,
        maxRestorablePages: null,
        maxItemsPerPage: null
      }
    });
    const options = {
      ...createAutoRestoreOptions(),
      sessionDraftStoragePolicy
    };
    const startSessionDraftAutoRestore = vi.fn(() => vi.fn());

    startLazyDraftRestore(
      () => Promise.resolve({ startSessionDraftAutoRestore }),
      options,
      vi.fn()
    );
    await flushAsyncWork();

    expect(startSessionDraftAutoRestore).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionDraftStoragePolicy
      })
    );
  });

  it('reports lazy import failures without starting auto-restore', async () => {
    const error = new Error('load failed');
    const onLoadError = vi.fn();
    const stop = startLazyDraftRestore(
      () => Promise.reject(error),
      createAutoRestoreOptions(),
      onLoadError
    );
    await flushAsyncWork();

    expect(onLoadError).toHaveBeenCalledWith(error);

    stop();
  });
});
