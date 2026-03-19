import { describe, it, expect } from 'vitest';
import { ClassificationResultSchema } from '@shared/schemas';

describe('ClassificationResultSchema', () => {
  it('accepts fallback with optional fields', () => {
    const res = ClassificationResultSchema.safeParse({ status: 'fallback', topics: [], tags: [] });
    expect(res.success).toBe(true);
  });

  it('accepts success with extras passthrough', () => {
    const res = ClassificationResultSchema.safeParse({
      status: 'success',
      type: 'article',
      ai_platform: 'test',
      topics: ['a', 'b'],
      tags: ['x'],
      vendor_meta: { score: 0.9 }
    });
    expect(res.success).toBe(true);
    if (res.success) {
      // @ts-expect-error passthrough keeps extras at runtime
      expect(res.data.vendor_meta.score).toBe(0.9);
    }
  });
});
