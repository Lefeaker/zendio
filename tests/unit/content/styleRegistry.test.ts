/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';

import { clearClipperStyleCache, loadClipperStyle } from '@content/clipper/shared/styleRegistry';

describe('styleRegistry', () => {
  afterEach(() => {
    clearClipperStyleCache();
  });

  it('returns an empty stylesheet in jsdom instead of warning on relative URLs', async () => {
    const css = await loadClipperStyle('clipper.tailwind');
    expect(css).toBe('');
  });
});
