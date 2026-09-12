import {
  SESSION_DRAFT_SCHEMA_VERSION,
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  filterSessionCommentDraftsForRetainedIds,
  selectRetainedSessionDraftItems,
  type ReaderSessionDraftEnvelope,
  type ReaderSessionDraftHighlightPayload,
  type SessionCommentDraftSnapshot,
  type SessionDraftStatus
} from '@shared/sessionDrafts';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import type { ReaderHighlightRecord } from './services/highlightManager';

export type ReaderDraftRetentionPolicy = Parameters<typeof selectRetainedSessionDraftItems>[1];

export function createReaderSessionDraftPayload(args: {
  highlights: ReaderHighlightRecord[];
  commentDrafts: SessionCommentDraftSnapshot;
  retentionPolicy?: ReaderDraftRetentionPolicy;
}): {
  highlights: ReaderSessionDraftHighlightPayload[];
  commentDrafts: SessionCommentDraftSnapshot;
} {
  const highlightPayloads = args.highlights.map((highlight) => ({
    id: highlight.id,
    selectedHtml: highlight.selectedHtml,
    selectedText: highlight.selectedText,
    comment: highlight.comment,
    fragmentUrl: highlight.fragmentUrl,
    createdAt: highlight.createdAt
  }));
  const highlights = selectRetainedSessionDraftItems(highlightPayloads, args.retentionPolicy);
  const commentDrafts = filterSessionCommentDraftsForRetainedIds(
    sanitizeCommentDrafts(args.commentDrafts),
    highlights.map((highlight) => highlight.id)
  );
  return { highlights, commentDrafts };
}

export function sanitizeCommentDrafts(
  drafts: SessionCommentDraftSnapshot
): SessionCommentDraftSnapshot {
  return Object.fromEntries(Object.entries(drafts).filter(([id]) => id.trim().length > 0));
}

export function countStoredReaderDraftHighlights(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    return 0;
  }
  const { highlights } = payload as { highlights?: unknown };
  return Array.isArray(highlights) ? highlights.length : 0;
}

export function createReaderSessionDraftId(now = Date.now()): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `reader-${globalThis.crypto.randomUUID()}`;
  }
  return `reader-${now}-${Math.random().toString(16).slice(2)}`;
}

export function buildReaderSessionDraftEnvelope(args: {
  draftId: string;
  createdAt: number;
  now?: number;
  pageUrl: string;
  pageTitle: string;
  destination?: ExportDestinationMetadata;
  highlights: ReaderHighlightRecord[];
  commentDrafts: SessionCommentDraftSnapshot;
  retentionPolicy?: ReaderDraftRetentionPolicy;
  status: SessionDraftStatus;
}): ReaderSessionDraftEnvelope | null {
  const { highlights, commentDrafts } = createReaderSessionDraftPayload(args);
  if (highlights.length === 0 && Object.keys(commentDrafts).length === 0) return null;
  const updatedAt = args.now ?? Date.now();
  return {
    schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
    draftId: args.draftId,
    mode: 'reader',
    pageKey: createSessionDraftPageKey('reader', args.pageUrl),
    pageUrl: args.pageUrl,
    pageTitle: args.pageTitle,
    createdAt: args.createdAt,
    updatedAt,
    expiresAt: updatedAt,
    status: args.status,
    payload: {
      mode: 'reader',
      url: args.pageUrl,
      title: args.pageTitle,
      ...(args.destination ? { destination: args.destination } : {}),
      highlights,
      commentDrafts
    }
  };
}

export function buildReaderSessionDraftState(args: {
  draftId: string | null;
  createdAt: number | null;
  pageUrl: string;
  pageTitle: string;
  destination?: ExportDestinationMetadata;
  highlights: ReaderHighlightRecord[];
  commentDrafts: SessionCommentDraftSnapshot;
  retentionPolicy?: ReaderDraftRetentionPolicy;
  status: SessionDraftStatus;
}) {
  const now = Date.now();
  const draftId = args.draftId ?? createReaderSessionDraftId(now);
  const createdAt = args.createdAt ?? now;
  const envelope = buildReaderSessionDraftEnvelope({ ...args, draftId, createdAt, now });
  if (!envelope) return null;
  return {
    envelope,
    draftId,
    createdAt,
    storageKey: createSessionDraftStorageKey(envelope)
  };
}

export function hasPersistableReaderSessionDraftContent(
  highlights: readonly ReaderHighlightRecord[],
  commentDrafts: SessionCommentDraftSnapshot
): boolean {
  return highlights.length > 0 || Object.keys(commentDrafts).length > 0;
}
