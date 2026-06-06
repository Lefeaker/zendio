import { z } from 'zod';
import {
  createExportDestinationMetadata,
  parseExportDestinationMetadata,
  type ExportDestinationMetadata
} from '@shared/exportDestination';
import {
  SESSION_DRAFT_SCHEMA_VERSION,
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  type ReaderSessionDraftEnvelope,
  type ReaderSessionDraftHighlightPayload,
  type SessionCommentDraftSnapshot,
  type SessionDraftRepository,
  type SessionDraftStatus
} from '@content/sessionDrafts';
import type { ReaderHighlightManager, ReaderHighlightRecord } from './services/highlightManager';
import { createDetachedReaderHighlight } from './sessionOperations';

const ReaderDraftHighlightSchema = z.object({
  id: z.string().min(1),
  selectedHtml: z.string(),
  selectedText: z.string(),
  comment: z.string(),
  fragmentUrl: z.string(),
  createdAt: z.number().int().nonnegative().finite()
});

const ReaderDraftPayloadSchema = z.object({
  mode: z.literal('reader'),
  url: z.string().url(),
  title: z.string(),
  destination: z
    .object({
      kind: z.enum(['vault', 'downloads']),
      vaultId: z.string().optional()
    })
    .optional(),
  highlights: z.array(ReaderDraftHighlightSchema),
  commentDrafts: z.record(z.string(), z.string())
});

export interface ReaderSessionDraftPayloadV1 {
  mode: 'reader';
  url: string;
  title: string;
  destination?: ExportDestinationMetadata;
  highlights: ReaderSessionDraftHighlightPayload[];
  commentDrafts: SessionCommentDraftSnapshot;
}

export interface LoadedReaderSessionDraft {
  envelope: ReaderSessionDraftEnvelope;
  storageKey: string;
  payload: ReaderSessionDraftPayloadV1;
}

export interface RestoredReaderHighlights {
  highlights: ReaderHighlightRecord[];
  detachedHighlightIds: string[];
}

interface TextSegment {
  node: Text;
  start: number;
  end: number;
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
  status: SessionDraftStatus;
}): ReaderSessionDraftEnvelope | null {
  const highlights = args.highlights.map((highlight) => ({
    id: highlight.id,
    selectedHtml: highlight.selectedHtml,
    selectedText: highlight.selectedText,
    comment: highlight.comment,
    fragmentUrl: highlight.fragmentUrl,
    createdAt: highlight.createdAt
  }));
  const commentDrafts = sanitizeCommentDrafts(args.commentDrafts);

  if (highlights.length === 0 && Object.keys(commentDrafts).length === 0) {
    return null;
  }

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

export async function loadLatestReaderSessionDraft(
  repository: SessionDraftRepository,
  pageUrl: string
): Promise<LoadedReaderSessionDraft | null> {
  const envelope = await repository.loadLatest('reader', pageUrl);
  if (!envelope || envelope.mode !== 'reader') {
    return null;
  }

  const storageKey = createSessionDraftStorageKey({
    mode: envelope.mode,
    pageKey: envelope.pageKey,
    draftId: envelope.draftId
  });
  const parsed = ReaderDraftPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    await repository.remove({ key: storageKey });
    return null;
  }

  const destinationSelection = parseExportDestinationMetadata(parsed.data.destination);

  return {
    envelope,
    storageKey,
    payload: {
      mode: 'reader',
      url: parsed.data.url,
      title: parsed.data.title,
      highlights: parsed.data.highlights,
      commentDrafts: parsed.data.commentDrafts,
      ...(destinationSelection
        ? { destination: createExportDestinationMetadata(destinationSelection) }
        : {})
    }
  };
}

export function restoreReaderSessionDraftHighlights(args: {
  doc: Document;
  highlightManager: ReaderHighlightManager;
  highlights: ReaderSessionDraftHighlightPayload[];
}): RestoredReaderHighlights {
  const resolveRange = createExactTextRangeResolver(args.doc);
  const restored: ReaderHighlightRecord[] = [];
  const detachedHighlightIds: string[] = [];

  for (const storedHighlight of args.highlights) {
    const range = resolveRange(storedHighlight.selectedText);
    const createdHighlight =
      range &&
      args.highlightManager.createHighlight({
        id: storedHighlight.id,
        range,
        selectedHtml: storedHighlight.selectedHtml,
        selectedText: storedHighlight.selectedText,
        comment: storedHighlight.comment,
        fragmentUrl: storedHighlight.fragmentUrl
      });
    range?.detach?.();

    const highlight =
      createdHighlight ??
      createDetachedReaderHighlight(
        args.doc,
        storedHighlight.id,
        storedHighlight.selectedHtml,
        storedHighlight.selectedText,
        storedHighlight.comment,
        storedHighlight.fragmentUrl,
        storedHighlight.createdAt
      );

    highlight.createdAt = storedHighlight.createdAt;
    restored.push(highlight);
    if (!createdHighlight) {
      detachedHighlightIds.push(storedHighlight.id);
    }
  }

  return { highlights: restored, detachedHighlightIds };
}

function sanitizeCommentDrafts(drafts: SessionCommentDraftSnapshot): SessionCommentDraftSnapshot {
  return Object.fromEntries(Object.entries(drafts).filter(([id]) => id.trim().length > 0));
}

function createExactTextRangeResolver(doc: Document): (selectedText: string) => Range | null {
  const { fullText, segments } = collectTextSegments(doc);
  const claimedSpans: Array<{ start: number; end: number }> = [];

  return (selectedText: string): Range | null => {
    if (!selectedText) {
      return null;
    }

    let searchIndex = 0;
    while (searchIndex <= fullText.length) {
      const start = fullText.indexOf(selectedText, searchIndex);
      if (start === -1) {
        return null;
      }
      const end = start + selectedText.length;
      searchIndex = start + Math.max(selectedText.length, 1);

      if (claimedSpans.some((span) => start < span.end && end > span.start)) {
        continue;
      }

      const range = createRangeFromOffsets(doc, segments, start, end);
      if (!range) {
        continue;
      }
      if (range.toString() !== selectedText) {
        range.detach?.();
        continue;
      }

      claimedSpans.push({ start, end });
      return range;
    }

    return null;
  };
}

function collectTextSegments(doc: Document): { fullText: string; segments: TextSegment[] } {
  const root = doc.body ?? doc.documentElement;
  if (!root) {
    return { fullText: '', segments: [] };
  }

  const segments: TextSegment[] = [];
  let fullText = '';
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text) || node.data.length === 0) {
        return NodeFilter.FILTER_REJECT;
      }
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const start = fullText.length;
    fullText += node.data;
    segments.push({ node, start, end: fullText.length });
    current = walker.nextNode();
  }

  return { fullText, segments };
}

function createRangeFromOffsets(
  doc: Document,
  segments: TextSegment[],
  start: number,
  end: number
): Range | null {
  const startPosition = locateTextPosition(segments, start);
  const endPosition = locateTextPosition(segments, end);
  if (!startPosition || !endPosition) {
    return null;
  }

  const range = doc.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  return range;
}

function locateTextPosition(
  segments: TextSegment[],
  absoluteOffset: number
): { node: Text; offset: number } | null {
  if (segments.length === 0) {
    return null;
  }

  for (const segment of segments) {
    if (absoluteOffset < segment.end) {
      return {
        node: segment.node,
        offset: absoluteOffset - segment.start
      };
    }
    if (absoluteOffset === segment.end) {
      return {
        node: segment.node,
        offset: segment.node.data.length
      };
    }
  }

  return null;
}
