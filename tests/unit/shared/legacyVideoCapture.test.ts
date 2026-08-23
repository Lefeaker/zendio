import { describe, expect, it } from 'vitest';

import { decodeLegacyVideoCapture } from '../../../src/shared/sessionDrafts/legacyVideoCapture';

function timestamp(id: string, createdAt: number, kind: 'timestamp' | undefined = 'timestamp') {
  return {
    ...(kind === undefined ? {} : { kind }),
    id,
    timeSec: createdAt,
    comment: '',
    url: 'https://www.youtube.com/watch?v=abc_DEF-123',
    createdAt
  };
}

describe('legacy video capture decoder', () => {
  it('canonicalizes the one kindless timestamp alias and strips screenshot bytes to intent', () => {
    const result = decodeLegacyVideoCapture({
      entries: [
        {
          ...timestamp('legacy', 1, undefined),
          screenshot: { dataUrl: 'data:image/png;base64,cHJpdmF0ZQ==' }
        }
      ],
      updatedAt: 2
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        entries: [{ kind: 'timestamp', id: 'legacy', createdAt: 1, screenshotRequested: true }]
      }
    });
    if (result.ok) expect(result.canonicalJson).not.toContain('data:image');
  });

  it('retains the newest twenty entries with stable source ordering', () => {
    const entries = Array.from({ length: 25 }, (_, index) => timestamp(`capture-${index}`, index));
    const result = decodeLegacyVideoCapture({ entries, updatedAt: 30 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toHaveLength(20);
    expect(result.value.entries[0]?.id).toBe('capture-24');
    expect(result.value.entries.at(-1)?.id).toBe('capture-5');
  });

  it.each([
    null,
    4,
    { updatedAt: 1 },
    { entries: {}, updatedAt: 1 },
    { entries: [{ ...timestamp('x', 1), kind: 'unknown' }], updatedAt: 1 },
    { entries: [{ ...timestamp('x', Number.NaN) }], updatedAt: 1 },
    { entries: [{ ...timestamp('x', 1), extra: true }], updatedAt: 1 }
  ])('rejects malformed roots and entries', (value) => {
    expect(decodeLegacyVideoCapture(value)).toEqual({ ok: false, issue: 'INVALID' });
  });

  it('rejects accessors and cycles without invoking them', () => {
    let called = false;
    const value: { entries: never[]; updatedAt: number; title?: string } = {
      entries: [],
      updatedAt: 1
    };
    Object.defineProperty(value, 'title', {
      enumerable: true,
      get() {
        called = true;
        return 'title';
      }
    });
    expect(decodeLegacyVideoCapture(value)).toEqual({ ok: false, issue: 'INVALID' });
    expect(called).toBe(false);

    const cyclic: { entries: never[]; updatedAt: number; cycle?: object } = {
      entries: [],
      updatedAt: 1
    };
    cyclic.cycle = cyclic;
    expect(decodeLegacyVideoCapture(cyclic)).toEqual({ ok: false, issue: 'INVALID' });
  });
});
