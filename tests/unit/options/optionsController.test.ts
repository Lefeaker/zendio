import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { createOptionsController } from '@options/app/optionsController';
import type { OptionsFormAdapter } from '@options/components/optionsFormAdapter';
import type { OptionsPersistenceService } from '@options/services/persistence';

describe('OptionsController', () => {
  let persistence: OptionsPersistenceService;
  let formAdapter: OptionsFormAdapter;
  let savedOptions: Array<CompleteOptions | StoredOptions>;
  let loadMock: Mock<(...args: []) => Promise<StoredOptions>>;
  let saveMock: Mock<(...args: [CompleteOptions | StoredOptions]) => Promise<void>>;
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
    getCachedMock = vi.fn<(...args: []) => StoredOptions | null>(() => snapshot);

    persistence = {
      load: loadMock,
      save: saveMock,
      getCached: getCachedMock
    };

    readMock = vi.fn<(...args: [StoredOptions | null]) => CompleteOptions>(
      (_snapshot) =>
        ({
          rest: { baseUrl: 'https://changed.example.com/' }
        }) as CompleteOptions
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
    expect(onSaveSuccess).toHaveBeenCalledWith(
      'manual',
      expect.objectContaining({
        rest: { baseUrl: 'https://changed.example.com/' }
      })
    );
  });

  it('debounces auto save requests', async () => {
    vi.useFakeTimers();

    const autoDraft = { rest: { baseUrl: 'https://auto.example.com/' } } as CompleteOptions;
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

    const autoDraft = { rest: { baseUrl: 'https://async.example.com/' } } as CompleteOptions;
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
    persistence.subscribe = vi.fn((listener) => {
      listeners.push(listener);
      return unsubscribe;
    });

    const controller = createOptionsController({
      persistence,
      formAdapter
    });
    await controller.loadInitialState();

    const nextState = { rest: { baseUrl: 'https://external.example.com/' } } as StoredOptions;
    listeners.forEach((listener) => listener(nextState));

    expect(controller.getSnapshot()?.rest?.baseUrl).toBe('https://external.example.com/');

    controller.dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('dispose cancels pending auto save timer', async () => {
    vi.useFakeTimers();

    const collect = vi.fn(
      () =>
        ({
          rest: { baseUrl: 'https://dispose.example.com/' }
        }) as CompleteOptions
    );

    const controller = createOptionsController({
      persistence,
      formAdapter
    });
    await controller.loadInitialState();

    controller.scheduleAutoSave(collect);
    controller.dispose();

    await vi.advanceTimersByTimeAsync(400);

    expect(collect).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
