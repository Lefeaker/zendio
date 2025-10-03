import type { Options } from '../store';
import type { ClipPayload } from '../types/messages';
import { classify } from '../llm/classifier';

export interface ClassificationResult {
  type?: string;
  topics?: string[];
  ai_platform?: string;
  tags?: string[];
  [key: string]: unknown;
}

const CLASSIFICATION_PREVIEW_LENGTH = 4000;

export function createClassificationPreview(payload: ClipPayload): string {
  return payload.markdown.slice(0, CLASSIFICATION_PREVIEW_LENGTH);
}

export async function classifyClip(options: Options, payload: ClipPayload): Promise<ClassificationResult> {
  const fallback: ClassificationResult = {
    type: payload.type,
    ai_platform: payload.meta?.platform,
    topics: [],
    tags: []
  };

  if (!options.classifier?.enabled) {
    return fallback;
  }

  try {
    const preview = createClassificationPreview(payload);
    const result = await classify(options.classifier, {
      typeHint: payload.type || 'article',
      platform: payload.meta?.platform || 'unknown',
      url: payload.meta?.url || '',
      title: payload.title || 'Untitled'
    }, preview);

    if (result && typeof result === 'object') {
      return result as ClassificationResult;
    }
  } catch (error) {
    console.error('[classification] Failed to classify clip:', error);
  }

  return fallback;
}
