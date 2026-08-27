export type ContentCssPackId =
  | 'options'
  | 'onboarding'
  | 'clipper'
  | 'reader'
  | 'video'
  | 'prompt-task';

export const CONTENT_CSS_PACKS: Readonly<Record<ContentCssPackId, string>>;

export interface ContentCssPackReport {
  failures: string[];
  packs: Array<{ id: ContentCssPackId; path: string; bytes: number; sha256: string }>;
}

export function validateContentCssPacks(options?: {
  root?: string;
  distDir?: string;
}): ContentCssPackReport;
