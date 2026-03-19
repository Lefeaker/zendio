import { tryParseUrl } from '../../shared/url';
import type { ClipResultMessage } from '../../shared/types';
import {
  AppError,
  errorHandler,
  notificationErrors
} from '../../shared/errors';

export async function safeNotify(
  action: () => Promise<void>,
  context: { channel: string; title: string }
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const appError = notificationErrors.dispatchFailed(
      message,
      {
        channel: context.channel,
        title: context.title
      },
      { cause: error }
    );
    await errorHandler.handle(appError, { suppressNotifications: true });
  }
}

export function normalizeClipPayload(payload: ClipResultMessage['payload']): ClipResultMessage['payload'] {
  if (!payload) {
    return payload;
  }

  if (!payload.meta) {
    payload.meta = {};
  }

  const meta = payload.meta;

  const resolvedCandidate =
    (typeof meta.resolvedUrl === 'string' && meta.resolvedUrl.trim().length > 0)
      ? meta.resolvedUrl
      : undefined;
  const sourceCandidate =
    (typeof meta.sourceUrl === 'string' && meta.sourceUrl.trim().length > 0)
      ? meta.sourceUrl
      : undefined;
  const urlCandidate =
    (typeof meta.url === 'string' && meta.url.trim().length > 0)
      ? meta.url
      : undefined;

  const canonicalUrl = urlCandidate || resolvedCandidate || sourceCandidate;
  if (canonicalUrl && canonicalUrl !== meta.url) {
    meta.url = canonicalUrl;
  }

  if (!meta.domain || typeof meta.domain !== 'string' || meta.domain.trim().length === 0) {
    const parsed = tryParseUrl(canonicalUrl);
    if (parsed) {
      meta.domain = parsed.hostname;
    }
  }

  return payload;
}

export function buildFailureContext(
  payload?: ClipResultMessage['payload']
): Record<string, unknown> {
  return {
    ...(payload?.meta?.url !== undefined && { url: payload.meta.url }),
    ...(payload?.type !== undefined && { type: payload.type })
  };
}

export function buildPipelineErrorContext(
  payload?: ClipResultMessage['payload']
): { url?: string; payloadType?: string } {
  return {
    ...(payload?.meta?.url !== undefined && { url: payload.meta.url }),
    ...(payload?.meta?.resolvedUrl !== undefined && payload?.meta?.url === undefined
      ? { url: payload.meta.resolvedUrl }
      : {}),
    ...(payload?.type !== undefined && { payloadType: payload.type })
  };
}

export function buildSupportOptions(
  status: 'success' | 'failure' | 'warning',
  payload: ClipResultMessage['payload'] | undefined,
  vaultName?: string,
  error?: AppError
): {
  status: 'success' | 'failure' | 'warning';
  source?: string;
  vaultName?: string;
  error?: AppError;
} {
  return {
    status,
    ...(payload?.type !== undefined && { source: payload.type }),
    ...(vaultName !== undefined && { vaultName }),
    ...(error !== undefined && { error })
  };
}
