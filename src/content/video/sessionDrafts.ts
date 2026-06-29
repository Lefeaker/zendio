import {
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  filterSessionCommentDraftsForRetainedIds,
  SESSION_DRAFT_SCHEMA_VERSION,
  selectRetainedSessionDraftItems,
  type SessionCommentDraftSnapshot,
  type SessionDraftRetentionPolicy,
  type SessionDraftStatus,
  type VideoSessionDraftEnvelope,
  type VideoSessionDraftPayload
} from '../sessionDrafts';
import type { ExportDestinationMetadata } from '../../shared/exportDestination';
import type { VideoCapture } from './types';
import type { VideoPlatform } from './utils';
import {
  normalizeVideoScreenshotCacheRef,
  type VideoScreenshotCacheRef
} from './videoScreenshotCacheTypes';

export interface VideoSessionDraftTimestampCaptureDraft {
  kind: 'timestamp';
  id: string;
  timeSec: number;
  url: string;
  comment: string;
  createdAt: number;
  screenshotRequested?: boolean;
  screenshotRef?: VideoScreenshotCacheRef;
}

export interface VideoSessionDraftFragmentCaptureDraft {
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

export type VideoSessionDraftCaptureDraft =
  | VideoSessionDraftTimestampCaptureDraft
  | VideoSessionDraftFragmentCaptureDraft;

export interface VideoSessionDraftPayloadShape extends VideoSessionDraftPayload {
  mode: 'video';
  platform: VideoPlatform;
  videoId: string | null;
  videoUrl: string;
  canonicalUrl: string;
  videoTitle: string;
  destination?: ExportDestinationMetadata;
  captures: VideoSessionDraftCaptureDraft[];
}

export interface BuildVideoSessionDraftPayloadArgs {
  captures: VideoCapture[];
  commentDrafts: SessionCommentDraftSnapshot;
  destination?: ExportDestinationMetadata;
  platform: VideoPlatform;
  videoId: string | null;
  videoUrl: string;
  canonicalUrl: string;
  videoTitle: string;
  retentionPolicy?: Partial<SessionDraftRetentionPolicy> | null | undefined;
}

export interface HydratedVideoSessionDraft {
  captures: VideoCapture[];
  commentDrafts: SessionCommentDraftSnapshot;
  destination?: ExportDestinationMetadata;
  platform: VideoPlatform;
  videoId: string | null;
  videoUrl: string;
  canonicalUrl: string;
  videoTitle: string;
}

export interface CreateVideoSessionDraftEnvelopeArgs {
  draftId: string;
  pageUrl: string;
  pageTitle: string;
  updatedAt: number;
  payload: VideoSessionDraftPayloadShape;
  createdAt?: number;
  expiresAt?: number;
  status?: SessionDraftStatus;
}

export function createVideoSessionDraftId(now = Date.now()): string {
  return `video-draft-${now}-${Math.random().toString(16).slice(2)}`;
}

export function createVideoSessionDraftStorageKey(pageUrl: string, draftId: string): string {
  return createSessionDraftStorageKey({
    mode: 'video',
    pageKey: createSessionDraftPageKey('video', pageUrl),
    draftId
  });
}

export function buildVideoSessionDraftPayload(
  args: BuildVideoSessionDraftPayloadArgs
): VideoSessionDraftPayloadShape {
  const captures = selectRetainedSessionDraftItems(args.captures, args.retentionPolicy).map(
    serializeVideoDraftCapture
  );
  const commentDrafts = filterSessionCommentDraftsForRetainedIds(
    args.commentDrafts,
    captures.map((capture) => capture.id)
  );

  return {
    mode: 'video',
    platform: args.platform,
    videoId: args.videoId,
    videoUrl: args.videoUrl,
    canonicalUrl: args.canonicalUrl,
    videoTitle: args.videoTitle,
    ...(args.destination ? { destination: args.destination } : {}),
    commentDrafts,
    captures
  };
}

export function deserializeVideoDraftCaptures(
  captures: VideoSessionDraftCaptureDraft[] | undefined,
  ctx: { fallbackUrl: string }
): VideoCapture[] {
  return (captures ?? []).map((capture) => deserializeVideoDraftCapture(capture, ctx.fallbackUrl));
}

export function hydrateVideoSessionDraft(
  payload: VideoSessionDraftPayloadShape,
  fallbackUrl: string
): HydratedVideoSessionDraft {
  return {
    captures: deserializeVideoDraftCaptures(payload.captures, { fallbackUrl }),
    commentDrafts: { ...(payload.commentDrafts ?? {}) },
    ...(payload.destination ? { destination: payload.destination } : {}),
    platform: payload.platform,
    videoId: payload.videoId,
    videoUrl: payload.videoUrl,
    canonicalUrl: payload.canonicalUrl,
    videoTitle: payload.videoTitle
  };
}

export function createVideoSessionDraftEnvelope(
  args: CreateVideoSessionDraftEnvelopeArgs
): VideoSessionDraftEnvelope {
  const createdAt = args.createdAt ?? args.updatedAt;
  return {
    schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
    draftId: args.draftId,
    mode: 'video',
    pageKey: createSessionDraftPageKey('video', args.pageUrl),
    pageUrl: args.pageUrl,
    pageTitle: args.pageTitle,
    createdAt,
    updatedAt: args.updatedAt,
    expiresAt: args.expiresAt ?? args.updatedAt,
    status: args.status ?? 'active',
    payload: args.payload
  };
}

export function pickVideoSessionDraftCandidate(
  candidates: VideoSessionDraftEnvelope[]
): VideoSessionDraftEnvelope | null {
  const restorable = candidates
    .filter((candidate) => candidate.status === 'restorable')
    .sort((left, right) => right.updatedAt - left.updatedAt);
  if (restorable.length > 0) {
    return restorable[0] ?? null;
  }
  return [...candidates].sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
}

function serializeVideoDraftCapture(capture: VideoCapture): VideoSessionDraftCaptureDraft {
  if (capture.kind === 'fragment') {
    return {
      kind: 'fragment',
      id: capture.id,
      comment: capture.comment,
      selectedText: capture.selectedText,
      selectedHtml: capture.selectedHtml,
      fragmentUrl: capture.fragmentUrl,
      createdAt: capture.createdAt,
      ...(capture.timeSec !== undefined ? { timeSec: capture.timeSec } : {}),
      ...(capture.wrapperId !== undefined ? { wrapperId: capture.wrapperId } : {})
    };
  }

  const screenshotRef = normalizeVideoScreenshotCacheRef(capture.screenshotRef);

  return {
    kind: 'timestamp',
    id: capture.id,
    timeSec: capture.timeSec,
    url: capture.url,
    comment: capture.comment,
    createdAt: capture.createdAt,
    ...(capture.screenshotRequested ? { screenshotRequested: true } : {}),
    ...(screenshotRef ? { screenshotRef } : {})
  };
}

function deserializeVideoDraftCapture(
  capture: VideoSessionDraftCaptureDraft,
  fallbackUrl: string
): VideoCapture {
  if (capture.kind === 'fragment') {
    return {
      kind: 'fragment',
      id: capture.id,
      comment: capture.comment,
      selectedText: capture.selectedText,
      selectedHtml: capture.selectedHtml,
      fragmentUrl: capture.fragmentUrl,
      createdAt: capture.createdAt,
      ...(capture.timeSec !== undefined ? { timeSec: capture.timeSec } : {}),
      ...(capture.wrapperId !== undefined ? { wrapperId: capture.wrapperId } : {})
    };
  }

  const screenshotRef = normalizeVideoScreenshotCacheRef(capture.screenshotRef);

  return {
    kind: 'timestamp',
    id: capture.id,
    timeSec: capture.timeSec,
    url: capture.url || fallbackUrl,
    comment: capture.comment,
    createdAt: capture.createdAt,
    ...(capture.screenshotRequested ? { screenshotRequested: true } : {}),
    ...(screenshotRef ? { screenshotRef } : {})
  };
}
