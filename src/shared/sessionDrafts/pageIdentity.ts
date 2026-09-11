import { z } from 'zod';
export const SESSION_DRAFT_LEASE_DURATION_MS = 30 * 1000;
export const SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS = 10 * 1000;
export type SessionDraftMode = 'reader' | 'video';
export type SessionDraftStatus = 'active' | 'restorable' | 'discarded' | 'exported';
export type SessionDraftTerminalStatus = 'discarded' | 'exported';
export interface SessionDraftTrustedOwnerContext {
  tabId: number;
  frameId: number;
  windowId?: number | undefined;
}
export interface SessionDraftLegacyOwnerContext {
  tabId?: number | undefined;
  frameId?: number | undefined;
  windowId?: number | undefined;
}
export type SessionDraftOwnerContext = SessionDraftLegacyOwnerContext;
export interface SessionDraftLease {
  leaseId: string;
  owner: SessionDraftTrustedOwnerContext;
  renewedAt: number;
  leaseExpiresAt: number;
}
export interface SessionDraftLegacyCleanupObligation {
  state: 'pending';
  legacyKey: string;
  v2Key: string;
  rawDigest: string;
  canonicalDigest: string;
  v2PayloadDigest: string;
  requestDigest: string;
}
export type SessionDraftOwnerLivenessTarget =
  | {
      kind: 'leased-v2';
      requirePositiveInactiveEvidence?: boolean;
      documentId?: string;
      key: string;
      leaseId: string;
      owner: SessionDraftTrustedOwnerContext;
    }
  | { kind: 'legacy-v1'; key: string; owner: SessionDraftTrustedOwnerContext };
export type SessionDraftOwnerLivenessProbe = (
  target: SessionDraftOwnerLivenessTarget
) => Promise<'active' | 'inactive'>;
const TimestampSchema = z.number().int().nonnegative().finite();
const BoundedIdSchema = z.string().min(1).max(128);
export const SessionDraftModeSchema = z.enum(['reader', 'video']);
export const SessionDraftStatusSchema = z.enum(['active', 'restorable', 'discarded', 'exported']);
export const SessionDraftTrustedOwnerContextSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    frameId: z.number().int().nonnegative(),
    windowId: z.number().int().nonnegative().optional()
  })
  .strict();
export const SessionDraftLegacyOwnerContextSchema = SessionDraftTrustedOwnerContextSchema.partial();
export const SessionDraftLeaseSchema = z
  .object({
    leaseId: BoundedIdSchema,
    owner: SessionDraftTrustedOwnerContextSchema,
    renewedAt: TimestampSchema,
    leaseExpiresAt: TimestampSchema
  })
  .strict()
  .refine(
    (lease) => lease.leaseExpiresAt === lease.renewedAt + SESSION_DRAFT_LEASE_DURATION_MS,
    'SESSION_DRAFT_LEASE_EXPIRY_INVALID'
  );
export const SessionDraftLegacyCleanupObligationSchema = z
  .object({
    state: z.literal('pending'),
    legacyKey: z.string().min(1).max(128),
    v2Key: z.string().min(1).max(1024),
    rawDigest: z.string().regex(/^[0-9a-f]{64}$/),
    canonicalDigest: z.string().regex(/^[0-9a-f]{64}$/),
    v2PayloadDigest: z.string().regex(/^[0-9a-f]{64}$/),
    requestDigest: z.string().regex(/^[0-9a-f]{64}$/)
  })
  .strict();
const TEXT_FRAGMENT_MARKER = ':~:text=';
const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
] as const;
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const;
export interface SessionDraftPageIdentity {
  mode: SessionDraftMode;
  normalizedPageUrl: string;
  pageKey: string;
}

interface SessionDraftPageReference {
  mode: SessionDraftMode;
  pageUrl: string;
}

interface SessionDraftStoredPageReference extends SessionDraftPageReference {
  pageKey: string;
  schemaVersion: number;
}

export interface SessionDraftIdentityRequest {
  operation: string;
  key: string;
  draft?: SessionDraftPageReference & { draftId: string };
}

function extractReaderHash(hash: string): string {
  const markerIndex = hash.indexOf(TEXT_FRAGMENT_MARKER);
  return markerIndex === -1 ? '' : `#${hash.slice(markerIndex)}`;
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state: number[] = [...SHA256_INITIAL_STATE];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < words.length; index += 1) {
      const previous15 = words[index - 15] ?? 0;
      const previous2 = words[index - 2] ?? 0;
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0;
    }

    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;
    let e = state[4] ?? 0;
    let f = state[5] ?? 0;
    let g = state[6] ?? 0;
    let h = state[7] ?? 0;
    for (let index = 0; index < words.length; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h + sum1 + choice + (SHA256_ROUND_CONSTANTS[index] ?? 0) + (words[index] ?? 0)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = ((state[0] ?? 0) + a) >>> 0;
    state[1] = ((state[1] ?? 0) + b) >>> 0;
    state[2] = ((state[2] ?? 0) + c) >>> 0;
    state[3] = ((state[3] ?? 0) + d) >>> 0;
    state[4] = ((state[4] ?? 0) + e) >>> 0;
    state[5] = ((state[5] ?? 0) + f) >>> 0;
    state[6] = ((state[6] ?? 0) + g) >>> 0;
    state[7] = ((state[7] ?? 0) + h) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function normalizeSessionDraftPageUrl(mode: SessionDraftMode, pageUrl: string): string {
  const parsed = new URL(pageUrl);
  const hash = mode === 'reader' ? extractReaderHash(parsed.hash) : '';
  return `${parsed.origin}${parsed.pathname}${parsed.search}${hash}`;
}

export function createLegacySessionDraftPageKey(mode: SessionDraftMode, pageUrl: string): string {
  const input = `${mode}:${normalizeSessionDraftPageUrl(mode, pageUrl)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function createSessionDraftPageIdentity(
  mode: SessionDraftMode,
  pageUrl: string
): SessionDraftPageIdentity {
  const normalizedPageUrl = normalizeSessionDraftPageUrl(mode, pageUrl);
  const pageKey = sha256Hex(JSON.stringify([mode, normalizedPageUrl]));
  return { mode, normalizedPageUrl, pageKey };
}

export function createSessionDraftCanonicalPageFields(
  mode: SessionDraftMode,
  pageUrl: string
): { pageKey: string; pageUrl: string } {
  const identity = createSessionDraftPageIdentity(mode, pageUrl);
  return { pageKey: identity.pageKey, pageUrl: identity.normalizedPageUrl };
}

export function createSessionDraftPageKey(mode: SessionDraftMode, pageUrl: string): string {
  return createSessionDraftPageIdentity(mode, pageUrl).pageKey;
}

export function matchesSessionDraftPageIdentity(
  left: SessionDraftPageReference,
  right: SessionDraftPageReference
): boolean {
  return (
    left.mode === right.mode &&
    normalizeSessionDraftPageUrl(left.mode, left.pageUrl) ===
      normalizeSessionDraftPageUrl(right.mode, right.pageUrl)
  );
}

export function hasCanonicalSessionDraftPageIdentity(
  input: Omit<SessionDraftStoredPageReference, 'schemaVersion'>
): boolean {
  const identity = createSessionDraftPageIdentity(input.mode, input.pageUrl);
  return input.pageKey === identity.pageKey && input.pageUrl === identity.normalizedPageUrl;
}

export function matchesSessionDraftRecordPageIdentity(
  record: SessionDraftStoredPageReference,
  requested: SessionDraftPageReference
): boolean {
  return (
    matchesSessionDraftPageIdentity(record, requested) &&
    (record.schemaVersion === 1 || hasCanonicalSessionDraftPageIdentity(record))
  );
}
