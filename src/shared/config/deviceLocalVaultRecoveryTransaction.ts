import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
import type { PrivacyPreferencesOptions } from '../types/options';
import {
  OptionsMutationError,
  type OptionsMutationCommand
} from '../types/optionsMutationMessages';
import {
  DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM,
  decodeDeviceLocalVaultRecoveryRecord,
  portableOptionsIdentity
} from './deviceLocalVaultRecoveryCodec';

export { DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM, portableOptionsIdentity };
export const DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY = 'deviceLocalVaultCleanupJournal';
import {
  DEVICE_LOCAL_VAULT_RECOVERY_PROTOCOL,
  type DecodedDeviceLocalVaultRecoveryRecord,
  type DeviceLocalVaultBindingSnapshot,
  type DeviceLocalVaultRecoveryTransactionV3
} from './deviceLocalVaultRecoverySchema';
export {
  DEVICE_LOCAL_VAULT_RECOVERY_PROTOCOL,
  type DeviceLocalVaultBinding,
  type DeviceLocalVaultBindingSnapshot,
  type DeviceLocalVaultPortableEvidenceV2,
  type DeviceLocalVaultRecoveryTransactionV2,
  type DeviceLocalVaultRecoveryPhaseV3,
  type DeviceLocalVaultRecoveryTransactionV3,
  type DeviceLocalVaultRecoveryTransaction
} from './deviceLocalVaultRecoverySchema';

export interface DeviceLocalVaultBindingRepository {
  readVaultBindings(): Promise<DeviceLocalVaultBindingSnapshot>;
  writeVaultBindings(snapshot: DeviceLocalVaultBindingSnapshot): Promise<void>;
}
export interface OptionsRawStorageRepository {
  readRaw(): Promise<PlainStructuredValue | null>;
  writeRaw(value: PlainStructuredObject): Promise<void>;
}
export type OptionsMutationVerification =
  | { readonly kind: 'full'; readonly expected: PlainStructuredObject }
  | {
      readonly kind: 'paths';
      readonly expected: ReadonlyArray<{
        readonly path: readonly string[];
        readonly value: PlainStructuredValue | undefined;
      }>;
    };

export interface DeviceLocalVaultPortableAttempt {
  readonly portablePreimage: PlainStructuredObject;
  readonly portableProposal: PlainStructuredObject;
  readonly writeRequired: boolean;
  readonly verification: OptionsMutationVerification;
  readonly privacyRestoreTarget: PrivacyPreferencesOptions;
  readonly privacyForwardTarget: PrivacyPreferencesOptions;
  readonly privacyWriteRequired: boolean;
}
export interface DeviceLocalVaultRecoveryObservation {
  readonly portableState: 'proposal' | 'preimage' | 'third';
  readonly privacyState: 'forward' | 'restore' | 'third';
  readonly portableRaw: PlainStructuredObject;
  readonly privacy: PrivacyPreferencesOptions;
}
export interface DeviceLocalPrivacyCommitter {
  recover?(): Promise<void>;
  execute(
    command: OptionsMutationCommand,
    applyCommand: (
      raw: PlainStructuredObject,
      command: OptionsMutationCommand
    ) => { next: PlainStructuredObject; verification: OptionsMutationVerification },
    quotaBytesPerItem: number,
    lifecycle?: {
      beforePortableDecision(attempt: DeviceLocalVaultPortableAttempt): Promise<void>;
      beforeForwardMutation(): Promise<boolean>;
    }
  ): Promise<{
    raw: PlainStructuredObject;
    privacy?: PrivacyPreferencesOptions;
    didWrite: boolean;
  }>;
  observe?(
    transaction: DeviceLocalVaultRecoveryTransactionV3,
    direction: 'forward' | 'restore'
  ): Promise<DeviceLocalVaultRecoveryObservation>;
  compensate?(
    transaction: DeviceLocalVaultRecoveryTransactionV3
  ): Promise<DeviceLocalVaultRecoveryObservation>;
}

export class DeviceLocalVaultRecoveryError extends Error {
  constructor(readonly code: 'OPTIONS_STORAGE_FAILURE' | 'EXTERNAL_SYNC_CONFLICT') {
    super(code);
    this.name = 'DeviceLocalVaultRecoveryError';
  }
}
export const asOptionsMutationError = <T>(error: T) =>
  error instanceof OptionsMutationError
    ? error
    : new OptionsMutationError(
        error instanceof DeviceLocalVaultRecoveryError ? error.code : 'OPTIONS_STORAGE_FAILURE'
      );
export const deviceLocalVaultRecoveryCode = <T>(error: T) =>
  error instanceof OptionsMutationError && error.code === 'EXTERNAL_SYNC_CONFLICT'
    ? 'EXTERNAL_SYNC_CONFLICT'
    : 'OPTIONS_STORAGE_FAILURE';
export const withDeviceLocalVaultRecoveryPhase = (
  transaction: DeviceLocalVaultRecoveryTransactionV3,
  update: Partial<DeviceLocalVaultRecoveryTransactionV3>
): DeviceLocalVaultRecoveryTransactionV3 => ({ ...transaction, ...update });

export async function decodeDeviceLocalVaultRecoveryTransaction<T>(
  value: T
): Promise<DecodedDeviceLocalVaultRecoveryRecord> {
  const decoded = decodeDeviceLocalVaultRecoveryRecord(value);
  if (
    decoded.kind === 'v3-transaction' &&
    (await portableOptionsIdentity(decoded.transaction.portable.preimage)) !==
      decoded.transaction.portable.preimageIdentity
  )
    return { kind: 'invalid' };
  return decoded;
}

export async function createPreparedDeviceLocalVaultRecoveryTransaction(input: {
  readonly transactionId: string;
  readonly previousBindings: DeviceLocalVaultBindingSnapshot;
  readonly proposedBindings: DeviceLocalVaultBindingSnapshot;
  readonly portablePreimage: PlainStructuredObject;
  readonly portableProposal: PlainStructuredObject;
  readonly writeRequired: boolean;
  readonly privacyRestoreTarget: PrivacyPreferencesOptions;
  readonly privacyForwardTarget: PrivacyPreferencesOptions;
  readonly privacyWriteRequired: boolean;
}): Promise<DeviceLocalVaultRecoveryTransactionV3> {
  const proposedIds = new Set(
    Object.values(input.proposedBindings.bindings).map(({ folderId }) => folderId)
  );
  const cleanupCandidates = [
    ...new Set(
      Object.values(input.previousBindings.bindings)
        .map(({ folderId }) => folderId)
        .filter((id) => !proposedIds.has(id))
    )
  ];
  const transaction: DeviceLocalVaultRecoveryTransactionV3 = {
    version: 3,
    protocol: DEVICE_LOCAL_VAULT_RECOVERY_PROTOCOL,
    transactionId: input.transactionId,
    phase: 'prepared',
    previousBindings: structuredClone(input.previousBindings),
    proposedBindings: structuredClone(input.proposedBindings),
    cleanupCandidates,
    remainingCleanupCandidates: cleanupCandidates,
    portable: {
      identityAlgorithm: DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM,
      preimage: structuredClone(input.portablePreimage),
      preimageIdentity: await portableOptionsIdentity(input.portablePreimage),
      proposedIdentity: await portableOptionsIdentity(input.portableProposal),
      writeRequired: input.writeRequired
    },
    privacy: {
      restoreTarget: structuredClone(input.privacyRestoreTarget),
      forwardTarget: structuredClone(input.privacyForwardTarget),
      writeRequired: input.privacyWriteRequired
    }
  };
  if ((await decodeDeviceLocalVaultRecoveryTransaction(transaction)).kind !== 'v3-transaction')
    throw new Error('DEVICE_LOCAL_VAULT_TRANSACTION_INVALID');
  return transaction;
}
