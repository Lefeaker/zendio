import type { StorageAreaService } from '../../platform/interfaces/storage';
import type { PlainStructuredObject } from './losslessObjectBoundaryTypes';
import {
  DeviceLocalVaultCleanupExecutor,
  DeviceLocalVaultLegacyV2Recovery,
  DeviceLocalVaultLocalCommitter,
  DeviceLocalVaultRecoveryStorage,
  sameDeviceLocalVaultBindings
} from './deviceLocalVaultCleanupExecutor';
import {
  DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
  DeviceLocalVaultRecoveryError,
  createPreparedDeviceLocalVaultRecoveryTransaction,
  decodeDeviceLocalVaultRecoveryTransaction,
  portableOptionsIdentity,
  type DeviceLocalVaultBindingSnapshot,
  type DeviceLocalVaultRecoveryTransaction,
  type DeviceLocalVaultRecoveryOperations,
  type DeviceLocalVaultRecoveryTransactionV3,
  withDeviceLocalVaultRecoveryPhase
} from './deviceLocalVaultRecoveryTransaction';

export { DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, DeviceLocalVaultRecoveryError };
type PreparationInput = Parameters<typeof createPreparedDeviceLocalVaultRecoveryTransaction>[0];

export class DeviceLocalVaultCleanupJournal {
  private readonly cleanup: DeviceLocalVaultCleanupExecutor;
  private readonly legacyRecovery: DeviceLocalVaultLegacyV2Recovery;
  private readonly localCommitter: DeviceLocalVaultLocalCommitter;
  private readonly recoveryStorage: DeviceLocalVaultRecoveryStorage;

  constructor(
    storage: StorageAreaService,
    readBindings: () => Promise<DeviceLocalVaultBindingSnapshot>,
    removeDirectory: (folderId: string) => Promise<void>,
    private readonly operations: DeviceLocalVaultRecoveryOperations
  ) {
    this.recoveryStorage = new DeviceLocalVaultRecoveryStorage(
      storage,
      readBindings,
      operations.writeBindings,
      operations.readPortableRaw
    );
    this.cleanup = new DeviceLocalVaultCleanupExecutor(this.recoveryStorage, removeDirectory);
    this.legacyRecovery = new DeviceLocalVaultLegacyV2Recovery(this.recoveryStorage, this.cleanup);
    this.localCommitter = new DeviceLocalVaultLocalCommitter(this.recoveryStorage);
  }

  async prepare(input: PreparationInput): Promise<DeviceLocalVaultRecoveryTransactionV3> {
    const transaction = await createPreparedDeviceLocalVaultRecoveryTransaction(input);
    await this.recoveryStorage.replace(transaction);
    return transaction;
  }

  async completePortableCommit(observedRaw: PlainStructuredObject): Promise<void> {
    const transaction = await this.requireV3();
    const identity = await portableOptionsIdentity(observedRaw);
    if (identity !== transaction.portable.proposedIdentity) {
      throw new DeviceLocalVaultRecoveryError('EXTERNAL_SYNC_CONFLICT');
    }
    const portableCommitted = withDeviceLocalVaultRecoveryPhase(transaction, {
      phase: 'portable-committed',
      portable: { ...transaction.portable, observedCommittedIdentity: identity }
    });
    await this.recoveryStorage.replace(portableCommitted);
    const committed = await this.attemptLocalCommit(portableCommitted);
    try {
      await this.cleanup.execute(committed);
    } catch (error) {
      console.warn('[background] Local vault cleanup deferred after commit:', error);
    }
  }

  async recover(allowNoWriteCommit = true): Promise<void> {
    const raw = await this.recoveryStorage.getRaw();
    if (raw === undefined) return;
    const decoded = await decodeDeviceLocalVaultRecoveryTransaction(raw);
    if (decoded.kind === 'legacy-unproven' || decoded.kind === 'invalid') {
      console.warn('[background] Local vault cleanup journal quarantined:', decoded.kind);
      await this.recoveryStorage.remove();
      return;
    }
    if (decoded.kind === 'legacy-v2-transaction') {
      await this.legacyRecovery.execute(decoded.transaction, allowNoWriteCommit);
      return;
    }
    await this.recoverV3(decoded.transaction, allowNoWriteCommit);
  }

  private async recoverV3(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    allowNoWriteCommit: boolean
  ): Promise<void> {
    if (transaction.phase === 'cleanup-complete' || transaction.phase === 'aborted') {
      await this.recoveryStorage.remove();
      return;
    }
    if (transaction.phase === 'local-committed') {
      await this.cleanup.execute(transaction);
      return;
    }
    if (transaction.phase === 'prepared') {
      const current = await this.recoveryStorage.readPortableIdentity();
      const noWrite =
        allowNoWriteCommit &&
        !transaction.portable.writeRequired &&
        transaction.portable.preimageIdentity === transaction.portable.proposedIdentity;
      if (
        current === transaction.portable.proposedIdentity &&
        (transaction.portable.writeRequired || noWrite)
      ) {
        transaction = withDeviceLocalVaultRecoveryPhase(transaction, {
          phase: 'portable-committed',
          portable: { ...transaction.portable, observedCommittedIdentity: current }
        });
        await this.recoveryStorage.replace(transaction);
      } else {
        const code: DeviceLocalVaultRecoveryError['code'] =
          current === transaction.portable.preimageIdentity
            ? 'OPTIONS_STORAGE_FAILURE'
            : 'EXTERNAL_SYNC_CONFLICT';
        await this.recoveryStorage.restorePreviousIfOwned(transaction);
        await this.abort(
          transaction,
          code === 'EXTERNAL_SYNC_CONFLICT' ? 'external-sync-conflict' : 'portable-not-committed'
        );
        if (code === 'EXTERNAL_SYNC_CONFLICT') throw new DeviceLocalVaultRecoveryError(code);
        return;
      }
    }
    if (transaction.phase === 'portable-committed') {
      const committed = await this.attemptLocalCommit(transaction);
      await this.cleanup.execute(committed);
      return;
    }
    if (transaction.phase === 'local-commit-inflight') {
      const outcome = await this.localCommitter.execute(transaction, false);
      if (outcome.kind === 'committed') {
        const committed = outcome.transaction;
        await this.cleanup.execute(committed);
        return;
      }
      await this.compensate(
        transaction,
        outcome.kind === 'previous' ? 'OPTIONS_STORAGE_FAILURE' : 'EXTERNAL_SYNC_CONFLICT'
      );
      return;
    }
    if (transaction.phase === 'compensating') {
      await this.compensate(
        transaction,
        transaction.failureCode ? 'OPTIONS_STORAGE_FAILURE' : 'EXTERNAL_SYNC_CONFLICT'
      );
      return;
    }
    await this.finishBindingCompensation(
      transaction,
      transaction.failureCode ? 'OPTIONS_STORAGE_FAILURE' : 'EXTERNAL_SYNC_CONFLICT'
    );
  }

  private async attemptLocalCommit(
    transaction: DeviceLocalVaultRecoveryTransactionV3
  ): Promise<DeviceLocalVaultRecoveryTransactionV3> {
    const outcome = await this.localCommitter.execute(transaction, true);
    if (outcome.kind === 'committed') return outcome.transaction;
    return this.compensate(
      withDeviceLocalVaultRecoveryPhase(transaction, { phase: 'local-commit-inflight' }),
      outcome.kind === 'previous' ? 'OPTIONS_STORAGE_FAILURE' : 'EXTERNAL_SYNC_CONFLICT'
    );
  }

  private async compensate(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    code: DeviceLocalVaultRecoveryError['code']
  ): Promise<never> {
    const operation = this.operations.compensate;
    if (!operation) throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    const compensating = withDeviceLocalVaultRecoveryPhase(transaction, {
      phase: 'compensating',
      ...(code === 'OPTIONS_STORAGE_FAILURE' ? { failureCode: code } : {})
    });
    await this.recoveryStorage.replace(compensating);
    let portableState: 'proposal' | 'preimage' | 'third';
    try {
      ({ portableState } = await operation({
        portablePreimage: compensating.portable.preimage,
        preimageIdentity: compensating.portable.preimageIdentity,
        proposedIdentity: compensating.portable.proposedIdentity,
        privacyTarget: compensating.privacy.target,
        privacyRestoreRequired: compensating.privacy.restoreRequired
      }));
    } catch {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
    const { failureCode: _failureCode, ...conflictBase } = compensating;
    const restored =
      portableState === 'third'
        ? withDeviceLocalVaultRecoveryPhase(conflictBase as DeviceLocalVaultRecoveryTransactionV3, {
            phase: 'portable-privacy-restored'
          })
        : withDeviceLocalVaultRecoveryPhase(compensating, {
            phase: 'portable-privacy-restored'
          });
    await this.recoveryStorage.replace(restored);
    return this.finishBindingCompensation(
      restored,
      portableState === 'third' ? 'EXTERNAL_SYNC_CONFLICT' : code
    );
  }

  private async finishBindingCompensation(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    code: DeviceLocalVaultRecoveryError['code']
  ): Promise<never> {
    const current = await this.recoveryStorage.readBindings();
    let finalCode = code;
    if (sameDeviceLocalVaultBindings(current, transaction.proposedBindings)) {
      await this.recoveryStorage.writeBindingsVerified(transaction.previousBindings);
    } else if (!sameDeviceLocalVaultBindings(current, transaction.previousBindings)) {
      finalCode = 'EXTERNAL_SYNC_CONFLICT';
    }
    await this.abort(
      transaction,
      finalCode === 'EXTERNAL_SYNC_CONFLICT' ? 'external-sync-conflict' : 'local-commit-failed'
    );
    throw new DeviceLocalVaultRecoveryError(finalCode);
  }

  private async abort(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    abortReason: NonNullable<DeviceLocalVaultRecoveryTransactionV3['abortReason']>
  ) {
    await this.recoveryStorage.replace(
      withDeviceLocalVaultRecoveryPhase(transaction, { phase: 'aborted', abortReason })
    );
    await this.recoveryStorage.remove();
  }

  private async requireV3() {
    const decoded = await decodeDeviceLocalVaultRecoveryTransaction(
      await this.recoveryStorage.getRaw()
    );
    if (decoded.kind !== 'v3-transaction') {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
    return decoded.transaction;
  }
}
