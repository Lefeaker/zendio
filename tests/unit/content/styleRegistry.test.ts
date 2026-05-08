/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';

import { clearClipperStyleCache, loadExtensionStyle } from '@content/clipper/shared/styleRegistry';

describe('styleRegistry', () => {
  afterEach(() => {
    clearClipperStyleCache();
  });

  it('returns an empty stylesheet in jsdom instead of warning on relative URLs', async () => {
    const css = await loadExtensionStyle('options/stitch/styles/stitch.css');
    expect(css).toBe('');
  });
});
