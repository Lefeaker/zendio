import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import {
  DeviceLocalVaultCleanupExecutor,
  DeviceLocalVaultRecoveryStorage
} from '@shared/config/deviceLocalVaultCleanupExecutor';
import {
  createPreparedDeviceLocalVaultRecoveryTransaction,
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
    privacyTarget: { analytics: false, errorReporting: false, debugMode: false },
    privacyWriteRequired: true
  });
  return {
    ...prepared,
    phase: 'local-committed',
    portable: {
      ...prepared.portable,
      observedCommittedIdentity: prepared.portable.proposedIdentity
    }
  };
}

describe('DeviceLocalVaultCleanupExecutor', () => {
  it('keeps local-committed irreversible when progress persistence fails after delete', async () => {
    const storage = createMemoryStorageService();
    const transaction = await localCommitted();
    await storage.local.set('deviceLocalVaultCleanupJournal', transaction);
    const removeDirectory = vi.fn(() => Promise.resolve());
    const originalSet = storage.local.set.bind(storage.local);
    storage.local.set = vi.fn(async (key, value) => {
      const record = value as { remainingCleanupCandidates?: unknown[] };
      if (record.remainingCleanupCandidates?.length === 0) throw new Error('progress failed');
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
