import { createHash } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync
} from 'node:fs';

export const AUDIT_REGRESSION_LIMITS = Object.freeze({
  maxReportBytes: 16 * 1024 * 1024,
  maxManifestBytes: 64 * 1024,
  maxManifestDepth: 8,
  maxJsonDepth: 32,
  maxObjectKeyBytes: 512,
  maxStringBytes: 4096,
  maxVulnerabilityPackages: 20000,
  maxAdvisoryIdentities: 50000,
  maxViaEntriesPerPackage: 256,
  maxCweEntriesPerAdvisory: 256,
  auditTimeoutMs: 180000,
  auditTerminateMs: 5000,
  stderrLimitBytes: 64 * 1024
});

export const sha256Buffer = (buffer) => createHash('sha256').update(buffer).digest('hex');
export const sha256Text = (text) => sha256Buffer(Buffer.from(text));

export function canonicalCompactJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalCompactJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalCompactJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

const isJsonPrimitive = (value) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

function stringifyCanonical(value, depth = 0) {
  if (isJsonPrimitive(value)) return JSON.stringify(value);
  const indentation = '  '.repeat(depth);
  const nestedIndentation = '  '.repeat(depth + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length === 1 && isJsonPrimitive(value[0])) {
      return `[${stringifyCanonical(value[0], depth + 1)}]`;
    }
    return `[\n${value
      .map((entry) => `${nestedIndentation}${stringifyCanonical(entry, depth + 1)}`)
      .join(',\n')}\n${indentation}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  return `{\n${entries
    .map(
      ([key, entry]) =>
        `${nestedIndentation}${JSON.stringify(key)}: ${stringifyCanonical(entry, depth + 1)}`
    )
    .join(',\n')}\n${indentation}}`;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${stringifyCanonical(canonicalize(value))}\n`);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const cloneJson = (value) => JSON.parse(JSON.stringify(value));

export function assertJsonEqual(actual, expected, message) {
  if (JSON.stringify(canonicalize(actual)) !== JSON.stringify(canonicalize(expected)))
    throw new Error(message);
}

export function assertClosedKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unexpected or missing fields.`);
  }
}

export function identityRecord(stats) {
  return {
    dev: stats.dev,
    ino: stats.ino,
    uid: stats.uid,
    gid: stats.gid,
    mode: stats.mode & 0o777,
    size: stats.size,
    nlink: stats.nlink
  };
}

export function readFileBounded(path, limitBytes) {
  const fd = openSync(path, 'r');
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > limitBytes)
      throw new Error(`File exceeds limit or is not regular: ${path}`);
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error(`Unexpected EOF: ${path}`);
      offset += count;
    }
    const after = fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size)
      throw new Error(`File changed while reading: ${path}`);
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export const sha256File = (path, limitBytes = AUDIT_REGRESSION_LIMITS.maxReportBytes) =>
  sha256Buffer(readFileBounded(path, limitBytes));

export function snapshotFile(path, limitBytes = AUDIT_REGRESSION_LIMITS.maxReportBytes) {
  const bytes = readFileBounded(path, limitBytes);
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) throw new Error(`Expected non-symlink file: ${path}`);
  return {
    path: realpathSync(path),
    identity: identityRecord(stats),
    sha256: sha256Buffer(bytes),
    limitBytes
  };
}

export function assertSnapshotStable(
  snapshot,
  limitBytes = snapshot.limitBytes ?? AUDIT_REGRESSION_LIMITS.maxReportBytes
) {
  const current = snapshotFile(snapshot.path, limitBytes);
  if (
    JSON.stringify(current.identity) !== JSON.stringify(snapshot.identity) ||
    current.sha256 !== snapshot.sha256
  ) {
    throw new Error(`Evidence changed during operation: ${snapshot.path}`);
  }
}

function scanStrictJson(text) {
  let index = 0;
  const whitespace = () => {
    while (/\s/u.test(text[index] ?? '')) index += 1;
  };
  const stringToken = () => {
    const start = index++;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index++] === '"') return JSON.parse(text.slice(start, index));
    }
    throw new Error('JSON_STRING_UNTERMINATED');
  };
  const value = () => {
    whitespace();
    if (text[index] === '{') {
      index += 1;
      whitespace();
      const keys = new Set();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      while (true) {
        whitespace();
        if (text[index] !== '"') throw new Error('JSON_OBJECT_KEY_REQUIRED');
        const key = stringToken();
        if (keys.has(key)) throw new Error(`JSON_DUPLICATE_KEY:${key}`);
        keys.add(key);
        whitespace();
        if (text[index++] !== ':') throw new Error('JSON_COLON_REQUIRED');
        value();
        whitespace();
        if (text[index] === '}') {
          index += 1;
          return;
        }
        if (text[index++] !== ',') throw new Error('JSON_OBJECT_SEPARATOR_REQUIRED');
      }
    }
    if (text[index] === '[') {
      index += 1;
      whitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      while (true) {
        value();
        whitespace();
        if (text[index] === ']') {
          index += 1;
          return;
        }
        if (text[index++] !== ',') throw new Error('JSON_ARRAY_SEPARATOR_REQUIRED');
      }
    }
    if (text[index] === '"') {
      stringToken();
      return;
    }
    const match = /^(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/u.exec(
      text.slice(index)
    );
    if (!match) throw new Error('JSON_VALUE_INVALID');
    index += match[0].length;
  };
  value();
  whitespace();
  if (index !== text.length) throw new Error('JSON_TRAILING_BYTES');
}

export function assertPlainJson(
  value,
  context,
  depth = 0,
  maximumDepth = AUDIT_REGRESSION_LIMITS.maxJsonDepth
) {
  if (depth > maximumDepth) throw new Error(`JSON depth exceeds limit in ${context.path}`);
  if (value === null) return;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > AUDIT_REGRESSION_LIMITS.maxStringBytes)
      throw new Error(`String value exceeds limit in ${context.path}`);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (const entry of value) assertPlainJson(entry, context, depth + 1, maximumDepth);
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, entry] of Object.entries(value)) {
      if (Buffer.byteLength(key) > AUDIT_REGRESSION_LIMITS.maxObjectKeyBytes)
        throw new Error(`Object key exceeds limit in ${context.path}`);
      assertPlainJson(entry, context, depth + 1, maximumDepth);
    }
    return;
  }
  throw new Error(`Unsupported JSON value in ${context.path}`);
}

export function parseJsonBytesStrict(
  bytes,
  { path = '<buffer>', maximumDepth = AUDIT_REGRESSION_LIMITS.maxJsonDepth } = {}
) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw new Error('JSON_INVALID_UTF8');
  scanStrictJson(text);
  const parsed = JSON.parse(text);
  assertPlainJson(parsed, { path }, 0, maximumDepth);
  return parsed;
}

export function readJsonFileBounded(path, limitBytes = AUDIT_REGRESSION_LIMITS.maxReportBytes) {
  return parseJsonBytesStrict(readFileBounded(path, limitBytes), { path });
}

export function readCanonicalJsonFileBounded(
  path,
  limitBytes = AUDIT_REGRESSION_LIMITS.maxManifestBytes,
  maximumDepth = AUDIT_REGRESSION_LIMITS.maxManifestDepth
) {
  const bytes = readFileBounded(path, limitBytes);
  const parsed = parseJsonBytesStrict(bytes, { path, maximumDepth });
  if (!bytes.equals(canonicalJsonBytes(parsed)))
    throw new Error('Manifest bytes are not exact canonical sorted two-space JSON plus LF.');
  return parsed;
}
