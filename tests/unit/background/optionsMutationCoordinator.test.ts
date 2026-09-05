import { describe, expect, it, vi } from 'vitest';
import {
  createBackgroundOptionsRepository,
  OptionsMutationCoordinator,
  type OptionsMutationCoordinatorOptions
} from '../../../src/background/services/optionsMutationCoordinator';
import { decodeStoredOptions } from '../../../src/shared/config/storedOptionsCodec';
import {
  captureDeviceLocalVaultBindings,
  optionsValuesEqual
} from '../../../src/shared/config/deviceLocalVaultBindings';
import { createMemoryStorageService } from '../../../src/platform/preview/memoryStorage';
import {
  DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
  DeviceLocalVaultCleanupJournal
} from '../../../src/shared/config/deviceLocalVaultCleanupJournal';
import {
  DeviceLocalVaultCleanupExecutor,
  DeviceLocalVaultLocalCommitter,
  DeviceLocalVaultRecoveryStorage
} from '../../../src/shared/config/deviceLocalVaultCleanupExecutor';
import type {
  DeviceLocalVaultBindingRepository,
  DeviceLocalPrivacyCommitter,
  OptionsRawStorageRepository
} from '../../../src/infrastructure/repositories/ChromeOptionsRepository';
import { ChromeOptionsRepository } from '../../../src/infrastructure/repositories/ChromeOptionsRepository';
import { createDeviceLocalPrivacyCommitter } from '../../../src/background/services/deviceLocalPrivacyCommitter';
import {
  DEVICE_LOCAL_PRIVACY_CONFIG_KEY,
  DEVICE_LOCAL_PRIVACY_CONSENT_KEY
} from '../../../src/shared/config/deviceLocalPrivacy';
import { DEVICE_LOCAL_VAULT_BINDINGS_KEY } from '../../../src/shared/config/deviceLocalVaultBindings';
import type { DeviceLocalVaultBindingSnapshot } from '../../../src/shared/config/deviceLocalVaultBindings';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../../src/shared/config/losslessObjectBoundaryTypes';
import {
  portableOptionsIdentity,
  type DeviceLocalVaultRecoveryObservation
} from '../../../src/shared/config/deviceLocalVaultRecoveryTransaction';
import type { CompleteOptions, PrivacyPreferencesOptions } from '../../../src/shared/types/options';
import {
  OptionsMutationError,
  type OptionsPatch
} from '../../../src/shared/types/optionsMutationMessages';

const privacy0: PrivacyPreferencesOptions = {
  analytics: false,
  errorReporting: false,
  debugMode: false
};

function requirePlainStructuredObject(value: PlainStructuredValue | null): PlainStructuredObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('EXPECTED_PLAIN_STRUCTURED_OBJECT');
  return value;
}

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
  repository: OptionsRawStorageRepository,
  options: OptionsMutationCoordinatorOptions = {}
): OptionsMutationCoordinator {
  return new OptionsMutationCoordinator(repository, {
    createOperationId: () => 'operation-id',
    yieldAfterWrite: () => Promise.resolve(),
    ...options
  });
}

function createVaultJournal(
  storage: ReturnType<typeof createMemoryStorageService>,
  repository: VaultRawRepository,
  removeDirectory: (folderId: string) => Promise<void> = () => Promise.resolve()
): DeviceLocalVaultCleanupJournal {
  const observe = async (
    transaction: Parameters<NonNullable<DeviceLocalPrivacyCommitter['observe']>>[0],
    direction: 'forward' | 'restore'
  ): Promise<DeviceLocalVaultRecoveryObservation> => {
    const raw = requirePlainStructuredObject(repository.raw);
    const identity = await portableOptionsIdentity(raw);
    const request = {
      preimageIdentity: transaction.portable.preimageIdentity,
      proposedIdentity: transaction.portable.proposedIdentity,
      privacyRestoreTarget: transaction.privacy.restoreTarget,
      privacyForwardTarget: transaction.privacy.forwardTarget
    };
    const primaryIdentity =
      direction === 'forward' ? request.proposedIdentity : request.preimageIdentity;
    const secondaryIdentity =
      direction === 'forward' ? request.preimageIdentity : request.proposedIdentity;
    const portableState: DeviceLocalVaultRecoveryObservation['portableState'] =
      identity === primaryIdentity
        ? direction === 'forward'
          ? 'proposal'
          : 'preimage'
        : identity === secondaryIdentity
          ? direction === 'forward'
            ? 'preimage'
            : 'proposal'
          : 'third';
    const primary =
      direction === 'forward' ? request.privacyForwardTarget : request.privacyRestoreTarget;
    const secondary =
      direction === 'forward' ? request.privacyRestoreTarget : request.privacyForwardTarget;
    const privacyState: DeviceLocalVaultRecoveryObservation['privacyState'] = optionsValuesEqual(
      privacy0,
      primary
    )
      ? direction
      : optionsValuesEqual(privacy0, secondary)
        ? direction === 'forward'
          ? 'restore'
          : 'forward'
        : 'third';
    return { portableState, privacyState, portableRaw: clone(raw), privacy: clone(privacy0) };
  };
  const recoveryStorage = new DeviceLocalVaultRecoveryStorage(
    storage.local,
    () => repository.readVaultBindings(),
    (snapshot) => repository.writeVaultBindings(snapshot),
    async () => {
      const raw = await repository.readRaw();
      return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
    }
  );
  return new DeviceLocalVaultCleanupJournal(
    recoveryStorage,
    new DeviceLocalVaultCleanupExecutor(recoveryStorage, removeDirectory),
    new DeviceLocalVaultLocalCommitter(recoveryStorage),
    {
      observe,
      compensate: async (transaction) => {
        const current = await observe(transaction, 'restore');
        if (current.portableState === 'proposal')
          repository.raw = clone(transaction.portable.preimage);
        return observe(transaction, 'restore');
      }
    }
  );
}

function createConcreteVaultJournal(
  storage: ReturnType<typeof createMemoryStorageService>,
  repository: ChromeOptionsRepository,
  committer: DeviceLocalPrivacyCommitter,
  removeDirectory: (folderId: string) => Promise<void>
) {
  const { observe, compensate } = committer;
  if (!observe || !compensate) throw new Error('recovery operations unavailable');
  const recoveryStorage = new DeviceLocalVaultRecoveryStorage(
    storage.local,
    () => repository.readVaultBindings(),
    (snapshot) => repository.writeVaultBindings(snapshot),
    async () => requirePlainStructuredObject(await repository.readRaw())
  );
  return new DeviceLocalVaultCleanupJournal(
    recoveryStorage,
    new DeviceLocalVaultCleanupExecutor(recoveryStorage, removeDirectory),
    new DeviceLocalVaultLocalCommitter(recoveryStorage),
    { observe, compensate }
  );
}

function commitPortable(repository: VaultRawRepository): DeviceLocalPrivacyCommitter['execute'] {
  return async (command, applyCommand, _quotaBytesPerItem, lifecycle) => {
    const raw = repository.raw;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new OptionsMutationError('OPTIONS_MUTATION_REJECTED');
    }
    const mutation = applyCommand(raw, command);
    const writeRequired = !optionsValuesEqual(raw, mutation.next);
    await lifecycle?.beforePortableDecision({
      portablePreimage: raw,
      portableProposal: mutation.next,
      writeRequired,
      verification: mutation.verification,
      privacyRestoreTarget: privacy0,
      privacyForwardTarget: privacy0,
      privacyWriteRequired: false
    });
    await lifecycle?.beforeForwardMutation();
    if (writeRequired) repository.raw = clone(mutation.next);
    return { raw: mutation.next, didWrite: writeRequired };
  };
}

describe('OptionsMutationCoordinator', () => {
  it('admits commands only after privacy recovery, vault recovery, and migration', async () => {
    const events: string[] = [];
    const repository = new VaultRawRepository({ interfaceTheme: 'system' });
    const execute: DeviceLocalPrivacyCommitter['execute'] = async (command, applyCommand) => {
      events.push(command.kind);
      const raw = requirePlainStructuredObject(repository.raw);
      const mutation = applyCommand(raw, command);
      repository.raw = clone(mutation.next);
      return { raw: mutation.next, didWrite: command.kind !== 'migrate' };
    };
    const journal = createVaultJournal(createMemoryStorageService(), repository);
    vi.spyOn(journal, 'recover').mockImplementation(async () => {
      events.push('vault-recovery');
      return null;
    });
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: {
        recover: async () => {
          events.push('privacy-recovery');
        },
        execute
      },
      deviceLocalVaultCleanupJournal: journal
    });

    await coordinator.patch([{ path: ['interfaceTheme'], value: 'dark' }]);

    expect(events).toEqual([
      'privacy-recovery',
      'vault-recovery',
      'migrate',
      'vault-recovery',
      'patch'
    ]);
  });

  it('does not recapture the composed REST binding during an explicit vaultRouter clear', () => {
    const runtime = decodeStoredOptions({}).runtime;
    runtime.rest.localFolderId = 'folder-old';
    runtime.rest.localFolderName = 'Old Folder';
    runtime.vaultRouter = {
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
    };

    expect(captureDeviceLocalVaultBindings(runtime, 'vaultRouter')).toEqual({
      version: 1,
      bindings: {}
    });
  });

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

  it('commits a local-only binding change through an exact no-write portable decision', async () => {
    const portable: PlainStructuredObject = {
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
      }
    };
    const repository = new VaultRawRepository(portable);
    repository.bindings = {
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    };
    const storage = createMemoryStorageService();
    const journal = createVaultJournal(storage, repository);
    const prepare = vi.spyOn(journal, 'prepare');
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>(commitPortable(repository));
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute },
      deviceLocalVaultCleanupJournal: journal
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
              localFolderId: 'folder-new',
              localFolderName: 'New Folder'
            }
          ]
        }
      }
    ]);

    expect(result.didWrite).toBe(true);
    expect(repository.raw).toEqual(portable);
    expect(repository.bindings.bindings.primary).toEqual({
      folderId: 'folder-new',
      folderName: 'New Folder'
    });
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ writeRequired: false }));
  });

  it('keeps mixed privacy and vault state atomic when the binding write fails', async () => {
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
    let privacy = { analytics: false, errorReporting: false, debugMode: false };
    const storage = createMemoryStorageService();
    const journal = createVaultJournal(storage, repository);
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>(
      async (command, applyCommand, _quotaBytesPerItem, lifecycle) => {
        const mutation = applyCommand({ ...originalRaw, privacyPreferences: privacy }, command);
        privacy = clone(decodeStoredOptions(mutation.next).runtime.privacyPreferences);
        await lifecycle?.beforePortableDecision({
          portablePreimage: originalRaw,
          portableProposal: mutation.next,
          writeRequired: true,
          verification: mutation.verification,
          privacyRestoreTarget: privacy0,
          privacyForwardTarget: privacy,
          privacyWriteRequired: true
        });
        await lifecycle?.beforeForwardMutation();
        repository.raw = clone(mutation.next);
        return { raw: mutation.next, privacy, didWrite: true };
      }
    );
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute },
      deviceLocalVaultCleanupJournal: journal
    });
    await coordinator.initialize();
    execute.mockClear();
    repository.failNextBindingWrite = true;

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

    expect(execute).toHaveBeenCalledOnce();
    expect(repository.raw).toEqual(originalRaw);
    expect(repository.bindings).toEqual({
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    });
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('attempts B1 before any real portable or privacy forward write', async () => {
    const portablePreimage = {
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
      }
    } satisfies PlainStructuredObject;
    const previousBindings: DeviceLocalVaultBindingSnapshot = {
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    };
    const storage = createMemoryStorageService();
    await storage.sync.set('options', portablePreimage);
    await storage.local.set(DEVICE_LOCAL_PRIVACY_CONSENT_KEY, {
      analytics: false,
      errorReporting: false,
      timestamp: 1,
      version: '1.0'
    });
    await storage.local.set(DEVICE_LOCAL_PRIVACY_CONFIG_KEY, { debugMode: false });
    await storage.local.set(DEVICE_LOCAL_VAULT_BINDINGS_KEY, previousBindings);
    const repository = new ChromeOptionsRepository(storage);
    const committer = createDeviceLocalPrivacyCommitter(storage, repository);
    const journal = createConcreteVaultJournal(storage, repository, committer, () =>
      Promise.resolve()
    );
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: committer,
      deviceLocalVaultCleanupJournal: journal
    });
    await coordinator.initialize();
    const forwardEvents: string[] = [];
    const originalSyncSet = storage.sync.set.bind(storage.sync);
    const originalLocalSet = storage.local.set.bind(storage.local);
    const originalSetMany = storage.local.setMany.bind(storage.local);
    let failedBinding = false;
    storage.sync.set = vi.fn(async (key, value) => {
      forwardEvents.push('portable');
      await originalSyncSet(key, value);
    });
    storage.local.setMany = vi.fn(async (entries) => {
      forwardEvents.push('privacy-forward');
      await originalSetMany(entries);
    });
    storage.local.set = vi.fn(async (key, value) => {
      if (key === DEVICE_LOCAL_VAULT_BINDINGS_KEY && !failedBinding) {
        failedBinding = true;
        forwardEvents.push('binding-stage');
        throw new Error('binding stage failed');
      }
      if (key === 'deviceLocalPrivacyTransaction') forwardEvents.push('privacy-begin');
      await originalLocalSet(key, value);
    });

    await expect(
      coordinator.patch([
        { path: ['privacyPreferences', 'analytics'], value: true },
        {
          path: ['vaultRouter'],
          value: {
            ...portablePreimage.vaultRouter,
            vaults: [
              {
                ...portablePreimage.vaultRouter.vaults[0],
                localFolderId: 'folder-new',
                localFolderName: 'New Folder'
              }
            ]
          }
        }
      ])
    ).rejects.toEqual(new OptionsMutationError('OPTIONS_STORAGE_FAILURE'));

    expect(forwardEvents).toEqual(['binding-stage']);
    await expect(repository.readRaw()).resolves.toEqual(portablePreimage);
    await expect(repository.readPrivacy()).resolves.toEqual(privacy0);
    await expect(repository.readVaultBindings()).resolves.toEqual(previousBindings);
  });

  it('compensates portable state when the real privacy commit fails after P1', async () => {
    const portablePreimage: PlainStructuredObject = {
      interfaceTheme: 'system',
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
      }
    };
    const previousBindings: DeviceLocalVaultBindingSnapshot = {
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    };
    const storage = createMemoryStorageService();
    await storage.sync.set('options', portablePreimage);
    await storage.local.set(DEVICE_LOCAL_PRIVACY_CONSENT_KEY, {
      analytics: false,
      errorReporting: false,
      timestamp: 1,
      version: '1.0'
    });
    await storage.local.set(DEVICE_LOCAL_PRIVACY_CONFIG_KEY, { debugMode: false });
    await storage.local.set(DEVICE_LOCAL_VAULT_BINDINGS_KEY, previousBindings);
    const repository = new ChromeOptionsRepository(storage);
    const committer = createDeviceLocalPrivacyCommitter(storage, repository);
    const removeDirectory = vi.fn(() => Promise.resolve());
    const journal = createConcreteVaultJournal(storage, repository, committer, removeDirectory);
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: committer,
      deviceLocalVaultCleanupJournal: journal
    });
    await coordinator.initialize();
    const bindingWrite = vi.spyOn(repository, 'writeVaultBindings');
    const originalSetMany = storage.local.setMany.bind(storage.local);
    storage.local.setMany = vi
      .fn<typeof storage.local.setMany>()
      .mockRejectedValueOnce(new Error('privacy write failed'))
      .mockImplementation(originalSetMany);

    await expect(
      coordinator.patch([
        { path: ['interfaceTheme'], value: 'dark' },
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

    await expect(repository.readRaw()).resolves.toEqual(portablePreimage);
    await expect(repository.readPrivacy()).resolves.toEqual(privacy0);
    await expect(repository.readVaultBindings()).resolves.toEqual(previousBindings);
    expect(bindingWrite.mock.calls).toEqual([[expect.any(Object)], [previousBindings]]);
    expect(bindingWrite.mock.calls[0]?.[0]).toMatchObject({
      bindings: { primary: { folderId: 'folder-new' } }
    });
    expect(removeDirectory).not.toHaveBeenCalled();
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('reconstructs success when the real privacy write commits F before reporting failure', async () => {
    const portablePreimage: PlainStructuredObject = {
      interfaceTheme: 'system',
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
      }
    };
    const previousBindings: DeviceLocalVaultBindingSnapshot = {
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    };
    const storage = createMemoryStorageService();
    await storage.sync.set('options', portablePreimage);
    await storage.local.set(DEVICE_LOCAL_PRIVACY_CONSENT_KEY, {
      analytics: false,
      errorReporting: false,
      timestamp: 1,
      version: '1.0'
    });
    await storage.local.set(DEVICE_LOCAL_PRIVACY_CONFIG_KEY, { debugMode: false });
    await storage.local.set(DEVICE_LOCAL_VAULT_BINDINGS_KEY, previousBindings);
    const repository = new ChromeOptionsRepository(storage);
    const committer = createDeviceLocalPrivacyCommitter(storage, repository);
    const removeDirectory = vi.fn(() => Promise.resolve());
    const journal = createConcreteVaultJournal(storage, repository, committer, removeDirectory);
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: committer,
      deviceLocalVaultCleanupJournal: journal
    });
    await coordinator.initialize();
    const bindingWrite = vi.spyOn(repository, 'writeVaultBindings');
    const originalSetMany = storage.local.setMany.bind(storage.local);
    storage.local.setMany = vi.fn(async (values) => {
      await originalSetMany(values);
      throw new Error('ambiguous privacy callback');
    });

    const result = await coordinator.patch([
      { path: ['interfaceTheme'], value: 'dark' },
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
    ]);

    await expect(repository.readRaw()).resolves.toMatchObject({ interfaceTheme: 'dark' });
    await expect(repository.readPrivacy()).resolves.toEqual({ ...privacy0, analytics: true });
    await expect(repository.readVaultBindings()).resolves.toEqual({
      version: 1,
      bindings: { primary: { folderId: 'folder-new', folderName: 'New Folder' } }
    });
    expect(result.snapshot.privacyPreferences.analytics).toBe(true);
    expect(bindingWrite).toHaveBeenCalledOnce();
    expect(removeDirectory).toHaveBeenCalledWith('folder-old');
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
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

  it('persists local commit before a bounded cleanup failure and recovers later', async () => {
    const originalRaw: PlainStructuredObject = {
      rest: {
        vault: 'Primary',
        httpsUrl: '',
        httpUrl: '',
        apiKey: ''
      },
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
    const storage = createMemoryStorageService();
    const removeDirectory = vi
      .fn<(folderId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('indexeddb unavailable'))
      .mockResolvedValue(undefined);
    const journal = createVaultJournal(storage, repository, removeDirectory);
    const journalWrite = vi.spyOn(storage.local, 'set');
    const bindingWrite = vi.spyOn(repository, 'writeVaultBindings');
    const portableWrite = vi.fn();
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>(
      async (command, applyCommand, _quotaBytesPerItem, lifecycle) => {
        const mutation = applyCommand(requirePlainStructuredObject(repository.raw), command);
        await lifecycle?.beforePortableDecision({
          portablePreimage: requirePlainStructuredObject(repository.raw),
          portableProposal: mutation.next,
          writeRequired: true,
          verification: mutation.verification,
          privacyRestoreTarget: privacy0,
          privacyForwardTarget: privacy0,
          privacyWriteRequired: false
        });
        await lifecycle?.beforeForwardMutation();
        portableWrite();
        repository.raw = clone(mutation.next);
        return { raw: mutation.next, didWrite: true };
      }
    );
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute },
      deviceLocalVaultCleanupJournal: journal
    });
    await coordinator.initialize();
    execute.mockClear();
    portableWrite.mockClear();
    journalWrite.mockClear();
    bindingWrite.mockClear();

    await coordinator.patch([
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
              apiKey: ''
            }
          ]
        }
      }
    ]);

    expect(journalWrite.mock.invocationCallOrder[0]).toBeLessThan(
      portableWrite.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(bindingWrite.mock.invocationCallOrder[0]).toBeLessThan(
      portableWrite.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(repository.bindings).toEqual({ version: 1, bindings: {} });
    expect(repository.raw).toEqual(originalRaw);
    expect(removeDirectory).toHaveBeenCalledWith('folder-old');
    await expect(storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)).resolves.toMatchObject({
      version: 3,
      phase: 'local-committed',
      remainingCleanupCandidates: ['folder-old']
    });

    await journal.recover();
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('does not change bindings or synchronized state when the journal cannot become durable', async () => {
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
    const storage = createMemoryStorageService();
    const journal = createVaultJournal(storage, repository);
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>(commitPortable(repository));
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute },
      deviceLocalVaultCleanupJournal: journal
    });
    await coordinator.initialize();
    execute.mockClear();
    storage.local.set = vi.fn(() => Promise.reject(new Error('local storage unavailable')));

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
                apiKey: ''
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

  it('lets two fresh coordinator instances resume one durable cleanup transaction', async () => {
    const portablePreimage = { opaqueRoot: { keep: true } };
    const portableProposal = { opaqueRoot: { keep: false } };
    const repository = new VaultRawRepository(portablePreimage);
    repository.bindings = {
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    };
    const storage = createMemoryStorageService();
    const removeDirectory = vi
      .fn<(folderId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('indexeddb transaction aborted'))
      .mockResolvedValue(undefined);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const seedJournal = createVaultJournal(storage, repository, removeDirectory);
    await seedJournal.prepare({
      transactionId: 'operation-crashed',
      previousBindings: repository.bindings,
      proposedBindings: { version: 1, bindings: {} },
      portablePreimage,
      portableProposal,
      writeRequired: true,
      privacyRestoreTarget: privacy0,
      privacyForwardTarget: privacy0,
      privacyWriteRequired: false
    });
    await seedJournal.beginForward();
    repository.raw = portableProposal;

    const first = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute: commitPortable(repository) },
      deviceLocalVaultCleanupJournal: createVaultJournal(storage, repository, removeDirectory)
    });
    await expect(first.initialize()).rejects.toMatchObject({ code: 'OPTIONS_STORAGE_FAILURE' });
    await expect(storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)).resolves.toMatchObject({
      phase: 'local-committed',
      remainingCleanupCandidates: ['folder-old']
    });

    const second = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute: commitPortable(repository) },
      deviceLocalVaultCleanupJournal: createVaultJournal(storage, repository, removeDirectory)
    });
    await second.initialize();

    expect(removeDirectory).toHaveBeenCalledTimes(2);
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalled();
  });

  it('retries a rejected initialization on the next command using the same FIFO', async () => {
    const portablePreimage = { opaqueRoot: { keep: true } };
    const portableProposal = { opaqueRoot: { keep: false } };
    const repository = new VaultRawRepository(portablePreimage);
    repository.bindings = {
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    };
    const storage = createMemoryStorageService();
    const removeDirectory = vi
      .fn<(folderId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('indexeddb transaction aborted'))
      .mockResolvedValue(undefined);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const journal = createVaultJournal(storage, repository, removeDirectory);
    warning.mockClear();
    await journal.prepare({
      transactionId: 'operation-crashed',
      previousBindings: repository.bindings,
      proposedBindings: { version: 1, bindings: {} },
      portablePreimage,
      portableProposal,
      writeRequired: true,
      privacyRestoreTarget: privacy0,
      privacyForwardTarget: privacy0,
      privacyWriteRequired: false
    });
    await journal.beginForward();
    repository.raw = portableProposal;
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>(commitPortable(repository));
    const recoverPrivacy = vi.fn(() => Promise.resolve());
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { recover: recoverPrivacy, execute },
      deviceLocalVaultCleanupJournal: journal
    });

    const firstInitialization = coordinator.initialize();
    expect(coordinator.initialize()).toBe(firstInitialization);
    await expect(firstInitialization).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    await expect(
      coordinator.patch([{ path: ['interfaceTheme'], value: 'dark' }])
    ).resolves.toMatchObject({ snapshot: { interfaceTheme: 'dark' } });

    expect(recoverPrivacy).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map(([command]) => command.kind)).toEqual(['migrate', 'patch']);
    expect(removeDirectory).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledOnce();
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('cancels a pending cleanup intent when the same handle is rebound through the FIFO', async () => {
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
      }
    };
    const repository = new VaultRawRepository(originalRaw);
    const storage = createMemoryStorageService();
    await storage.local.set(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, {
      version: 1,
      folderIds: ['folder-old']
    });
    const removeDirectory = vi.fn(() => Promise.resolve());
    const journal = createVaultJournal(storage, repository, removeDirectory);
    const execute = vi.fn<DeviceLocalPrivacyCommitter['execute']>(commitPortable(repository));
    const coordinator = createCoordinator(repository, {
      deviceLocalPrivacyCommitter: { execute },
      deviceLocalVaultCleanupJournal: journal
    });

    await coordinator.patch([
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
              localFolderId: 'folder-old',
              localFolderName: 'Old Folder'
            }
          ]
        }
      }
    ]);

    expect(repository.bindings).toEqual({
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    });
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
    expect(removeDirectory).not.toHaveBeenCalled();
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
    expect(execute).toHaveBeenCalledTimes(3);
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
