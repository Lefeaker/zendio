import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import {
  DeviceLocalVaultCleanupExecutor,
  DeviceLocalVaultLocalCommitter,
  DeviceLocalVaultRecoveryStorage
} from '@shared/config/deviceLocalVaultCleanupExecutor';
import {
  createPreparedDeviceLocalVaultRecoveryTransaction,
  decodeDeviceLocalVaultRecoveryTransaction,
  type DeviceLocalVaultBindingSnapshot,
  type DeviceLocalVaultRecoveryTransactionV3
} from '@shared/config/deviceLocalVaultRecoveryTransaction';

const bindings = (folderId?: string): DeviceLocalVaultBindingSnapshot => ({
  version: 1,
  bindings: folderId ? { primary: { folderId, folderName: folderId } } : {}
});

async function localCommitted(): Promise<DeviceLocalVaultRecoveryTransactionV3> {
  const prepared = await createPreparedDeviceLocalVaultRecoveryTransaction({
    transactionId: 'cleanup-1',
    previousBindings: bindings('folder-old'),
    proposedBindings: bindings(),
    portablePreimage: { revision: 0 },
    portableProposal: { revision: 1 },
    writeRequired: true,
    privacyRestoreTarget: { analytics: false, errorReporting: false, debugMode: false },
    privacyForwardTarget: { analytics: true, errorReporting: false, debugMode: false },
    privacyWriteRequired: true
  });
  return {
    ...prepared,
    phase: 'local-committed',
    portable: {
      ...prepared.portable,
      observedCommittedIdentity: prepared.portable.proposedIdentity
    },
    privacy: { ...prepared.privacy, observedForward: 'exact-target-readback' }
  };
}

describe('DeviceLocalVaultCleanupExecutor', () => {
  it('re-exports finalization that opens publication only after exact staged B1', async () => {
    const storage = createMemoryStorageService();
    const prepared = await createPreparedDeviceLocalVaultRecoveryTransaction({
      transactionId: 'finalize-1',
      previousBindings: bindings('folder-old'),
      proposedBindings: bindings('folder-new'),
      portablePreimage: { revision: 0 },
      portableProposal: { revision: 1 },
      writeRequired: true,
      privacyRestoreTarget: { analytics: false, errorReporting: false, debugMode: false },
      privacyForwardTarget: { analytics: true, errorReporting: false, debugMode: false },
      privacyWriteRequired: true
    });
    const staged = bindings('folder-new');
    const recoveryStorage = new DeviceLocalVaultRecoveryStorage(
      storage.local,
      () => Promise.resolve(staged),
      () => Promise.resolve(),
      () => Promise.resolve({ revision: 1 })
    );
    const forwardCommitted: DeviceLocalVaultRecoveryTransactionV3 = {
      ...prepared,
      phase: 'forward-committed',
      portable: {
        ...prepared.portable,
        observedCommittedIdentity: prepared.portable.proposedIdentity
      },
      privacy: { ...prepared.privacy, observedForward: 'exact-target-readback' }
    };

    await expect(
      new DeviceLocalVaultLocalCommitter(recoveryStorage).execute(forwardCommitted, false)
    ).resolves.toMatchObject({
      kind: 'committed',
      transaction: { phase: 'local-committed' }
    });
    await expect(storage.local.get('deviceLocalVaultCleanupJournal')).resolves.toMatchObject({
      phase: 'local-committed'
    });
  });

  it('keeps local-committed irreversible when progress persistence fails after delete', async () => {
    const storage = createMemoryStorageService();
    const transaction = await localCommitted();
    await storage.local.set('deviceLocalVaultCleanupJournal', transaction);
    const removeDirectory = vi.fn(() => Promise.resolve());
    const originalSet = storage.local.set.bind(storage.local);
    storage.local.set = vi.fn(async (key, value) => {
      const decoded = await decodeDeviceLocalVaultRecoveryTransaction(value);
      if (decoded.kind !== 'v3-transaction') throw new Error('EXPECTED_VALID_CLEANUP_TRANSACTION');
      if (decoded.transaction.remainingCleanupCandidates.length === 0)
        throw new Error('progress failed');
      await originalSet(key, value);
    });
    const recoveryStorage = new DeviceLocalVaultRecoveryStorage(
      storage.local,
      () => Promise.resolve(bindings()),
      () => Promise.resolve(),
      () => Promise.resolve({ revision: 1 })
    );
    const executor = new DeviceLocalVaultCleanupExecutor(recoveryStorage, removeDirectory);

    await expect(executor.execute(transaction)).rejects.toThrow('progress failed');

    expect(removeDirectory).toHaveBeenCalledWith('folder-old');
    await expect(storage.local.get('deviceLocalVaultCleanupJournal')).resolves.toMatchObject({
      phase: 'local-committed'
    });
  });

  it('has no compensation capability', () => {
    expect(DeviceLocalVaultCleanupExecutor.length).toBe(2);
  });
});
