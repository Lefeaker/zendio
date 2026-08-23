import { z } from 'zod';
import {
  createExportDestinationMetadata,
  parseExportDestinationMetadata,
  type ExportDestinationMetadata
} from '@shared/exportDestination';
import {
  createSessionDraftStorageKey,
  type ReaderSessionDraftEnvelope,
  type ReaderSessionDraftHighlightPayload,
  type ReaderSessionDraftPayload,
  SessionDraftEnvelopeSchema,
  type SessionCommentDraftSnapshot,
  type SessionDraftSelectAndClaimResult
} from '@shared/sessionDrafts';
import type { SessionDraftMessageRepository } from '../sessionDrafts/sessionDraftRepository';
import type { ReaderHighlightManager, ReaderHighlightRecord } from './services/highlightManager';
import { createDetachedReaderHighlight } from './sessionOperationSelection';
import { createExactTextRangeResolver } from './sessionDraftTextResolver';
import {
  buildReaderSessionDraftEnvelope,
  countStoredReaderDraftHighlights,
  createReaderSessionDraftId
} from './sessionDraftPayload';

export { buildReaderSessionDraftEnvelope, createReaderSessionDraftId };

export function bindReaderSessionDraftLifecycle(
  doc: Document,
  flushForRestore: () => Promise<void>
): () => void {
  const flush = () => void flushForRestore();
  doc.defaultView?.addEventListener('pagehide', flush, { passive: true });
  doc.defaultView?.addEventListener('beforeunload', flush);
  return () => {
    doc.defaultView?.removeEventListener('pagehide', flush);
    doc.defaultView?.removeEventListener('beforeunload', flush);
  };
}

export async function discardReaderSessionDraftCandidate(
  repository: Pick<SessionDraftMessageRepository, 'remove'>,
  storageKey: string
): Promise<void> {
  try {
    await repository.remove({ key: storageKey });
  } catch (error) {
    console.warn('[ReaderSession] Failed to discard invalid stored session draft:', error);
  }
}

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

export interface ReaderSessionDraftPayloadV1 extends ReaderSessionDraftPayload {
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

export async function loadLatestReaderSessionDraft(
  repository: Pick<SessionDraftMessageRepository, 'selectAndClaim' | 'remove'>,
  pageUrl: string
): Promise<LoadedReaderSessionDraft | null> {
  const result = await loadReaderDraftCandidate(repository, pageUrl);
  return result.kind === 'loaded' ? result.draft : null;
}

async function loadReaderDraftCandidate(
  repository: Pick<SessionDraftMessageRepository, 'selectAndClaim' | 'remove'> &
    Partial<Pick<SessionDraftMessageRepository, 'adoptClaimed'>>,
  pageUrl: string,
  initialClaimedDraft?: ReaderSessionDraftEnvelope
): Promise<
  | { kind: 'none' }
  | {
      kind: 'invalid';
      storageKey: string;
      highlightCount: number;
      cleanup: ReaderSessionDraftLoadCleanup;
    }
  | { kind: 'loaded'; draft: LoadedReaderSessionDraft }
> {
  const parsedInitial = initialClaimedDraft
    ? SessionDraftEnvelopeSchema.safeParse(initialClaimedDraft)
    : null;
  if (parsedInitial && !parsedInitial.success) {
    throw new Error('SESSION_DRAFT_REVISION_INVALID');
  }
  if (parsedInitial?.success) {
    repository.adoptClaimed?.(parsedInitial.data);
  }
  const selected: SessionDraftSelectAndClaimResult = initialClaimedDraft
    ? {
        outcome: 'claimed',
        revision: parsedInitial?.success ? parsedInitial.data.revision : 0,
        envelope: parsedInitial?.success ? parsedInitial.data : undefined,
        selectionReason: 'restorable',
        invalidRemovedCount: 0
      }
    : await repository.selectAndClaim({
        operation: 'selectAndClaim',
        requestId:
          typeof globalThis.crypto?.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `reader-claim-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode: 'reader',
        pageUrl
      });
  if (selected.outcome === 'conflict' || selected.outcome === 'recovery_failed') {
    throw new Error(selected.code);
  }
  if (selected.outcome === 'invalid_removed') {
    return {
      kind: 'invalid',
      storageKey: '',
      highlightCount: selected.invalidRemovedCount,
      cleanup: 'removed'
    };
  }
  if (selected.outcome !== 'claimed' || !selected.envelope || selected.envelope.mode !== 'reader') {
    return { kind: 'none' };
  }
  const stored = selected.envelope;
  const storageKey = createSessionDraftStorageKey({
    mode: stored.mode,
    pageKey: stored.pageKey,
    draftId: stored.draftId
  });
  const parsed = ReaderDraftPayloadSchema.safeParse(stored.payload);
  if (!parsed.success) {
    const highlightCount = countStoredReaderDraftHighlights(stored.payload);
    try {
      await repository.remove({ key: storageKey });
      return { kind: 'invalid', storageKey, highlightCount, cleanup: 'removed' };
    } catch {
      return { kind: 'invalid', storageKey, highlightCount, cleanup: 'remove_failed' };
    }
  }

  const destinationSelection = parseExportDestinationMetadata(parsed.data.destination);
  const payload: ReaderSessionDraftPayloadV1 = {
    mode: 'reader',
    url: parsed.data.url,
    title: parsed.data.title,
    highlights: parsed.data.highlights,
    commentDrafts: parsed.data.commentDrafts,
    ...(destinationSelection
      ? { destination: createExportDestinationMetadata(destinationSelection) }
      : {})
  };
  const { lease, legacyCleanup, ...baseEnvelope } = stored;
  const envelope: ReaderSessionDraftEnvelope = {
    ...baseEnvelope,
    mode: 'reader',
    payload,
    ...(lease ? { lease } : {}),
    ...(legacyCleanup ? { legacyCleanup } : {})
  };

  return {
    kind: 'loaded',
    draft: {
      envelope,
      storageKey,
      payload
    }
  };
}

export async function loadLatestReaderSessionDraftResult(
  repository: Pick<SessionDraftMessageRepository, 'selectAndClaim' | 'remove'>,
  pageUrl: string,
  initialClaimedDraft?: ReaderSessionDraftEnvelope
): Promise<LoadedReaderSessionDraftResult> {
  const result = await loadReaderDraftCandidate(repository, pageUrl, initialClaimedDraft);
  if (result.kind === 'none') {
    return {
      status: 'none',
      highlightCount: 0,
      cleanup: 'not_needed'
    };
  }
  if (result.kind === 'invalid') {
    return {
      status: 'invalid_removed',
      highlightCount: result.highlightCount,
      cleanup: result.cleanup,
      storageKey: result.storageKey
    };
  }
  return {
    status: 'loaded',
    highlightCount: result.draft.payload.highlights.length,
    cleanup: 'not_needed',
    draft: result.draft
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
