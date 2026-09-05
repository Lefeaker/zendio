import { snapshotPlainStructuredData } from './losslessObjectBoundary';
import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';

export const DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM = 'sha256-canonical-plain-json-v1';

export type DecodedDeviceLocalVaultRecoveryRecord =
  | { readonly kind: 'v3-transaction'; readonly transaction: Record<string, unknown> }
  | { readonly kind: 'legacy-v2-transaction'; readonly transaction: Record<string, unknown> }
  | { readonly kind: 'legacy-unproven' }
  | { readonly kind: 'invalid' };

const MAX_BINDINGS = 100;
const MAX_ID_LENGTH = 256;
const IDENTITY_PATTERN = /^[0-9a-f]{64}$/u;
const V2_PHASES = /^(prepared|portable-committed|local-committed|cleanup-complete|aborted)$/u;
const V3_PHASES =
  /^(prepared|portable-committed|local-commit-inflight|compensating|portable-privacy-restored|local-committed|cleanup-complete|aborted)$/u;
const ABORT_REASONS =
  /^(portable-not-committed|local-commit-failed|external-sync-conflict|invalid-legacy)$/u;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const closedKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const names = keys.map((key) => (key.endsWith('?') ? key.slice(0, -1) : key));
  return (
    Object.keys(value).every((key) => names.includes(key)) &&
    keys.filter((key) => !key.endsWith('?')).every((key) => key in value)
  );
};
const boundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;

function canonicalJson(value: PlainStructuredValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (record(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as PlainStructuredValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function portableOptionsIdentity(raw: PlainStructuredObject): Promise<string> {
  const snapshot = snapshotPlainStructuredData(raw, { maxUtf8Bytes: 8_192 });
  if (!snapshot.ok || !record(snapshot.value)) throw new Error('PORTABLE_IDENTITY_INVALID');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('PORTABLE_IDENTITY_UNAVAILABLE');
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(snapshot.value))
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBindings(value: unknown) {
  if (!record(value) || !closedKeys(value, ['version', 'bindings']) || value.version !== 1)
    return null;
  if (!record(value.bindings) || Object.keys(value.bindings).length > MAX_BINDINGS) return null;
  const bindings: Record<string, { folderId: string; folderName: string }> = {};
  for (const [vaultId, candidate] of Object.entries(value.bindings)) {
    if (!boundedString(vaultId, MAX_ID_LENGTH) || !record(candidate)) return null;
    if (!closedKeys(candidate, ['folderId', 'folderName'])) return null;
    if (
      !boundedString(candidate.folderId, MAX_ID_LENGTH) ||
      !boundedString(candidate.folderName, 512)
    )
      return null;
    bindings[vaultId] = { folderId: candidate.folderId, folderName: candidate.folderName };
  }
  return bindings;
}

function decodeIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_BINDINGS) return null;
  const ids = value.filter((item): item is string => boundedString(item, MAX_ID_LENGTH));
  return ids.length === value.length && new Set(ids).size === ids.length ? ids : null;
}

function commonFields(value: Record<string, unknown>) {
  const previousBindings = decodeBindings(value.previousBindings);
  const proposedBindings = decodeBindings(value.proposedBindings);
  const cleanupCandidates = decodeIds(value.cleanupCandidates);
  const remaining = decodeIds(value.remainingCleanupCandidates);
  if (
    !boundedString(value.transactionId, 128) ||
    !previousBindings ||
    !proposedBindings ||
    !cleanupCandidates ||
    !remaining ||
    !remaining.every((id) => cleanupCandidates.includes(id))
  )
    return null;
  const previousIds = new Set(Object.values(previousBindings).map(({ folderId }) => folderId));
  const proposedIds = new Set(Object.values(proposedBindings).map(({ folderId }) => folderId));
  if (cleanupCandidates.some((id) => !previousIds.has(id) || proposedIds.has(id))) return null;
  return { remaining };
}

function portableBase(value: unknown) {
  if (!record(value)) return null;
  if (
    value.identityAlgorithm !== DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM ||
    !IDENTITY_PATTERN.test(String(value.preimageIdentity)) ||
    !IDENTITY_PATTERN.test(String(value.proposedIdentity)) ||
    typeof value.writeRequired !== 'boolean'
  )
    return null;
  if (!value.writeRequired && value.preimageIdentity !== value.proposedIdentity) return null;
  const observed = value.observedCommittedIdentity;
  return observed === undefined || IDENTITY_PATTERN.test(String(observed)) ? { observed } : null;
}

function phaseValid(
  value: Record<string, unknown>,
  observed: unknown,
  proposedIdentity: unknown,
  remainingCount: number,
  phases: RegExp
) {
  if (!phases.test(String(value.phase))) return false;
  if (value.phase === 'prepared' && observed !== undefined) return false;
  if (value.phase !== 'prepared' && value.phase !== 'aborted' && observed !== proposedIdentity)
    return false;
  if (value.phase === 'cleanup-complete' && remainingCount > 0) return false;
  return value.phase === 'aborted'
    ? ABORT_REASONS.test(String(value.abortReason))
    : value.abortReason === undefined;
}

function decodeV2(value: Record<string, unknown>): DecodedDeviceLocalVaultRecoveryRecord {
  if (
    !closedKeys(value, [
      'version',
      'transactionId',
      'phase',
      'previousBindings',
      'proposedBindings',
      'cleanupCandidates',
      'remainingCleanupCandidates',
      'portable',
      'abortReason?'
    ]) ||
    !record(value.portable)
  )
    return { kind: 'invalid' };
  const common = commonFields(value);
  if (
    !common ||
    !closedKeys(value.portable, [
      'identityAlgorithm',
      'preimageIdentity',
      'proposedIdentity',
      'observedCommittedIdentity?',
      'writeRequired'
    ])
  )
    return { kind: 'invalid' };
  const portable = portableBase(value.portable);
  if (
    !portable ||
    !phaseValid(
      value,
      portable.observed,
      value.portable.proposedIdentity,
      common.remaining.length,
      V2_PHASES
    )
  )
    return { kind: 'invalid' };
  return { kind: 'legacy-v2-transaction', transaction: structuredClone(value) };
}

function decodeV3(value: Record<string, unknown>): DecodedDeviceLocalVaultRecoveryRecord {
  if (
    !closedKeys(value, [
      'version',
      'transactionId',
      'phase',
      'previousBindings',
      'proposedBindings',
      'cleanupCandidates',
      'remainingCleanupCandidates',
      'portable',
      'privacy',
      'failureCode?',
      'abortReason?'
    ]) ||
    !record(value.portable) ||
    !record(value.privacy)
  )
    return { kind: 'invalid' };
  const common = commonFields(value);
  if (
    !common ||
    !closedKeys(value.portable, [
      'identityAlgorithm',
      'preimage',
      'preimageIdentity',
      'proposedIdentity',
      'observedCommittedIdentity?',
      'writeRequired'
    ])
  )
    return { kind: 'invalid' };
  const portable = portableBase(value.portable);
  const preimage = snapshotPlainStructuredData(value.portable.preimage, { maxUtf8Bytes: 8_192 });
  if (!portable || !preimage.ok || !record(preimage.value)) return { kind: 'invalid' };
  if (
    !closedKeys(value.privacy, ['restoreRequired', 'target']) ||
    typeof value.privacy.restoreRequired !== 'boolean' ||
    !record(value.privacy.target) ||
    !closedKeys(value.privacy.target, ['analytics', 'errorReporting', 'debugMode']) ||
    !Object.values(value.privacy.target).every((item) => typeof item === 'boolean')
  )
    return { kind: 'invalid' };
  if (value.failureCode !== undefined && value.failureCode !== 'OPTIONS_STORAGE_FAILURE')
    return { kind: 'invalid' };
  if (
    value.failureCode !== undefined &&
    !['compensating', 'portable-privacy-restored', 'aborted'].includes(String(value.phase))
  )
    return { kind: 'invalid' };
  if (
    !phaseValid(
      value,
      portable.observed,
      value.portable.proposedIdentity,
      common.remaining.length,
      V3_PHASES
    )
  )
    return { kind: 'invalid' };
  return { kind: 'v3-transaction', transaction: structuredClone(value) };
}

export function decodeDeviceLocalVaultRecoveryRecord(
  value: unknown
): DecodedDeviceLocalVaultRecoveryRecord {
  if (record(value) && value.version === 1 && Array.isArray(value.folderIds)) {
    return { kind: 'legacy-unproven' };
  }
  const snapshot = snapshotPlainStructuredData(value, { maxUtf8Bytes: 131_072 });
  if (!snapshot.ok || !record(snapshot.value)) return { kind: 'invalid' };
  if (snapshot.value.version === 2) return decodeV2(snapshot.value);
  if (snapshot.value.version === 3) return decodeV3(snapshot.value);
  return { kind: 'invalid' };
}
