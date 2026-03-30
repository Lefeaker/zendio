import { describe, it, expect } from 'vitest';
import { ClipPayloadSchema } from '@shared/schemas';

describe('ClipPayloadSchema', () => {
  it('accepts minimal valid payload', () => {
    const res = ClipPayloadSchema.safeParse({ markdown: '# title' });
    expect(res.success).toBe(true);
  });

  it('accepts full payload with meta and extras', () => {
    const res = ClipPayloadSchema.safeParse({
      markdown: 'content',
      title: 't',
      type: 'article',
      meta: { url: 'https://example.com', platform: 'web', extra: 1 },
      extraTop: true
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.meta?.platform).toBe('web');
    }
  });

  it('rejects empty markdown', () => {
    const res = ClipPayloadSchema.safeParse({ markdown: '' });
    expect(res.success).toBe(false);
  });
});
