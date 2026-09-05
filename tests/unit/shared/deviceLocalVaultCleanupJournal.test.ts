import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import {
  DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
  DeviceLocalVaultCleanupJournal
} from '@shared/config/deviceLocalVaultCleanupJournal';
import type { PlainStructuredObject } from '@shared/config/losslessObjectBoundaryTypes';
import type { DeviceLocalVaultBindingSnapshot } from '@shared/config/deviceLocalVaultBindings';
import {
  portableOptionsIdentity,
  type DeviceLocalVaultCompensationRequest,
  type DeviceLocalVaultRecoveryTransactionV3
} from '@shared/config/deviceLocalVaultRecoveryTransaction';

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

function harness(options?: {
  current?: DeviceLocalVaultBindingSnapshot;
  portable?: PlainStructuredObject;
  removeDirectory?: (folderId: string) => Promise<void>;
  onPortableRead?: (count: number) => void;
  writeBindings?: (snapshot: DeviceLocalVaultBindingSnapshot) => Promise<void>;
  compensate?: (request: DeviceLocalVaultCompensationRequest) => Promise<{
    portableState: 'proposal' | 'preimage' | 'third';
  }>;
}) {
  const storage = createMemoryStorageService();
  let current = options?.current ?? bindings({});
  let portable = options?.portable ?? {};
  const removeDirectory = vi.fn(options?.removeDirectory ?? (() => Promise.resolve()));
  let portableReads = 0;
  const createJournal = () =>
    new DeviceLocalVaultCleanupJournal(
      storage.local,
      () => Promise.resolve(structuredClone(current)),
      removeDirectory,
      {
        readPortableRaw: () => {
          options?.onPortableRead?.(++portableReads);
          return Promise.resolve(structuredClone(portable));
        },
        writeBindings:
          options?.writeBindings ??
          ((snapshot) => {
            current = structuredClone(snapshot);
            return Promise.resolve();
          }),
        compensate:
          options?.compensate ??
          (async (request) => {
            const identity = await portableOptionsIdentity(portable);
            const portableState =
              identity === request.proposedIdentity
                ? 'proposal'
                : identity === request.preimageIdentity
                  ? 'preimage'
                  : 'third';
            if (portableState === 'proposal') portable = structuredClone(request.portablePreimage);
            return { portableState };
          })
      }
    );
  return {
    storage,
    removeDirectory,
    createJournal,
    current: () => current,
    portable: () => portable,
    setCurrent: (snapshot: DeviceLocalVaultBindingSnapshot) => {
      current = snapshot;
    },
    setPortable: (raw: PlainStructuredObject) => {
      portable = raw;
    }
  };
}

const previous = bindings({ primary: { folderId: 'folder-old', folderName: 'Old' } });
const proposed = bindings({});
const portablePreimage = { vaultRouter: { defaultVaultId: 'primary' } };
const portableProposal = { vaultRouter: { defaultVaultId: 'primary', vaults: [] } };
const preparation = {
  transactionId: 'operation-1',
  previousBindings: previous,
  proposedBindings: proposed,
  portablePreimage,
  portableProposal,
  writeRequired: true,
  privacyTarget: { analytics: false, errorReporting: false, debugMode: false },
  privacyWriteRequired: false
} as const;

async function phaseRecord(
  phase: DeviceLocalVaultRecoveryTransactionV3['phase'],
  failureCode?: 'OPTIONS_STORAGE_FAILURE'
): Promise<DeviceLocalVaultRecoveryTransactionV3> {
  const state = harness({ current: previous, portable: portablePreimage });
  const transaction = await state.createJournal().prepare(preparation);
  await state.storage.local.remove(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);
  return {
    ...transaction,
    phase,
    portable: {
      ...transaction.portable,
      ...(phase === 'prepared'
        ? {}
        : { observedCommittedIdentity: transaction.portable.proposedIdentity })
    },
    ...(failureCode ? { failureCode } : {})
  };
}

afterEach(() => vi.restoreAllMocks());

describe('DeviceLocalVaultCleanupJournal', () => {
  it('restores the binding preimage and preserves the handle after a pre-portable crash', async () => {
    const state = harness({ current: previous, portable: portablePreimage });
    await state.createJournal().prepare(preparation);
    state.setCurrent(proposed);

    await state.createJournal().recover();

    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it.each([
    { version: 1, folderIds: ['folder-old'] },
    { version: 2, transactionId: 'broken', phase: 'prepared' },
    { version: 99, folderIds: ['folder-old'] }
  ])('quarantines v1, unknown, and invalid rows without deleting: %#', async (record) => {
    const state = harness({ current: previous, portable: portablePreimage });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await state.storage.local.set(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, record);

    await state.createJournal().recover();

    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('rolls portable-committed state forward through bindings and cleanup', async () => {
    const state = harness({ current: previous, portable: portablePreimage });
    const journal = state.createJournal();
    await journal.prepare(preparation);
    state.setPortable(portableProposal);

    await state.createJournal().recover();

    expect(state.current()).toEqual(proposed);
    expect(state.removeDirectory).toHaveBeenCalledWith('folder-old');
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('advances a no-portable-write transaction only when all identities match', async () => {
    const state = harness({ current: previous, portable: portablePreimage });
    await state.createJournal().prepare({
      ...preparation,
      portableProposal: portablePreimage,
      writeRequired: false
    });

    await state.createJournal().recover();

    expect(state.current()).toEqual(proposed);
    expect(state.removeDirectory).toHaveBeenCalledWith('folder-old');
  });

  it('aborts a no-write prepared record when the live enclosing commit failed', async () => {
    const state = harness({ current: previous, portable: portablePreimage });
    await state.createJournal().prepare({
      ...preparation,
      portableProposal: portablePreimage,
      writeRequired: false
    });
    state.setCurrent(proposed);

    await state.createJournal().recover(false);

    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('preserves the preimage and handle for a third portable state', async () => {
    const state = harness({ current: previous, portable: portablePreimage });
    await state.createJournal().prepare(preparation);
    state.setPortable({ external: { revision: 3 } });

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'EXTERNAL_SYNC_CONFLICT'
    });

    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('does not overwrite a third local binding snapshot or delete its handle', async () => {
    const state = harness({ current: previous, portable: portablePreimage });
    await state.createJournal().prepare(preparation);
    state.setPortable(portableProposal);
    const third = bindings({ external: { folderId: 'folder-external' } });
    state.setCurrent(third);

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'EXTERNAL_SYNC_CONFLICT'
    });

    expect(state.current()).toEqual(third);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('recovers a crash from local-commit-inflight by compensating P1 and preserving B0', async () => {
    const state = harness({ current: previous, portable: portableProposal });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('local-commit-inflight')
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });

    expect(state.portable()).toEqual(portablePreimage);
    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('resumes compensating after portable rollback and finishes the durable privacy/B0 path', async () => {
    const state = harness({ current: previous, portable: portablePreimage });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('compensating', 'OPTIONS_STORAGE_FAILURE')
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });

    expect(state.portable()).toEqual(portablePreimage);
    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('keeps portable-privacy-restored durable until a later B0 recovery pass succeeds', async () => {
    let fail = true;
    let state!: ReturnType<typeof harness>;
    state = harness({
      current: proposed,
      portable: portablePreimage,
      writeBindings: (snapshot) => {
        if (fail) {
          fail = false;
          return Promise.reject(new Error('B0 storage unavailable'));
        }
        state.setCurrent(snapshot);
        return Promise.resolve();
      }
    });
    await state.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('portable-privacy-restored', 'OPTIONS_STORAGE_FAILURE')
    );

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toMatchObject({
      phase: 'portable-privacy-restored'
    });

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    expect(state.current()).toEqual(previous);
    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('rolls forward a throw-after-write B1 result without entering compensation', async () => {
    let state!: ReturnType<typeof harness>;
    const compensate = vi.fn(async () => ({ portableState: 'proposal' as const }));
    state = harness({
      current: previous,
      portable: portablePreimage,
      compensate,
      writeBindings: (snapshot) => {
        state.setCurrent(snapshot);
        return Promise.reject(new Error('ambiguous after write'));
      }
    });
    const journal = state.createJournal();
    await journal.prepare(preparation);
    state.setPortable(portableProposal);

    await journal.completePortableCommit(portableProposal);

    expect(state.current()).toEqual(proposed);
    expect(compensate).not.toHaveBeenCalled();
    expect(state.removeDirectory).toHaveBeenCalledWith('folder-old');
  });

  it('compensates a throw-before-write B1 result and preserves a third portable value', async () => {
    let failed = false;
    const state = harness({
      current: previous,
      portable: portablePreimage,
      writeBindings: () => {
        if (!failed) {
          failed = true;
          return Promise.reject(new Error('before write'));
        }
        return Promise.resolve();
      }
    });
    const journal = state.createJournal();
    await journal.prepare(preparation);
    state.setPortable(portableProposal);

    await expect(journal.completePortableCommit(portableProposal)).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    expect(state.portable()).toEqual(portablePreimage);
    expect(state.current()).toEqual(previous);

    const thirdState = harness({ current: previous, portable: { external: true } });
    await thirdState.storage.local.set(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
      await phaseRecord('local-commit-inflight')
    );
    await expect(thirdState.createJournal().recover()).rejects.toMatchObject({
      code: 'EXTERNAL_SYNC_CONFLICT'
    });
    expect(thirdState.portable()).toEqual({ external: true });
    expect(thirdState.current()).toEqual(previous);
  });

  it('records a rebound candidate as complete without deleting it', async () => {
    let state: ReturnType<typeof harness>;
    state = harness({
      current: previous,
      portable: portablePreimage,
      onPortableRead: (count) => {
        if (count === 2) {
          state.setCurrent(bindings({ rebound: { folderId: 'folder-old' } }));
        }
      }
    });
    await state.createJournal().prepare(preparation);
    state.setPortable(portableProposal);

    await state.createJournal().recover();

    expect(state.removeDirectory).not.toHaveBeenCalled();
  });

  it('keeps a failed delete durable for one bounded later pass', async () => {
    const removeDirectory = vi
      .fn<(folderId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('indexeddb transaction aborted'))
      .mockResolvedValue(undefined);
    const state = harness({ current: previous, portable: portablePreimage, removeDirectory });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await state.createJournal().prepare(preparation);
    state.setPortable(portableProposal);

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    const pending = await state.storage.local.get<Record<string, unknown>>(
      DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY
    );
    expect(pending).toMatchObject({ phase: 'local-committed' });

    await state.createJournal().recover();

    expect(removeDirectory).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledOnce();
    await expect(
      state.storage.local.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    ).resolves.toBeUndefined();
  });

  it('stops after a progress-write failure and replays only bounded candidates', async () => {
    const twoPrevious = bindings({
      first: { folderId: 'folder-a' },
      second: { folderId: 'folder-b' }
    });
    const state = harness({ current: twoPrevious, portable: portablePreimage });
    await state.createJournal().prepare({ ...preparation, previousBindings: twoPrevious });
    state.setPortable(portableProposal);
    const originalSet = state.storage.local.set.bind(state.storage.local);
    let failed = false;
    state.storage.local.set = vi.fn(async (key, value) => {
      const candidate = value as { phase?: string; remainingCleanupCandidates?: unknown[] };
      if (
        !failed &&
        candidate.phase === 'local-committed' &&
        candidate.remainingCleanupCandidates?.length === 1
      ) {
        failed = true;
        throw new Error('progress unavailable');
      }
      await originalSet(key, value);
    });

    await expect(state.createJournal().recover()).rejects.toThrow('progress unavailable');
    expect(state.removeDirectory.mock.calls).toEqual([['folder-a']]);

    state.storage.local.set = originalSet;
    await state.createJournal().recover();
    expect(state.removeDirectory.mock.calls).toEqual([['folder-a'], ['folder-a'], ['folder-b']]);
  });

  it('does not restore B0 over B1 when local-committed portable state drifts third', async () => {
    const removeDirectory = vi.fn(() => Promise.reject(new Error('indexeddb unavailable')));
    const state = harness({ current: previous, portable: portablePreimage, removeDirectory });
    await state.createJournal().prepare(preparation);
    state.setPortable(portableProposal);
    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    state.setPortable({ external: { revision: 4 } });

    await expect(state.createJournal().recover()).rejects.toMatchObject({
      code: 'EXTERNAL_SYNC_CONFLICT'
    });

    expect(state.current()).toEqual(proposed);
    expect(removeDirectory).toHaveBeenCalledOnce();
  });
});
