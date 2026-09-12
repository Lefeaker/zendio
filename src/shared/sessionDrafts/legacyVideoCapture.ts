type SessionDraftStoredValue = object | string | number | boolean | null | undefined;

function normalizeSessionDraftStoredValue(value: unknown): SessionDraftStoredValue {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  return undefined;
}

export const LEGACY_VIDEO_CAPTURE_MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const LEGACY_VIDEO_CAPTURE_MAX_ENTRIES = 20;
const MAX_TEXT = 256 * 1024;
const MAX_URL = 4096;

export interface CanonicalLegacyTimestampCapture {
  kind: 'timestamp';
  id: string;
  timeSec: number;
  comment: string;
  url: string;
  createdAt: number;
  screenshotRequested?: true;
}

export interface CanonicalLegacyFragmentCapture {
  kind: 'fragment';
  id: string;
  timeSec?: number;
  comment: string;
  selectedText: string;
  selectedHtml: string;
  fragmentUrl: string;
  createdAt: number;
  wrapperId?: string;
}

export type CanonicalLegacyVideoCapture =
  | CanonicalLegacyTimestampCapture
  | CanonicalLegacyFragmentCapture;

export interface CanonicalLegacyVideoCaptureData {
  title?: string;
  url?: string;
  entries: CanonicalLegacyVideoCapture[];
  updatedAt: number;
}

export type LegacyVideoCaptureDecodeResult =
  | {
      ok: true;
      value: CanonicalLegacyVideoCaptureData;
      rawCanonicalJson: string;
      canonicalJson: string;
    }
  | { ok: false; issue: 'INVALID' | 'OVERSIZE' };

export async function digestLegacyVideoCaptureJson(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function dataRecord(
  value: SessionDraftStoredValue
): value is Record<string, SessionDraftStoredValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const names = Object.keys(value);
  if (Reflect.ownKeys(value).length !== names.length) return false;
  return names.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && 'value' in descriptor;
  });
}

function canonicalJson(value: SessionDraftStoredValue, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('cycle');
    ancestors.add(value);
    try {
      const entries: readonly unknown[] = value;
      return `[${entries
        .map((entry) => canonicalJson(normalizeSessionDraftStoredValue(entry), ancestors))
        .join(',')}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (!dataRecord(value) || ancestors.has(value)) throw new TypeError('invalid object');
  ancestors.add(value);
  try {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function exactKeys(
  value: Record<string, SessionDraftStoredValue>,
  allowed: readonly string[]
): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function boundedString(value: SessionDraftStoredValue, max = MAX_TEXT): value is string {
  return typeof value === 'string' && value.length <= max;
}

function finite(value: SessionDraftStoredValue): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function decodeEntry(value: SessionDraftStoredValue, ordinal: number) {
  if (!dataRecord(value)) return null;
  const kind = value.kind;
  if (kind === 'fragment') {
    if (
      !exactKeys(value, [
        'kind',
        'id',
        'timeSec',
        'comment',
        'selectedText',
        'selectedHtml',
        'fragmentUrl',
        'createdAt',
        'wrapperId'
      ]) ||
      !boundedString(value.id, 256) ||
      !boundedString(value.comment) ||
      !boundedString(value.selectedText) ||
      !boundedString(value.selectedHtml) ||
      !boundedString(value.fragmentUrl, MAX_URL) ||
      !finite(value.createdAt) ||
      (value.timeSec !== undefined && !finite(value.timeSec)) ||
      (value.wrapperId !== undefined && !boundedString(value.wrapperId, 256))
    ) {
      return null;
    }
    const entry: CanonicalLegacyFragmentCapture = {
      kind: 'fragment',
      id: value.id,
      comment: value.comment,
      selectedText: value.selectedText,
      selectedHtml: value.selectedHtml,
      fragmentUrl: value.fragmentUrl,
      createdAt: value.createdAt,
      ...(value.timeSec === undefined ? {} : { timeSec: value.timeSec }),
      ...(value.wrapperId === undefined ? {} : { wrapperId: value.wrapperId })
    };
    return { entry, ordinal };
  }
  if (kind !== undefined && kind !== 'timestamp') return null;
  if (
    !exactKeys(value, [
      'kind',
      'id',
      'timeSec',
      'comment',
      'url',
      'createdAt',
      'screenshotRequested',
      'screenshot'
    ]) ||
    !boundedString(value.id, 256) ||
    !finite(value.timeSec) ||
    !boundedString(value.comment) ||
    !boundedString(value.url, MAX_URL) ||
    !finite(value.createdAt) ||
    (value.screenshotRequested !== undefined && typeof value.screenshotRequested !== 'boolean') ||
    (value.screenshot !== undefined && !dataRecord(value.screenshot))
  ) {
    return null;
  }
  const entry: CanonicalLegacyTimestampCapture = {
    kind: 'timestamp',
    id: value.id,
    timeSec: value.timeSec,
    comment: value.comment,
    url: value.url,
    createdAt: value.createdAt,
    ...(value.screenshotRequested === true || value.screenshot !== undefined
      ? { screenshotRequested: true }
      : {})
  };
  return { entry, ordinal };
}

export function decodeLegacyVideoCapture<Value>(value: Value): LegacyVideoCaptureDecodeResult {
  const storedValue = normalizeSessionDraftStoredValue(value);
  let rawCanonicalJson: string;
  try {
    rawCanonicalJson = canonicalJson(storedValue);
  } catch {
    return { ok: false, issue: 'INVALID' };
  }
  if (new TextEncoder().encode(rawCanonicalJson).length > LEGACY_VIDEO_CAPTURE_MAX_INPUT_BYTES) {
    return { ok: false, issue: 'OVERSIZE' };
  }
  if (
    !dataRecord(storedValue) ||
    !exactKeys(storedValue, ['title', 'url', 'entries', 'updatedAt']) ||
    !Array.isArray(storedValue.entries) ||
    !finite(storedValue.updatedAt) ||
    (storedValue.title !== undefined && !boundedString(storedValue.title)) ||
    (storedValue.url !== undefined && !boundedString(storedValue.url, MAX_URL))
  ) {
    return { ok: false, issue: 'INVALID' };
  }
  const decoded = storedValue.entries.map((entry, ordinal) =>
    decodeEntry(normalizeSessionDraftStoredValue(entry), ordinal)
  );
  if (decoded.some((entry) => entry === null)) return { ok: false, issue: 'INVALID' };
  const entries = decoded
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort(
      (left, right) => right.entry.createdAt - left.entry.createdAt || left.ordinal - right.ordinal
    )
    .slice(0, LEGACY_VIDEO_CAPTURE_MAX_ENTRIES)
    .map(({ entry }) => entry);
  const canonical: CanonicalLegacyVideoCaptureData = {
    entries,
    updatedAt: storedValue.updatedAt,
    ...(storedValue.title === undefined ? {} : { title: storedValue.title }),
    ...(storedValue.url === undefined ? {} : { url: storedValue.url })
  };
  return {
    ok: true,
    value: canonical,
    rawCanonicalJson,
    canonicalJson: canonicalJson(canonical)
  };
}
