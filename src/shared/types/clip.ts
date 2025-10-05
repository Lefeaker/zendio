export interface ClipMeta {
  url?: string;
  domain?: string;
  platform?: string;
  [key: string]: unknown;
}

export interface ClipPayload {
  markdown: string;
  title?: string;
  type?: string;
  meta?: ClipMeta;
  [key: string]: unknown;
}

export const SHOW_SUPPORT_PROMPT = 'SHOW_SUPPORT_PROMPT';

export interface ClipResultMessage {
  type: 'CLIP_RESULT';
  payload: ClipPayload;
}

export interface SupportPromptMessage {
  type: typeof SHOW_SUPPORT_PROMPT;
  source?: string;
  vaultName?: string;
  status?: 'success' | 'failure';
  errorMessage?: string;
}

export interface ClipErrorMessage {
  type: 'CLIP_ERROR';
  error: unknown;
}

export interface TestConnectionMessage {
  type: 'TEST_CONNECTION';
}

export type RuntimeMessage = ClipResultMessage | ClipErrorMessage | TestConnectionMessage;

export function isClipResultMessage(message: unknown): message is ClipResultMessage {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'CLIP_RESULT';
}

export function isClipErrorMessage(message: unknown): message is ClipErrorMessage {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'CLIP_ERROR';
}

export function isTestConnectionMessage(message: unknown): message is TestConnectionMessage {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'TEST_CONNECTION';
}
