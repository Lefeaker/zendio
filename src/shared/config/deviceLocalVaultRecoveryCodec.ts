import { snapshotPlainStructuredData } from './losslessObjectBoundary';
import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
export const DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM = 'sha256-canonical-plain-json-v1';
const PROTOCOL = 'forward-privacy-v1';
export type DecodedDeviceLocalVaultRecoveryRecord =
  | { readonly kind: 'v3-transaction'; readonly transaction: Record<string, unknown> }
  | { readonly kind: 'legacy-v2-transaction'; readonly transaction: Record<string, unknown> }
  | { readonly kind: 'legacy-v3-unproven' | 'legacy-unproven' | 'invalid' };
const MAX_BINDINGS = 100;
const MAX_ID_LENGTH = 256;
const IDENTITY = /^[0-9a-f]{64}$/u;
const V2_PHASES = /^(prepared|portable-committed|local-committed|cleanup-complete|aborted)$/u;
const V3_PHASES =
  /^(prepared|forward-inflight|forward-committed|local-commit-inflight|compensating|portable-privacy-restored|local-committed|cleanup-complete|aborted)$/u;
const V2_ABORTS = /^(portable-not-committed|external-sync-conflict|invalid-legacy)$/u;
const V3_ABORTS =
  /^(forward-not-started|forward-not-committed|local-commit-failed|external-sync-conflict|invalid-legacy)$/u;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const closed = (value: Record<string, unknown>, shape: string) => {
  const keys = shape.split(' ');
  const names = keys.map((key) => key.replace(/\?$/u, ''));
  return (
    Object.keys(value).every((key) => names.includes(key)) &&
    keys.every((key) => key.endsWith('?') || key in value)
  );
};
const bounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
function canonicalJson(value: PlainStructuredValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!record(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as PlainStructuredValue)}`)
    .join(',')}}`;
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
function decodeBindings(value: unknown) {
  if (
    !record(value) ||
    !closed(value, 'version bindings') ||
    value.version !== 1 ||
    !record(value.bindings)
  )
    return null;
  if (Object.keys(value.bindings).length > MAX_BINDINGS) return null;
  const bindings: Record<string, { folderId: string; folderName: string }> = {};
  for (const [vaultId, candidate] of Object.entries(value.bindings)) {
    if (
      !bounded(vaultId, MAX_ID_LENGTH) ||
      !record(candidate) ||
      !closed(candidate, 'folderId folderName')
    )
      return null;
    if (!bounded(candidate.folderId, MAX_ID_LENGTH) || !bounded(candidate.folderName, 512))
      return null;
    bindings[vaultId] = { folderId: candidate.folderId, folderName: candidate.folderName };
  }
  return bindings;
}
function decodeIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_BINDINGS) return null;
  const ids = value.filter((item): item is string => bounded(item, MAX_ID_LENGTH));
  return ids.length === value.length && new Set(ids).size === ids.length ? ids : null;
}
function common(value: Record<string, unknown>) {
  const previous = decodeBindings(value.previousBindings);
  const proposed = decodeBindings(value.proposedBindings);
  const cleanup = decodeIds(value.cleanupCandidates);
  const remaining = decodeIds(value.remainingCleanupCandidates);
  if (
    !bounded(value.transactionId, 128) ||
    !previous ||
    !proposed ||
    !cleanup ||
    !remaining ||
    !remaining.every((id) => cleanup.includes(id))
  )
    return null;
  const previousIds = new Set(Object.values(previous).map(({ folderId }) => folderId));
  const proposedIds = new Set(Object.values(proposed).map(({ folderId }) => folderId));
  return cleanup.some((id) => !previousIds.has(id) || proposedIds.has(id)) ? null : remaining;
}
function portable(value: unknown, withPreimage: boolean) {
  if (
    !record(value) ||
    !closed(
      value,
      `identityAlgorithm preimageIdentity proposedIdentity writeRequired${withPreimage ? ' preimage' : ''} observedCommittedIdentity?`
    )
  )
    return null;
  if (
    value.identityAlgorithm !== DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM ||
    !IDENTITY.test(String(value.preimageIdentity)) ||
    !IDENTITY.test(String(value.proposedIdentity)) ||
    typeof value.writeRequired !== 'boolean'
  )
    return null;
  if (!value.writeRequired && value.preimageIdentity !== value.proposedIdentity) return null;
  if (
    value.observedCommittedIdentity !== undefined &&
    !IDENTITY.test(String(value.observedCommittedIdentity))
  )
    return null;
  if (withPreimage) {
    const snapshot = snapshotPlainStructuredData(value.preimage, { maxUtf8Bytes: 8_192 });
    if (!snapshot.ok || !record(snapshot.value)) return null;
  }
  return value;
}
const privacyTarget = (value: unknown) =>
  record(value) &&
  closed(value, 'analytics errorReporting debugMode') &&
  Object.values(value).every((item) => typeof item === 'boolean');
const samePrivacy = (left: Record<string, unknown>, right: Record<string, unknown>) =>
  left.analytics === right.analytics &&
  left.errorReporting === right.errorReporting &&
  left.debugMode === right.debugMode;
function decodeV2(value: Record<string, unknown>): DecodedDeviceLocalVaultRecoveryRecord {
  if (
    !closed(
      value,
      'version transactionId phase previousBindings proposedBindings cleanupCandidates remainingCleanupCandidates portable abortReason?'
    )
  )
    return { kind: 'invalid' };
  const remaining = common(value);
  const proof = portable(value.portable, false);
  if (!remaining || !proof || !V2_PHASES.test(String(value.phase))) return { kind: 'invalid' };
  const observed = proof.observedCommittedIdentity;
  if (value.phase === 'prepared' && observed !== undefined) return { kind: 'invalid' };
  if (!['prepared', 'aborted'].includes(String(value.phase)) && observed !== proof.proposedIdentity)
    return { kind: 'invalid' };
  if (value.phase === 'cleanup-complete' && remaining.length > 0) return { kind: 'invalid' };
  if (
    value.phase === 'aborted'
      ? !V2_ABORTS.test(String(value.abortReason))
      : value.abortReason !== undefined
  )
    return { kind: 'invalid' };
  return { kind: 'legacy-v2-transaction', transaction: structuredClone(value) };
}
function decodeRecovery(value: unknown) {
  if (
    !record(value) ||
    !closed(
      value,
      'outcomeCode bindingWriteMayHaveOccurred portableRestoreEvidence? privacyRestoreEvidence?'
    ) ||
    !['OPTIONS_STORAGE_FAILURE', 'EXTERNAL_SYNC_CONFLICT'].includes(String(value.outcomeCode)) ||
    typeof value.bindingWriteMayHaveOccurred !== 'boolean' ||
    (value.portableRestoreEvidence !== undefined &&
      !['preimage', 'third-preserved'].includes(String(value.portableRestoreEvidence))) ||
    (value.privacyRestoreEvidence !== undefined &&
      !['restore-target', 'third-preserved'].includes(String(value.privacyRestoreEvidence)))
  )
    return null;
  return value;
}
function decodeV3(value: Record<string, unknown>): DecodedDeviceLocalVaultRecoveryRecord {
  if (
    !closed(
      value,
      'version protocol transactionId phase previousBindings proposedBindings cleanupCandidates remainingCleanupCandidates portable privacy recovery? abortReason?'
    ) ||
    value.protocol !== PROTOCOL
  )
    return { kind: 'invalid' };
  const remaining = common(value);
  const proof = portable(value.portable, true);
  if (
    !remaining ||
    !proof ||
    !record(value.privacy) ||
    !closed(value.privacy, 'restoreTarget forwardTarget writeRequired observedForward?')
  )
    return { kind: 'invalid' };
  const restore = value.privacy.restoreTarget;
  const forward = value.privacy.forwardTarget;
  if (
    !privacyTarget(restore) ||
    !privacyTarget(forward) ||
    typeof value.privacy.writeRequired !== 'boolean' ||
    (!value.privacy.writeRequired &&
      !samePrivacy(restore as Record<string, unknown>, forward as Record<string, unknown>)) ||
    (value.privacy.observedForward !== undefined &&
      value.privacy.observedForward !== 'exact-target-readback')
  )
    return { kind: 'invalid' };
  if (!V3_PHASES.test(String(value.phase))) return { kind: 'invalid' };
  const forwardProof =
    proof.observedCommittedIdentity === proof.proposedIdentity &&
    value.privacy.observedForward === 'exact-target-readback';
  const phase = String(value.phase);
  if (
    ['prepared', 'forward-inflight'].includes(phase) &&
    (proof.observedCommittedIdentity !== undefined || value.privacy.observedForward !== undefined)
  )
    return { kind: 'invalid' };
  if (
    ['forward-committed', 'local-commit-inflight', 'local-committed', 'cleanup-complete'].includes(
      phase
    ) &&
    !forwardProof
  )
    return { kind: 'invalid' };
  const recovery = value.recovery === undefined ? null : decodeRecovery(value.recovery);
  if (value.recovery !== undefined && !recovery) return { kind: 'invalid' };
  if (phase === 'compensating' && !recovery) return { kind: 'invalid' };
  if (
    phase === 'portable-privacy-restored' &&
    (!recovery?.portableRestoreEvidence || !recovery.privacyRestoreEvidence)
  )
    return { kind: 'invalid' };
  if (!['compensating', 'portable-privacy-restored', 'aborted'].includes(phase) && recovery)
    return { kind: 'invalid' };
  if (phase === 'cleanup-complete' && remaining.length > 0) return { kind: 'invalid' };
  if (
    phase === 'aborted'
      ? !V3_ABORTS.test(String(value.abortReason))
      : value.abortReason !== undefined
  )
    return { kind: 'invalid' };
  return { kind: 'v3-transaction', transaction: structuredClone(value) };
}
export function decodeDeviceLocalVaultRecoveryRecord(
  value: unknown
): DecodedDeviceLocalVaultRecoveryRecord {
  if (record(value) && value.version === 1 && Array.isArray(value.folderIds))
    return { kind: 'legacy-unproven' };
  const snapshot = snapshotPlainStructuredData(value, { maxUtf8Bytes: 131_072 });
  if (!snapshot.ok || !record(snapshot.value)) return { kind: 'invalid' };
  if (snapshot.value.version === 2) return decodeV2(snapshot.value);
  if (snapshot.value.version === 3 && snapshot.value.protocol === undefined)
    return { kind: 'legacy-v3-unproven' };
  if (snapshot.value.version === 3) return decodeV3(snapshot.value);
  return { kind: 'invalid' };
}
