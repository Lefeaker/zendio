import type { SessionDraftMode } from './sessionDraftTypes';

const SESSION_DRAFT_KEY_PREFIX = 'aiob.sessionDraft';
const TEXT_FRAGMENT_MARKER = ':~:text=';

export const SESSION_DRAFT_INDEX_KEY = `${SESSION_DRAFT_KEY_PREFIX}.index.v1`;

function extractReaderHash(hash: string): string {
  const markerIndex = hash.indexOf(TEXT_FRAGMENT_MARKER);
  if (markerIndex === -1) {
    return '';
  }
  return `#${hash.slice(markerIndex)}`;
}

function hashSessionDraftKey(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function encodeDraftId(draftId: string): string {
  return encodeURIComponent(draftId);
}

export function normalizeSessionDraftPageUrl(mode: SessionDraftMode, pageUrl: string): string {
  const parsed = new URL(pageUrl);
  const hash = mode === 'reader' ? extractReaderHash(parsed.hash) : '';
  return `${parsed.origin}${parsed.pathname}${parsed.search}${hash}`;
}

export function createSessionDraftPageKey(mode: SessionDraftMode, pageUrl: string): string {
  return hashSessionDraftKey(`${mode}:${normalizeSessionDraftPageUrl(mode, pageUrl)}`);
}

export function createSessionDraftStorageKey(options: {
  mode: SessionDraftMode;
  pageKey: string;
  draftId: string;
}): string {
  const { mode, pageKey, draftId } = options;
  return `${SESSION_DRAFT_KEY_PREFIX}.v1.${mode}.${pageKey}.${encodeDraftId(draftId)}`;
}

export function isSessionDraftStorageKey(value: string): boolean {
  return value.startsWith(`${SESSION_DRAFT_KEY_PREFIX}.v1.`);
}
