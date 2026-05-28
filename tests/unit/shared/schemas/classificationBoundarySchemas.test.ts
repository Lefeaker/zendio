import { describe, it, expect } from 'vitest';
import { ClassificationResultSchema } from '@shared/schemas';

describe('ClassificationResultSchema', () => {
  it('accepts fallback with optional fields', () => {
    const res = ClassificationResultSchema.safeParse({ status: 'fallback', topics: [], tags: [] });
    expect(res.success).toBe(true);
  });

  it('accepts success with known fields and strips unknown root fields', () => {
    const res = ClassificationResultSchema.safeParse({
      status: 'success',
      type: 'article',
      ai_platform: 'test',
      topics: ['a', 'b'],
      tags: ['x'],
      vendor_meta: { score: 0.9 },
      providerDebug: { raw: true }
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.type).toBe('article');
      expect(res.data.ai_platform).toBe('test');
      expect(res.data.topics).toEqual(['a', 'b']);
      expect(res.data.tags).toEqual(['x']);
      expect('vendor_meta' in res.data).toBe(false);
      expect('providerDebug' in res.data).toBe(false);
    }
  });
});
