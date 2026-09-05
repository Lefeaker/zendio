import { snapshotPlainStructuredData } from './losslessObjectBoundary';
import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
import {
  DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM,
  DEVICE_LOCAL_VAULT_RECOVERY_PROTOCOL,
  recoveryRecord as record,
  recoveryClosed as closed,
  recoveryBounded,
  decodeRecoveryBindings,
  decodeRecoveryIds,
  type RecoveryCommon,
  type DeviceLocalVaultBindingSnapshot,
  decodeRecoveryPortableFields,
  decodeRecoveryPrivacy,
  decodeRecoveryEvidence,
  type DecodedDeviceLocalVaultRecoveryRecord,
  type DeviceLocalVaultRecoveryTransactionV2,
  type DeviceLocalVaultRecoveryTransactionV3
} from './deviceLocalVaultRecoverySchema';
export { DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM, type DecodedDeviceLocalVaultRecoveryRecord };

function canonicalJson(value: PlainStructuredValue): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (!record(value)) return JSON.stringify(value);
  return (
    '{' +
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item))
      .join(',') +
    '}'
  );
}
export async function portableOptionsIdentity(raw: PlainStructuredObject): Promise<string> {
  const snapshot = snapshotPlainStructuredData(raw, { maxUtf8Bytes: 8_192 });
  if (!snapshot.ok || !record(snapshot.value)) throw new Error('PORTABLE_IDENTITY_INVALID');
  if (!globalThis.crypto?.subtle) throw new Error('PORTABLE_IDENTITY_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(snapshot.value))
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
const portableShape =
  'identityAlgorithm preimageIdentity proposedIdentity writeRequired observedCommittedIdentity?';
function decodePortableV2(value: PlainStructuredValue | undefined) {
  return record(value) && closed(value, portableShape) ? decodeRecoveryPortableFields(value) : null;
}
function decodePortableV3(value: PlainStructuredValue | undefined) {
  if (!record(value) || !closed(value, portableShape + ' preimage')) return null;
  const fields = decodeRecoveryPortableFields(value);
  const snapshot = snapshotPlainStructuredData(value.preimage, { maxUtf8Bytes: 8_192 });
  return fields && snapshot.ok && record(snapshot.value)
    ? { ...fields, preimage: snapshot.value }
    : null;
}
const v2Phase = (
  value: PlainStructuredValue | undefined
): value is DeviceLocalVaultRecoveryTransactionV2['phase'] =>
  value === 'prepared' ||
  value === 'portable-committed' ||
  value === 'local-committed' ||
  value === 'cleanup-complete' ||
  value === 'aborted';
const v2Abort = (
  value: PlainStructuredValue | undefined
): value is NonNullable<DeviceLocalVaultRecoveryTransactionV2['abortReason']> =>
  value === 'portable-not-committed' ||
  value === 'external-sync-conflict' ||
  value === 'invalid-legacy';
const v3Phase = (
  value: PlainStructuredValue | undefined
): value is DeviceLocalVaultRecoveryTransactionV3['phase'] =>
  value === 'prepared' ||
  value === 'forward-inflight' ||
  value === 'forward-committed' ||
  value === 'local-commit-inflight' ||
  value === 'compensating' ||
  value === 'portable-privacy-restored' ||
  value === 'local-committed' ||
  value === 'cleanup-complete' ||
  value === 'aborted';
const v3Abort = (
  value: PlainStructuredValue | undefined
): value is NonNullable<DeviceLocalVaultRecoveryTransactionV3['abortReason']> =>
  value === 'forward-not-started' ||
  value === 'forward-not-committed' ||
  value === 'local-commit-failed' ||
  value === 'external-sync-conflict' ||
  value === 'invalid-legacy';
function decodeRecoveryCommon(value: PlainStructuredObject): RecoveryCommon | null {
  const previousBindings = decodeRecoveryBindings(value.previousBindings);
  const proposedBindings = decodeRecoveryBindings(value.proposedBindings);
  const cleanupCandidates = decodeRecoveryIds(value.cleanupCandidates);
  const remainingCleanupCandidates = decodeRecoveryIds(value.remainingCleanupCandidates);
  if (
    !recoveryBounded(value.transactionId, 128) ||
    !previousBindings ||
    !proposedBindings ||
    !cleanupCandidates ||
    !remainingCleanupCandidates ||
    !remainingCleanupCandidates.every((id) => cleanupCandidates.includes(id))
  )
    return null;
  // Legacy validation used ordinary-object assignment, excluding the __proto__ setter key.
  const ids = (snapshot: DeviceLocalVaultBindingSnapshot) =>
    new Set(
      Object.entries(snapshot.bindings)
        .filter(([id]) => id !== '__proto__')
        .map(([, binding]) => binding.folderId)
    );
  const previousIds = ids(previousBindings);
  const proposedIds = ids(proposedBindings);
  if (cleanupCandidates.some((id) => !previousIds.has(id) || proposedIds.has(id))) return null;
  return {
    transactionId: value.transactionId,
    previousBindings,
    proposedBindings,
    cleanupCandidates,
    remainingCleanupCandidates
  };
}
function decodeV2(value: PlainStructuredObject): DecodedDeviceLocalVaultRecoveryRecord {
  if (
    !closed(
      value,
      'version transactionId phase previousBindings proposedBindings cleanupCandidates remainingCleanupCandidates portable abortReason?'
    )
  )
    return { kind: 'invalid' };
  const common = decodeRecoveryCommon(value);
  const portable = decodePortableV2(value.portable);
  if (!common || !portable || !v2Phase(value.phase)) return { kind: 'invalid' };
  const observed = portable.observedCommittedIdentity;
  if (value.phase === 'prepared' && observed !== undefined) return { kind: 'invalid' };
  if (!['prepared', 'aborted'].includes(value.phase) && observed !== portable.proposedIdentity)
    return { kind: 'invalid' };
  if (value.phase === 'cleanup-complete' && common.remainingCleanupCandidates.length > 0)
    return { kind: 'invalid' };
  const abortReason = value.abortReason;
  if (abortReason !== undefined && !v2Abort(abortReason)) return { kind: 'invalid' };
  if (value.phase === 'aborted' ? abortReason === undefined : abortReason !== undefined)
    return { kind: 'invalid' };
  return {
    kind: 'legacy-v2-transaction',
    transaction: {
      version: 2,
      ...common,
      phase: value.phase,
      portable,
      ...(abortReason === undefined ? {} : { abortReason })
    }
  };
}
function decodeV3(value: PlainStructuredObject): DecodedDeviceLocalVaultRecoveryRecord {
  if (
    !closed(
      value,
      'version protocol transactionId phase previousBindings proposedBindings cleanupCandidates remainingCleanupCandidates portable privacy recovery? abortReason?'
    ) ||
    value.protocol !== DEVICE_LOCAL_VAULT_RECOVERY_PROTOCOL
  )
    return { kind: 'invalid' };
  const common = decodeRecoveryCommon(value);
  const portable = decodePortableV3(value.portable);
  const privacy = decodeRecoveryPrivacy(value.privacy);
  if (!common || !portable || !privacy || !v3Phase(value.phase)) return { kind: 'invalid' };
  const phase = value.phase;
  const forwardProof =
    portable.observedCommittedIdentity === portable.proposedIdentity &&
    privacy.observedForward === 'exact-target-readback';
  if (
    ['prepared', 'forward-inflight'].includes(phase) &&
    (portable.observedCommittedIdentity !== undefined || privacy.observedForward !== undefined)
  )
    return { kind: 'invalid' };
  if (
    ['forward-committed', 'local-commit-inflight', 'local-committed', 'cleanup-complete'].includes(
      phase
    ) &&
    !forwardProof
  )
    return { kind: 'invalid' };
  const recovery = value.recovery === undefined ? null : decodeRecoveryEvidence(value.recovery);
  if (value.recovery !== undefined && !recovery) return { kind: 'invalid' };
  if (phase === 'compensating' && !recovery) return { kind: 'invalid' };
  if (
    phase === 'portable-privacy-restored' &&
    (!recovery?.portableRestoreEvidence || !recovery.privacyRestoreEvidence)
  )
    return { kind: 'invalid' };
  if (!['compensating', 'portable-privacy-restored', 'aborted'].includes(phase) && recovery)
    return { kind: 'invalid' };
  if (phase === 'cleanup-complete' && common.remainingCleanupCandidates.length > 0)
    return { kind: 'invalid' };
  const abortReason = value.abortReason;
  if (abortReason !== undefined && !v3Abort(abortReason)) return { kind: 'invalid' };
  if (phase === 'aborted' ? abortReason === undefined : abortReason !== undefined)
    return { kind: 'invalid' };
  return {
    kind: 'v3-transaction',
    transaction: {
      version: 3,
      protocol: DEVICE_LOCAL_VAULT_RECOVERY_PROTOCOL,
      ...common,
      phase,
      portable,
      privacy,
      ...(recovery ? { recovery } : {}),
      ...(abortReason === undefined ? {} : { abortReason })
    }
  };
}
export function decodeDeviceLocalVaultRecoveryRecord<T>(
  value: T
): DecodedDeviceLocalVaultRecoveryRecord {
  const snapshot = snapshotPlainStructuredData(value, { maxUtf8Bytes: 131_072 });
  if (!snapshot.ok || !record(snapshot.value)) return { kind: 'invalid' };
  if (snapshot.value.version === 1 && Array.isArray(snapshot.value.folderIds))
    return { kind: 'legacy-unproven' };
  if (snapshot.value.version === 2) return decodeV2(snapshot.value);
  if (snapshot.value.version === 3 && snapshot.value.protocol === undefined)
    return { kind: 'legacy-v3-unproven' };
  if (snapshot.value.version === 3) return decodeV3(snapshot.value);
  return { kind: 'invalid' };
}
