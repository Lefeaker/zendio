import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
import type { PrivacyPreferencesOptions } from '../types/options';

export const DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM = 'sha256-canonical-plain-json-v1';
export const DEVICE_LOCAL_VAULT_RECOVERY_PROTOCOL = 'forward-privacy-v1';
export interface DeviceLocalVaultBinding {
  readonly folderId: string;
  readonly folderName: string;
}
export interface DeviceLocalVaultBindingSnapshot {
  readonly version: 1;
  readonly bindings: Readonly<Record<string, DeviceLocalVaultBinding>>;
}
export interface DeviceLocalVaultPortableEvidenceV2 {
  readonly identityAlgorithm: typeof DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM;
  readonly preimageIdentity: string;
  readonly proposedIdentity: string;
  readonly observedCommittedIdentity?: string;
  readonly writeRequired: boolean;
}
export interface RecoveryCommon {
  readonly transactionId: string;
  readonly previousBindings: DeviceLocalVaultBindingSnapshot;
  readonly proposedBindings: DeviceLocalVaultBindingSnapshot;
  readonly cleanupCandidates: readonly string[];
  readonly remainingCleanupCandidates: readonly string[];
}
export interface DeviceLocalVaultRecoveryTransactionV2 extends RecoveryCommon {
  readonly version: 2;
  readonly phase:
    | 'prepared'
    | 'portable-committed'
    | 'local-committed'
    | 'cleanup-complete'
    | 'aborted';
  readonly portable: DeviceLocalVaultPortableEvidenceV2;
  readonly abortReason?: 'portable-not-committed' | 'external-sync-conflict' | 'invalid-legacy';
}
export type DeviceLocalVaultRecoveryPhaseV3 =
  | 'prepared'
  | 'forward-inflight'
  | 'forward-committed'
  | 'portable-committed'
  | 'local-commit-inflight'
  | 'compensating'
  | 'portable-privacy-restored'
  | 'local-committed'
  | 'cleanup-complete'
  | 'aborted';
export interface DeviceLocalVaultRecoveryTransactionV3 extends RecoveryCommon {
  readonly version: 3;
  readonly protocol: typeof DEVICE_LOCAL_VAULT_RECOVERY_PROTOCOL;
  readonly phase: DeviceLocalVaultRecoveryPhaseV3;
  readonly portable: DeviceLocalVaultPortableEvidenceV2 & {
    readonly preimage: PlainStructuredObject;
  };
  readonly privacy: {
    readonly restoreTarget: PrivacyPreferencesOptions;
    readonly forwardTarget: PrivacyPreferencesOptions;
    readonly writeRequired: boolean;
    readonly observedForward?: 'exact-target-readback';
  };
  readonly recovery?: {
    readonly outcomeCode: 'OPTIONS_STORAGE_FAILURE' | 'EXTERNAL_SYNC_CONFLICT';
    readonly bindingWriteMayHaveOccurred: boolean;
    readonly portableRestoreEvidence?: 'preimage' | 'third-preserved';
    readonly privacyRestoreEvidence?: 'restore-target' | 'third-preserved';
  };
  readonly abortReason?:
    | 'forward-not-started'
    | 'forward-not-committed'
    | 'local-commit-failed'
    | 'external-sync-conflict'
    | 'invalid-legacy';
}
export type DeviceLocalVaultRecoveryTransaction =
  | DeviceLocalVaultRecoveryTransactionV2
  | DeviceLocalVaultRecoveryTransactionV3;
export type DecodedDeviceLocalVaultRecoveryRecord =
  | { readonly kind: 'v3-transaction'; readonly transaction: DeviceLocalVaultRecoveryTransactionV3 }
  | {
      readonly kind: 'legacy-v2-transaction';
      readonly transaction: DeviceLocalVaultRecoveryTransactionV2;
    }
  | { readonly kind: 'legacy-v3-unproven' | 'legacy-unproven' | 'invalid' };
type Value = PlainStructuredValue | undefined;
type V3 = DeviceLocalVaultRecoveryTransactionV3;
export const recoveryRecord = (value: Value): value is PlainStructuredObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const recoveryClosed = (value: PlainStructuredObject, shape: string): boolean => {
  const keys = shape.split(' ');
  const names = keys.map((key) => key.replace(/\?$/u, ''));
  return (
    Object.keys(value).every((key) => names.includes(key)) &&
    keys.every((key) => key.endsWith('?') || key in value)
  );
};
export const recoveryBounded = (value: Value, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
export const recoveryIdentity = (value: Value): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
export function decodeRecoveryBindings(value: Value): DeviceLocalVaultBindingSnapshot | null {
  if (
    !recoveryRecord(value) ||
    !recoveryClosed(value, 'version bindings') ||
    value.version !== 1 ||
    !recoveryRecord(value.bindings) ||
    Object.keys(value.bindings).length > 100
  )
    return null;
  const bindings: Record<string, DeviceLocalVaultBinding> = {};
  for (const [vaultId, candidate] of Object.entries(value.bindings)) {
    if (
      !recoveryBounded(vaultId, 256) ||
      !recoveryRecord(candidate) ||
      !recoveryClosed(candidate, 'folderId folderName') ||
      !recoveryBounded(candidate.folderId, 256) ||
      !recoveryBounded(candidate.folderName, 512)
    )
      return null;
    Object.defineProperty(bindings, vaultId, {
      value: { folderId: candidate.folderId, folderName: candidate.folderName },
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return { version: 1, bindings };
}
export function decodeRecoveryIds(value: Value): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ids = value.filter((item): item is string => recoveryBounded(item, 256));
  return ids.length === value.length && new Set(ids).size === ids.length ? ids : null;
}
export function decodeRecoveryPortableFields(
  value: PlainStructuredObject
): DeviceLocalVaultPortableEvidenceV2 | null {
  if (
    value.identityAlgorithm !== DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM ||
    !recoveryIdentity(value.preimageIdentity) ||
    !recoveryIdentity(value.proposedIdentity) ||
    typeof value.writeRequired !== 'boolean' ||
    (!value.writeRequired && value.preimageIdentity !== value.proposedIdentity) ||
    (value.observedCommittedIdentity !== undefined &&
      !recoveryIdentity(value.observedCommittedIdentity))
  )
    return null;
  return {
    identityAlgorithm: DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM,
    preimageIdentity: value.preimageIdentity,
    proposedIdentity: value.proposedIdentity,
    writeRequired: value.writeRequired,
    ...(value.observedCommittedIdentity === undefined
      ? {}
      : { observedCommittedIdentity: value.observedCommittedIdentity })
  };
}
function decodePrivacyTarget(value: Value): PrivacyPreferencesOptions | null {
  if (
    !recoveryRecord(value) ||
    !recoveryClosed(value, 'analytics errorReporting debugMode') ||
    typeof value.analytics !== 'boolean' ||
    typeof value.errorReporting !== 'boolean' ||
    typeof value.debugMode !== 'boolean'
  )
    return null;
  return {
    analytics: value.analytics,
    errorReporting: value.errorReporting,
    debugMode: value.debugMode
  };
}
export function decodeRecoveryPrivacy(value: Value): V3['privacy'] | null {
  if (
    !recoveryRecord(value) ||
    !recoveryClosed(value, 'restoreTarget forwardTarget writeRequired observedForward?')
  )
    return null;
  const restoreTarget = decodePrivacyTarget(value.restoreTarget);
  const forwardTarget = decodePrivacyTarget(value.forwardTarget);
  if (
    !restoreTarget ||
    !forwardTarget ||
    typeof value.writeRequired !== 'boolean' ||
    (!value.writeRequired &&
      (restoreTarget.analytics !== forwardTarget.analytics ||
        restoreTarget.errorReporting !== forwardTarget.errorReporting ||
        restoreTarget.debugMode !== forwardTarget.debugMode)) ||
    (value.observedForward !== undefined && value.observedForward !== 'exact-target-readback')
  )
    return null;
  return {
    restoreTarget,
    forwardTarget,
    writeRequired: value.writeRequired,
    ...(value.observedForward === undefined ? {} : { observedForward: value.observedForward })
  };
}
export function decodeRecoveryEvidence(value: Value): V3['recovery'] | null {
  if (
    !recoveryRecord(value) ||
    !recoveryClosed(
      value,
      'outcomeCode bindingWriteMayHaveOccurred portableRestoreEvidence? privacyRestoreEvidence?'
    ) ||
    (value.outcomeCode !== 'OPTIONS_STORAGE_FAILURE' &&
      value.outcomeCode !== 'EXTERNAL_SYNC_CONFLICT') ||
    typeof value.bindingWriteMayHaveOccurred !== 'boolean' ||
    (value.portableRestoreEvidence !== undefined &&
      value.portableRestoreEvidence !== 'preimage' &&
      value.portableRestoreEvidence !== 'third-preserved') ||
    (value.privacyRestoreEvidence !== undefined &&
      value.privacyRestoreEvidence !== 'restore-target' &&
      value.privacyRestoreEvidence !== 'third-preserved')
  )
    return null;
  return {
    outcomeCode: value.outcomeCode,
    bindingWriteMayHaveOccurred: value.bindingWriteMayHaveOccurred,
    ...(value.portableRestoreEvidence === undefined
      ? {}
      : { portableRestoreEvidence: value.portableRestoreEvidence }),
    ...(value.privacyRestoreEvidence === undefined
      ? {}
      : { privacyRestoreEvidence: value.privacyRestoreEvidence })
  };
}
