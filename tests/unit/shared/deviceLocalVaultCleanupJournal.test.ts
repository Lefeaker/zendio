import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import {
  DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
  DeviceLocalVaultCleanupJournal
} from '@shared/config/deviceLocalVaultCleanupJournal';
import {
  DeviceLocalVaultCleanupExecutor,
  DeviceLocalVaultLocalCommitter,
  DeviceLocalVaultRecoveryStorage
} from '@shared/config/deviceLocalVaultCleanupExecutor';
import type { PlainStructuredObject } from '@shared/config/losslessObjectBoundaryTypes';
import type { DeviceLocalVaultBindingSnapshot } from '@shared/config/deviceLocalVaultBindings';
import type { PrivacyPreferencesOptions } from '@shared/types/options';
import {
  portableOptionsIdentity,
  type DeviceLocalVaultRecoveryObservation,
  type DeviceLocalVaultRecoveryTransactionV3
} from '@shared/config/deviceLocalVaultRecoveryTransaction';
import { OptionsMutationError } from '@shared/types/optionsMutationMessages';

const privacy0 = { analytics: false, errorReporting: false, debugMode: false } as const;
const privacy1 = { analytics: true, errorReporting: false, debugMode: false } as const;
const privacyX = { analytics: false, errorReporting: true, debugMode: false } as const;
function bindings(
  entries: Readonly<Record<string, { folderId: string; folderName?: string }>>
): DeviceLocalVaultBindingSnapshot {
  return {
    version: 1,
    bindings: Object.fromEntries(
      Object.entries(entries).map(([vaultId, binding]) => [
        vaultId,
        { folderId: binding.folderId, folderName: binding.folderName ?? binding.folderId }
      ])
    )
  };
}
const previous = bindings({ primary: { folderId: 'folder-old', folderName: 'Old' } });
const proposed = bindings({});
const thirdBindings = bindings({ external: { folderId: 'folder-external' } });
const portablePreimage = { vaultRouter: { defaultVaultId: 'primary' } };
const portableProposal = { vaultRouter: { defaultVaultId: 'primary', vaults: [] } };
const portableThird = { external: { revision: 3 } };
const preparation = {
  transactionId: 'operation-1',
  previousBindings: previous,
  proposedBindings: proposed,
  portablePreimage,
  portableProposal,
  writeRequired: true,
  privacyRestoreTarget: privacy0,
  privacyForwardTarget: privacy1,
  privacyWriteRequired: true
} as const;
function harness(options?: {
  current?: DeviceLocalVaultBindingSnapshot;
  portable?: PlainStructuredObject;
  privacy?: PrivacyPreferencesOptions;
  removeDirectory?: (folderId: string) => Promise<void>;
  failObserve?: boolean;
  writeBindings?: (snapshot: DeviceLocalVaultBindingSnapshot) => Promise<void>;
}) {
  const storage = createMemoryStorageService();
  let current = structuredClone(options?.current ?? previous);
  let portable = structuredClone(options?.portable ?? portablePreimage);
  let privacy = structuredClone(options?.privacy ?? privacy0);
  const removeDirectory = vi.fn(options?.removeDirectory ?? (() => Promise.resolve()));
  const observe = async (
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    direction: 'forward' | 'restore'
  ): Promise<DeviceLocalVaultRecoveryObservation> => {
    if (options?.failObserve) throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
    const request = {
      preimageIdentity: transaction.portable.preimageIdentity,
      proposedIdentity: transaction.portable.proposedIdentity,
      privacyRestoreTarget: transaction.privacy.restoreTarget,
      privacyForwardTarget: transaction.privacy.forwardTarget
    };
    const identity = await portableOptionsIdentity(portable);
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
    const primary =
      direction === 'forward' ? request.privacyForwardTarget : request.privacyRestoreTarget;
    const secondary =
      direction === 'forward' ? request.privacyRestoreTarget : request.privacyForwardTarget;
    const equal = (left: PrivacyPreferencesOptions, right: PrivacyPreferencesOptions) =>
      left.analytics === right.analytics &&
      left.errorReporting === right.errorReporting &&
      left.debugMode === right.debugMode;
    const privacyState = equal(privacy, primary)
      ? direction
      : equal(privacy, secondary)
        ? direction === 'forward'
          ? 'restore'
          : 'forward'
        : 'third';
    return {
      portableState,
      privacyState,
      portableRaw: structuredClone(portable),
      privacy: structuredClone(privacy)
    };
  };
  const createJournal = () => {
    const recoveryStorage = new DeviceLocalVaultRecoveryStorage(
      storage.local,
      () => Promise.resolve(structuredClone(current)),
      options?.writeBindings ??
        ((snapshot) => {
          current = structuredClone(snapshot);
          return Promise.resolve();
        }),
      () => Promise.resolve(structuredClone(portable))
    );
    return new DeviceLocalVaultCleanupJournal(
      recoveryStorage,
      new DeviceLocalVaultCleanupExecutor(recoveryStorage, removeDirectory),
      new DeviceLocalVaultLocalCommitter(recoveryStorage),
      {
        observe,
        compensate: async (transaction) => {
          const before = await observe(transaction, 'restore');
          if (before.portableState === 'proposal')
            portable = structuredClone(transaction.portable.preimage);
          if (before.privacyState === 'forward')
            privacy = structuredClone(transaction.privacy.restoreTarget);
          return observe(transaction, 'restore');
        }
      }
    );
  };
  return {
    storage,
    removeDirectory,
    createJournal,
    current: () => current,
    portable: () => portable,
    privacy: () => privacy,
    setCurrent: (value: DeviceLocalVaultBindingSnapshot) => {
      current = structuredClone(value);
    },
    setPortable: (value: PlainStructuredObject) => {
      portable = structuredClone(value);
    },
    setPrivacy: (value: PrivacyPreferencesOptions) => {
      privacy = structuredClone(value);
    }
  };
}

async function phaseRecord(
  phase: DeviceLocalVaultRecoveryTransactionV3['phase'],
  bindingWriteMayHaveOccurred = false
): Promise<DeviceLocalVaultRecoveryTransactionV3> {
  const state = harness();
  const transaction = await state.createJournal().prepare(preparation);
  await state.storage.local.remove(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);
  const forwardEvidence = [
    'forward-committed',
    'local-commit-inflight',
    'local-committed'
  ].includes(phase)
    ? {
        portable: {
          ...transaction.portable,
          observedCommittedIdentity: transaction.portable.proposedIdentity
        },
        privacy: { ...transaction.privacy, observedForward: 'exact-target-readback' as const }
      }
    : {};
  const recovery = ['compensating', 'portable-privacy-restored'].includes(phase)
    ? {
        recovery: {
          outcomeCode: 'OPTIONS_STORAGE_FAILURE' as const,
          bindingWriteMayHaveOccurred,
          ...(phase === 'portable-privacy-restored'
            ? {
                portableRestoreEvidence: 'preimage' as const,
                privacyRestoreEvidence: 'restore-target' as const
              }
            : {})
        }
      }
    : {};
  return { ...transaction, ...forwardEvidence, ...recovery, phase };
}

afterEach(() => vi.restoreAllMocks());

describe('DeviceLocalVaultCleanupJournal forward privacy protocol', () => {
  it('aborts an untouched prepared record without changing B0 or deleting', async () => {
    const state = harness();
    await state.createJournal().prepare(preparation);

    await state.createJournal().recover();

    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it.each([
    { portable: portableProposal, privacy: privacy0, current: previous },
    { portable: portableProposal, privacy: privacy1, current: previous },
    { portable: portablePreimage, privacy: privacy0, current: proposed }
  ])('never advances an externally changed prepared record: %#', async (input) => {
    const state = harness(input);
    await state.createJournal().prepare(preparation);

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'EXTERNAL_SYNC_CONFLICT'
    });

    expect(state.current()).toEqual(input.current);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('quarantines rejected v3 without a protocol discriminator', async () => {
    const state = harness();
    const oldV3 = await state.createJournal().prepare(preparation);
    const { protocol: _protocol, ...unproven } = oldV3;
    await state.storage.local.set(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, unproven);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await state.createJournal().recover();

    expect(warning).toHaveBeenCalledOnce();
    expect(state.removeDirectory).not.toHaveBeenCalled();
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('advances only forward-inflight P1/F through B1 and cleanup', async () => {
    const state = harness({ portable: portableProposal, privacy: privacy1 });
    const journal = state.createJournal();
    await journal.prepare(preparation);
    await journal.beginForward();

    await journal.recover(false, 'OPTIONS_STORAGE_FAILURE', true);

    expect(state.current()).toEqual(proposed);
    expect(state.removeDirectory).toHaveBeenCalledWith('folder-old');
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('aborts before portable or privacy forward work when the B1 stage fails', async () => {
    const state = harness({
      writeBindings: () => Promise.reject(new Error('binding storage unavailable'))
    });
    const journal = state.createJournal();
    await journal.prepare(preparation);

    await expect(journal.beginForward()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });

    expect(state.portable()).toEqual(portablePreimage);
    expect(state.privacy()).toEqual(privacy0);
    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('compensates forward-inflight P1/R without writing B1 or deleting', async () => {
    const state = harness({ portable: portableProposal, privacy: privacy0 });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('forward-inflight')
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });

    expect(state.portable()).toEqual(portablePreimage);
    expect(state.privacy()).toEqual(privacy0);
    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('restores R for forward-inflight P0/F without rewriting P0', async () => {
    const state = harness({ portable: portablePreimage, privacy: privacy1 });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('forward-inflight')
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });

    expect(state.portable()).toEqual(portablePreimage);
    expect(state.privacy()).toEqual(privacy0);
    expect(state.current()).toEqual(previous);
  });

  it.each([
    {
      portable: portableThird,
      privacy: privacy1,
      expectedPortable: portableThird,
      expectedPrivacy: privacy0
    },
    {
      portable: portableProposal,
      privacy: privacyX,
      expectedPortable: portablePreimage,
      expectedPrivacy: privacyX
    }
  ])('preserves third state and compensates only the owned counterpart: %#', async (input) => {
    const state = harness(input);
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('forward-inflight')
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'EXTERNAL_SYNC_CONFLICT'
    });

    expect(state.portable()).toEqual(input.expectedPortable);
    expect(state.privacy()).toEqual(input.expectedPrivacy);
    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('restores a staged B1 from every forward-inflight compensation', async () => {
    const state = harness({ current: proposed, portable: portableProposal, privacy: privacy0 });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('forward-inflight')
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });

    expect(state.current()).toEqual(previous);
    expect(state.portable()).toEqual(portablePreimage);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('compensates P1/F from local-commit-inflight B0 with binding-write ownership', async () => {
    const state = harness({ portable: portableProposal, privacy: privacy1, current: previous });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('local-commit-inflight', true)
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });

    expect(state.portable()).toEqual(portablePreimage);
    expect(state.privacy()).toEqual(privacy0);
    expect(state.current()).toEqual(previous);
  });

  it('treats local-commit-inflight B1 as irreversible and cleans', async () => {
    const state = harness({ portable: portableProposal, privacy: privacy1, current: proposed });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('local-commit-inflight', true)
    );

    await state.createJournal().recover();

    expect(state.portable()).toEqual(portableProposal);
    expect(state.privacy()).toEqual(privacy1);
    expect(state.removeDirectory).toHaveBeenCalledWith('folder-old');
  });

  it('preserves a third binding while compensating P1/F', async () => {
    const state = harness({
      portable: portableProposal,
      privacy: privacy1,
      current: thirdBindings
    });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('local-commit-inflight', true)
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'EXTERNAL_SYNC_CONFLICT'
    });

    expect(state.current()).toEqual(thirdBindings);
    expect(state.portable()).toEqual(portablePreimage);
    expect(state.privacy()).toEqual(privacy0);
  });

  it('requires forward-inflight even when both writes are no-ops', async () => {
    const noWrite = {
      ...preparation,
      portableProposal: portablePreimage,
      writeRequired: false,
      privacyForwardTarget: privacy0,
      privacyWriteRequired: false
    } as const;
    const aborted = harness();
    await aborted.createJournal().prepare(noWrite);
    await aborted.createJournal().recover();
    expect(aborted.current()).toEqual(previous);

    const committed = harness();
    const journal = committed.createJournal();
    await journal.prepare(noWrite);
    await journal.beginForward();
    await journal.recover(false, 'OPTIONS_STORAGE_FAILURE', true);
    expect(committed.current()).toEqual(proposed);
  });

  it('leaves forward-inflight durable when portable/privacy observation is unavailable', async () => {
    const state = harness({ failObserve: true });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('forward-inflight')
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });

    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toMatchObject({
      phase: 'forward-inflight'
    });
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('keeps local-committed durable when cleanup fails and never compensates', async () => {
    const removeDirectory = vi
      .fn<(folderId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('indexeddb unavailable'))
      .mockResolvedValue(undefined);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const state = harness({
      portable: portableProposal,
      privacy: privacy1,
      current: proposed,
      removeDirectory
    });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('local-committed', true)
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    expect(state.portable()).toEqual(portableProposal);
    expect(state.privacy()).toEqual(privacy1);
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toMatchObject({
      phase: 'local-committed'
    });

    await state.createJournal().recover();
    expect(removeDirectory).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledOnce();
  });
});
