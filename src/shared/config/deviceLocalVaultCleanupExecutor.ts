import type { StorageAreaService } from '../../platform/interfaces/storage';
import { plainStructuredDataEqual } from './losslessObjectBoundary';
import type { PlainStructuredObject } from './losslessObjectBoundaryTypes';
import {
  DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
  DeviceLocalVaultRecoveryError,
  decodeDeviceLocalVaultRecoveryTransaction,
  portableOptionsIdentity,
  type DeviceLocalVaultBindingSnapshot,
  type DeviceLocalVaultRecoveryTransaction,
  type DeviceLocalVaultRecoveryTransactionV2,
  type DeviceLocalVaultRecoveryTransactionV3
} from './deviceLocalVaultRecoveryTransaction';

export function sameDeviceLocalVaultBindings(
  left: DeviceLocalVaultBindingSnapshot,
  right: DeviceLocalVaultBindingSnapshot
): boolean {
  const result = plainStructuredDataEqual(left, right);
  return result.ok && result.equal;
}

export class DeviceLocalVaultRecoveryStorage {
  constructor(
    private readonly storage: StorageAreaService,
    private readonly readBindingsOperation: () => Promise<DeviceLocalVaultBindingSnapshot>,
    private readonly writeBindingsOperation: (
      snapshot: DeviceLocalVaultBindingSnapshot
    ) => Promise<void>,
    private readonly readPortableRaw: () => Promise<PlainStructuredObject>
  ) {}

  readonly getRaw = (): Promise<unknown> =>
    this.storage.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);

  readonly remove = (): Promise<void> =>
    this.storage.remove(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);

  async readBindings(): Promise<DeviceLocalVaultBindingSnapshot> {
    try {
      return await this.readBindingsOperation();
    } catch {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
  }

  async writeBindingsVerified(snapshot: DeviceLocalVaultBindingSnapshot): Promise<void> {
    try {
      await this.writeBindingsOperation(snapshot);
    } catch {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
    if (!sameDeviceLocalVaultBindings(await this.readBindings(), snapshot)) {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
  }

  async readPortableIdentity(): Promise<string> {
    return portableOptionsIdentity(await this.readPortableRaw());
  }

  async restorePreviousIfOwned(transaction: DeviceLocalVaultRecoveryTransaction): Promise<void> {
    const current = await this.readBindings();
    if (sameDeviceLocalVaultBindings(current, transaction.proposedBindings)) {
      await this.writeBindingsVerified(transaction.previousBindings);
    }
  }

  async replace(transaction: DeviceLocalVaultRecoveryTransaction): Promise<void> {
    const decoded = await decodeDeviceLocalVaultRecoveryTransaction(transaction);
    if (decoded.kind !== 'v3-transaction' && decoded.kind !== 'legacy-v2-transaction') {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
    await this.storage.set(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, transaction);
  }
}

export type DeviceLocalVaultLocalCommitOutcome =
  | { readonly kind: 'committed'; readonly transaction: DeviceLocalVaultRecoveryTransactionV3 }
  | { readonly kind: 'previous' }
  | { readonly kind: 'third' };

export class DeviceLocalVaultLocalCommitter {
  constructor(private readonly recoveryStorage: DeviceLocalVaultRecoveryStorage) {}

  async execute(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    allowWrite: boolean
  ): Promise<DeviceLocalVaultLocalCommitOutcome> {
    const inflight =
      transaction.phase === 'portable-committed'
        ? { ...transaction, phase: 'local-commit-inflight' as const }
        : transaction;
    if (transaction.phase === 'portable-committed') await this.recoveryStorage.replace(inflight);
    let current = await this.recoveryStorage.readBindings();
    if (sameDeviceLocalVaultBindings(current, inflight.proposedBindings)) {
      return { kind: 'committed', transaction: await this.commit(inflight) };
    }
    if (!sameDeviceLocalVaultBindings(current, inflight.previousBindings)) {
      return { kind: 'third' };
    }
    if (!allowWrite) return { kind: 'previous' };
    try {
      await this.recoveryStorage.writeBindingsVerified(inflight.proposedBindings);
    } catch {
      /* The immediate readback below classifies the ambiguous write. */
    }
    current = await this.recoveryStorage.readBindings();
    if (sameDeviceLocalVaultBindings(current, inflight.proposedBindings)) {
      return { kind: 'committed', transaction: await this.commit(inflight) };
    }
    return sameDeviceLocalVaultBindings(current, inflight.previousBindings)
      ? { kind: 'previous' }
      : { kind: 'third' };
  }

  private async commit(transaction: DeviceLocalVaultRecoveryTransactionV3) {
    const committed = { ...transaction, phase: 'local-committed' as const };
    await this.recoveryStorage.replace(committed);
    return committed;
  }
}

const folderIds = (snapshot: DeviceLocalVaultBindingSnapshot) =>
  new Set(Object.values(snapshot.bindings).map(({ folderId }) => folderId));

export class DeviceLocalVaultCleanupExecutor {
  constructor(
    private readonly recoveryStorage: DeviceLocalVaultRecoveryStorage,
    private readonly removeDirectory: (folderId: string) => Promise<void>
  ) {}

  async execute(transaction: DeviceLocalVaultRecoveryTransaction): Promise<void> {
    if (transaction.phase !== 'local-committed' && transaction.phase !== 'cleanup-complete') {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
    if (transaction.phase === 'cleanup-complete') {
      await this.recoveryStorage.remove();
      return;
    }
    let current = transaction;
    for (const candidate of current.remainingCleanupCandidates) {
      await this.requireCommittedAuthority(current);
      const bindings = await this.recoveryStorage.readBindings();
      if (folderIds(bindings).has(candidate)) {
        current = await this.recordComplete(current, candidate);
        continue;
      }
      if (!sameDeviceLocalVaultBindings(bindings, current.proposedBindings)) {
        throw new DeviceLocalVaultRecoveryError('EXTERNAL_SYNC_CONFLICT');
      }
      try {
        await this.removeDirectory(candidate);
      } catch (error) {
        console.warn('[background] Local vault handle cleanup deferred:', candidate, error);
        throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
      }
      current = await this.recordComplete(current, candidate);
    }
    const complete = {
      ...current,
      phase: 'cleanup-complete' as const,
      remainingCleanupCandidates: []
    };
    await this.recoveryStorage.replace(complete);
    await this.recoveryStorage.remove();
  }

  private async requireCommittedAuthority(
    transaction: DeviceLocalVaultRecoveryTransaction
  ): Promise<void> {
    const identity = await this.recoveryStorage.readPortableIdentity();
    if (
      identity !== transaction.portable.proposedIdentity ||
      transaction.portable.observedCommittedIdentity !== transaction.portable.proposedIdentity
    ) {
      throw new DeviceLocalVaultRecoveryError('EXTERNAL_SYNC_CONFLICT');
    }
  }

  private async recordComplete(
    transaction: DeviceLocalVaultRecoveryTransaction,
    candidate: string
  ): Promise<DeviceLocalVaultRecoveryTransaction> {
    const next = {
      ...transaction,
      remainingCleanupCandidates: transaction.remainingCleanupCandidates.filter(
        (folderId) => folderId !== candidate
      )
    };
    await this.recoveryStorage.replace(next);
    return next;
  }
}

export class DeviceLocalVaultLegacyV2Recovery {
  constructor(
    private readonly recoveryStorage: DeviceLocalVaultRecoveryStorage,
    private readonly cleanup: DeviceLocalVaultCleanupExecutor
  ) {}

  async execute(
    transaction: DeviceLocalVaultRecoveryTransactionV2,
    allowNoWriteCommit: boolean
  ): Promise<void> {
    if (transaction.phase === 'cleanup-complete' || transaction.phase === 'aborted') {
      await this.recoveryStorage.remove();
      return;
    }
    let current = transaction;
    if (current.phase === 'prepared') {
      const identity = await this.recoveryStorage.readPortableIdentity();
      const noWrite =
        allowNoWriteCommit &&
        !current.portable.writeRequired &&
        current.portable.preimageIdentity === current.portable.proposedIdentity;
      if (
        identity !== current.portable.proposedIdentity ||
        (!current.portable.writeRequired && !noWrite)
      ) {
        const bindings = await this.recoveryStorage.readBindings();
        if (sameDeviceLocalVaultBindings(bindings, current.proposedBindings)) {
          await this.recoveryStorage.writeBindingsVerified(current.previousBindings);
        }
        await this.recoveryStorage.remove();
        return;
      }
      current = {
        ...current,
        phase: 'portable-committed',
        portable: { ...current.portable, observedCommittedIdentity: identity }
      };
      await this.recoveryStorage.replace(current);
    }
    if (current.phase === 'portable-committed') {
      const bindings = await this.recoveryStorage.readBindings();
      if (sameDeviceLocalVaultBindings(bindings, current.previousBindings)) {
        await this.recoveryStorage.writeBindingsVerified(current.proposedBindings);
      } else if (!sameDeviceLocalVaultBindings(bindings, current.proposedBindings)) {
        await this.recoveryStorage.remove();
        return;
      }
      current = { ...current, phase: 'local-committed' };
      await this.recoveryStorage.replace(current);
    }
    await this.cleanup.execute(current);
  }
}
