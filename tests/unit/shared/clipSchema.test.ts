import { describe, expect, it } from 'vitest';
import { ClipPayloadSchema } from '@shared/schemas/clip.schema';

describe('ClipPayloadSchema', () => {
  it('preserves an optional export timestamp and accepts legacy messages without it', () => {
    const exportStartedAt = new Date('2026-10-15T23:59:59Z').getTime();
    expect(ClipPayloadSchema.parse({ markdown: 'body', meta: { exportStartedAt } })).toEqual({
      markdown: 'body',
      meta: { exportStartedAt }
    });
    expect(
      ClipPayloadSchema.parse({ markdown: 'legacy', meta: { createdAt: 'source timestamp' } })
    ).toEqual({
      markdown: 'legacy',
      meta: { createdAt: 'source timestamp' }
    });
  });

  it.each(['2026-10-15', null, NaN, Infinity, -1, 1.5, 8_640_000_000_000_001])(
    'rejects malformed export timestamp %s',
    (exportStartedAt) => {
      expect(
        ClipPayloadSchema.safeParse({ markdown: 'body', meta: { exportStartedAt } }).success
      ).toBe(false);
    }
  );

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
