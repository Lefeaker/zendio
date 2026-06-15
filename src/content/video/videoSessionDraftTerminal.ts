import type {
  SessionDraftEnvelope,
  SessionDraftStatus,
  SessionDraftTerminalStatus,
  VideoSessionDraftEnvelope
} from '../sessionDrafts';
import type { StorageAreaService } from '../../platform/interfaces/storage';

export interface BuildVideoSessionDraftEnvelopeOptions {
  status?: SessionDraftStatus;
  draftId?: string;
  pageUrl?: string;
  allowEmpty?: boolean;
}

export async function buildVideoTerminalEnvelopeForExactKey(
  storageArea: StorageAreaService,
  storageKey: string,
  status: SessionDraftTerminalStatus,
  buildEnvelope: (
    options: BuildVideoSessionDraftEnvelopeOptions
  ) => VideoSessionDraftEnvelope | null
): Promise<VideoSessionDraftEnvelope | null> {
  const stored = await storageArea.get<SessionDraftEnvelope>(storageKey);
  if (!stored || stored.mode !== 'video') {
    return null;
  }

  return buildEnvelope({
    draftId: stored.draftId,
    pageUrl: stored.pageUrl,
    status,
    allowEmpty: true
  });
}
