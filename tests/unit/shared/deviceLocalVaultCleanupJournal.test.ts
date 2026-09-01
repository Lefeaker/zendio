import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import {
  DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
  DeviceLocalVaultCleanupJournal
} from '@shared/config/deviceLocalVaultCleanupJournal';
import type { DeviceLocalVaultBindingSnapshot } from '@shared/config/deviceLocalVaultBindings';

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

describe('DeviceLocalVaultCleanupJournal', () => {
  it('durably journals unreferenced handles and cancels an intent when rebound', async () => {
    const storage = createMemoryStorageService();
    let current = bindings({ 'vault-a': { folderId: 'folder-a' } });
    const removeDirectory = vi.fn(() => Promise.resolve());
    const journal = new DeviceLocalVaultCleanupJournal(
      storage.local,
      () => Promise.resolve(current),
      removeDirectory
    );

    await journal.prepare(current, bindings({}));

    await expect(storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)).resolves.toEqual({
      version: 1,
      folderIds: ['folder-a']
    });

    current = bindings({ 'vault-b': { folderId: 'folder-a' } });
    await journal.prepare(bindings({}), current);

    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
    await journal.retryPending();
    expect(removeDirectory).not.toHaveBeenCalled();
  });

  it('keeps failed cleanup durable and clears it only after a later successful retry', async () => {
    const storage = createMemoryStorageService();
    const current = bindings({});
    const removeDirectory = vi
      .fn<(folderId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('indexeddb transaction aborted'))
      .mockResolvedValue(undefined);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const journal = new DeviceLocalVaultCleanupJournal(
      storage.local,
      () => Promise.resolve(current),
      removeDirectory
    );

    await journal.prepare(bindings({ 'vault-a': { folderId: 'folder-a' } }), current);
    await journal.retryPending();

    expect(removeDirectory).toHaveBeenCalledTimes(1);
    await expect(storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)).resolves.toEqual({
      version: 1,
      folderIds: ['folder-a']
    });

    await journal.retryPending();

    expect(removeDirectory).toHaveBeenCalledTimes(2);
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('cleanup deferred'),
      expect.objectContaining({ folderId: 'folder-a' })
    );
  });

  it('restores the exact prior journal when the enclosing binding transaction rolls back', async () => {
    const storage = createMemoryStorageService();
    const current = bindings({});
    const journal = new DeviceLocalVaultCleanupJournal(
      storage.local,
      () => Promise.resolve(current),
      () => Promise.resolve()
    );
    await storage.local.set(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, {
      version: 1,
      folderIds: ['folder-existing']
    });

    const prepared = await journal.prepare(
      bindings({ 'vault-a': { folderId: 'folder-a' } }),
      current
    );
    await journal.rollback(prepared);

    await expect(storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)).resolves.toEqual({
      version: 1,
      folderIds: ['folder-existing']
    });
  });

  it('deletes pending handles sequentially', async () => {
    const storage = createMemoryStorageService();
    let releaseFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const removeDirectory = vi.fn((folderId: string) =>
      folderId === 'folder-a' ? first : Promise.resolve()
    );
    const journal = new DeviceLocalVaultCleanupJournal(
      storage.local,
      () => Promise.resolve(bindings({})),
      removeDirectory
    );
    await storage.local.set(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, {
      version: 1,
      folderIds: ['folder-a', 'folder-b']
    });

    const retry = journal.retryPending();
    await vi.waitFor(() => expect(removeDirectory).toHaveBeenCalledWith('folder-a'));
    expect(removeDirectory).not.toHaveBeenCalledWith('folder-b');

    releaseFirst?.();
    await retry;

    expect(removeDirectory.mock.calls).toEqual([['folder-a'], ['folder-b']]);
    await expect(
      storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });
});
