import { getPlatformServices } from '../platform';
import { registerRepositories } from '../shared/di/serviceRegistry';
import { startBackgroundRuntime } from './backgroundStartup';
import { createDefaultTrialLifecycleDependencies, registerTrialLifecycle } from './trialLifecycle';
import { ChromeOptionsRepository } from '../infrastructure/repositories/ChromeOptionsRepository';
import {
  optionsEnvelopeBytes,
  optionsVerificationMatches,
  optionsValuesEqual,
  type DeviceLocalPrivacyCommitter,
  type OptionsMutationVerification,
  type OptionsRawStorageRepository
} from '../infrastructure/repositories/ChromeOptionsRepository';
import {
  DeviceLocalPrivacyStore,
  containsDeviceLocalPrivacy,
  omitDeviceLocalPrivacy
} from '../shared/config/deviceLocalPrivacy';
import { decodeStoredOptions } from '../shared/config/storedOptionsCodec';
import { snapshotPlainStructuredData } from '../shared/config/losslessObjectBoundary';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../shared/config/losslessObjectBoundaryTypes';
import type { StorageService } from '../platform/interfaces/storage';
import {
  OptionsMutationError,
  type OptionsMutationCommand
} from '../shared/types/optionsMutationMessages';
import {
  createBackgroundOptionsRepository,
  createOptionsMutationCoordinator
} from './services/optionsMutationCoordinator';
import { DeviceLocalVaultCleanupJournal } from '../shared/config/deviceLocalVaultCleanupJournal';

function rawObject(value: PlainStructuredValue | null): PlainStructuredObject {
  if (value === null) return {};
  const snapshot = snapshotPlainStructuredData(value);
  if (
    !snapshot.ok ||
    typeof snapshot.value !== 'object' ||
    snapshot.value === null ||
    Array.isArray(snapshot.value)
  ) {
    throw new OptionsMutationError('OPTIONS_MUTATION_REJECTED');
  }
  return snapshot.value;
}

function mutatesPrivacy(command: OptionsMutationCommand): boolean {
  return command.kind === 'patch'
    ? command.patches.some((patch) => patch.path[0] === 'privacyPreferences')
    : command.kind === 'replace' &&
        Object.prototype.hasOwnProperty.call(command.replacement, 'privacyPreferences');
}

function portableVerification(
  verification: OptionsMutationVerification,
  next: PlainStructuredObject
): OptionsMutationVerification {
  return verification.kind === 'full'
    ? { kind: 'full', expected: next }
    : {
        kind: 'paths',
        expected: [
          ...verification.expected.filter(({ path }) => path[0] !== 'privacyPreferences'),
          { path: ['privacyPreferences'], value: undefined }
        ]
      };
}

function createDeviceLocalPrivacyCommitter(
  storage: StorageService,
  repository: OptionsRawStorageRepository
): DeviceLocalPrivacyCommitter {
  const local = new DeviceLocalPrivacyStore(storage.local);
  const yieldWrite = () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  const rollback = async () => {
    try {
      await local.rollback();
    } catch {
      throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
    }
  };
  const restoreMirror = async (privacy: PlainStructuredValue) => {
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      try {
        const current = rawObject(await repository.readRaw());
        await repository.writeRaw({ ...current, privacyPreferences: structuredClone(privacy) });
        await yieldWrite();
        const restored = rawObject(await repository.readRaw()).privacyPreferences;
        if (optionsValuesEqual(restored, privacy)) return;
      } catch {
        // Retry the bounded compensation against the newest raw snapshot.
      }
    }
    throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
  };
  return {
    recover: rollback,
    async execute(command, applyCommand, quotaBytesPerItem, lifecycle) {
      for (let attempt = 0; attempt <= 2; attempt += 1) {
        const raw = rawObject(await repository.readRaw());
        const privacy = await local.ensureBaseline(raw);
        const mutation = applyCommand(
          { ...raw, privacyPreferences: structuredClone(privacy) },
          command
        );
        const privacyChanged = mutatesPrivacy(command);
        const nextPrivacy = privacyChanged
          ? decodeStoredOptions(mutation.next).runtime.privacyPreferences
          : privacy;
        const next = omitDeviceLocalPrivacy(mutation.next);
        const writePrivacy = containsDeviceLocalPrivacy(raw) || privacyChanged;
        const writePortable = !optionsValuesEqual(raw, next);
        const verification = portableVerification(mutation.verification, next);
        if (writePortable && optionsEnvelopeBytes(next) > quotaBytesPerItem) {
          throw new OptionsMutationError('OPTIONS_QUOTA_EXCEEDED');
        }
        await lifecycle?.beforePortableDecision({
          portablePreimage: omitDeviceLocalPrivacy(raw),
          portableProposal: next,
          writeRequired: writePortable,
          verification
        });
        if (writePrivacy) await local.begin();
        if (!writePortable) {
          try {
            if (writePrivacy) await local.commit(nextPrivacy);
          } catch {
            await rollback();
            throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
          }
          return { raw: next, privacy: nextPrivacy, didWrite: writePrivacy };
        }
        try {
          await repository.writeRaw(next);
          await yieldWrite();
          const readback = rawObject(await repository.readRaw());
          if (optionsVerificationMatches(readback, verification)) {
            try {
              if (writePrivacy) await local.commit(nextPrivacy);
            } catch {
              if (containsDeviceLocalPrivacy(raw)) await restoreMirror(raw.privacyPreferences);
              await rollback();
              throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
            }
            return { raw: readback, privacy: nextPrivacy, didWrite: true };
          }
        } catch (error) {
          if (writePrivacy) await rollback();
          if (error instanceof OptionsMutationError) throw error;
          throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
        }
        if (writePrivacy) await rollback();
      }
      throw new OptionsMutationError('EXTERNAL_SYNC_CONFLICT');
    }
  };
}

const platformServices = getPlatformServices();
const optionsStorageRepository = new ChromeOptionsRepository(platformServices.storage);
const deviceLocalVaultCleanupJournal = new DeviceLocalVaultCleanupJournal(
  platformServices.storage.local,
  () => optionsStorageRepository.readVaultBindings(),
  (folderId) => platformServices.fileSystemAccess.removeDirectory(folderId),
  {
    readPortableRaw: async () => rawObject(await optionsStorageRepository.readRaw()),
    writeBindings: (snapshot) => optionsStorageRepository.writeVaultBindings(snapshot)
  }
);
const optionsMutationCoordinator = createOptionsMutationCoordinator(optionsStorageRepository, {
  deviceLocalPrivacyCommitter: createDeviceLocalPrivacyCommitter(
    platformServices.storage,
    optionsStorageRepository
  ),
  deviceLocalVaultCleanupJournal
});

registerRepositories({
  storage: platformServices.storage,
  messaging: platformServices.messaging,
  tabs: platformServices.tabs,
  runtime: platformServices.runtime,
  optionsRepository: createBackgroundOptionsRepository(
    optionsStorageRepository,
    optionsMutationCoordinator
  )
});

startBackgroundRuntime({
  action: platformServices.action,
  contextMenus: platformServices.contextMenus,
  messaging: platformServices.messaging,
  runtime: platformServices.runtime,
  scripting: platformServices.scripting,
  storage: platformServices.storage,
  tabs: platformServices.tabs,
  optionsMutationCoordinator
});

registerTrialLifecycle(
  createDefaultTrialLifecycleDependencies(
    {
      ...platformServices.runtime,
      registerOnSuspend: (listener) => {
        chrome.runtime.onSuspend.addListener(listener);
      }
    },
    platformServices.storage,
    platformServices.tabs,
    platformServices.notifications
  )
);
