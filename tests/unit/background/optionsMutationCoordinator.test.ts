import { describe, expect, it, vi } from 'vitest';
import {
  createBackgroundOptionsRepository,
  OptionsMutationCoordinator,
  type OptionsMutationCoordinatorOptions
} from '../../../src/background/services/optionsMutationCoordinator';
import { decodeStoredOptions } from '../../../src/shared/config/storedOptionsCodec';
import type { OptionsRawStorageRepository } from '../../../src/infrastructure/repositories/ChromeOptionsRepository';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../../src/shared/config/losslessObjectBoundaryTypes';
import type { CompleteOptions } from '../../../src/shared/types/options';
import { OptionsMutationError } from '../../../src/shared/types/optionsMutationMessages';

function clone<T>(value: T): T {
  return structuredClone(value);
}

class RawRepository implements OptionsRawStorageRepository {
  writes: PlainStructuredObject[] = [];
  failNextWrite = false;

  constructor(public raw: PlainStructuredValue | null) {}

  readRaw(): Promise<PlainStructuredValue | null> {
    return Promise.resolve(clone(this.raw));
  }

  writeRaw(value: PlainStructuredObject): Promise<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return Promise.reject(new Error('write failed'));
    }
    this.raw = clone(value);
    this.writes.push(clone(value));
    return Promise.resolve();
  }
}

function createCoordinator(
  repository: RawRepository,
  options: OptionsMutationCoordinatorOptions = {}
): OptionsMutationCoordinator {
  return new OptionsMutationCoordinator(repository, {
    createOperationId: () => 'operation-id',
    yieldAfterWrite: () => Promise.resolve(),
    ...options
  });
}

describe('OptionsMutationCoordinator', () => {
  it('stores privacy patches locally and scrubs the synchronized mirror', async () => {
    const repository = new RawRepository({
      interfaceTheme: 'system',
      privacyPreferences: {
        analytics: false,
        errorReporting: true,
        debugMode: false
      },
      opaqueRoot: { keep: true }
    });
    let privacy = { analytics: false, errorReporting: false, debugMode: false };
    const readPrivacy = vi.fn(() => Promise.resolve(privacy));
    const writePrivacy = vi.fn((next: typeof privacy) => {
      privacy = clone(next);
      return Promise.resolve();
    });
    const coordinatorOptions = {
      yieldAfterWrite: () => Promise.resolve(),
      deviceLocalPrivacy: { readPrivacy, writePrivacy }
    };
    const coordinator = createCoordinator(repository, coordinatorOptions);

    const result = await coordinator.patch([
      { path: ['privacyPreferences', 'analytics'], value: true },
      { path: ['privacyPreferences', 'errorReporting'], value: false },
      { path: ['privacyPreferences', 'debugMode'], value: true }
    ]);

    expect(writePrivacy).toHaveBeenCalledWith({
      analytics: true,
      errorReporting: false,
      debugMode: false
    });
    expect(repository.raw).toEqual({
      interfaceTheme: 'system',
      opaqueRoot: { keep: true }
    });
    expect(result.snapshot.privacyPreferences).toEqual({
      analytics: true,
      errorReporting: false,
      debugMode: false
    });

    const replacement = await coordinator.replace({ interfaceTheme: 'dark' });
    expect(repository.raw).toEqual({ interfaceTheme: 'dark' });
    expect(replacement.snapshot.privacyPreferences).toEqual(privacy);
    expect(writePrivacy).toHaveBeenCalledTimes(1);
  });

  it('serializes disjoint patches and preserves opaque or malformed untouched roots', async () => {
    const repository = new RawRepository({
      templates: { article: 'Before' },
      fragmentClipper: { captureContext: false },
      opaqueRoot: { keep: ['opaque', 1] },
      rest: { apiKey: { malformed: true } }
    });
    const coordinator = createCoordinator(repository);

    await Promise.all([
      coordinator.patch([{ path: ['templates', 'article'], value: 'After' }]),
      coordinator.patch([{ path: ['fragmentClipper', 'captureContext'], value: true }])
    ]);

    expect(repository.raw).toMatchObject({
      templates: { article: 'After' },
      fragmentClipper: { captureContext: true },
      opaqueRoot: { keep: ['opaque', 1] },
      rest: { apiKey: { malformed: true } }
    });
    expect(repository.writes).toHaveLength(2);
  });

  it('serializes same-root patches in arrival order and skips deep-equal writes', async () => {
    const repository = new RawRepository({ templates: { article: 'Before' } });
    const coordinator = createCoordinator(repository);

    await Promise.all([
      coordinator.patch([{ path: ['templates', 'article'], value: 'First' }]),
      coordinator.patch([{ path: ['templates', 'article'], value: 'Second' }])
    ]);
    const noOp = await coordinator.patch([{ path: ['templates', 'article'], value: 'Second' }]);

    expect(repository.raw).toEqual({ templates: { article: 'Second' } });
    expect(repository.writes).toHaveLength(2);
    expect(noOp.didWrite).toBe(false);
  });

  it('strictly replaces the raw root instead of preserving opaque values', async () => {
    const repository = new RawRepository({ opaqueRoot: { keep: true } });
    const coordinator = createCoordinator(repository);

    const result = await coordinator.replace({ interfaceTheme: 'dark' });

    expect(repository.raw).toEqual({ interfaceTheme: 'dark' });
    expect(result.snapshot.interfaceTheme).toBe('dark');
    expect(result.rawSignature).toMatch(/^fnv1a32:[0-9a-f]{8}:\d+$/u);
  });

  it('counts the storage key envelope in the conservative quota preflight', async () => {
    const next = { templates: { article: 'A' } };
    const valueBytes = new TextEncoder().encode(JSON.stringify(next)).byteLength;
    const envelopeBytes = new TextEncoder().encode(JSON.stringify({ options: next })).byteLength;
    expect(envelopeBytes).toBeGreaterThan(valueBytes);
    const repository = new RawRepository({});
    const coordinator = createCoordinator(repository, {
      quotaBytesPerItem: envelopeBytes - 1
    });

    await expect(
      coordinator.patch([{ path: ['templates', 'article'], value: 'A' }])
    ).rejects.toMatchObject({ code: 'OPTIONS_QUOTA_EXCEEDED' });
    expect(repository.writes).toHaveLength(0);
  });

  it('rebases twice against observed drift and reports a stable conflict after continued loss', async () => {
    const repository = new RawRepository({ templates: { article: 'Before' } });
    let driftCount = 0;
    const coordinator = createCoordinator(repository, {
      yieldAfterWrite: async () => {
        driftCount += 1;
        repository.raw = { templates: { article: `Remote ${driftCount}` } };
      }
    });

    await expect(
      coordinator.patch([{ path: ['templates', 'article'], value: 'Local' }])
    ).rejects.toEqual(new OptionsMutationError('EXTERNAL_SYNC_CONFLICT'));
    expect(repository.writes).toHaveLength(3);
  });

  it('accepts disjoint external drift when the touched result survives readback', async () => {
    const repository = new RawRepository({ templates: { article: 'Before' } });
    const coordinator = createCoordinator(repository, {
      yieldAfterWrite: async () => {
        const current = repository.raw;
        repository.raw = {
          ...(typeof current === 'object' && current !== null && !Array.isArray(current)
            ? current
            : {}),
          remoteOpaque: { preserved: true }
        };
      }
    });

    await coordinator.patch([{ path: ['templates', 'article'], value: 'Local' }]);

    expect(repository.raw).toEqual({
      templates: { article: 'Local' },
      remoteOpaque: { preserved: true }
    });
    expect(repository.writes).toHaveLength(1);
  });

  it('does not let a stale lossless migration overwrite a newer user edit', async () => {
    const repository = new RawRepository({
      fragmentClipper: { selectionModifierEnabled: false, selectionModifierKeys: ['shift'] }
    });
    let injected = false;
    const coordinator = createCoordinator(repository, {
      yieldAfterWrite: async () => {
        if (injected) return;
        injected = true;
        repository.raw = {
          fragmentClipper: {
            selectionTriggerMode: 'modifier',
            selectionModifierKeys: ['shift']
          }
        };
      }
    });

    const result = await coordinator.migrate();

    expect(result.snapshot.fragmentClipper.selectionTriggerMode).toBe('modifier');
    expect(repository.raw).toMatchObject({
      fragmentClipper: { selectionTriggerMode: 'modifier' }
    });
  });

  it('recovers the FIFO after a storage failure', async () => {
    const repository = new RawRepository({ interfaceTheme: 'system' });
    repository.failNextWrite = true;
    const coordinator = createCoordinator(repository);

    await expect(
      coordinator.patch([{ path: ['interfaceTheme'], value: 'dark' }])
    ).rejects.toMatchObject({ code: 'OPTIONS_STORAGE_FAILURE' });
    await expect(
      coordinator.patch([{ path: ['interfaceTheme'], value: 'light' }])
    ).resolves.toMatchObject({ snapshot: { interfaceTheme: 'light' } });
  });

  it('exposes only the closed legacy usageStats root cleanup', async () => {
    const repository = new RawRepository({
      usageStats: { aiChatSaves: 1 },
      opaqueRoot: { keep: true }
    });
    const coordinator = createCoordinator(repository);

    await coordinator.deleteLegacyUsageStatsRoot();

    expect(repository.raw).toEqual({ opaqueRoot: { keep: true } });
  });

  it('adapts background callers directly onto the same coordinator', async () => {
    const repository = new RawRepository({
      fragmentClipper: { selectionModifierEnabled: true, selectionModifierKeys: ['shift'] }
    });
    const coordinator = createCoordinator(repository);
    const listener = vi.fn<(options: CompleteOptions) => void>();
    const stop = vi.fn();
    const reader = {
      get: () => Promise.resolve(decodeStoredOptions(repository.raw).runtime),
      readDecoded: () => Promise.resolve(decodeStoredOptions(repository.raw)),
      onChange: vi.fn((callback: (options: CompleteOptions) => void) => {
        callback(decodeStoredOptions(repository.raw).runtime);
        return stop;
      })
    };
    const options = createBackgroundOptionsRepository(reader, coordinator);

    expect((await options.get()).fragmentClipper.selectionTriggerMode).toBe('modifier');
    await options.patch({ path: ['interfaceTheme'], value: 'dark' });
    await options.replace({ interfaceTheme: 'light' });
    const unsubscribe = options.onChange(listener);

    expect(repository.writes).toHaveLength(3);
    expect(repository.raw).toEqual({ interfaceTheme: 'light' });
    expect(reader.onChange).toHaveBeenCalledWith(listener);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });
});
