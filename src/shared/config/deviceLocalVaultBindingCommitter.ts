import { plainStructuredDataEqual } from './losslessObjectBoundary';
import type {
  DeviceLocalVaultBindingSnapshot,
  DeviceLocalVaultRecoveryTransaction,
  DeviceLocalVaultRecoveryTransactionV3
} from './deviceLocalVaultRecoveryTransaction';

interface DeviceLocalVaultBindingStageStorage {
  readBindings(): Promise<DeviceLocalVaultBindingSnapshot>;
  writeBindings(snapshot: DeviceLocalVaultBindingSnapshot): Promise<void>;
}

interface DeviceLocalVaultBindingCommitStorage extends DeviceLocalVaultBindingStageStorage {
  replace(transaction: DeviceLocalVaultRecoveryTransaction): Promise<void>;
}

export function sameDeviceLocalVaultBindings(
  left: DeviceLocalVaultBindingSnapshot,
  right: DeviceLocalVaultBindingSnapshot
): boolean {
  const result = plainStructuredDataEqual(left, right);
  return result.ok && result.equal;
}

export type DeviceLocalVaultBindingStageOutcome =
  | { readonly kind: 'staged' }
  | { readonly kind: 'previous' }
  | { readonly kind: 'third' };

export class DeviceLocalVaultBindingCommitter {
  constructor(private readonly recoveryStorage: DeviceLocalVaultBindingStageStorage) {}

  async execute(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    allowWrite: boolean
  ): Promise<DeviceLocalVaultBindingStageOutcome> {
    let current = await this.recoveryStorage.readBindings();
    if (sameDeviceLocalVaultBindings(current, transaction.proposedBindings)) {
      return { kind: 'staged' };
    }
    if (!sameDeviceLocalVaultBindings(current, transaction.previousBindings)) {
      return { kind: 'third' };
    }
    if (!allowWrite) return { kind: 'previous' };
    try {
      await this.recoveryStorage.writeBindings(transaction.proposedBindings);
    } catch {
      /* The immediate readback classifies an ambiguous physical write. */
    }
    current = await this.recoveryStorage.readBindings();
    if (sameDeviceLocalVaultBindings(current, transaction.proposedBindings)) {
      return { kind: 'staged' };
    }
    return sameDeviceLocalVaultBindings(current, transaction.previousBindings)
      ? { kind: 'previous' }
      : { kind: 'third' };
  }
}

export type DeviceLocalVaultLocalCommitOutcome =
  | { readonly kind: 'committed'; readonly transaction: DeviceLocalVaultRecoveryTransactionV3 }
  | { readonly kind: 'previous' }
  | { readonly kind: 'third' };

export class DeviceLocalVaultLocalCommitter {
  private readonly bindingCommitter: DeviceLocalVaultBindingCommitter;

  constructor(private readonly recoveryStorage: DeviceLocalVaultBindingCommitStorage) {
    this.bindingCommitter = new DeviceLocalVaultBindingCommitter(recoveryStorage);
  }

  stage(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    allowWrite: boolean
  ): Promise<DeviceLocalVaultBindingStageOutcome> {
    return this.bindingCommitter.execute(transaction, allowWrite);
  }

  async execute(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    allowWrite: boolean
  ): Promise<DeviceLocalVaultLocalCommitOutcome> {
    const inflight =
      transaction.phase === 'portable-committed'
        ? { ...transaction, phase: 'local-commit-inflight' as const }
        : transaction;
    if (transaction.phase === 'portable-committed') await this.recoveryStorage.replace(inflight);
    const outcome = await this.stage(inflight, allowWrite);
    if (outcome.kind !== 'staged') return outcome;
    const committed = { ...inflight, phase: 'local-committed' as const };
    await this.recoveryStorage.replace(committed);
    return { kind: 'committed', transaction: committed };
  }
}
