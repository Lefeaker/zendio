import type { VideoCapture, VideoFragmentCapture, VideoTimestampCapture } from './types';
import {
  decodeLegacyVideoCapture,
  digestLegacyVideoCaptureJson,
  type CanonicalLegacyFragmentCapture,
  type CanonicalLegacyTimestampCapture,
  type CanonicalLegacyVideoCapture,
  type CanonicalLegacyVideoCaptureData
} from '../../shared/sessionDrafts/legacyVideoCapture';
import type {
  SessionDraftEnvelope as PersistedSessionDraftEnvelope,
  VideoSessionDraftEnvelope
} from '@shared/sessionDrafts';
import type { SessionDraftMessageRepository } from '../sessionDrafts/sessionDraftRepository';
import type { SessionDraftPersister } from '../sessionDrafts';
import { createVideoSessionDraftStorageKey } from './sessionDrafts';

export type StoredVideoTimestampEntry = CanonicalLegacyTimestampCapture;
export type StoredVideoFragmentEntry = CanonicalLegacyFragmentCapture;
export type StoredVideoCaptureEntry = CanonicalLegacyVideoCapture;
export type StoredVideoCaptureData = CanonicalLegacyVideoCaptureData;
export interface LoadedStoredVideoCaptureData extends StoredVideoCaptureData {
  migration: {
    legacyKey: string;
    rawDigest: string;
    canonicalDigest: string;
    canonicalLegacy: CanonicalLegacyVideoCaptureData;
  };
}
export type LegacyVideoCaptureMigration = LoadedStoredVideoCaptureData['migration'];

export function createLegacyVideoMigrationRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `video-migrate-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export async function persistLegacyVideoCaptureMigration(args: {
  repository: Pick<SessionDraftMessageRepository, 'migrateLegacyVideoCapture' | 'readExact'>;
  migration: LegacyVideoCaptureMigration;
  requestId: string;
  envelope: VideoSessionDraftEnvelope;
}): Promise<{ envelope: PersistedSessionDraftEnvelope; cleanupPending: boolean }> {
  const key = createVideoSessionDraftStorageKey(args.envelope.pageUrl, args.envelope.draftId);
  const migrated = await args.repository.migrateLegacyVideoCapture({
    operation: 'migrateLegacyVideoCapture',
    requestId: args.requestId,
    key,
    legacyKey: args.migration.legacyKey,
    rawDigest: args.migration.rawDigest,
    canonicalDigest: args.migration.canonicalDigest,
    canonicalLegacy: args.migration.canonicalLegacy,
    draft: {
      draftId: args.envelope.draftId,
      mode: args.envelope.mode,
      pageUrl: args.envelope.pageUrl,
      pageTitle: args.envelope.pageTitle,
      payload: args.envelope.payload as PersistedSessionDraftEnvelope['payload']
    }
  });
  if (migrated.outcome === 'migrated' && migrated.envelope) {
    return { envelope: migrated.envelope, cleanupPending: false };
  }
  if (migrated.outcome === 'conflict' && migrated.code === 'MIGRATION_CLEANUP_PENDING') {
    const pending = await args.repository.readExact({ operation: 'readExact', key });
    if (pending.outcome === 'found' && pending.envelope.schemaVersion === 2) {
      return { envelope: pending.envelope, cleanupPending: true };
    }
  }
  throw new Error(
    migrated.outcome === 'conflict' || migrated.outcome === 'recovery_failed'
      ? migrated.code
      : 'SESSION_DRAFT_MIGRATION_FAILED'
  );
}

export async function flushVideoSessionDraftPersister(
  persister: Pick<SessionDraftPersister, 'scheduleSave' | 'flushNow'>
): Promise<void> {
  const pending = persister.scheduleSave();
  try {
    await persister.flushNow();
    await pending;
  } catch (error) {
    await pending.catch(() => undefined);
    throw error;
  }
}

export interface StorageNamespace {
  get<T>(key: string): Promise<T | undefined>;
}

export interface DeserializeContext {
  fallbackUrl: string;
}

type VideoTimestampCaptureWithScreenshotIntent = VideoTimestampCapture & {
  screenshotRequested?: boolean;
};

export function deserializeStoredCaptures(
  entries: StoredVideoCaptureEntry[],
  ctx: DeserializeContext
): VideoCapture[] {
  return entries.map((entry) => {
    if (entry.kind === 'fragment') {
      const fragmentEntry = entry as StoredVideoFragmentEntry;
      const selectedHtml = fragmentEntry.selectedHtml ?? fragmentEntry.selectedText ?? '';
      const fragmentUrl = fragmentEntry.fragmentUrl ?? ctx.fallbackUrl;
      const capture: VideoFragmentCapture = {
        kind: 'fragment',
        id: fragmentEntry.id,
        comment: fragmentEntry.comment ?? '',
        selectedText: fragmentEntry.selectedText ?? '',
        selectedHtml,
        fragmentUrl,
        createdAt: fragmentEntry.createdAt
      };
      if (fragmentEntry.wrapperId !== undefined) {
        capture.wrapperId = fragmentEntry.wrapperId;
      }
      return capture;
    }
    const timestampEntry = entry as StoredVideoTimestampEntry;
    const capture: VideoTimestampCaptureWithScreenshotIntent = {
      kind: 'timestamp',
      id: timestampEntry.id,
      timeSec: timestampEntry.timeSec,
      comment: timestampEntry.comment,
      url: timestampEntry.url || ctx.fallbackUrl,
      createdAt: timestampEntry.createdAt,
      ...(timestampEntry.screenshotRequested ? { screenshotRequested: true } : {})
    };
    return capture;
  });
}

export async function loadStoredCaptureData(
  storage: StorageNamespace,
  key: string
): Promise<LoadedStoredVideoCaptureData | undefined> {
  const raw = await storage.get<unknown>(key);
  if (raw === undefined) return undefined;
  const decoded = decodeLegacyVideoCapture(raw);
  if (!decoded.ok) throw new Error(`LEGACY_VIDEO_CAPTURE_${decoded.issue}`);
  return {
    ...decoded.value,
    migration: {
      legacyKey: key,
      rawDigest: await digestLegacyVideoCaptureJson(decoded.rawCanonicalJson),
      canonicalDigest: await digestLegacyVideoCaptureJson(decoded.canonicalJson),
      canonicalLegacy: decoded.value
    }
  };
}
