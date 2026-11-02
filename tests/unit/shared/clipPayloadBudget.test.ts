import { describe, expect, it } from 'vitest';
import {
  isClipResultWithinTransportBudget,
  MAX_CLIP_RESULT_BYTES
} from '../../../src/shared/attachments/clipPayloadBudget';

describe('complete clip message capacity', () => {
  it('includes the envelope and metadata in the limit', () => {
    const empty = { markdown: '', meta: { platform: 'chatgpt' } };
    const overhead = new TextEncoder().encode(
      JSON.stringify({ type: 'CLIP_RESULT', payload: empty })
    ).byteLength;
    const markdown = 'a'.repeat(MAX_CLIP_RESULT_BYTES - overhead);
    expect(isClipResultWithinTransportBudget({ ...empty, markdown })).toBe(true);
    expect(isClipResultWithinTransportBudget({ ...empty, markdown: `${markdown}a` })).toBe(false);
  });
  it('counts Unicode bytes rather than UTF16 code units', () => {
    expect(
      isClipResultWithinTransportBudget({ markdown: '图'.repeat(MAX_CLIP_RESULT_BYTES / 3) })
    ).toBe(false);
    expect(
      isClipResultWithinTransportBudget({ markdown: '😀'.repeat(MAX_CLIP_RESULT_BYTES / 4) })
    ).toBe(false);
  });
});
