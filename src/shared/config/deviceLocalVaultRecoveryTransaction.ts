import { snapshotPlainStructuredData } from './losslessObjectBoundary';
import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
import type { PrivacyPreferencesOptions } from '../types/options';
import type { OptionsMutationCommand } from '../types/optionsMutationMessages';
export const DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM = 'sha256-canonical-plain-json-v1';
const MAX_PORTABLE_BYTES = 8_192;
const MAX_BINDINGS = 100;
const MAX_ID_LENGTH = 256;
const MAX_NAME_LENGTH = 512;
const IDENTITY_PATTERN = /^[0-9a-f]{64}$/u;
const PHASE_PATTERN = /^(prepared|portable-committed|local-committed|cleanup-complete|aborted)$/u;
const ABORT_PATTERN = /^(portable-not-committed|external-sync-conflict|invalid-legacy)$/u;
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
}
export type DeviceLocalVaultRecoveryPhase =
  | 'prepared'
  | 'portable-committed'
  | 'local-committed'
  | 'cleanup-complete'
  | 'aborted';
export interface DeviceLocalVaultRecoveryTransaction {
  readonly version: 2;
  readonly transactionId: string;
  readonly phase: DeviceLocalVaultRecoveryPhase;
  readonly previousBindings: DeviceLocalVaultBindingSnapshot;
  readonly proposedBindings: DeviceLocalVaultBindingSnapshot;
  readonly cleanupCandidates: readonly string[];
  readonly remainingCleanupCandidates: readonly string[];
  readonly portable: {
    readonly identityAlgorithm: typeof DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM;
    readonly preimageIdentity: string;
    readonly proposedIdentity: string;
    readonly observedCommittedIdentity?: string;
    readonly writeRequired: boolean;
  };
  readonly abortReason?: 'portable-not-committed' | 'external-sync-conflict' | 'invalid-legacy';
}
export type DecodedDeviceLocalVaultRecoveryTransaction =
  | { readonly kind: 'transaction'; readonly transaction: DeviceLocalVaultRecoveryTransaction }
  | { readonly kind: 'legacy-unproven' }
  | { readonly kind: 'invalid' };
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
function decodeBindings(value: unknown): DeviceLocalVaultBindingSnapshot | null {
  if (!record(value) || !closedKeys(value, ['version', 'bindings']) || value.version !== 1)
    return null;
  if (!record(value.bindings) || Object.keys(value.bindings).length > MAX_BINDINGS) return null;
  const bindings: Record<string, DeviceLocalVaultBinding> = {};
  for (const [vaultId, candidate] of Object.entries(value.bindings)) {
    if (!boundedString(vaultId, MAX_ID_LENGTH) || !record(candidate)) return null;
    if (!closedKeys(candidate, ['folderId', 'folderName'])) return null;
    if (
      !boundedString(candidate.folderId, MAX_ID_LENGTH) ||
      !boundedString(candidate.folderName, MAX_NAME_LENGTH)
    )
      return null;
    bindings[vaultId] = { folderId: candidate.folderId, folderName: candidate.folderName };
  }
  return { version: 1, bindings };
}
function decodeIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_BINDINGS) return null;
  const ids = value.filter((item): item is string => boundedString(item, MAX_ID_LENGTH));
  return ids.length === value.length && new Set(ids).size === ids.length ? ids : null;
}
export function decodeDeviceLocalVaultRecoveryTransaction(
  value: unknown
): DecodedDeviceLocalVaultRecoveryTransaction {
  if (record(value) && value.version === 1 && Array.isArray(value.folderIds)) {
    return { kind: 'legacy-unproven' };
  }
  if (!record(value) || value.version !== 2) return { kind: 'invalid' };
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
    ])
  )
    return { kind: 'invalid' };
  const previousBindings = decodeBindings(value.previousBindings);
  const proposedBindings = decodeBindings(value.proposedBindings);
  const cleanupCandidates = decodeIds(value.cleanupCandidates);
  const remainingCleanupCandidates = decodeIds(value.remainingCleanupCandidates);
  const portable = value.portable;
  if (
    !boundedString(value.transactionId, 128) ||
    !PHASE_PATTERN.test(String(value.phase)) ||
    !previousBindings ||
    !proposedBindings ||
    !cleanupCandidates ||
    !remainingCleanupCandidates ||
    !remainingCleanupCandidates.every((id) => cleanupCandidates.includes(id)) ||
    !record(portable) ||
    !closedKeys(portable, [
      'identityAlgorithm',
      'preimageIdentity',
      'proposedIdentity',
      'observedCommittedIdentity?',
      'writeRequired'
    ]) ||
    portable.identityAlgorithm !== DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM ||
    !IDENTITY_PATTERN.test(String(portable.preimageIdentity)) ||
    !IDENTITY_PATTERN.test(String(portable.proposedIdentity)) ||
    typeof portable.writeRequired !== 'boolean'
  )
    return { kind: 'invalid' };
  const observed = portable.observedCommittedIdentity;
  const phase = value.phase as DeviceLocalVaultRecoveryPhase;
  const abortReason = value.abortReason;
  const previousIds = new Set(Object.values(previousBindings.bindings).map((x) => x.folderId));
  const proposedIds = new Set(Object.values(proposedBindings.bindings).map((x) => x.folderId));
  if (
    (observed !== undefined && !IDENTITY_PATTERN.test(String(observed))) ||
    (phase === 'prepared' && observed !== undefined) ||
    (phase !== 'prepared' && phase !== 'aborted' && observed !== portable.proposedIdentity) ||
    (phase === 'cleanup-complete' && remainingCleanupCandidates.length > 0) ||
    (!portable.writeRequired && portable.preimageIdentity !== portable.proposedIdentity) ||
    cleanupCandidates.some((id) => !previousIds.has(id) || proposedIds.has(id)) ||
    (abortReason !== undefined && !ABORT_PATTERN.test(String(abortReason))) ||
    (phase !== 'aborted' && abortReason !== undefined)
  )
    return { kind: 'invalid' };
  const transaction = structuredClone(value) as unknown as DeviceLocalVaultRecoveryTransaction;
  return { kind: 'transaction', transaction };
}

function canonicalJson(value: PlainStructuredValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (record(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as PlainStructuredValue)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export async function portableOptionsIdentity(raw: PlainStructuredObject): Promise<string> {
  const snapshot = snapshotPlainStructuredData(raw, { maxUtf8Bytes: MAX_PORTABLE_BYTES });
  if (!snapshot.ok || !record(snapshot.value)) throw new Error('PORTABLE_IDENTITY_INVALID');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('PORTABLE_IDENTITY_UNAVAILABLE');
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(snapshot.value))
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPreparedDeviceLocalVaultRecoveryTransaction(input: {
  readonly transactionId: string;
  readonly previousBindings: DeviceLocalVaultBindingSnapshot;
  readonly proposedBindings: DeviceLocalVaultBindingSnapshot;
  readonly portablePreimage: PlainStructuredObject;
  readonly portableProposal: PlainStructuredObject;
  readonly writeRequired: boolean;
}): Promise<DeviceLocalVaultRecoveryTransaction> {
  const proposedIds = new Set(
    Object.values(input.proposedBindings.bindings).map((x) => x.folderId)
  );
  const cleanupCandidates = [
    ...new Set(
      Object.values(input.previousBindings.bindings)
        .map((binding) => binding.folderId)
        .filter((folderId) => !proposedIds.has(folderId))
    )
  ];
  const transaction: DeviceLocalVaultRecoveryTransaction = {
    version: 2,
    transactionId: input.transactionId,
    phase: 'prepared',
    previousBindings: structuredClone(input.previousBindings),
    proposedBindings: structuredClone(input.proposedBindings),
    cleanupCandidates,
    remainingCleanupCandidates: cleanupCandidates,
    portable: {
      identityAlgorithm: DEVICE_LOCAL_VAULT_IDENTITY_ALGORITHM,
      preimageIdentity: await portableOptionsIdentity(input.portablePreimage),
      proposedIdentity: await portableOptionsIdentity(input.portableProposal),
      writeRequired: input.writeRequired
    }
  };
  if (decodeDeviceLocalVaultRecoveryTransaction(transaction).kind !== 'transaction') {
    throw new Error('DEVICE_LOCAL_VAULT_TRANSACTION_INVALID');
  }
  return transaction;
}
