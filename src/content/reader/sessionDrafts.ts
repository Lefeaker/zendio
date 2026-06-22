import { z } from 'zod';
import {
  createExportDestinationMetadata,
  parseExportDestinationMetadata,
  type ExportDestinationMetadata
} from '@shared/exportDestination';
import {
  SESSION_DRAFT_INDEX_KEY,
  SESSION_DRAFT_SCHEMA_VERSION,
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  SessionDraftIndexSchema,
  type ReaderSessionDraftEnvelope,
  type ReaderSessionDraftHighlightPayload,
  type SessionCommentDraftSnapshot,
  type SessionDraftRepository,
  type SessionDraftStatus
} from '@content/sessionDrafts';
import type { ReaderHighlightManager, ReaderHighlightRecord } from './services/highlightManager';
import type { StorageAreaService } from '@platform/interfaces/storage';
import { createDetachedReaderHighlight } from './sessionOperationSelection';
import { createExactTextRangeResolver } from './sessionDraftTextResolver';
import {
  countStoredReaderDraftHighlights,
  createReaderSessionDraftPayload,
  type ReaderDraftRetentionPolicy
} from './sessionDraftPayload';

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

export type ReaderSessionDraftLoadCleanup = 'not_needed' | 'removed' | 'remove_failed';

export type LoadedReaderSessionDraftResult =
  | {
      status: 'none';
      highlightCount: number;
      cleanup: ReaderSessionDraftLoadCleanup;
    }
  | {
      status: 'loaded';
      highlightCount: number;
      cleanup: ReaderSessionDraftLoadCleanup;
      draft: LoadedReaderSessionDraft;
    }
  | {
      status: 'invalid_removed';
      highlightCount: number;
      cleanup: ReaderSessionDraftLoadCleanup;
      storageKey: string;
    };

export interface RestoredReaderHighlights {
  highlights: ReaderHighlightRecord[];
  detachedHighlightIds: string[];
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
  const { highlights, commentDrafts } = createReaderSessionDraftPayload({
    highlights: args.highlights,
    commentDrafts: args.commentDrafts,
    retentionPolicy: args.retentionPolicy
  });
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

export async function loadLatestReaderSessionDraftResult(
  repository: SessionDraftRepository,
  storageArea: StorageAreaService,
  pageUrl: string
): Promise<LoadedReaderSessionDraftResult> {
  const candidate = await findLatestReaderDraftCandidate(storageArea, pageUrl);
  const draft = await loadLatestReaderSessionDraft(repository, pageUrl);
  if (!draft) {
    if (!candidate) {
      return {
        status: 'none',
        highlightCount: 0,
        cleanup: 'not_needed'
      };
    }
    return {
      status: 'invalid_removed',
      highlightCount: candidate.highlightCount,
      cleanup: await removeReaderDraftCandidate(repository, candidate.storageKey),
      storageKey: candidate.storageKey
    };
  }
  return {
    status: 'loaded',
    highlightCount: draft.payload.highlights.length,
    cleanup: 'not_needed',
    draft
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

async function findLatestReaderDraftCandidate(
  storageArea: StorageAreaService,
  pageUrl: string
): Promise<{ storageKey: string; highlightCount: number } | null> {
  const rawIndex = await storageArea.get<unknown>(SESSION_DRAFT_INDEX_KEY);
  const parsedIndex = SessionDraftIndexSchema.safeParse(rawIndex);
  if (!parsedIndex.success) {
    return null;
  }

  const pageKey = createSessionDraftPageKey('reader', pageUrl);
  const candidates = parsedIndex.data.entries
    .filter(
      (entry) =>
        entry.mode === 'reader' && entry.pageKey === pageKey && entry.status === 'restorable'
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const latest = candidates[0];
  if (!latest) {
    return null;
  }

  const rawEnvelope = await storageArea.get<unknown>(latest.key);
  const payload =
    typeof rawEnvelope === 'object' && rawEnvelope !== null
      ? (rawEnvelope as { payload?: unknown }).payload
      : undefined;
  return {
    storageKey: latest.key,
    highlightCount: countStoredReaderDraftHighlights(payload)
  };
}

async function removeReaderDraftCandidate(
  repository: SessionDraftRepository,
  storageKey: string
): Promise<ReaderSessionDraftLoadCleanup> {
  try {
    await repository.remove({ key: storageKey });
    return 'removed';
  } catch {
    return 'remove_failed';
  }
}
