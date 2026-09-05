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
import {
  portableOptionsIdentity,
  type DeviceLocalVaultRecoveryObservation,
  type DeviceLocalVaultRecoveryTransactionV3
} from '../../shared/config/deviceLocalVaultRecoveryTransaction';
import {
  OptionsMutationError,
  type OptionsMutationCommand
} from '../../shared/types/optionsMutationMessages';

function rawObject(value: PlainStructuredValue | null): PlainStructuredObject {
  const snapshot = snapshotPlainStructuredData(value ?? {});
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
const mutatesPrivacy = (command: OptionsMutationCommand) =>
  command.kind === 'patch'
    ? command.patches.some((patch) => patch.path[0] === 'privacyPreferences')
    : command.kind === 'replace' &&
      Object.prototype.hasOwnProperty.call(command.replacement, 'privacyPreferences');
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
const recoveryRequest = (transaction: DeviceLocalVaultRecoveryTransactionV3) => ({
  portablePreimage: transaction.portable.preimage,
  preimageIdentity: transaction.portable.preimageIdentity,
  proposedIdentity: transaction.portable.proposedIdentity,
  privacyRestoreTarget: transaction.privacy.restoreTarget,
  privacyForwardTarget: transaction.privacy.forwardTarget
});
type RecoveryRequest = ReturnType<typeof recoveryRequest>;

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
  const observe = async (
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    direction: 'forward' | 'restore'
  ): Promise<DeviceLocalVaultRecoveryObservation> => {
    try {
      const request = recoveryRequest(transaction);
      const portableRaw = rawObject(await repository.readRaw());
      const identity = await portableOptionsIdentity(portableRaw);
      const primaryIdentity =
        direction === 'forward' ? request.proposedIdentity : request.preimageIdentity;
      const secondaryIdentity =
        direction === 'forward' ? request.preimageIdentity : request.proposedIdentity;
      const portableState =
        identity === primaryIdentity
          ? direction === 'forward'
            ? 'proposal'
            : 'preimage'
          : identity === secondaryIdentity
            ? direction === 'forward'
              ? 'preimage'
              : 'proposal'
            : 'third';
      const privacy = (await local.read(portableRaw)).preferences;
      const primary =
        direction === 'forward' ? request.privacyForwardTarget : request.privacyRestoreTarget;
      const secondary =
        direction === 'forward' ? request.privacyRestoreTarget : request.privacyForwardTarget;
      const privacyState = optionsValuesEqual(privacy, primary)
        ? direction
        : optionsValuesEqual(privacy, secondary)
          ? direction === 'forward'
            ? 'restore'
            : 'forward'
          : 'third';
      return { portableState, privacyState, portableRaw, privacy };
    } catch (error) {
      if (error instanceof OptionsMutationError) throw error;
      throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
    }
  };
  const restorePortable = async (request: RecoveryRequest) => {
    await repository.writeRaw(structuredClone(request.portablePreimage));
    await yieldWrite();
    const raw = rawObject(await repository.readRaw());
    if ((await portableOptionsIdentity(raw)) !== request.preimageIdentity)
      throw new Error('PORTABLE_RESTORE_UNVERIFIED');
  };
  const restorePrivacy = async (request: RecoveryRequest) => {
    await local.begin();
    await local.commit(request.privacyRestoreTarget);
    const restored = (await local.read(await repository.readRaw())).preferences;
    if (!optionsValuesEqual(restored, request.privacyRestoreTarget))
      throw new Error('PRIVACY_RESTORE_UNVERIFIED');
  };
  const restoreMirror = async (privacy: PlainStructuredValue) => {
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      const current = rawObject(await repository.readRaw());
      await repository.writeRaw({ ...current, privacyPreferences: structuredClone(privacy) });
      await yieldWrite();
      if (optionsValuesEqual(rawObject(await repository.readRaw()).privacyPreferences, privacy))
        return;
    }
    throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
  };
  return {
    recover: rollback,
    observe,
    async compensate(transaction) {
      try {
        const request = recoveryRequest(transaction);
        const current = await observe(transaction, 'restore');
        if (current.portableState === 'proposal') await restorePortable(request);
        if (current.privacyState === 'forward') await restorePrivacy(request);
        return await observe(transaction, 'restore');
      } catch (error) {
        if (error instanceof OptionsMutationError) throw error;
        throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
      }
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
        if (writePortable && optionsEnvelopeBytes(next) > quotaBytesPerItem)
          throw new OptionsMutationError('OPTIONS_QUOTA_EXCEEDED');
        await lifecycle?.beforePortableDecision({
          portablePreimage: omitDeviceLocalPrivacy(raw),
          portableProposal: next,
          writeRequired: writePortable,
          verification,
          privacyRestoreTarget: privacy,
          privacyForwardTarget: nextPrivacy,
          privacyWriteRequired: writePrivacy
        });
        const journalled = (await lifecycle?.beforeForwardMutation()) === true;
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
              if (!journalled && containsDeviceLocalPrivacy(raw))
                await restoreMirror(raw.privacyPreferences);
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
        if (journalled) throw new OptionsMutationError('EXTERNAL_SYNC_CONFLICT');
      }
      throw new OptionsMutationError('EXTERNAL_SYNC_CONFLICT');
    }
  };
}
