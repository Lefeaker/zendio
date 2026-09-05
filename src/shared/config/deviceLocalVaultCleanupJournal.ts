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
  type DeviceLocalPrivacyCommitter,
  type DeviceLocalVaultRecoveryObservation,
  type DeviceLocalVaultRecoveryTransactionV3,
  withDeviceLocalVaultRecoveryPhase
} from './deviceLocalVaultRecoveryTransaction';

export { DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, DeviceLocalVaultRecoveryError };
type PreparationInput = Parameters<typeof createPreparedDeviceLocalVaultRecoveryTransaction>[0];
type RecoveryCode = DeviceLocalVaultRecoveryError['code'];
type RecoveryOperations = Required<Pick<DeviceLocalPrivacyCommitter, 'observe' | 'compensate'>>;
const committedResult = (observation?: DeviceLocalVaultRecoveryObservation) =>
  observation
    ? { raw: observation.portableRaw, privacy: observation.privacy, didWrite: true as const }
    : null;
const isConflict = (observation: DeviceLocalVaultRecoveryObservation) =>
  observation.portableState === 'third' || observation.privacyState === 'third';

export class DeviceLocalVaultCleanupJournal {
  constructor(
    private readonly recoveryStorage: DeviceLocalVaultRecoveryStorage,
    private readonly cleanup: DeviceLocalVaultCleanupExecutor,
    private readonly localCommitter: DeviceLocalVaultLocalCommitter,
    private readonly operations: RecoveryOperations
  ) {}
  async prepare(input: PreparationInput): Promise<DeviceLocalVaultRecoveryTransactionV3> {
    const transaction = await createPreparedDeviceLocalVaultRecoveryTransaction(input);
    await this.recoveryStorage.replace(transaction);
    return transaction;
  }
  async beginForward(): Promise<void> {
    const transaction = await this.requireV3();
    if (transaction.phase !== 'prepared')
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    await this.recoveryStorage.replace(
      withDeviceLocalVaultRecoveryPhase(transaction, { phase: 'forward-inflight' })
    );
  }
  async recover(
    allowNoWriteCommit = true,
    outcomeCode: RecoveryCode = 'OPTIONS_STORAGE_FAILURE',
    deferCleanupFailure = false
  ) {
    const raw = await this.recoveryStorage.getRaw();
    if (raw === undefined) return null;
    const decoded = await decodeDeviceLocalVaultRecoveryTransaction(raw);
    if (
      decoded.kind === 'legacy-unproven' ||
      decoded.kind === 'legacy-v3-unproven' ||
      decoded.kind === 'invalid'
    ) {
      console.warn('[background] Local vault cleanup journal quarantined:', decoded.kind);
      await this.recoveryStorage.remove();
      return null;
    }
    if (decoded.kind === 'legacy-v2-transaction') {
      await new DeviceLocalVaultLegacyV2Recovery(this.recoveryStorage, this.cleanup).execute(
        decoded.transaction,
        allowNoWriteCommit
      );
      return null;
    }
    if (decoded.kind !== 'v3-transaction') return null;
    return this.recoverV3(decoded.transaction, outcomeCode, deferCleanupFailure);
  }
  private async recoverV3(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    outcomeCode: RecoveryCode,
    deferCleanupFailure: boolean
  ) {
    if (transaction.phase === 'cleanup-complete' || transaction.phase === 'aborted') {
      await this.recoveryStorage.remove();
      return null;
    }
    if (transaction.phase === 'local-committed') {
      await this.cleanup.execute(transaction);
      return null;
    }
    if (transaction.phase === 'prepared') return this.recoverPrepared(transaction);
    if (transaction.phase === 'forward-inflight')
      return this.advanceForward(transaction, outcomeCode, deferCleanupFailure);
    if (transaction.phase === 'forward-committed') {
      const observation = await this.operations.observe(transaction, 'forward');
      if (observation.portableState !== 'proposal' || observation.privacyState !== 'forward')
        return this.compensate(
          transaction,
          isConflict(observation) ? 'EXTERNAL_SYNC_CONFLICT' : outcomeCode,
          false
        );
      return this.attemptLocalCommit(transaction, observation, true, deferCleanupFailure);
    }
    if (transaction.phase === 'local-commit-inflight')
      return this.attemptLocalCommit(transaction, undefined, false, deferCleanupFailure);
    if (transaction.phase === 'compensating') {
      return this.compensate(
        transaction,
        transaction.recovery?.outcomeCode ?? outcomeCode,
        transaction.recovery?.bindingWriteMayHaveOccurred ?? false
      );
    }
    return this.finishBindingCompensation(transaction);
  }
  private async recoverPrepared(transaction: DeviceLocalVaultRecoveryTransactionV3) {
    const observation = await this.operations.observe(transaction, 'restore');
    const bindings = await this.recoveryStorage.readBindings();
    const untouched =
      observation.portableState === 'preimage' &&
      observation.privacyState === 'restore' &&
      sameDeviceLocalVaultBindings(bindings, transaction.previousBindings);
    await this.abort(transaction, untouched ? 'forward-not-started' : 'external-sync-conflict');
    if (untouched) return null;
    throw new DeviceLocalVaultRecoveryError('EXTERNAL_SYNC_CONFLICT');
  }
  private async advanceForward(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    outcomeCode: DeviceLocalVaultRecoveryError['code'],
    deferCleanupFailure: boolean
  ) {
    const observation = await this.operations.observe(transaction, 'forward');
    if (observation.portableState !== 'proposal' || observation.privacyState !== 'forward')
      return this.compensate(
        transaction,
        isConflict(observation) ? 'EXTERNAL_SYNC_CONFLICT' : outcomeCode,
        false
      );
    const committed = withDeviceLocalVaultRecoveryPhase(transaction, {
      phase: 'forward-committed',
      portable: {
        ...transaction.portable,
        observedCommittedIdentity: transaction.portable.proposedIdentity
      },
      privacy: { ...transaction.privacy, observedForward: 'exact-target-readback' }
    });
    await this.recoveryStorage.replace(committed);
    return this.attemptLocalCommit(committed, observation, true, deferCleanupFailure);
  }
  private async attemptLocalCommit(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    observation: DeviceLocalVaultRecoveryObservation | undefined,
    allowWrite: boolean,
    deferCleanupFailure: boolean
  ) {
    const inflight =
      transaction.phase === 'forward-committed'
        ? withDeviceLocalVaultRecoveryPhase(transaction, { phase: 'local-commit-inflight' })
        : transaction;
    if (inflight !== transaction) await this.recoveryStorage.replace(inflight);
    const outcome = await this.localCommitter.execute(inflight, allowWrite);
    if (outcome.kind === 'committed') {
      try {
        await this.cleanup.execute(outcome.transaction);
      } catch (error) {
        if (!deferCleanupFailure) throw error;
        console.warn('[background] Local vault cleanup deferred after commit:', error);
      }
      return committedResult(observation);
    }
    const code = outcome.kind === 'third' ? 'EXTERNAL_SYNC_CONFLICT' : 'OPTIONS_STORAGE_FAILURE';
    return this.compensate(inflight, code, true);
  }
  private async compensate(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    code: RecoveryCode,
    bindingWriteMayHaveOccurred: boolean
  ): Promise<never> {
    const priorConflict = transaction.recovery?.outcomeCode === 'EXTERNAL_SYNC_CONFLICT';
    const recovery = {
      outcomeCode: priorConflict ? ('EXTERNAL_SYNC_CONFLICT' as const) : code,
      bindingWriteMayHaveOccurred
    };
    const compensating = withDeviceLocalVaultRecoveryPhase(transaction, {
      phase: 'compensating',
      recovery
    });
    await this.recoveryStorage.replace(compensating);
    const observation = await this.operations.compensate(compensating);
    if (observation.portableState === 'proposal' || observation.privacyState === 'forward') {
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    }
    const conflict =
      recovery.outcomeCode === 'EXTERNAL_SYNC_CONFLICT' ||
      observation.portableState === 'third' ||
      observation.privacyState === 'third';
    const restored = withDeviceLocalVaultRecoveryPhase(compensating, {
      phase: 'portable-privacy-restored',
      recovery: {
        outcomeCode: conflict ? 'EXTERNAL_SYNC_CONFLICT' : recovery.outcomeCode,
        bindingWriteMayHaveOccurred,
        portableRestoreEvidence:
          observation.portableState === 'preimage' ? 'preimage' : 'third-preserved',
        privacyRestoreEvidence:
          observation.privacyState === 'restore' ? 'restore-target' : 'third-preserved'
      }
    });
    await this.recoveryStorage.replace(restored);
    return this.finishBindingCompensation(restored);
  }
  private async finishBindingCompensation(
    transaction: DeviceLocalVaultRecoveryTransactionV3
  ): Promise<never> {
    const current = await this.recoveryStorage.readBindings();
    let code = transaction.recovery?.outcomeCode ?? 'OPTIONS_STORAGE_FAILURE';
    if (sameDeviceLocalVaultBindings(current, transaction.proposedBindings)) {
      if (transaction.recovery?.bindingWriteMayHaveOccurred)
        await this.recoveryStorage.writeBindingsVerified(transaction.previousBindings);
      else code = 'EXTERNAL_SYNC_CONFLICT';
    } else if (!sameDeviceLocalVaultBindings(current, transaction.previousBindings))
      code = 'EXTERNAL_SYNC_CONFLICT';
    await this.abort(
      transaction,
      code === 'EXTERNAL_SYNC_CONFLICT' ? 'external-sync-conflict' : 'local-commit-failed'
    );
    throw new DeviceLocalVaultRecoveryError(code);
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
    if (decoded.kind !== 'v3-transaction')
      throw new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE');
    return decoded.transaction;
  }
}
