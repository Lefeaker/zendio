import type { ClipMeta, ClipPayload } from './clip';

export interface ExtractionResult extends ClipPayload {
  title: string;
  type: string;
  meta: ClipMeta;
}

export interface ExtractionFailureContext {
  url: string;
  type: string;
}
