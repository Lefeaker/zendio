import { isObjectRecord } from '../guards';

export const FETCH_AI_CHAT_IMAGE = 'FETCH_AI_CHAT_IMAGE';
export interface AIChatImageFetchRequest {
  url: string;
  sourceUrl: string;
  platform: string;
}

export function isAIChatImageFetchRequest(value: unknown): value is AIChatImageFetchRequest {
  return (
    isObjectRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.sourceUrl === 'string' &&
    typeof value.platform === 'string' &&
    Object.keys(value).every((key) => ['url', 'sourceUrl', 'platform', 'type'].includes(key)) &&
    (value.type === undefined || value.type === FETCH_AI_CHAT_IMAGE)
  );
}
