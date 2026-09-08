import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { OptionsPatch } from '@shared/types/optionsMutationMessages';
import { mergeOptions } from '@shared/config/optionsMerger';
import { STORED_OPTIONS_DELETE } from '@shared/config/storedOptionsCodec';
import { createOptionsController } from '@options/app/optionsController';
import {
  createOptionsControllerDurability,
  type DurableOptionsMutation
} from '@options/app/optionsControllerDurability';
import {
  OPTIONS_PATCH_PATHS,
  replaceOptionsPath,
  type OptionsPath
} from '@options/state/optionsPatchModel';
import type { MountedDraftRebase } from '@options/app/optionsDraftSession';
import type { OptionsFormAdapter } from '@options/components/optionsFormAdapter';
import type { OptionsPersistenceService } from '@options/services/persistence';

function requireOptionsPath(path: readonly string[]): OptionsPath {
  const registered = OPTIONS_PATCH_PATHS.find(
    (candidate) =>
      candidate.length === path.length &&
      candidate.every((segment, index) => segment === path[index])
  );
  if (!registered) throw new Error('UNREGISTERED_OPTIONS_DRAFT_PATH');
  return registered;
}

describe('OptionsController', () => {
  let persistence: OptionsPersistenceService;
  let formAdapter: OptionsFormAdapter;
  let savedOptions: Array<CompleteOptions | StoredOptions>;
  let repositorySnapshot: CompleteOptions;
  let loadMock: Mock<(...args: []) => Promise<StoredOptions>>;
  let saveMock: Mock<(...args: [readonly OptionsPatch[]]) => Promise<StoredOptions>>;
  let replaceMock: Mock<(...args: [CompleteOptions | StoredOptions]) => Promise<StoredOptions>>;
  let getCachedMock: Mock<(...args: []) => StoredOptions | null>;
  let readMock: Mock<(...args: [StoredOptions | null]) => CompleteOptions>;
  let applyMock: Mock<(...args: [StoredOptions]) => Promise<void>>;

  beforeEach(() => {
    savedOptions = [];
    const snapshot: StoredOptions = {
      rest: { baseUrl: 'https://example.com/' }
    };
    repositorySnapshot = mergeOptions(snapshot);

    const commitPatches = (patches: readonly OptionsPatch[]): StoredOptions => {
      for (const patch of patches) {
        const value = patch.value === STORED_OPTIONS_DELETE ? undefined : patch.value;
        repositorySnapshot = replaceOptionsPath(
          repositorySnapshot,
          requireOptionsPath(patch.path),
          value
        );
      }
      const acknowledged = structuredClone(repositorySnapshot);
      savedOptions.push(acknowledged);
      return acknowledged;
    };

    loadMock = vi.fn<(...args: []) => Promise<StoredOptions>>(() => Promise.resolve(snapshot));
    saveMock = vi.fn<(...args: [readonly OptionsPatch[]]) => Promise<StoredOptions>>((patches) =>
      Promise.resolve(commitPatches(patches))
    );
    replaceMock = vi.fn<(...args: [CompleteOptions | StoredOptions]) => Promise<StoredOptions>>(
      (options) => {
        repositorySnapshot = mergeOptions(options);
        const acknowledged = structuredClone(repositorySnapshot);
        savedOptions.push(acknowledged);
        return Promise.resolve(acknowledged);
      }
    );
    getCachedMock = vi.fn<(...args: []) => StoredOptions | null>(() => snapshot);

    persistence = {
      load: loadMock,
      save: saveMock,
      replace: replaceMock,
      getCached: getCachedMock
    };

    readMock = vi.fn<(...args: [StoredOptions | null]) => CompleteOptions>((_snapshot) =>
      mergeOptions({ rest: { baseUrl: 'https://changed.example.com/' } })
    );
    applyMock = vi.fn<(...args: [StoredOptions]) => Promise<void>>((_options) => Promise.resolve());

    formAdapter = {
      read: readMock,
      apply: applyMock
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads options and updates snapshot', async () => {
    const controller = createOptionsController({
      persistence,
      formAdapter
    });

    const stored = await controller.loadInitialState();
    expect(stored.rest?.baseUrl).toBe('https://example.com/');

    expect(loadMock).toHaveBeenCalledTimes(1);
    const snapshot = controller.getSnapshot();
    expect(snapshot?.rest?.baseUrl).toBe('https://example.com/');
  });

  it('saves snapshot using form adapter when no draft provided', async () => {
    const onSaveSuccess = vi.fn();
    const controller = createOptionsController({
      persistence,
      formAdapter,
      onSaveSuccess
    });
    await controller.loadInitialState();

    await controller.saveSnapshot({ reason: 'manual' });

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedOptions[0]?.rest?.baseUrl).toBe('https://changed.example.com/');
    expect(onSaveSuccess).toHaveBeenCalledWith('manual', savedOptions[0]);
  });

  it('debounces auto save requests', async () => {
    vi.useFakeTimers();

    const autoDraft = mergeOptions({ rest: { baseUrl: 'https://auto.example.com/' } });
    const collect = vi.fn(() => autoDraft);

    const controller = createOptionsController({
      persistence,
      formAdapter
    });
    await controller.loadInitialState();

    controller.scheduleAutoSave(collect);
    controller.scheduleAutoSave(collect);

    expect(collect).toHaveBeenCalledTimes(2);
    expect(saveMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);

    expect(collect).toHaveBeenCalledTimes(2);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedOptions[0]?.rest?.baseUrl).toBe('https://auto.example.com/');
  });

  it('captures local ownership before a repository notification during debounce', async () => {
    vi.useFakeTimers();
    const listeners: Array<(options: StoredOptions) => void> = [];
    persistence.subscribe = vi.fn((listener: (options: StoredOptions) => void) => {
      listeners.push(listener);
      return () => undefined;
    });
    const autoDraft = structuredClone(repositorySnapshot);
    autoDraft.fragmentClipper.captureContext = true;

    const controller = createOptionsController({
      persistence,
      formAdapter
    });
    await controller.loadInitialState();

    controller.scheduleAutoSave(() => autoDraft);
    const remote = structuredClone(repositorySnapshot);
    remote.interfaceTheme = 'dark';
    repositorySnapshot = structuredClone(remote);
    listeners.forEach((listener) => listener(remote));
    await vi.advanceTimersByTimeAsync(400);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith([
      { path: ['fragmentClipper', 'captureContext'], value: true }
    ]);
    expect(savedOptions[0]?.interfaceTheme).toBe('dark');
  });

  it('rebases mounted non-dirty values while preserving captured local ownership', async () => {
    const listeners: Array<(options: StoredOptions) => void> = [];
    persistence.subscribe = vi.fn((listener: (options: StoredOptions) => void) => {
      listeners.push(listener);
      return () => undefined;
    });
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const rebase = vi.fn<(options: CompleteOptions, transition: MountedDraftRebase) => void>();
    controller.bindMountedDraftRebase(rebase);

    const local = structuredClone(repositorySnapshot);
    local.fragmentClipper.captureContext = true;
    controller.scheduleAutoSave(() => local);
    rebase.mockClear();

    const remote = structuredClone(repositorySnapshot);
    remote.interfaceTheme = 'dark';
    listeners.forEach((listener) => listener(remote));

    expect(rebase).toHaveBeenCalledOnce();
    const rebased = rebase.mock.calls[0]?.[0];
    if (!rebased) throw new Error('EXPECTED_MOUNTED_REBASE');
    expect(rebased.interfaceTheme).toBe('dark');
    expect(rebased.fragmentClipper.captureContext).toBe(true);
    expect(rebase.mock.calls[0]?.[1]).toEqual({
      changedPaths: [['interfaceTheme']],
      dirtyPathKeys: ['fragmentClipper.captureContext']
    });
  });

  it('keeps a later mounted notification when an in-flight older acknowledgement clears ownership', async () => {
    const listeners: Array<(options: StoredOptions) => void> = [];
    persistence.subscribe = vi.fn((listener: (options: StoredOptions) => void) => {
      listeners.push(listener);
      return () => undefined;
    });
    let releaseSave: (() => void) | undefined;
    saveMock.mockImplementationOnce(
      () =>
        new Promise<StoredOptions>((resolve) => {
          const olderAcknowledgement = structuredClone(repositorySnapshot);
          olderAcknowledgement.fragmentClipper.captureContext = true;
          releaseSave = () => resolve(olderAcknowledgement);
        })
    );
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const rebase = vi.fn<(options: CompleteOptions, transition: MountedDraftRebase) => void>();
    controller.bindMountedDraftRebase(rebase);

    const local = structuredClone(repositorySnapshot);
    local.fragmentClipper.captureContext = true;
    controller.scheduleAutoSave(() => local);
    const flush = controller.flushPendingAutoSave();
    rebase.mockClear();

    const remote = structuredClone(repositorySnapshot);
    remote.interfaceTheme = 'dark';
    repositorySnapshot = remote;
    listeners.forEach((listener) => listener(remote));
    expect(rebase).toHaveBeenCalledOnce();
    expect(rebase.mock.calls[0]?.[0].interfaceTheme).toBe('dark');

    releaseSave?.();
    await flush;

    expect(controller.getSnapshot()?.interfaceTheme).toBe('dark');
    expect(rebase.mock.calls.at(-1)?.[1]).toEqual({
      changedPaths: [],
      dirtyPathKeys: []
    });
    expect(rebase.mock.calls.at(-1)?.[0].interfaceTheme).toBe('dark');
  });

  it('keeps later same-path authority when the old native acknowledgement arrives last', async () => {
    const listeners: Array<(options: StoredOptions) => void> = [];
    persistence.subscribe = vi.fn((listener: (options: StoredOptions) => void) => {
      listeners.push(listener);
      return () => undefined;
    });
    let releaseSave: (() => void) | undefined;
    saveMock.mockImplementationOnce(
      () =>
        new Promise<StoredOptions>((resolve) => {
          const olderAcknowledgement = structuredClone(repositorySnapshot);
          olderAcknowledgement.fragmentClipper.captureContext = true;
          releaseSave = () => resolve(olderAcknowledgement);
        })
    );
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const rebase = vi.fn<(options: CompleteOptions, transition: MountedDraftRebase) => void>();
    controller.bindMountedDraftRebase(rebase);

    const local = structuredClone(repositorySnapshot);
    local.fragmentClipper.captureContext = true;
    controller.scheduleAutoSave(() => local);
    const flush = controller.flushPendingAutoSave();

    const written = structuredClone(repositorySnapshot);
    written.fragmentClipper.captureContext = true;
    listeners.forEach((listener) => listener(written));
    const remote = structuredClone(written);
    remote.fragmentClipper.captureContext = false;
    repositorySnapshot = remote;
    listeners.forEach((listener) => listener(remote));

    releaseSave?.();
    await flush;

    expect(controller.getSnapshot()?.fragmentClipper?.captureContext).toBe(false);
    expect(rebase.mock.calls.at(-1)?.[0].fragmentClipper.captureContext).toBe(false);
    expect(rebase.mock.calls.at(-1)?.[1].dirtyPathKeys).toEqual([]);
  });

  it('serializes a reversal behind an earlier pending durable autosave', async () => {
    vi.useFakeTimers();

    let releaseFirstSave: (() => void) | undefined;
    saveMock
      .mockImplementationOnce(
        (patches) =>
          new Promise<StoredOptions>((resolve) => {
            releaseFirstSave = () => {
              for (const patch of patches) {
                const value = patch.value === STORED_OPTIONS_DELETE ? undefined : patch.value;
                repositorySnapshot = replaceOptionsPath(
                  repositorySnapshot,
                  requireOptionsPath(patch.path),
                  value
                );
              }
              const acknowledged = structuredClone(repositorySnapshot);
              savedOptions.push(acknowledged);
              resolve(acknowledged);
            };
          })
      )
      .mockImplementation(
        (patches) =>
          new Promise((resolve) => {
            for (const patch of patches) {
              const value = patch.value === STORED_OPTIONS_DELETE ? undefined : patch.value;
              repositorySnapshot = replaceOptionsPath(
                repositorySnapshot,
                requireOptionsPath(patch.path),
                value
              );
            }
            const acknowledged = structuredClone(repositorySnapshot);
            savedOptions.push(acknowledged);
            resolve(acknowledged);
          })
      );

    const controller = createOptionsController({
      persistence,
      formAdapter,
      autoSaveDebounceMs: 10
    });
    await controller.loadInitialState();

    const temporaryDraft = mergeOptions({ fragmentClipper: { captureContext: false } });
    const baselineDraft = mergeOptions({ fragmentClipper: { captureContext: true } });

    controller.scheduleAutoSave(() => temporaryDraft);
    await vi.advanceTimersByTimeAsync(10);
    expect(saveMock).toHaveBeenCalledTimes(1);

    controller.scheduleAutoSave(() => baselineDraft);
    await vi.advanceTimersByTimeAsync(10);

    expect(saveMock).toHaveBeenCalledTimes(1);

    releaseFirstSave?.();
    await vi.waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(2);
    });
    expect(savedOptions.map((draft) => draft.fragmentClipper?.captureContext)).toEqual([
      false,
      true
    ]);
  });

  it('uses strict replacement for imported configuration', async () => {
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const imported = mergeOptions({ rest: { baseUrl: 'https://import.example.com/' } });

    await controller.applyImportedConfig(imported);

    expect(replaceMock).toHaveBeenCalledWith(imported);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('preserves the pre-import dirty intent when strict replacement fails', async () => {
    vi.useFakeTimers();
    const failure = new Error('replace failed');
    replaceMock.mockRejectedValueOnce(failure);
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const local = structuredClone(repositorySnapshot);
    local.aiChat.userName = 'local-before-import';
    controller.scheduleAutoSave(() => local);

    await expect(
      controller.applyImportedConfig(mergeOptions({ interfaceTheme: 'dark' }))
    ).rejects.toBe(failure);
    await controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenCalledWith([
      { path: ['aiChat', 'userName'], value: 'local-before-import' }
    ]);
    expect(savedOptions.at(-1)?.aiChat?.userName).toBe('local-before-import');
  });

  it('reports collector errors through onSaveError callback', async () => {
    vi.useFakeTimers();

    const error = new Error('collect failed');
    const onSaveError = vi.fn();

    const controller = createOptionsController({
      persistence,
      formAdapter,
      onSaveError
    });
    await controller.loadInitialState();

    controller.scheduleAutoSave(() => {
      throw error;
    });

    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();

    expect(onSaveError).toHaveBeenCalledWith('auto', error);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('syncs snapshot updates from persistence subscriptions', async () => {
    const listeners: Array<(options: StoredOptions) => void> = [];
    const unsubscribe = vi.fn();
    persistence.subscribe = vi.fn((listener: (options: StoredOptions) => void) => {
      listeners.push(listener);
      return unsubscribe;
    });

    const controller = createOptionsController({
      persistence,
      formAdapter
    });
    await controller.loadInitialState();

    const nextState: StoredOptions = { rest: { baseUrl: 'https://external.example.com/' } };
    listeners.forEach((listener) => listener(nextState));

    expect(controller.getSnapshot()?.rest?.baseUrl).toBe('https://external.example.com/');

    await controller.dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('dispose drains a pending auto save instead of dropping it', async () => {
    vi.useFakeTimers();

    const collect = vi.fn(() =>
      mergeOptions({ rest: { baseUrl: 'https://dispose.example.com/' } })
    );

    const controller = createOptionsController({
      persistence,
      formAdapter
    });
    await controller.loadInitialState();

    controller.scheduleAutoSave(collect);
    await controller.dispose();

    expect(collect).toHaveBeenCalledOnce();
    expect(saveMock).toHaveBeenCalledOnce();
    expect(savedOptions[0]?.rest?.baseUrl).toBe('https://dispose.example.com/');
  });

  it('drains a newer pending desired state before a bounded flush resolves', async () => {
    vi.useFakeTimers();

    let releaseFirstSave: (() => void) | undefined;
    saveMock
      .mockImplementationOnce(
        (patches) =>
          new Promise<StoredOptions>((resolve) => {
            releaseFirstSave = () => {
              for (const patch of patches) {
                const value = patch.value === STORED_OPTIONS_DELETE ? undefined : patch.value;
                repositorySnapshot = replaceOptionsPath(
                  repositorySnapshot,
                  requireOptionsPath(patch.path),
                  value
                );
              }
              const acknowledged = structuredClone(repositorySnapshot);
              savedOptions.push(acknowledged);
              resolve(acknowledged);
            };
          })
      )
      .mockImplementation(
        (patches) =>
          new Promise((resolve) => {
            for (const patch of patches) {
              const value = patch.value === STORED_OPTIONS_DELETE ? undefined : patch.value;
              repositorySnapshot = replaceOptionsPath(
                repositorySnapshot,
                requireOptionsPath(patch.path),
                value
              );
            }
            const acknowledged = structuredClone(repositorySnapshot);
            savedOptions.push(acknowledged);
            resolve(acknowledged);
          })
      );

    const controller = createOptionsController({
      persistence,
      formAdapter,
      autoSaveDebounceMs: 10
    });
    await controller.loadInitialState();

    controller.scheduleAutoSave(() =>
      mergeOptions({ rest: { baseUrl: 'https://first.example.com/' } })
    );
    await vi.advanceTimersByTimeAsync(10);

    controller.scheduleAutoSave(() =>
      mergeOptions({ rest: { baseUrl: 'https://second.example.com/' } })
    );
    const flush = controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenCalledTimes(1);
    releaseFirstSave?.();
    await flush;

    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(savedOptions.map((draft) => draft.rest?.baseUrl)).toEqual([
      'https://first.example.com/',
      'https://second.example.com/'
    ]);
  });

  it('hands a synchronous pending collector to persistence before flush yields', async () => {
    let releaseSave: (() => void) | undefined;
    saveMock.mockImplementationOnce(
      (patches) =>
        new Promise<StoredOptions>((resolve) => {
          releaseSave = () => {
            for (const patch of patches) {
              const value = patch.value === STORED_OPTIONS_DELETE ? undefined : patch.value;
              repositorySnapshot = replaceOptionsPath(
                repositorySnapshot,
                requireOptionsPath(patch.path),
                value
              );
            }
            const acknowledged = structuredClone(repositorySnapshot);
            savedOptions.push(acknowledged);
            resolve(acknowledged);
          };
        })
    );

    const controller = createOptionsController({
      persistence,
      formAdapter,
      autoSaveDebounceMs: 400
    });
    await controller.loadInitialState();
    controller.scheduleAutoSave(() =>
      mergeOptions({ rest: { baseUrl: 'https://page-exit.example.com/' } })
    );

    const flush = controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenCalledOnce();
    releaseSave?.();
    await flush;
  });

  it('shares one active drain across repeated flush requests', async () => {
    let releaseSave: (() => void) | undefined;
    saveMock.mockImplementationOnce(
      (patches) =>
        new Promise<StoredOptions>((resolve) => {
          releaseSave = () => {
            for (const patch of patches) {
              const value = patch.value === STORED_OPTIONS_DELETE ? undefined : patch.value;
              repositorySnapshot = replaceOptionsPath(
                repositorySnapshot,
                requireOptionsPath(patch.path),
                value
              );
            }
            resolve(structuredClone(repositorySnapshot));
          };
        })
    );
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const desired = structuredClone(repositorySnapshot);
    desired.interfaceTheme = 'dark';
    controller.scheduleAutoSave(() => desired);

    const firstFlush = controller.flushPendingAutoSave();
    const secondFlush = controller.flushPendingAutoSave();
    expect(saveMock).toHaveBeenCalledTimes(1);
    releaseSave?.();
    await Promise.all([firstFlush, secondFlush]);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed handoff retryable for the next bounded flush without looping', async () => {
    vi.useFakeTimers();

    const failure = new Error('durable handoff failed');
    saveMock.mockRejectedValueOnce(failure);

    const controller = createOptionsController({
      persistence,
      formAdapter,
      autoSaveDebounceMs: 10
    });
    await controller.loadInitialState();
    controller.scheduleAutoSave(() =>
      mergeOptions({ rest: { baseUrl: 'https://retry.example.com/' } })
    );

    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    expect(saveMock).toHaveBeenCalledTimes(1);

    await expect(controller.flushPendingAutoSave()).resolves.toBeUndefined();
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[0]).toEqual(saveMock.mock.calls[1]);
    expect(savedOptions.map((draft) => draft.rest?.baseUrl)).toEqual([
      'https://retry.example.com/'
    ]);
  });

  it('correlates a retained autosave failure with its successful retry', async () => {
    const failure = new Error('EXTERNAL_SYNC_CONFLICT');
    saveMock.mockRejectedValueOnce(failure);
    const onSaveError = vi.fn();
    const onAutoSaveRecovered = vi.fn();
    const controller = createOptionsController({
      persistence,
      formAdapter,
      onSaveError,
      onAutoSaveRecovered
    });
    await controller.loadInitialState();
    const desired = structuredClone(repositorySnapshot);
    desired.fragmentClipper.captureContext = true;
    controller.scheduleAutoSave(() => desired);

    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    expect(onSaveError).toHaveBeenCalledWith('auto', failure, {
      intentId: 1,
      admissionGeneration: 1
    });
    expect(onAutoSaveRecovered).not.toHaveBeenCalled();

    await controller.flushPendingAutoSave();

    expect(onAutoSaveRecovered).toHaveBeenCalledWith({
      intentId: 1,
      admissionGeneration: 1
    });
  });

  it('reports authoritative satisfaction as autosave recovery without another write', async () => {
    const failure = new Error('OPTIONS_STORAGE_FAILURE');
    saveMock.mockRejectedValueOnce(failure);
    const onAutoSaveRecovered = vi.fn();
    const controller = createOptionsController({
      persistence,
      formAdapter,
      onAutoSaveRecovered
    });
    await controller.loadInitialState();
    const desired = structuredClone(repositorySnapshot);
    desired.fragmentClipper.captureContext = true;
    controller.scheduleAutoSave(() => desired);

    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    controller.setSnapshot(desired);

    expect(onAutoSaveRecovered).toHaveBeenCalledWith({
      intentId: 1,
      admissionGeneration: 1
    });
    await controller.flushPendingAutoSave();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('lets a user reversal discard a failed retry without writing the obsolete value', async () => {
    const failure = new Error('durable handoff failed');
    saveMock.mockRejectedValueOnce(failure);
    const onAutoSaveRecovered = vi.fn();
    const dirtyPathStates: Array<readonly string[]> = [];
    const controller = createOptionsController({
      persistence,
      formAdapter,
      onAutoSaveRecovered
    });
    await controller.loadInitialState();
    controller.bindMountedDraftRebase((_draft, transition) => {
      dirtyPathStates.push(transition.dirtyPathKeys);
    });
    const changed = structuredClone(repositorySnapshot);
    changed.aiChat.userName = 'obsolete';
    controller.scheduleAutoSave(() => changed);

    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    controller.scheduleAutoSave(() => structuredClone(repositorySnapshot));
    await controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedOptions).toEqual([]);
    expect(dirtyPathStates.at(-1)).toEqual([]);
    expect(onAutoSaveRecovered).toHaveBeenCalledOnce();
    expect(onAutoSaveRecovered).toHaveBeenCalledWith({
      intentId: 1,
      admissionGeneration: 1
    });
  });

  it('reconciles a debounced failed edit when a later debounced capture reverses it', async () => {
    vi.useFakeTimers();
    const failure = new Error('OPTIONS_STORAGE_FAILURE');
    saveMock.mockRejectedValueOnce(failure);
    const onSaveError = vi.fn();
    const onAutoSaveRecovered = vi.fn();
    const controller = createOptionsController({
      persistence,
      formAdapter,
      onSaveError,
      onAutoSaveRecovered
    });
    await controller.loadInitialState();
    const changed = structuredClone(repositorySnapshot);
    changed.fragmentClipper.captureContext = true;

    controller.scheduleAutoSave(() => changed);
    await vi.advanceTimersByTimeAsync(400);
    expect(onSaveError).toHaveBeenCalledOnce();

    controller.scheduleAutoSave(() => structuredClone(repositorySnapshot));
    await vi.advanceTimersByTimeAsync(400);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(onAutoSaveRecovered).toHaveBeenCalledOnce();
    expect(onAutoSaveRecovered).toHaveBeenCalledWith({
      intentId: 1,
      admissionGeneration: 1
    });
  });

  it('discards a failed retry after a manual reversal before page exit', async () => {
    const failure = new Error('EXTERNAL_SYNC_CONFLICT');
    saveMock.mockRejectedValueOnce(failure);
    const onAutoSaveRecovered = vi.fn();
    const controller = createOptionsController({
      persistence,
      formAdapter,
      onAutoSaveRecovered
    });
    await controller.loadInitialState();
    const desired = structuredClone(repositorySnapshot);
    desired.fragmentClipper.captureContext = true;

    controller.scheduleAutoSave(() => desired);
    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    await controller.saveSnapshot({
      reason: 'manual',
      draft: structuredClone(repositorySnapshot)
    });
    await controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedOptions).toEqual([]);
    expect(onAutoSaveRecovered).toHaveBeenCalledOnce();
    expect(onAutoSaveRecovered).toHaveBeenCalledWith({
      intentId: 1,
      admissionGeneration: 1
    });
  });

  it('does not let the same synthetic admission silently unblock a failed mutation', async () => {
    const failure = new Error('EXTERNAL_SYNC_CONFLICT');
    const persist = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const durability = createOptionsControllerDurability({ persist });
    const mutation = (admissionGeneration: number): DurableOptionsMutation => ({
      intent: {
        intentId: admissionGeneration,
        baseRevision: 1,
        admissionGeneration,
        owned: [],
        patches: []
      },
      reason: 'auto'
    });

    durability.enqueue(mutation(1));
    await expect(durability.flush()).rejects.toBe(failure);
    durability.enqueue(mutation(1));
    durability.enqueue(mutation(0));
    await Promise.resolve();

    expect(persist).toHaveBeenCalledTimes(1);
    await expect(durability.flush()).resolves.toBeUndefined();
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('discards a failed admission when the authoritative base already satisfies it', async () => {
    const failure = new Error('EXTERNAL_SYNC_CONFLICT');
    saveMock.mockRejectedValueOnce(failure);
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const desired = structuredClone(repositorySnapshot);
    desired.fragmentClipper.captureContext = true;

    controller.scheduleAutoSave(() => desired);
    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    controller.setSnapshot(desired);
    controller.scheduleAutoSave(() => structuredClone(desired));
    await controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedOptions).toEqual([]);
  });

  it('discards a failed retry when an authoritative notification satisfies it before page exit', async () => {
    const failure = new Error('EXTERNAL_SYNC_CONFLICT');
    saveMock.mockRejectedValueOnce(failure);
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const desired = structuredClone(repositorySnapshot);
    desired.fragmentClipper.captureContext = true;

    controller.scheduleAutoSave(() => desired);
    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    controller.setSnapshot(desired);
    await controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedOptions).toEqual([]);
  });

  it('re-drains one newer real admission even when its final patches match the failure', async () => {
    const failure = new Error('EXTERNAL_SYNC_CONFLICT');
    saveMock.mockRejectedValueOnce(failure);
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const desired = structuredClone(repositorySnapshot);
    desired.fragmentClipper.captureContext = true;

    controller.scheduleAutoSave(() => desired);
    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    controller.scheduleAutoSave(() => structuredClone(desired));
    await controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[0]).toEqual(saveMock.mock.calls[1]);
    expect(savedOptions.at(-1)?.fragmentClipper?.captureContext).toBe(true);
  });

  it('combines a failed dirty value with an unrelated newer interaction', async () => {
    const failure = new Error('EXTERNAL_SYNC_CONFLICT');
    saveMock.mockRejectedValueOnce(failure);
    const controller = createOptionsController({ persistence, formAdapter });
    await controller.loadInitialState();
    const failed = structuredClone(repositorySnapshot);
    failed.fragmentClipper.captureContext = true;

    controller.scheduleAutoSave(() => failed);
    await expect(controller.flushPendingAutoSave()).rejects.toBe(failure);
    const combined = structuredClone(failed);
    combined.interfaceTheme = 'dark';
    controller.scheduleAutoSave(() => combined);
    await controller.flushPendingAutoSave();

    expect(saveMock).toHaveBeenLastCalledWith([
      { path: ['interfaceTheme'], value: 'dark' },
      { path: ['fragmentClipper', 'captureContext'], value: true }
    ]);
    expect(savedOptions.at(-1)?.interfaceTheme).toBe('dark');
    expect(savedOptions.at(-1)?.fragmentClipper?.captureContext).toBe(true);
  });
});
