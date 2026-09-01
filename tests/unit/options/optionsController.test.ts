import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { mergeOptions } from '@shared/config/optionsMerger';
import { createOptionsController } from '@options/app/optionsController';
import type { OptionsFormAdapter } from '@options/components/optionsFormAdapter';
import type { OptionsPersistenceService } from '@options/services/persistence';

describe('OptionsController', () => {
  let persistence: OptionsPersistenceService;
  let formAdapter: OptionsFormAdapter;
  let savedOptions: Array<CompleteOptions | StoredOptions>;
  let loadMock: Mock<(...args: []) => Promise<StoredOptions>>;
  let saveMock: Mock<(...args: [CompleteOptions | StoredOptions]) => Promise<void>>;
  let replaceMock: Mock<(...args: [CompleteOptions | StoredOptions]) => Promise<void>>;
  let getCachedMock: Mock<(...args: []) => StoredOptions | null>;
  let readMock: Mock<(...args: [StoredOptions | null]) => CompleteOptions>;
  let applyMock: Mock<(...args: [StoredOptions]) => Promise<void>>;

  beforeEach(() => {
    savedOptions = [];
    const snapshot: StoredOptions = {
      rest: { baseUrl: 'https://example.com/' }
    };

    loadMock = vi.fn<(...args: []) => Promise<StoredOptions>>(() => Promise.resolve(snapshot));
    saveMock = vi.fn<(...args: [CompleteOptions | StoredOptions]) => Promise<void>>((options) => {
      savedOptions.push(options);
      return Promise.resolve();
    });
    replaceMock = vi.fn<(...args: [CompleteOptions | StoredOptions]) => Promise<void>>(
      (options) => {
        savedOptions.push(options);
        return Promise.resolve();
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

    expect(collect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);

    expect(collect).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedOptions[0]?.rest?.baseUrl).toBe('https://auto.example.com/');
  });

  it('awaits async collectors before saving auto snapshot', async () => {
    vi.useFakeTimers();

    const autoDraft = mergeOptions({ rest: { baseUrl: 'https://async.example.com/' } });
    const collect = vi.fn(async () => {
      await Promise.resolve();
      return autoDraft;
    });

    const controller = createOptionsController({
      persistence,
      formAdapter
    });
    await controller.loadInitialState();

    controller.scheduleAutoSave(collect);
    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();

    expect(collect).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedOptions[0]?.rest?.baseUrl).toBe('https://async.example.com/');
  });

  it('serializes a reversal behind an earlier pending durable autosave', async () => {
    vi.useFakeTimers();

    let releaseFirstSave: (() => void) | undefined;
    saveMock
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstSave = resolve;
          })
      )
      .mockResolvedValue(undefined);

    const controller = createOptionsController({
      persistence,
      formAdapter,
      autoSaveDebounceMs: 10
    });
    await controller.loadInitialState();

    const temporaryDraft = mergeOptions({ fragmentClipper: { captureContext: true } });
    const baselineDraft = mergeOptions({ fragmentClipper: { captureContext: false } });

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
    expect(saveMock.mock.calls.map(([draft]) => draft.fragmentClipper?.captureContext)).toEqual([
      true,
      false
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
        () =>
          new Promise<void>((resolve) => {
            releaseFirstSave = resolve;
          })
      )
      .mockResolvedValue(undefined);

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
    expect(saveMock.mock.calls.map(([draft]) => draft.rest?.baseUrl)).toEqual([
      'https://first.example.com/',
      'https://second.example.com/'
    ]);
  });

  it('hands a synchronous pending collector to persistence before flush yields', async () => {
    let releaseSave: (() => void) | undefined;
    saveMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
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

  it('keeps a failed handoff retryable for the next bounded flush without looping', async () => {
    vi.useFakeTimers();

    const failure = new Error('durable handoff failed');
    saveMock.mockRejectedValueOnce(failure).mockResolvedValue(undefined);

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
    expect(saveMock.mock.calls.map(([draft]) => draft.rest?.baseUrl)).toEqual([
      'https://retry.example.com/',
      'https://retry.example.com/'
    ]);
  });
});
