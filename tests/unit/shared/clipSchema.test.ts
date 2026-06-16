import { describe, expect, it } from 'vitest';
import { ClipPayloadSchema } from '@shared/schemas/clip.schema';

describe('ClipPayloadSchema', () => {
  it('returns a stable code for legacy attachment mime mismatches', () => {
    const result = ClipPayloadSchema.safeParse({
      markdown: 'body',
      meta: {
        attachments: [
          {
            id: 'attachment-1',
            fileName: 'frame.png',
            mimeType: 'image/png',
            dataUrl: 'data:image/jpeg;base64,cHJpdmF0ZQ=='
          }
        ]
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.message === 'CLIP_ATTACHMENT_DATA_URL_MIME_MISMATCH'
        )
      ).toBe(true);
    }
  });
});
