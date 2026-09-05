import type { StorageService } from '../../platform/interfaces/storage';
import {
  optionsEnvelopeBytes,
  optionsValuesEqual,
  optionsVerificationMatches,
  type DeviceLocalPrivacyCommitter,
  type OptionsMutationVerification,
  type OptionsRawStorageRepository
} from '../../infrastructure/repositories/ChromeOptionsRepository';
import {
  containsDeviceLocalPrivacy,
  DeviceLocalPrivacyStore,
  omitDeviceLocalPrivacy
} from '../../shared/config/deviceLocalPrivacy';
import { snapshotPlainStructuredData } from '../../shared/config/losslessObjectBoundary';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../shared/config/losslessObjectBoundaryTypes';
import { decodeStoredOptions } from '../../shared/config/storedOptionsCodec';
import { portableOptionsIdentity } from '../../shared/config/deviceLocalVaultRecoveryTransaction';
import {
  OptionsMutationError,
  type OptionsMutationCommand
} from '../../shared/types/optionsMutationMessages';

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

export function createDeviceLocalPrivacyCommitter(
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
        // Existing bounded forward compensation observes the newest raw snapshot.
      }
    }
    throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
  };
  return {
    recover: rollback,
    async compensate(request) {
      let raw = rawObject(await repository.readRaw());
      const currentIdentity = await portableOptionsIdentity(raw);
      const portableState =
        currentIdentity === request.proposedIdentity
          ? 'proposal'
          : currentIdentity === request.preimageIdentity
            ? 'preimage'
            : 'third';
      if (portableState === 'proposal') {
        try {
          await repository.writeRaw(structuredClone(request.portablePreimage));
          await yieldWrite();
          raw = rawObject(await repository.readRaw());
          if ((await portableOptionsIdentity(raw)) !== request.preimageIdentity) {
            throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
          }
        } catch (error) {
          if (error instanceof OptionsMutationError) throw error;
          throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
        }
      }
      if (request.privacyRestoreRequired) {
        try {
          await local.begin();
          await local.commit(request.privacyTarget);
          const restored = await local.read(raw);
          if (!optionsValuesEqual(restored.preferences, request.privacyTarget)) {
            throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
          }
        } catch (error) {
          if (error instanceof OptionsMutationError) throw error;
          throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
        }
      }
      return { portableState };
    },
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
          verification,
          privacyTarget: privacy,
          privacyWriteRequired: writePrivacy
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
