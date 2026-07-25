import {
  SessionDraftMutationReceiptSchema,
  SessionDraftPendingRemovalSchema
} from '../../shared/sessionDrafts/schemas';
import {
  SESSION_DRAFT_MAX_RECEIPTS,
  SESSION_DRAFT_RECEIPT_TTL_MS,
  type SessionDraftCommitMetadata,
  type SessionDraftEnvelope,
  type SessionDraftFormattedReceiptReplay,
  type SessionDraftMutationReceipt,
  type SessionDraftPendingRemoval,
  type SessionDraftTrustedOwnerContext
} from '../../shared/sessionDrafts/types';

type ReceiptIdentity = Pick<SessionDraftMutationReceipt, 'requestId' | 'operation' | 'digest'> &
  Partial<Pick<SessionDraftMutationReceipt, 'key'>>;

export type SessionDraftReceiptCheck =
  | { kind: 'miss'; receipts: SessionDraftMutationReceipt[] }
  | { kind: 'replay'; receipt: SessionDraftMutationReceipt }
  | { kind: 'conflict'; code: 'REQUEST_ID_REUSE' };

export type SessionDraftMutationBeginResult =
  | { kind: 'reuse' }
  | { kind: 'replay'; receipt: SessionDraftMutationReceipt }
  | { kind: 'ready'; digest: string; receipts: SessionDraftMutationReceipt[] };

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function stringifyScalar(value: string | number | boolean): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError('Value is not JSON serializable.');
  return serialized;
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return stringifyScalar(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON numbers must be finite.');
    return stringifyScalar(value);
  }
  if (typeof value !== 'object') throw new TypeError('Value is not JSON serializable.');
  if (ancestors.has(value)) throw new TypeError('Cyclic JSON values are not supported.');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const serialized: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (!descriptor) {
          throw new TypeError('Sparse JSON arrays are not supported.');
        }
        if (!('value' in descriptor)) throw new TypeError('JSON arrays cannot contain accessors.');
        serialized.push(canonicalJson(descriptor.value, ancestors));
      }
      if (Reflect.ownKeys(value).length !== value.length + 1)
        throw new TypeError('JSON arrays cannot contain extra fields.');
      return `[${serialized.join(',')}]`;
    }

    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError('Only plain JSON objects are supported.');
    const fields: string[] = [];
    const keys = Object.keys(value).sort(compareText);
    if (Reflect.ownKeys(value).length !== keys.length)
      throw new TypeError('JSON objects cannot contain hidden or symbol fields.');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) {
        throw new TypeError('JSON objects cannot contain accessors.');
      }
      if (descriptor.value === undefined) continue;
      fields.push(`${stringifyScalar(key)}:${canonicalJson(descriptor.value, ancestors)}`);
    }
    return `{${fields.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export async function createSessionDraftValueDigest(value: object): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function createSessionDraftRequestDigest<Request extends object>(
  request: Request,
  owner?: SessionDraftTrustedOwnerContext
): Promise<string> {
  const stableOwner = owner ? { tabId: owner.tabId, frameId: owner.frameId } : null;
  return createSessionDraftValueDigest({ owner: stableOwner, request });
}

function isActiveTimestamp(timestamp: number, now: number): boolean {
  return timestamp <= now && now - timestamp < SESSION_DRAFT_RECEIPT_TTL_MS;
}

function compareReceipts(
  left: SessionDraftMutationReceipt,
  right: SessionDraftMutationReceipt
): number {
  if (left.timestamp !== right.timestamp) return left.timestamp > right.timestamp ? -1 : 1;
  return compareText(canonicalJson(left), canonicalJson(right));
}

export function pruneSessionDraftMutationReceipts(
  receipts: readonly object[],
  now: number
): SessionDraftMutationReceipt[] {
  if (!Number.isFinite(now) || now < 0) throw new TypeError('Receipt time must be nonnegative.');
  const candidates: SessionDraftMutationReceipt[] = [];
  for (const receipt of receipts) {
    const parsed = SessionDraftMutationReceiptSchema.safeParse(receipt);
    if (parsed.success && isActiveTimestamp(parsed.data.timestamp, now)) {
      candidates.push(parsed.data);
    }
  }
  candidates.sort(compareReceipts);

  const requestIds = new Set<string>();
  const retained: SessionDraftMutationReceipt[] = [];
  for (const receipt of candidates) {
    if (requestIds.has(receipt.requestId)) continue;
    requestIds.add(receipt.requestId);
    retained.push(receipt);
    if (retained.length === SESSION_DRAFT_MAX_RECEIPTS) break;
  }
  return retained;
}

export function checkSessionDraftMutationReceipt(
  receipts: readonly object[],
  identity: ReceiptIdentity,
  now: number
): SessionDraftReceiptCheck {
  const active = pruneSessionDraftMutationReceipts(receipts, now);
  const existing = active.find((receipt) => receipt.requestId === identity.requestId);
  if (!existing) return { kind: 'miss', receipts: active };
  if (
    existing.operation !== identity.operation ||
    existing.digest !== identity.digest ||
    (identity.key !== undefined && existing.key !== identity.key)
  ) {
    return { kind: 'conflict', code: 'REQUEST_ID_REUSE' };
  }
  return { kind: 'replay', receipt: existing };
}

export async function beginSessionDraftMutation<Request extends { requestId: string }>(input: {
  request: Request;
  operation: SessionDraftMutationReceipt['operation'];
  exactKey?: string;
  receipts: readonly object[];
  now: number;
  owner?: SessionDraftTrustedOwnerContext;
}): Promise<SessionDraftMutationBeginResult> {
  const digest = await createSessionDraftRequestDigest(input.request, input.owner);
  const checked = checkSessionDraftMutationReceipt(
    input.receipts,
    {
      requestId: input.request.requestId,
      operation: input.operation,
      digest,
      ...(input.exactKey === undefined ? {} : { key: input.exactKey })
    },
    input.now
  );
  if (checked.kind === 'conflict') return { kind: 'reuse' };
  if (checked.kind === 'replay') return checked;
  return { kind: 'ready', digest, receipts: checked.receipts };
}

export function createSessionDraftMutationReceipt(
  input: Omit<SessionDraftMutationReceipt, 'timestamp'>,
  timestamp: number
): SessionDraftMutationReceipt {
  return SessionDraftMutationReceiptSchema.parse({ ...input, timestamp });
}

export function createSessionDraftPendingRemovals(
  receipt: SessionDraftMutationReceipt,
  exactKeys: readonly string[]
): SessionDraftPendingRemoval[] {
  const { key: receiptKey, ...metadata } = receipt;
  return exactKeys.map((key) =>
    SessionDraftPendingRemovalSchema.parse({ ...metadata, key, receiptKey })
  );
}

export function addSessionDraftMutationReceipt(
  receipts: readonly object[],
  receipt: object,
  now: number
): SessionDraftMutationReceipt[] {
  const parsed = SessionDraftMutationReceiptSchema.safeParse(receipt);
  if (!parsed.success || !isActiveTimestamp(parsed.data.timestamp, now)) {
    throw new TypeError('Cannot persist an invalid or expired mutation receipt.');
  }
  const active = pruneSessionDraftMutationReceipts(receipts, now);
  const existing = active.find((candidate) => candidate.requestId === parsed.data.requestId);
  if (existing) {
    if (canonicalJson(existing) === canonicalJson(parsed.data)) return active;
    throw new Error('REQUEST_ID_REUSE');
  }
  return pruneSessionDraftMutationReceipts([...active, parsed.data], now);
}

function commitMetadata(receipt: SessionDraftMutationReceipt): SessionDraftCommitMetadata {
  return {
    operation: receipt.operation,
    outcome: receipt.outcome,
    key: receipt.key,
    ...(receipt.revision === undefined ? {} : { revision: receipt.revision }),
    ...(receipt.removedCount === undefined ? {} : { removedCount: receipt.removedCount }),
    ...(receipt.selectionReason === undefined ? {} : { selectionReason: receipt.selectionReason }),
    ...(receipt.invalidRemovedCount === undefined
      ? {}
      : { invalidRemovedCount: receipt.invalidRemovedCount })
  };
}

export async function formatSessionDraftReceiptReplay(
  receipt: SessionDraftMutationReceipt,
  current?: { key: string; envelope: SessionDraftEnvelope }
): Promise<SessionDraftFormattedReceiptReplay> {
  const commit = commitMetadata(receipt);
  if (
    receipt.resultDigest !== undefined &&
    receipt.revision !== undefined &&
    current?.key === receipt.key &&
    current.envelope.revision === receipt.revision &&
    (await createSessionDraftValueDigest(current.envelope)) === receipt.resultDigest
  ) {
    return {
      replay: { replayed: true, commit, requiresReadExact: false },
      envelope: current.envelope
    };
  }
  return { replay: { replayed: true, commit, requiresReadExact: true } };
}
