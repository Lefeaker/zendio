import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
import type { PrivacyPreferencesOptions } from '../types/options';
import type { OptionsMutationCommand } from '../types/optionsMutationMessages';
import {
  DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM,
  decodeDeviceLocalVaultRecoveryRecord,
  portableOptionsIdentity
} from './deviceLocalVaultRecoveryCodec';

export { DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM, portableOptionsIdentity };
export const DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY = 'deviceLocalVaultCleanupJournal';

export interface DeviceLocalVaultBinding {
  readonly folderId: string;
  readonly folderName: string;
}

export interface DeviceLocalVaultBindingSnapshot {
  readonly version: 1;
  readonly bindings: Readonly<Record<string, DeviceLocalVaultBinding>>;
}

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
  readonly privacyTarget: PrivacyPreferencesOptions;
  readonly privacyWriteRequired: boolean;
}

export interface DeviceLocalVaultCompensationRequest {
  readonly portablePreimage: PlainStructuredObject;
  readonly preimageIdentity: string;
  readonly proposedIdentity: string;
  readonly privacyTarget: PrivacyPreferencesOptions;
  readonly privacyRestoreRequired: boolean;
}

export interface DeviceLocalVaultRecoveryOperations {
  readonly readPortableRaw: () => Promise<PlainStructuredObject>;
  readonly writeBindings: (snapshot: DeviceLocalVaultBindingSnapshot) => Promise<void>;
  readonly compensate?: (request: DeviceLocalVaultCompensationRequest) => Promise<{
    readonly portableState: 'proposal' | 'preimage' | 'third';
  }>;
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
    }
  ): Promise<{
    raw: PlainStructuredObject;
    privacy?: PrivacyPreferencesOptions;
    didWrite: boolean;
  }>;
  compensate?(request: DeviceLocalVaultCompensationRequest): Promise<{
    readonly portableState: 'proposal' | 'preimage' | 'third';
  }>;
}

export interface DeviceLocalVaultPortableEvidenceV2 {
  readonly identityAlgorithm: typeof DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM;
  readonly preimageIdentity: string;
  readonly proposedIdentity: string;
  readonly observedCommittedIdentity?: string;
  readonly writeRequired: boolean;
}

export interface DeviceLocalVaultRecoveryTransactionV2 {
  readonly version: 2;
  readonly transactionId: string;
  readonly phase:
    | 'prepared'
    | 'portable-committed'
    | 'local-committed'
    | 'cleanup-complete'
    | 'aborted';
  readonly previousBindings: DeviceLocalVaultBindingSnapshot;
  readonly proposedBindings: DeviceLocalVaultBindingSnapshot;
  readonly cleanupCandidates: readonly string[];
  readonly remainingCleanupCandidates: readonly string[];
  readonly portable: DeviceLocalVaultPortableEvidenceV2;
  readonly abortReason?: 'portable-not-committed' | 'external-sync-conflict' | 'invalid-legacy';
}

export type DeviceLocalVaultRecoveryPhaseV3 =
  | 'prepared'
  | 'portable-committed'
  | 'local-commit-inflight'
  | 'compensating'
  | 'portable-privacy-restored'
  | 'local-committed'
  | 'cleanup-complete'
  | 'aborted';

export interface DeviceLocalVaultRecoveryTransactionV3 {
  readonly version: 3;
  readonly transactionId: string;
  readonly phase: DeviceLocalVaultRecoveryPhaseV3;
  readonly previousBindings: DeviceLocalVaultBindingSnapshot;
  readonly proposedBindings: DeviceLocalVaultBindingSnapshot;
  readonly cleanupCandidates: readonly string[];
  readonly remainingCleanupCandidates: readonly string[];
  readonly portable: {
    readonly identityAlgorithm: typeof DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM;
    readonly preimage: PlainStructuredObject;
    readonly preimageIdentity: string;
    readonly proposedIdentity: string;
    readonly observedCommittedIdentity?: string;
    readonly writeRequired: boolean;
  };
  readonly privacy: {
    readonly restoreRequired: boolean;
    readonly target: PrivacyPreferencesOptions;
  };
  readonly failureCode?: 'OPTIONS_STORAGE_FAILURE';
  readonly abortReason?:
    | 'portable-not-committed'
    | 'local-commit-failed'
    | 'external-sync-conflict'
    | 'invalid-legacy';
}

export type DeviceLocalVaultRecoveryTransaction =
  | DeviceLocalVaultRecoveryTransactionV2
  | DeviceLocalVaultRecoveryTransactionV3;

export class DeviceLocalVaultRecoveryError extends Error {
  constructor(readonly code: 'OPTIONS_STORAGE_FAILURE' | 'EXTERNAL_SYNC_CONFLICT') {
    super(code);
    this.name = 'DeviceLocalVaultRecoveryError';
  }
}

export const withDeviceLocalVaultRecoveryPhase = (
  transaction: DeviceLocalVaultRecoveryTransactionV3,
  update: Partial<DeviceLocalVaultRecoveryTransactionV3>
): DeviceLocalVaultRecoveryTransactionV3 => ({ ...transaction, ...update });

export async function decodeDeviceLocalVaultRecoveryTransaction(value: unknown) {
  const decoded = decodeDeviceLocalVaultRecoveryRecord(value);
  if (decoded.kind === 'v3-transaction') {
    const transaction = decoded.transaction as unknown as DeviceLocalVaultRecoveryTransactionV3;
    if (
      (await portableOptionsIdentity(transaction.portable.preimage)) !==
      transaction.portable.preimageIdentity
    )
      return { kind: 'invalid' } as const;
    return { kind: decoded.kind, transaction } as const;
  }
  if (decoded.kind === 'legacy-v2-transaction') {
    return {
      kind: decoded.kind,
      transaction: decoded.transaction as unknown as DeviceLocalVaultRecoveryTransactionV2
    } as const;
  }
  return decoded;
}

export async function createPreparedDeviceLocalVaultRecoveryTransaction(input: {
  readonly transactionId: string;
  readonly previousBindings: DeviceLocalVaultBindingSnapshot;
  readonly proposedBindings: DeviceLocalVaultBindingSnapshot;
  readonly portablePreimage: PlainStructuredObject;
  readonly portableProposal: PlainStructuredObject;
  readonly writeRequired: boolean;
  readonly privacyTarget: PrivacyPreferencesOptions;
  readonly privacyWriteRequired: boolean;
}): Promise<DeviceLocalVaultRecoveryTransactionV3> {
  const proposedIds = new Set(
    Object.values(input.proposedBindings.bindings).map(({ folderId }) => folderId)
  );
  const cleanupCandidates = [
    ...new Set(
      Object.values(input.previousBindings.bindings)
        .map(({ folderId }) => folderId)
        .filter((folderId) => !proposedIds.has(folderId))
    )
  ];
  const transaction: DeviceLocalVaultRecoveryTransactionV3 = {
    version: 3,
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
      restoreRequired: input.privacyWriteRequired,
      target: structuredClone(input.privacyTarget)
    }
  };
  const decoded = await decodeDeviceLocalVaultRecoveryTransaction(transaction);
  if (decoded.kind !== 'v3-transaction') {
    throw new Error('DEVICE_LOCAL_VAULT_TRANSACTION_INVALID');
  }
  return transaction;
}
