import type { StorageAreaService } from '../../platform/interfaces/storage';
import type { PlainStructuredObject } from './losslessObjectBoundaryTypes';
import type {
  DeviceLocalVaultBindingSnapshot,
  DeviceLocalVaultRecoveryTransaction
} from './deviceLocalVaultRecoveryTransaction';
import {
  createPreparedDeviceLocalVaultRecoveryTransaction,
  decodeDeviceLocalVaultRecoveryTransaction,
  portableOptionsIdentity
} from './deviceLocalVaultRecoveryTransaction';

export const DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY = 'deviceLocalVaultCleanupJournal';
type PreparationInput = Parameters<typeof createPreparedDeviceLocalVaultRecoveryTransaction>[0];

export class DeviceLocalVaultRecoveryError extends Error {
  constructor(readonly code: 'OPTIONS_STORAGE_FAILURE' | 'EXTERNAL_SYNC_CONFLICT') {
    super(code);
    this.name = 'DeviceLocalVaultRecoveryError';
  }
}

const folderIds = (snapshot: DeviceLocalVaultBindingSnapshot) =>
  new Set(Object.values(snapshot.bindings).map(({ folderId }) => folderId));
const canonicalBindings = (snapshot: DeviceLocalVaultBindingSnapshot) =>
  JSON.stringify(
    Object.entries(snapshot.bindings).sort(([left], [right]) => left.localeCompare(right))
  );
const sameBindings = (
  left: DeviceLocalVaultBindingSnapshot,
  right: DeviceLocalVaultBindingSnapshot
) => canonicalBindings(left) === canonicalBindings(right);
const withPhase = (
  transaction: DeviceLocalVaultRecoveryTransaction,
  update: Partial<DeviceLocalVaultRecoveryTransaction>
) => ({ ...transaction, ...update }) as DeviceLocalVaultRecoveryTransaction;

export class DeviceLocalVaultCleanupJournal {
  constructor(
    private readonly storage: StorageAreaService,
    private readonly readBindings: () => Promise<DeviceLocalVaultBindingSnapshot>,
    private readonly removeDirectory: (folderId: string) => Promise<void>,
    private readonly operations: {
      readonly readPortableRaw: () => Promise<PlainStructuredObject>;
      readonly writeBindings: (snapshot: DeviceLocalVaultBindingSnapshot) => Promise<void>;
    }
  ) {}

  async prepare(input: PreparationInput): Promise<DeviceLocalVaultRecoveryTransaction> {
    const transaction = await createPreparedDeviceLocalVaultRecoveryTransaction(input);
    await this.replaceDirect(transaction);
    return transaction;
  }

  async completePortableCommit(observedRaw: PlainStructuredObject): Promise<void> {
    const transaction = await this.requireTransaction();
    const identity = await portableOptionsIdentity(observedRaw);
    if (identity !== transaction.portable.proposedIdentity) {
      throw new DeviceLocalVaultRecoveryError('EXTERNAL_SYNC_CONFLICT');
    }
    const portableCommitted = withPhase(transaction, {
      phase: 'portable-committed',
      portable: { ...transaction.portable, observedCommittedIdentity: identity }
    });
    await this.replaceDirect(portableCommitted);
    const localCommitted = await this.commitLocalDirect(portableCommitted);
    if (localCommitted) await this.cleanupDirect(localCommitted, false);
  }

  async recover(allowNoWriteCommit = true): Promise<void> {
    const raw = await this.storage.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);
    if (raw === undefined) return;
    const decoded = decodeDeviceLocalVaultRecoveryTransaction(raw);
    if (decoded.kind !== 'transaction') {
      console.warn('[background] Local vault cleanup journal quarantined:', decoded.kind);
      await this.storage.remove(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);
      return;
    }
    let transaction = decoded.transaction;
    if (transaction.phase === 'cleanup-complete' || transaction.phase === 'aborted') {
      await this.storage.remove(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);
      return;
    }
    if (transaction.phase === 'prepared') {
      const currentIdentity = await this.readPortableIdentity();
      const noWriteCommitted =
        allowNoWriteCommit &&
        !transaction.portable.writeRequired &&
        transaction.portable.preimageIdentity === transaction.portable.proposedIdentity &&
        currentIdentity === transaction.portable.proposedIdentity;
      if (
        currentIdentity === transaction.portable.proposedIdentity &&
        (noWriteCommitted || transaction.portable.writeRequired)
      ) {
        transaction = withPhase(transaction, {
          phase: 'portable-committed',
          portable: { ...transaction.portable, observedCommittedIdentity: currentIdentity }
        });
        await this.replaceDirect(transaction);
      } else {
        const reason =
          currentIdentity === transaction.portable.preimageIdentity
            ? 'portable-not-committed'
            : 'external-sync-conflict';
        await this.restorePreviousIfOwned(transaction);
        await this.abortDirect(transaction, reason);
        return;
      }
    }
    if (transaction.phase === 'portable-committed') {
      const committed = await this.commitLocalDirect(transaction);
      if (!committed) return;
      transaction = committed;
    }
    await this.cleanupDirect(transaction, true);
  }

  private async commitLocalDirect(
    transaction: DeviceLocalVaultRecoveryTransaction
  ): Promise<DeviceLocalVaultRecoveryTransaction | null> {
    if (!(await this.portableStillCommitted(transaction))) {
      await this.restorePreviousIfOwned(transaction, true);
      await this.abortDirect(transaction, 'external-sync-conflict');
      return null;
    }
    const current = await this.readBindings();
    if (sameBindings(current, transaction.previousBindings)) {
      if (!sameBindings(current, transaction.proposedBindings)) {
        await this.writeBindingsVerified(transaction.proposedBindings);
      }
    } else if (!sameBindings(current, transaction.proposedBindings)) {
      await this.abortDirect(transaction, 'external-sync-conflict');
      return null;
    }
    const committed = withPhase(transaction, { phase: 'local-committed' });
    await this.replaceDirect(committed);
    return committed;
  }

  private async cleanupDirect(
    transaction: DeviceLocalVaultRecoveryTransaction,
    failOnDeleteError: boolean
  ): Promise<boolean> {
    let currentTransaction = transaction;
    for (const candidate of currentTransaction.remainingCleanupCandidates) {
      if (!(await this.portableStillCommitted(currentTransaction))) {
        await this.restorePreviousIfOwned(currentTransaction, true);
        await this.abortDirect(currentTransaction, 'external-sync-conflict');
        return false;
      }
      const currentBindings = await this.readBindings();
      if (folderIds(currentBindings).has(candidate)) {
        currentTransaction = await this.recordCandidateComplete(currentTransaction, candidate);
        continue;
      }
      if (!sameBindings(currentBindings, currentTransaction.proposedBindings)) {
        await this.abortDirect(currentTransaction, 'external-sync-conflict');
        return false;
      }
      try {
        await this.removeDirectory(candidate);
      } catch (error) {
        console.warn('[background] Local vault handle cleanup deferred:', {
          folderId: candidate,
          error
        });
        if (failOnDeleteError) throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
        return false;
      }
      currentTransaction = await this.recordCandidateComplete(currentTransaction, candidate);
    }
    await this.replaceDirect(
      withPhase(currentTransaction, {
        phase: 'cleanup-complete',
        remainingCleanupCandidates: []
      })
    );
    await this.storage.remove(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);
    return true;
  }

  private async recordCandidateComplete(
    transaction: DeviceLocalVaultRecoveryTransaction,
    candidate: string
  ): Promise<DeviceLocalVaultRecoveryTransaction> {
    const next = withPhase(transaction, {
      remainingCleanupCandidates: transaction.remainingCleanupCandidates.filter(
        (folderId) => folderId !== candidate
      )
    });
    await this.replaceDirect(next);
    return next;
  }

  private async restorePreviousIfOwned(
    transaction: DeviceLocalVaultRecoveryTransaction,
    requirePortablePreimage = false
  ): Promise<void> {
    if (
      requirePortablePreimage &&
      (await this.readPortableIdentity()) !== transaction.portable.preimageIdentity
    )
      return;
    const current = await this.readBindings();
    if (sameBindings(current, transaction.proposedBindings)) {
      await this.writeBindingsVerified(transaction.previousBindings);
    }
  }

  private async abortDirect(
    transaction: DeviceLocalVaultRecoveryTransaction,
    abortReason: 'portable-not-committed' | 'external-sync-conflict'
  ): Promise<void> {
    await this.replaceDirect(withPhase(transaction, { phase: 'aborted', abortReason }));
    await this.storage.remove(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);
  }

  private async portableStillCommitted(transaction: DeviceLocalVaultRecoveryTransaction) {
    return (await this.readPortableIdentity()) === transaction.portable.observedCommittedIdentity;
  }

  private async readPortableIdentity(): Promise<string> {
    return portableOptionsIdentity(await this.operations.readPortableRaw());
  }

  private async writeBindingsVerified(snapshot: DeviceLocalVaultBindingSnapshot): Promise<void> {
    await this.operations.writeBindings(snapshot);
    if (!sameBindings(await this.readBindings(), snapshot)) {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
  }

  private async requireTransaction(): Promise<DeviceLocalVaultRecoveryTransaction> {
    const decoded = decodeDeviceLocalVaultRecoveryTransaction(
      await this.storage.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
    );
    if (decoded.kind !== 'transaction')
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    return decoded.transaction;
  }

  private async replaceDirect(transaction: DeviceLocalVaultRecoveryTransaction): Promise<void> {
    if (decodeDeviceLocalVaultRecoveryTransaction(transaction).kind !== 'transaction')
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    await this.storage.set(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, transaction);
  }
}
