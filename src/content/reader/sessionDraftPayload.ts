import {
  filterSessionCommentDraftsForRetainedIds,
  selectRetainedSessionDraftItems,
  type ReaderSessionDraftHighlightPayload,
  type SessionCommentDraftSnapshot
} from '@content/sessionDrafts';
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
