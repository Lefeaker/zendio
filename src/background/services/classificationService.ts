import type { Options } from '../store';
import type { ClipPayload } from '../../shared/types';
import { classify } from '../llm/classifier';
import type { ClassifierFailure, ClassifierResponse } from '../llm/classifier';
import { AppError, classifierErrors, errorHandler } from '../../shared/errors';
import { ClassificationResultSchema } from '../../shared/schemas';
import type { ClassificationResult as ClassificationResultT } from '../../shared/schemas';

// Re-export narrowed result type from schemas to keep public API stable
export type { ClassificationResult } from '../../shared/schemas';

const CLASSIFICATION_PREVIEW_LENGTH = 4000;
const DEFAULT_CLASSIFICATION_TIMEOUT_MS = 2000;

export function createClassificationPreview(payload: ClipPayload): string {
  return payload.markdown.slice(0, CLASSIFICATION_PREVIEW_LENGTH);
}

export async function classifyClip(
  options: Options,
  payload: ClipPayload
): Promise<ClassificationResultT> {
  const fallbackBase: ClassificationResultT = ClassificationResultSchema.parse({
    topics: [],
    tags: [],
    status: 'fallback' as const,
    ...(payload.type !== undefined && { type: payload.type }),
    ...(payload.meta?.platform !== undefined && { ai_platform: payload.meta.platform })
  });

  if (!options.classifier?.enabled) {
    return { ...fallbackBase, fallbackReason: 'disabled' as const } as ClassificationResultT;
  }

  try {
    const preview = createClassificationPreview(payload);
    const response = await withTimeout(
      classify(
        options.classifier,
        {
          typeHint: payload.type || 'article',
          platform: payload.meta?.platform || 'unknown',
          url: payload.meta?.url || '',
          title: payload.title || 'Untitled'
        },
        preview
      ),
      resolveClassificationTimeoutMs(options)
    );

    if (response.ok) {
      return normalizeClassificationPayload(response, fallbackBase);
    }

    const { error } = response;
    await errorHandler.handle(error, { suppressNotifications: true });
    return ClassificationResultSchema.parse({
      ...fallbackBase,
      fallbackReason: 'error' as const,
      errorDetail: error
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CLASSIFICATION_TIMEOUT') {
      return ClassificationResultSchema.parse({
        ...fallbackBase,
        fallbackReason: 'timeout' as const
      });
    }
    const errorDetail = classifierErrors.transportFailure(
      error instanceof Error ? error.message : String(error),
      {
        provider: options.classifier.provider,
        endpoint: options.classifier.endpoint
      },
      { cause: error }
    );
    await errorHandler.handle(errorDetail, { suppressNotifications: true });
    return ClassificationResultSchema.parse({
      ...fallbackBase,
      fallbackReason: 'error' as const,
      errorDetail
    });
  }
}

function resolveClassificationTimeoutMs(options: Options): number {
  const configured = Number(options.classifier?.timeoutMs);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_CLASSIFICATION_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('CLASSIFICATION_TIMEOUT'));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function normalizeClassificationPayload(
  response: Extract<ClassifierResponse, { ok: true }>,
  fallbackBase: ClassificationResultT
): ClassificationResultT {
  const payload = response.payload;
  const normalized: ClassificationResultT = {
    ...fallbackBase,
    status: 'success'
  };

  if (typeof payload.type === 'string') {
    normalized.type = payload.type;
  }

  if (typeof payload.ai_platform === 'string') {
    normalized.ai_platform = payload.ai_platform;
  }

  if (Array.isArray(payload.topics)) {
    normalized.topics = payload.topics.filter(isString);
  } else {
    normalized.topics = fallbackBase.topics ?? [];
  }

  if (Array.isArray(payload.tags)) {
    normalized.tags = payload.tags.filter(isString);
  } else {
    normalized.tags = fallbackBase.tags ?? [];
  }

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'type' || key === 'ai_platform' || key === 'topics' || key === 'tags') {
      continue;
    }
    (normalized as Record<string, unknown>)[key] = value;
  }

  // Validate final shape but keep passthrough extras
  return ClassificationResultSchema.parse(normalized);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
