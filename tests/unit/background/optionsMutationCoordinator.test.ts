import { describe, expect, it, vi } from 'vitest';
import {
  createBackgroundOptionsRepository,
  OptionsMutationCoordinator,
  type OptionsMutationCoordinatorOptions
} from '../../../src/background/services/optionsMutationCoordinator';
import { decodeStoredOptions } from '../../../src/shared/config/storedOptionsCodec';
import type {
  DeviceLocalVaultBindingRepository,
  DeviceLocalPrivacyCommitter,
  OptionsRawStorageRepository
} from '../../../src/infrastructure/repositories/ChromeOptionsRepository';
import type { DeviceLocalVaultBindingSnapshot } from '../../../src/shared/config/deviceLocalVaultBindings';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../../src/shared/config/losslessObjectBoundaryTypes';
import type { CompleteOptions } from '../../../src/shared/types/options';
import {
  OptionsMutationError,
  type OptionsPatch
} from '../../../src/shared/types/optionsMutationMessages';

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

class VaultRawRepository extends RawRepository implements DeviceLocalVaultBindingRepository {
  bindings: DeviceLocalVaultBindingSnapshot = { version: 1, bindings: {} };
  failNextBindingWrite = false;

  readVaultBindings(): Promise<DeviceLocalVaultBindingSnapshot> {
    return Promise.resolve(clone(this.bindings));
  }

  writeVaultBindings(snapshot: DeviceLocalVaultBindingSnapshot): Promise<void> {
    if (this.failNextBindingWrite) {
      this.failNextBindingWrite = false;
      return Promise.reject(new Error('binding write failed'));
    }
    this.bindings = clone(snapshot);
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
  it('stores selected vault bindings locally while the privacy owner scrubs synchronized bytes', async () => {
    let portable: PlainStructuredObject = {
      privacyPreferences: { analytics: false, errorReporting: false, debugMode: false },
      opaqueRoot: { keep: true }
    };
    const repository = new VaultRawRepository(portable);
    const privacy = { analytics: false, errorReporting: false, debugMode: false };
    const execute: DeviceLocalPrivacyCommitter['execute'] = (command, applyCommand) => {
      const mutation = applyCommand({ ...portable, privacyPreferences: privacy }, command);
      portable = { ...mutation.next };
      delete portable.privacyPreferences;
      repository.raw = clone(portable);
      return Promise.resolve({ raw: portable, privacy, didWrite: true });
    };
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute }
    });

    const result = await coordinator.patch([
      {
        path: ['vaultRouter'],
        value: {
          defaultVaultId: 'primary',
          vaults: [
            {
              id: 'primary',
              name: 'Primary',
              vault: 'Primary',
              httpsUrl: '',
              httpUrl: '',
              apiKey: '',
              localFolderId: 'folder-primary',
              localFolderName: 'Primary Folder'
            }
          ]
        }
      }
    ]);

    expect(repository.raw).toEqual({
      vaultRouter: {
        defaultVaultId: 'primary',
        vaults: [
          {
            id: 'primary',
            name: 'Primary',
            vault: 'Primary',
            httpsUrl: '',
            httpUrl: '',
            apiKey: ''
          }
        ]
      },
      opaqueRoot: { keep: true }
    });
    expect(repository.bindings.bindings).toEqual({
      primary: { folderId: 'folder-primary', folderName: 'Primary Folder' }
    });
    expect(result.snapshot.vaultRouter?.vaults[0]?.localFolderId).toBe('folder-primary');
    expect(result.snapshot.privacyPreferences).toEqual(privacy);
  });

  it('does not commit synchronized options or privacy when the local vault binding write fails', async () => {
    const originalRaw: PlainStructuredObject = {
      privacyPreferences: { analytics: false, errorReporting: false, debugMode: false },
      vaultRouter: {
        defaultVaultId: 'primary',
        vaults: [
          {
            id: 'primary',
            name: 'Primary',
            vault: 'Primary',
            httpsUrl: '',
            httpUrl: '',
            apiKey: ''
          }
        ]
      },
      opaqueRoot: { keep: true }
    };
    const repository = new VaultRawRepository(originalRaw);
    repository.bindings = {
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    };
    repository.failNextBindingWrite = true;
    let privacy = { analytics: false, errorReporting: false, debugMode: false };
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>((command, applyCommand) => {
      const mutation = applyCommand({ ...originalRaw, privacyPreferences: privacy }, command);
      privacy = clone(decodeStoredOptions(mutation.next).runtime.privacyPreferences);
      repository.raw = clone(mutation.next);
      return Promise.resolve({ raw: mutation.next, privacy, didWrite: true });
    });
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute }
    });

    await expect(
      coordinator.patch([
        { path: ['privacyPreferences', 'analytics'], value: true },
        {
          path: ['vaultRouter'],
          value: {
            defaultVaultId: 'primary',
            vaults: [
              {
                id: 'primary',
                name: 'Primary',
                vault: 'Primary',
                httpsUrl: '',
                httpUrl: '',
                apiKey: '',
                localFolderId: 'folder-new',
                localFolderName: 'New Folder'
              }
            ]
          }
        }
      ])
    ).rejects.toEqual(new OptionsMutationError('OPTIONS_STORAGE_FAILURE'));

    expect(execute).not.toHaveBeenCalled();
    expect(repository.raw).toEqual(originalRaw);
    expect(repository.bindings).toEqual({
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    });
    expect(privacy).toEqual({ analytics: false, errorReporting: false, debugMode: false });
  });

  it('restores the previous vault binding when the coordinated commit fails', async () => {
    const originalRaw: PlainStructuredObject = {
      vaultRouter: {
        defaultVaultId: 'primary',
        vaults: [
          {
            id: 'primary',
            name: 'Primary',
            vault: 'Primary',
            httpsUrl: '',
            httpUrl: '',
            apiKey: ''
          }
        ]
      },
      opaqueRoot: { keep: true }
    };
    const repository = new VaultRawRepository(originalRaw);
    repository.bindings = {
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    };
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>(() =>
      Promise.reject(new OptionsMutationError('OPTIONS_STORAGE_FAILURE'))
    );
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute }
    });

    await expect(
      coordinator.patch([
        {
          path: ['vaultRouter'],
          value: {
            defaultVaultId: 'primary',
            vaults: [
              {
                id: 'primary',
                name: 'Primary',
                vault: 'Primary',
                httpsUrl: '',
                httpUrl: '',
                apiKey: '',
                localFolderId: 'folder-new',
                localFolderName: 'New Folder'
              }
            ]
          }
        }
      ])
    ).rejects.toEqual(new OptionsMutationError('OPTIONS_STORAGE_FAILURE'));

    expect(execute).toHaveBeenCalledOnce();
    expect(repository.raw).toEqual(originalRaw);
    expect(repository.bindings).toEqual({
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    });
  });

  it('stores privacy patches locally and scrubs the synchronized mirror', async () => {
    let portable: PlainStructuredObject = {
      interfaceTheme: 'system',
      privacyPreferences: {
        analytics: false,
        errorReporting: true,
        debugMode: false
      },
      opaqueRoot: { keep: true }
    };
    const repository = new RawRepository(portable);
    let privacy = { analytics: false, errorReporting: false, debugMode: false };
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>((command, applyCommand) => {
      const mutation = applyCommand({ ...portable, privacyPreferences: privacy }, command);
      if (
        command.kind === 'patch' &&
        command.patches.some((patch: OptionsPatch) => patch.path[0] === 'privacyPreferences')
      ) {
        privacy = clone(decodeStoredOptions(mutation.next).runtime.privacyPreferences);
      }
      portable = { ...mutation.next };
      delete portable.privacyPreferences;
      repository.raw = clone(portable);
      return Promise.resolve({ raw: portable, privacy, didWrite: true });
    });
    const coordinatorOptions = {
      yieldAfterWrite: () => Promise.resolve(),
      deviceLocalPrivacyCommitter: { execute }
    };
    const coordinator = createCoordinator(repository, coordinatorOptions);

    const result = await coordinator.patch([
      { path: ['privacyPreferences', 'analytics'], value: true },
      { path: ['privacyPreferences', 'errorReporting'], value: false },
      { path: ['privacyPreferences', 'debugMode'], value: true }
    ]);

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
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('rolls back staged privacy when the synchronized scrub fails', async () => {
    const originalRaw = {
      privacyPreferences: { analytics: false, errorReporting: false, debugMode: false },
      opaqueRoot: { keep: true }
    };
    const repository = new RawRepository(originalRaw);
    repository.failNextWrite = true;
    const execute: DeviceLocalPrivacyCommitter['execute'] = vi.fn(() =>
      Promise.reject(new OptionsMutationError('OPTIONS_STORAGE_FAILURE'))
    );
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute }
    });

    await expect(
      coordinator.patch([{ path: ['privacyPreferences', 'analytics'], value: true }])
    ).rejects.toEqual(new OptionsMutationError('OPTIONS_STORAGE_FAILURE'));

    expect(repository.raw).toEqual(originalRaw);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('restores the synchronized mirror when the local privacy commit fails', async () => {
    const originalRaw = {
      privacyPreferences: { analytics: false, errorReporting: false, debugMode: false },
      opaqueRoot: { keep: true }
    };
    const repository = new RawRepository(originalRaw);
    const execute: DeviceLocalPrivacyCommitter['execute'] = vi.fn(async () => {
      await repository.writeRaw({ opaqueRoot: { keep: true } });
      await repository.writeRaw(originalRaw);
      throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
    });
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute }
    });

    await expect(
      coordinator.patch([{ path: ['privacyPreferences', 'analytics'], value: true }])
    ).rejects.toEqual(new OptionsMutationError('OPTIONS_STORAGE_FAILURE'));

    expect(repository.raw).toEqual(originalRaw);
    expect(repository.writes).toEqual([{ opaqueRoot: { keep: true } }, originalRaw]);
    expect(execute).toHaveBeenCalledOnce();
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
