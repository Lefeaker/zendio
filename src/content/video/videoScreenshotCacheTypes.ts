import type { SerializedClipAttachmentBinaryContent } from '../../shared/attachments/clipAttachmentBinary';
import { isObjectRecord } from '../../shared/guards/object';
import {
  DEFAULT_SESSION_DRAFT_TTL_MS,
  SESSION_DRAFT_MAX_ENTRIES
} from '../sessionDrafts/sessionDraftTypes';

export const VIDEO_SCREENSHOT_CACHE_SCHEMA_VERSION = 1 as const;
export const VIDEO_SCREENSHOT_CACHE_KEY_PREFIX = 'aiob.videoScreenshotCache';
export const VIDEO_SCREENSHOT_CACHE_INDEX_KEY = `${VIDEO_SCREENSHOT_CACHE_KEY_PREFIX}.index.v1`;
export const VIDEO_SCREENSHOT_CACHE_TTL_MS = DEFAULT_SESSION_DRAFT_TTL_MS;
export const VIDEO_SCREENSHOT_CACHE_MAX_GLOBAL_ENTRIES = SESSION_DRAFT_MAX_ENTRIES;
export const VIDEO_SCREENSHOT_CACHE_MAX_PAGE_ENTRIES = 50;
export const VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES = 1024 * 1024;
const VIDEO_SCREENSHOT_CACHE_KEY_VERSION_PREFIX = `${VIDEO_SCREENSHOT_CACHE_KEY_PREFIX}.v${VIDEO_SCREENSHOT_CACHE_SCHEMA_VERSION}.`;
const VIDEO_SCREENSHOT_CACHE_MIME_TYPE = 'image/jpeg' as const;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
interface VideoScreenshotCacheIdentity {
  pageKey: string;
  captureId: string;
  id: string;
}
export interface VideoScreenshotCacheRef extends VideoScreenshotCacheIdentity {
  schemaVersion: typeof VIDEO_SCREENSHOT_CACHE_SCHEMA_VERSION;
  key: string;
  fileName: string;
  mimeType: typeof VIDEO_SCREENSHOT_CACHE_MIME_TYPE;
  byteLength: number;
  capturedAt: number;
  expiresAt: number;
}
export interface VideoScreenshotCacheEntry extends VideoScreenshotCacheRef {
  createdAt: number;
  updatedAt: number;
  content: SerializedClipAttachmentBinaryContent;
}
export interface VideoScreenshotCacheIndexEntry extends VideoScreenshotCacheIdentity {
  key: string;
  updatedAt: number;
  expiresAt: number;
  byteLength: number;
}

export function createVideoScreenshotCacheStorageKey(options: {
  pageKey: string;
  captureId: string;
  screenshotId: string;
}): string {
  const { pageKey, captureId, screenshotId } = options;
  return `${VIDEO_SCREENSHOT_CACHE_KEY_VERSION_PREFIX}${pageKey}.${encodeKeyPart(captureId)}.${encodeKeyPart(screenshotId)}`;
}
export function isVideoScreenshotCacheStorageKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(VIDEO_SCREENSHOT_CACHE_KEY_VERSION_PREFIX);
}
export function isVideoScreenshotCacheRef(value: unknown): value is VideoScreenshotCacheRef {
  return normalizeVideoScreenshotCacheRef(value) !== null;
}
export function normalizeVideoScreenshotCacheRef(value: unknown): VideoScreenshotCacheRef | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const schemaVersion = normalizeSchemaVersion(value.schemaVersion);
  const identity = normalizeIdentity(value);
  const key = normalizeStorageKey(value.key, identity);
  const fileName = normalizeNonEmptyString(value.fileName);
  const mimeType = normalizeMimeType(value.mimeType);
  const byteLength = normalizeByteLength(value.byteLength);
  const capturedAt = normalizeTimestamp(value.capturedAt);
  const expiresAt = normalizeTimestamp(value.expiresAt);

  if (
    schemaVersion === null ||
    identity === null ||
    key === null ||
    fileName === null ||
    mimeType === null ||
    byteLength === null ||
    capturedAt === null ||
    expiresAt === null ||
    expiresAt <= capturedAt
  ) {
    return null;
  }
  return {
    schemaVersion,
    key,
    pageKey: identity.pageKey,
    captureId: identity.captureId,
    id: identity.id,
    fileName,
    mimeType,
    byteLength,
    capturedAt,
    expiresAt
  };
}
export function isVideoScreenshotCacheEntry(value: unknown): value is VideoScreenshotCacheEntry {
  return normalizeVideoScreenshotCacheEntry(value) !== null;
}
export function normalizeVideoScreenshotCacheEntry(
  value: unknown
): VideoScreenshotCacheEntry | null {
  const ref = normalizeVideoScreenshotCacheRef(value);
  if (ref === null || !isObjectRecord(value)) {
    return null;
  }
  const createdAt = normalizeTimestamp(value.createdAt);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  const content = normalizeBinaryContent(value.content);
  if (createdAt === null || updatedAt === null || content === null) {
    return null;
  }
  if (
    updatedAt < createdAt ||
    ref.expiresAt <= updatedAt ||
    content.byteLength !== ref.byteLength
  ) {
    return null;
  }

  return {
    ...ref,
    createdAt,
    updatedAt,
    content
  };
}
export function isVideoScreenshotCacheIndexEntry(
  value: unknown
): value is VideoScreenshotCacheIndexEntry {
  return normalizeVideoScreenshotCacheIndexEntry(value) !== null;
}
export function normalizeVideoScreenshotCacheIndexEntry(
  value: unknown
): VideoScreenshotCacheIndexEntry | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const identity = normalizeIdentity(value);
  const key = normalizeStorageKey(value.key, identity);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  const expiresAt = normalizeTimestamp(value.expiresAt);
  const byteLength = normalizeByteLength(value.byteLength);
  if (
    identity === null ||
    key === null ||
    updatedAt === null ||
    expiresAt === null ||
    byteLength === null ||
    expiresAt <= updatedAt
  ) {
    return null;
  }
  return {
    key,
    pageKey: identity.pageKey,
    captureId: identity.captureId,
    id: identity.id,
    updatedAt,
    expiresAt,
    byteLength
  };
}
function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}
function normalizeSchemaVersion(
  value: unknown
): typeof VIDEO_SCREENSHOT_CACHE_SCHEMA_VERSION | null {
  return value === VIDEO_SCREENSHOT_CACHE_SCHEMA_VERSION
    ? VIDEO_SCREENSHOT_CACHE_SCHEMA_VERSION
    : null;
}
function normalizeIdentity(value: Record<string, unknown>): VideoScreenshotCacheIdentity | null {
  const pageKey = normalizeNonEmptyString(value.pageKey);
  const captureId = normalizeNonEmptyString(value.captureId);
  const id = normalizeNonEmptyString(value.id);
  if (pageKey === null || captureId === null || id === null) {
    return null;
  }
  return { pageKey, captureId, id };
}
function normalizeStorageKey(
  value: unknown,
  identity: VideoScreenshotCacheIdentity | null
): string | null {
  if (identity === null || typeof value !== 'string' || !isVideoScreenshotCacheStorageKey(value)) {
    return null;
  }
  const expected = createVideoScreenshotCacheStorageKey({
    pageKey: identity.pageKey,
    captureId: identity.captureId,
    screenshotId: identity.id
  });
  return value === expected ? expected : null;
}
function normalizeMimeType(value: unknown): typeof VIDEO_SCREENSHOT_CACHE_MIME_TYPE | null {
  return value === VIDEO_SCREENSHOT_CACHE_MIME_TYPE ? VIDEO_SCREENSHOT_CACHE_MIME_TYPE : null;
}
function normalizeNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function normalizeTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
function normalizeByteLength(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES
    ? value
    : null;
}
function normalizeBinaryContent(value: unknown): SerializedClipAttachmentBinaryContent | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const { encoding, data, byteLength } = value;
  const normalizedByteLength = normalizeByteLength(byteLength);
  if (
    encoding !== 'base64' ||
    typeof data !== 'string' ||
    data.length === 0 ||
    !BASE64_PATTERN.test(data) ||
    normalizedByteLength === null
  ) {
    return null;
  }
  return { encoding: 'base64', data, byteLength: normalizedByteLength };
}
